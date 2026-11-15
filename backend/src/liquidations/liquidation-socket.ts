import WebSocket from 'ws';
import type { LiqEvent, LiqExchange } from './liquidation-feed';

export interface SocketLike {
  on(event: string, cb: (...args: any[]) => void): unknown;
  send(data: string): void;
  close(): void;
}

export interface FeedSpec {
  exchange: LiqExchange;
  url: string;
  /** Отправить сразу после открытия (подписка). */
  hello: string[];
  /** Пинг приложения: Bybit ждёт `{"op":"ping"}` раз в 20 с. Binance пингует сам фреймами — `ws` отвечает на них без нас. */
  ping?: { message: string; everyMs: number };
  /** Столько без единого сообщения или пинга — соединение мертво, даже если TCP молчит. */
  silenceMs: number;
  parse(raw: string): LiqEvent[];
}

export interface FeedHandlers {
  onOpen(): void;
  onEvents(events: LiqEvent[]): void;
  /** Биржа отказала в подписке и т. п. — в лог. */
  onWarn(text: string): void;
  /** Соединение кончилось, ровно один раз. */
  onClosed(): void;
}

const CHECK_MS = 5_000;
/** Открытие дольше этого — соединение не поднялось. */
const OPEN_MS = 15_000;

/**
 * Одно соединение потока ликвидаций. Живёт один раз и сообщает о конце;
 * переподключение — забота владельца (`LiquidationRecorderService`), как у
 * приватного потока терминала.
 */
export class LiquidationSocket {
  private readonly ws: SocketLike;
  private readonly timer: NodeJS.Timeout;
  private ended = false;
  private opened = false;
  private seenAt: number;
  private pingedAt: number;
  private readonly startedAt: number;

  constructor(
    private readonly spec: FeedSpec,
    private readonly handlers: FeedHandlers,
    open: (url: string) => SocketLike = (url) => new WebSocket(url),
    private readonly now: () => number = Date.now,
  ) {
    this.startedAt = this.seenAt = this.pingedAt = this.now();
    this.timer = setInterval(() => this.check(), CHECK_MS);
    this.ws = open(spec.url);
    this.ws.on('open', () => {
      this.opened = true;
      this.seenAt = this.pingedAt = this.now();
      for (const m of spec.hello) this.send(m);
      this.handlers.onOpen();
    });
    this.ws.on('message', (raw: unknown) => this.receive(String(raw)));
    // Пинг-фрейм сервера — тоже признак жизни (Binance молчит, пока нет ликвидаций).
    this.ws.on('ping', () => (this.seenAt = this.now()));
    this.ws.on('close', () => this.end());
    // `ws` после ошибки сам шлёт close, но без обработчика ошибка роняла бы процесс.
    this.ws.on('error', () => this.end());
  }

  /** Время последнего признака жизни, мс. */
  lastSeen(): number {
    return this.seenAt;
  }

  /** Закрыть по своей воле: о конце не сообщается. */
  close(): void {
    if (this.ended) return;
    this.ended = true;
    this.stop();
  }

  private receive(raw: string): void {
    this.seenAt = this.now();
    if (raw.includes('"success":false')) {
      this.handlers.onWarn(`${this.spec.exchange}: ${raw.slice(0, 300)}`);
      return;
    }
    const events = this.spec.parse(raw);
    if (events.length > 0) this.handlers.onEvents(events);
  }

  private check(): void {
    const now = this.now();
    if (!this.opened) {
      if (now - this.startedAt >= OPEN_MS) this.end();
      return;
    }
    if (now - this.seenAt >= this.spec.silenceMs) return this.end();
    const ping = this.spec.ping;
    if (ping && now - this.pingedAt >= ping.everyMs) {
      this.pingedAt = now;
      this.send(ping.message);
    }
  }

  private send(msg: string): void {
    try {
      this.ws.send(msg);
    } catch {
      this.end();
    }
  }

  private end(): void {
    if (this.ended) return;
    this.ended = true;
    this.stop();
    this.handlers.onClosed();
  }

  private stop(): void {
    clearInterval(this.timer);
    try {
      this.ws.close();
    } catch {
      // уже закрыт
    }
  }
}
