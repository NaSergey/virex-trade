import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import type { BybitCredentials } from '../../bybit/services/bybit-auth.service';
import { CredentialsService } from '../../credentials/credentials.service';
import { runsBackgroundJobs } from '../../role';
import { readAccount } from '../account-snapshot';
import { BybitTerminalClient } from '../bybit-terminal.client';
import { BybitPrivateSocket, type SocketHandlers } from './bybit-private-socket';
import { ConnectLimiter } from './connect-limiter';
import { STREAM_LISTENER, type StreamContext, type StreamListener } from './stop-follow.service';
import { applyEvent, fromSnapshot, keyHash, type StreamState } from './stream-state';

const TICK_MS = 2_000;
const HEARTBEAT_MS = 10_000;
/** Спрос: экран спрашивал счёт за это время (`api` отмечает не чаще раза в 20 с). */
const WANTED_MS = 60_000;
const FLUSH_MS = 150;
const RESNAPSHOT_MS = 10 * 60_000;
/** Повторный снимок не прочитался (шлюз на паузе, биржа занята) — попробовать снова через минуту. */
const RESNAPSHOT_RETRY_MS = 60_000;
/**
 * Пульс — только соединению, от которого было сообщение за это время: на пинг
 * раз в 20 с биржа отвечает понгом. Замолчавшее соединение сокет сочтёт
 * мёртвым позже (45 с), а экран не должен верить ему всё это время.
 */
const QUIET_MS = 35_000;
const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 60_000;
/** Отказ входа: ключ отозван или без прав — частые попытки только жгут лимит соединений. */
const RETRY_AUTH_MS = 5 * 60_000;
/** Bybit — не больше 500 новых соединений за 5 минут; держимся ниже. */
const CONNECTS = { limit: 450, windowMs: 5 * 60_000 };

export interface StreamStore {
  wanted(since: Date): Promise<string[]>;
  save(userId: string, row: { keyHash: string; state: StreamState; eventAt: Date }): Promise<void>;
  heartbeat(userIds: string[]): Promise<void>;
  drop(userId: string): Promise<void>;
}
export const STREAM_STORE = Symbol('STREAM_STORE');

export interface StreamSocket {
  close(): void;
  /** Сколько мс от биржи не было ни одного сообщения. */
  idleMs(): number;
}
export type OpenStreamSocket = (creds: BybitCredentials, handlers: SocketHandlers) => StreamSocket;
export const STREAM_SOCKET = Symbol('STREAM_SOCKET');
const openBybit: OpenStreamSocket = (creds, handlers) => new BybitPrivateSocket(creds, handlers);

interface Stream {
  userId: string;
  creds: BybitCredentials;
  hash: string;
  socket: StreamSocket | null;
  /** null — снимка ещё нет. */
  state: StreamState | null;
  /** События, пришедшие во время снимка; null — снимок не идёт. */
  buffer: { topic: string; data: unknown[] }[] | null;
  live: boolean;
  eventAt: number;
  /** Номер изменения состояния и номер последнего записанного: разошлись — запись не дошла. */
  version: number;
  saved: number;
  nextSnapshotAt: number;
  retryAt: number;
  failures: number;
  flush?: NodeJS.Timeout;
}

/**
 * Счёт терминала из приватного WebSocket Bybit — роль `worker`
 * (спека `2026-10-02-terminal-bybit-websocket-design.md`).
 *
 * Кому нужно соединение, говорит `api` (`terminal_streams.wantedAt`: экран
 * спрашивал счёт). На соединение — REST-снимок (подписка снимка не даёт),
 * поверх него события; состояние уходит в базу, `api` читает его оттуда.
 * Соединения живут в памяти этого процесса — поэтому здесь, в `worker`,
 * который и так ровно один, а не в `api`.
 *
 * Строка в базе обязана не врать: `liveAt` (по нему `api` верит строке)
 * свежеет только у соединения, которое слышно и чьё состояние записано.
 * Записи и сбросы одного пользователя идут очередью, и запись берёт
 * состояние в момент выполнения, а не постановки.
 */
