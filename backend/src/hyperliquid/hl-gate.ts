import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ROLE, type Role } from '../role';

/**
 * Адреса Hyperliquid — **единственное место в коде, где они написаны**
 * (`hl-gate.spec.ts` это проверяет). Лимит считается на IP сервера, и запрос
 * мимо шлюза тратит общий бюджет так, что шлюз этого не видит.
 */
export const HL_INFO = 'https://api.hyperliquid.xyz/info';
/** Лидерборд — CDN статистики, а не `info`: в вес лимита он не входит. */
export const HL_LEADERBOARD =
  'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard';

/**
 * Лимит Hyperliquid: 1200 «веса» в минуту на IP на все REST-запросы
 * (https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits).
 * Вес — по документации: `clearinghouseState` 2, прочие `info` 20.
 */
export const WINDOW_MS = 60_000;
export const WEIGHT = {
  clearinghouseState: 2,
  portfolio: 20,
  default: 20,
} as const;

/**
 * Доля на процесс. В проде `api` и `worker` на одном IP, общего счётчика у них
 * нет: 700 + 200 ниже 1200 с запасом. `worker` — бот отбора, ему почти всё;
 * `api` — только позиции сохранённых кошельков владельца. `games` к
 * Hyperliquid не ходит, и запрос, по ошибке попавший в его граф, получит отказ
 * сразу, а не тихо съест чужую долю.
 */
export const BUDGET: Record<Role, number> = {
  api: 200,
  worker: 700,
  games: 0,
  all: 900,
};

/**
 * Интерактивному — несколько секунд, фоновому — дольше окна: место в нём
 * освобождается не раньше, чем через минуту после заполнения, и с меньшим
 * сроком бот получал бы отказ на каждом полном окне.
 */
const MAX_WAIT_MS: Record<Role, number> = {
  api: 8_000,
  worker: 120_000,
  games: 0,
  all: 70_000,
};

/** Запрос, который дольше этого не ответил, держал бы цикл разбора минутами. */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Пауза после 429. Срока Hyperliquid не называет; минута — одно окно лимита:
 * за неё вес, который мы превысили, гарантированно выходит из счёта.
 */
export const PAUSE_MS = 60_000;

const fail = (code: 'HL_BUSY' | 'HL_PAUSED' | 'HL_FAILED', message: string) =>
  new ServiceUnavailableException({ message, code });

/**
 * Отказ самого шлюза (нет места в окне, пауза после 429) — а не ответ
 * Hyperliquid о кошельке. Бот по нему не считает кошелёк разобранным.
 */
export function isGateRefusal(e: unknown): boolean {
  if (!(e instanceof ServiceUnavailableException)) return false;
  const code = (e.getResponse() as { code?: string }).code;
  return code === 'HL_BUSY' || code === 'HL_PAUSED';
}

export interface HlGateDeps {
  budget: number;
  maxWaitMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  fetch?: typeof fetch;
}

/**
 * Скользящее окно веса запросов процесса и пауза после 429. Тот же приём, что
 * у `BybitGate`, только окно считает не запуски, а их вес: у Hyperliquid один
 * запрос стоит 2, другой 20.
 *
 * Класс — ради тестов (часы, сон и сеть подменяются); в продукте он один на
 * процесс, `hlInfo` ниже.
 */
export class HlGate {
  private readonly logger = new Logger('HlGate');
  private readonly sent: { at: number; weight: number }[] = [];
  private pausedUntil = 0;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly send: typeof fetch;

  constructor(private readonly deps: HlGateDeps) {
    this.now = deps.now ?? Date.now;
    this.sleep =
      deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    // Глобальный fetch берётся в момент запроса, чтобы его подмена в тестах
    // других модулей работала.
    this.send = deps.fetch ?? ((input, init) => fetch(input, init));
  }

  async info<T>(
    body: { type: string; [k: string]: unknown },
    weight: number,
  ): Promise<T> {
    await this.acquire(weight);
    const res = await this.send(HL_INFO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 429) {
      this.trip();
      throw fail(
        'HL_PAUSED',
        'Hyperliquid ограничил запросы с сервера — пауза',
      );
    }
    if (!res.ok)
      throw fail(
        'HL_FAILED',
        `Hyperliquid ответил ${res.status} на ${body.type}`,
      );
    return (await res.json()) as T;
  }

  /** Сколько миллисекунд ещё стоит пауза; 0 — не стоит. Бот по нему спит. */
  pausedFor(): number {
    return Math.max(0, this.pausedUntil - this.now());
  }

  private async acquire(weight: number): Promise<void> {
    // Вес больше бюджета не поместится никогда, а пустой бюджет не освободится:
    // ждать нечего, а расчёт ожидания по пустому журналу дал бы вечный цикл.
    if (this.deps.budget <= 0 || weight > this.deps.budget) {
      throw fail('HL_BUSY', 'Нет бюджета запросов к Hyperliquid');
    }
    const deadline = this.now() + this.deps.maxWaitMs;
    for (;;) {
      const now = this.now();
      if (now < this.pausedUntil)
        throw fail(
          'HL_PAUSED',
          'Hyperliquid ограничил запросы с сервера — пауза',
        );
      while (this.sent.length > 0 && this.sent[0].at <= now - WINDOW_MS)
        this.sent.shift();
      const used = this.sent.reduce((s, x) => s + x.weight, 0);
      if (used + weight <= this.deps.budget) {
        this.sent.push({ at: now, weight });
        return;
      }
      // Место освобождает выход старейшего запуска из окна; проснувшись,
      // проверяем заново — его веса может и не хватить.
      const wait = this.sent[0].at + WINDOW_MS - now;
      if (now + wait > deadline)
        throw fail(
          'HL_BUSY',
          'Слишком много запросов к Hyperliquid — повторите позже',
        );
      await this.sleep(wait);
    }
  }

  private trip(): void {
    if (this.now() >= this.pausedUntil) {
      this.logger.warn(
        `Hyperliquid ответил 429 — запросы процесса остановлены на ${PAUSE_MS / 1000} с`,
      );
    }
    this.pausedUntil = this.now() + PAUSE_MS;
  }
}

const gate = new HlGate({ budget: BUDGET[ROLE], maxWaitMs: MAX_WAIT_MS[ROLE] });

/** Любой запрос к `info` Hyperliquid — только так. */
export const hlInfo = <T>(
  body: { type: string; [k: string]: unknown },
  weight: number,
): Promise<T> => gate.info<T>(body, weight);

export const hlPausedFor = (): number => gate.pausedFor();

/**
 * Лидерборд целиком: ~47 тыс. строк, ~39 МБ. Разбор держит ~140 МБ памяти,
 * пока идёт (лимит `worker` — 768 МБ), — поэтому раз в 6 часов, а не чаще.
 */
export async function fetchLeaderboard(): Promise<unknown> {
  const res = await fetch(HL_LEADERBOARD, {
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok)
    throw fail('HL_FAILED', `лидерборд Hyperliquid ответил ${res.status}`);
  return res.json();
}
