import { createHmac } from 'crypto';
import WebSocket from 'ws';
import type { BybitCredentials } from '../../bybit/services/bybit-auth.service';

/** Приватный поток Bybit V5. В REST-лимит 600 запросов на IP он не входит. */
export const BYBIT_PRIVATE_WS = 'wss://stream.bybit.com/v5/private';
const TOPICS = ['position.linear', 'order.linear', 'wallet'];
/** Bybit просит пинг раз в 20 с. */
const PING_MS = 20_000;
/**
 * Столько без единого сообщения — соединение мертво, даже если TCP молчит. На
 * пинг раз в 20 с биржа отвечает понгом, так что это два пропущенных ответа.
 */
const SILENCE_MS = 45_000;
/** Вход и подписка дольше этого — соединение не поднялось (повисли TCP, TLS или ответ биржи). */
const READY_MS = 15_000;
/** Срок подписи входа. */
const AUTH_TTL_MS = 10_000;

export interface SocketLike {
  on(event: string, cb: (...args: any[]) => void): unknown;
  send(data: string): void;
  close(): void;
}

export interface SocketHandlers {
  /** Вошли и подписались — события пошли. */
  onReady(): void;
  /** Сообщение темы. */
  onTopic(msg: { topic: string; data: unknown[] }): void;
  /** Соединение кончилось, ровно один раз. `auth` — биржа не приняла ключ. */
  onClosed(reason: 'auth' | 'closed'): void;
}

/**
 * Одно соединение приватного потока на один ключ: вход, подписка, пинг.
 * Переподключение — забота владельца соединения (`TerminalStreamService`):
 * здесь соединение живёт один раз и сообщает о конце.
 */
export class BybitPrivateSocket {
  private readonly ws: SocketLike;
  private timer?: NodeJS.Timeout;
  private readonly readyTimer: NodeJS.Timeout;
  private ended = false;
  private seenAt: number;

  constructor(
    private readonly creds: BybitCredentials,
    private readonly handlers: SocketHandlers,
    open: (url: string) => SocketLike = (url) => new WebSocket(url),
    private readonly now: () => number = Date.now,
  ) {
    this.seenAt = this.now();
    this.readyTimer = setTimeout(() => this.end('closed'), READY_MS);
    this.ws = open(BYBIT_PRIVATE_WS);
    this.ws.on('open', () => this.auth());
    this.ws.on('message', (raw: unknown) => this.receive(raw));
    this.ws.on('close', () => this.end('closed'));
    // `ws` после ошибки сам шлёт close, но без обработчика ошибка роняла бы процесс.
    this.ws.on('error', () => this.end('closed'));
  }

  /** Сколько мс от биржи не было ни одного сообщения (понг тоже считается). */
  idleMs(): number {
    return this.now() - this.seenAt;
  }

  /** Закрыть по своей воле: о конце не сообщается — его и так знают. */
  close(): void {
    if (this.ended) return;
    this.ended = true;
    this.stop();
  }

  private auth(): void {
    const expires = this.now() + AUTH_TTL_MS;
    const signature = createHmac('sha256', this.creds.apiSecret).update(`GET/realtime${expires}`).digest('hex');
    this.send({ op: 'auth', args: [this.creds.apiKey, expires, signature] });
  }

  private receive(raw: unknown): void {
    this.seenAt = this.now();
    let msg: any;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg?.op === 'auth') {
      if (msg.success) this.send({ op: 'subscribe', args: TOPICS });
      else this.end('auth');
      return;
    }
    if (msg?.op === 'subscribe') {
      if (!msg.success) return this.end('closed');
      // Повторный ответ на подписку не начинает второй снимок.
      if (this.timer) return;
      clearTimeout(this.readyTimer);
      this.timer = setInterval(() => this.beat(), PING_MS);
      this.handlers.onReady();
      return;
    }
    if (typeof msg?.topic === 'string' && Array.isArray(msg.data)) this.handlers.onTopic(msg);
  }

  private beat(): void {
    if (this.now() - this.seenAt >= SILENCE_MS) return this.end('closed');
    this.send({ op: 'ping' });
  }

  private send(msg: unknown): void {
    try {
      this.ws.send(JSON.stringify(msg));
    } catch {
      this.end('closed');
    }
  }

  private end(reason: 'auth' | 'closed'): void {
    if (this.ended) return;
    this.ended = true;
    this.stop();
    this.handlers.onClosed(reason);
  }

  private stop(): void {
    clearTimeout(this.readyTimer);
    if (this.timer) clearInterval(this.timer);
    try {
      this.ws.close();
    } catch {
      // уже закрыт
    }
  }
}