@Injectable()
export class TerminalStreamService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TerminalStreamService.name);
  private readonly streams = new Map<string, Stream>();
  private readonly limiter = new ConnectLimiter(CONNECTS.limit, CONNECTS.windowMs);
  private timers: NodeJS.Timeout[] = [];
  private busy = false;
  /**
   * Записи и сбросы строки пользователя по очереди: сброс не обгонит начатую
   * запись, запись — сброс. Очередь — по пользователю, а не по потоку: поток,
   * пересозданный после смены ключа, не должен получить свою первую запись
   * затёртой сбросом прежнего.
   */
  private readonly writes = new Map<string, Promise<void>>();

  constructor(
    @Inject(STREAM_STORE) private readonly store: StreamStore,
    private readonly credentials: CredentialsService,
    private readonly bybit: BybitTerminalClient,
    @Optional() @Inject(STREAM_SOCKET) private readonly open: OpenStreamSocket = openBybit,
    /** Стоп за тейками: держит соединение тем, у кого план, и слушает исполнения. */
    @Optional() @Inject(STREAM_LISTENER) private readonly listener?: StreamListener,
  ) {}

  onApplicationBootstrap() {
    if (!runsBackgroundJobs()) return;
    this.timers = [
      setInterval(() => void this.tick().catch((e) => this.logger.error('тик потоков упал', e as Error)), TICK_MS),
      setInterval(() => void this.beat().catch((e) => this.logger.error('пульс потоков упал', e as Error)), HEARTBEAT_MS),
    ];
  }

  /**
   * Остановка процесса (деплой): соединения закрываются, а строки
   * сбрасываются — иначе `api` ещё полминуты верил бы состоянию, которое
   * больше никто не ведёт. Ждать сброса дольше пары секунд остановка не будет.
   */
  async onModuleDestroy() {
    for (const t of this.timers) clearInterval(t);
    for (const s of [...this.streams.values()]) this.stop(s);
    await Promise.race([Promise.all(this.writes.values()), new Promise((r) => setTimeout(r, 2_000).unref())]);
  }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      // Экран спрашивал счёт — или у человека план стопа за тейками: тейк может
      // исполниться, когда вкладка давно закрыта.
      const pinned = (await this.listener?.pinned().catch((e: Error) => {
        this.logger.warn(`планы стопа за тейками не прочитаны — ${e.message}`);
        return [];
      })) ?? [];
      const wanted = new Set([...(await this.store.wanted(new Date(Date.now() - WANTED_MS))), ...pinned]);
      for (const s of [...this.streams.values()]) if (!wanted.has(s.userId)) this.stop(s);
      for (const userId of wanted) {
        // Один сломанный пользователь (ключ не расшифровался, база мигнула) не
        // должен оставить без соединений всех, кто в списке после него.
        try {
          await this.ensure(userId);
        } catch (e) {
          this.logger.warn(`user ${userId}: поток не обслужен — ${(e as Error).message}`);
        }
      }
      for (const s of this.streams.values()) {
        if (s.live && s.state) this.notify(() => this.listener?.onIdle(s.userId, this.context(s)));
      }
    } finally {
      this.busy = false;
    }
  }

  /**
   * Пульс живых соединений одной командой. Чьё состояние не записано —
   * вместо пульса повтор записи: свежий `liveAt` без свежего состояния
   * выдал бы экрану старые позиции за живые.
   */
  async beat(): Promise<void> {
    const fresh: string[] = [];
    for (const s of this.streams.values()) {
      if (!s.live || !s.socket || s.socket.idleMs() > QUIET_MS) continue;
      if (s.version !== s.saved) this.persist(s);
      else fresh.push(s.userId);
    }
    if (fresh.length > 0) await this.store.heartbeat(fresh);
  }

  private async ensure(userId: string): Promise<void> {
    const creds = await this.credsOf(userId);
    let s = this.streams.get(userId);
    if (!creds) {
      if (s) this.stop(s);
      return;
    }
    const hash = keyHash(creds.apiKey);
    if (s && s.hash !== hash) {
      this.stop(s);
      s = undefined;
    }
    if (!s) {
      s = {
        userId,
        creds,
        hash,
        socket: null,
        state: null,
        buffer: null,
        live: false,
        eventAt: 0,
        version: 0,
        saved: 0,
        nextSnapshotAt: 0,
        retryAt: 0,
        failures: 0,
      };
      this.streams.set(userId, s);
    }
    const now = Date.now();
    if (!s.socket) {
      if (now >= s.retryAt && this.limiter.tryTake(now)) this.connect(s);
    } else if (s.live && s.buffer == null && now >= s.nextSnapshotAt) {
      void this.snapshot(s, s.socket);
    }
  }

  private async credsOf(userId: string): Promise<BybitCredentials | null> {
    if ((await this.credentials.activeExchange(userId)) !== 'bybit') return null;
    const creds = await this.credentials.get(userId, 'bybit');
    return creds ? { apiKey: creds.apiKey, apiSecret: creds.apiSecret } : null;
  }

  private connect(s: Stream): void {
    s.state = null;
    s.buffer = null;
    s.live = false;
    let socket: StreamSocket;
    try {
      socket = this.open(s.creds, {
        onReady: () => void this.snapshot(s, socket),
        onTopic: (msg) => this.onTopic(s, socket, msg),
        onClosed: (reason) => this.onClosed(s, socket, reason),
      });
    } catch (e) {
      this.logger.warn(`user ${s.userId}: сокет не открылся — ${(e as Error).message}`);
      this.backoff(s, 'closed');
      return;
    }
    s.socket = socket;
  }

  /**
   * Снимок REST под уже идущей подпиской: события, пришедшие за время снимка,
   * копятся в буфере и ложатся поверх него — старше строки снимка они её не
   * откатят (`applyEvent`). Повторный снимок идёт так же, а экран тем
   * временем видит прежнее состояние с теми же событиями; не прочитался —
   * соединение остаётся, а снимок повторится позже.
   */
  private async snapshot(s: Stream, socket: StreamSocket): Promise<void> {
    if (s.socket !== socket) return;
    const repeat = s.live && s.state != null;
    s.buffer = [];
    try {
      const snap = await readAccount(this.bybit, s.creds);
      if (s.socket !== socket) return;
      const state = fromSnapshot(snap);
      for (const msg of s.buffer ?? []) applyEvent(state, msg);
      s.state = state;
      s.buffer = null;
      s.live = true;
      s.failures = 0;
      this.changed(s);
      s.nextSnapshotAt = s.eventAt + RESNAPSHOT_MS * (0.75 + Math.random() * 0.5);
      this.persist(s);
      this.notify(() => this.listener?.onSnapshot(s.userId, this.context(s)));
    } catch (e) {
      if (s.socket !== socket) return;
      this.logger.warn(`user ${s.userId}: снимок счёта не прочитан — ${(e as Error).message}`);
      if (repeat) {
        s.buffer = null;
        s.nextSnapshotAt = Date.now() + RESNAPSHOT_RETRY_MS;
        return;
      }
      socket.close();
      this.onClosed(s, socket, 'closed');
    }
  }

  private onTopic(s: Stream, socket: StreamSocket, msg: { topic: string; data: unknown[] }): void {
    if (s.socket !== socket) return;
    s.buffer?.push(msg);
    if (!s.state || !applyEvent(s.state, msg)) return;
    this.changed(s);
    if (s.live) this.notify(() => this.listener?.onEvent(s.userId, msg, this.context(s)));
    if (s.live && !s.flush) {
      s.flush = setTimeout(() => {
        s.flush = undefined;
        this.persist(s);
      }, FLUSH_MS);
    }
  }

  private onClosed(s: Stream, socket: StreamSocket, reason: 'auth' | 'closed'): void {
    if (s.socket !== socket) return;
    this.close(s);
    s.state = null;
    s.buffer = null;
    this.backoff(s, reason);
    if (reason === 'auth') this.logger.warn(`user ${s.userId}: Bybit не принял ключ в приватном потоке`);
    this.dropRow(s);
  }

  /** Ключ и живое состояние — состояние берётся в момент шага, а не постановки. */
  private context(s: Stream): StreamContext {
    return { creds: s.creds, state: () => s.state };
  }

  /** Слушатель не должен ронять поток. */
  private notify(call: () => void): void {
    try {
      call();
    } catch (e) {
      this.logger.error(`слушатель потока упал — ${(e as Error).message}`);
    }
  }

  private backoff(s: Stream, reason: 'auth' | 'closed'): void {
    s.failures++;
    const pause = reason === 'auth' ? RETRY_AUTH_MS : Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** (s.failures - 1));
    s.retryAt = Date.now() + pause;
  }

  private changed(s: Stream): void {
    s.version++;
    s.eventAt = Date.now();
  }

  private enqueue(userId: string, op: () => Promise<void>): void {
    const next = (this.writes.get(userId) ?? Promise.resolve()).then(op).catch(() => undefined);
    this.writes.set(userId, next);
    // Хвост очереди, который уже отработал, не держим: пользователей много, а очередь нужна только живая.
    void next.then(() => {
      if (this.writes.get(userId) === next) this.writes.delete(userId);
    });
  }

  /** Записать состояние — каким оно будет в момент записи, а не постановки. */
  private persist(s: Stream): void {
    this.enqueue(s.userId, async () => {
      if (!s.live || !s.state || this.streams.get(s.userId) !== s) return;
      const version = s.version;
      try {
        await this.store.save(s.userId, { keyHash: s.hash, state: s.state, eventAt: new Date(s.eventAt) });
        s.saved = Math.max(s.saved, version);
      } catch (e) {
        this.logger.warn(`user ${s.userId}: состояние потока не записано — ${(e as Error).message}`);
      }
    });
  }

  private dropRow(s: Stream): void {
    this.enqueue(s.userId, () => this.store.drop(s.userId));
  }

  /** Своей волей: ушёл со страницы, сменил ключ или биржу. */
  private stop(s: Stream): void {
    this.close(s);
    this.streams.delete(s.userId);
    this.dropRow(s);
  }

  private close(s: Stream): void {
    if (s.flush) clearTimeout(s.flush);
    s.flush = undefined;
    s.socket?.close();
    s.socket = null;
    s.live = false;
  }
}
