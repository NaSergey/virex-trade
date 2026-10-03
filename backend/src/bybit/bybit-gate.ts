import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ROLE, type Role } from '../role';

/**
 * Адрес Bybit v5 — **единственное место в коде, где он написан**
 * (`bybit-gate.spec.ts` это проверяет). Каждый запрос к бирже обязан идти
 * через `bybitFetch`: лимит Bybit считается на IP сервера, а не на
 * пользователя и не на сервис, и запрос мимо шлюза тратит общий бюджет так,
 * что шлюз этого не видит.
 */
export const BYBIT_API = 'https://api.bybit.com/v5';

/**
 * Лимит Bybit: 600 запросов за любые 5 секунд с одного IP, на весь трафик к
 * api.bybit.com — публичные свечи, приватные ключи пользователей, всё вместе.
 * Превышение — HTTP 403 «access too frequent» и не меньше 10 минут ожидания
 * (https://bybit-exchange.github.io/docs/v5/rate-limit).
 *
 * Бан IP останавливает не одного пользователя, а всех сразу: синк сделок,
 * цены, терминал. Поэтому шлюз держит запросы ниже лимита сам, а не надеется,
 * что нагрузка не дорастёт.
 */
export const WINDOW_MS = 5_000;

/**
 * Доля лимита на процесс. В проде `api` и `worker` — два процесса на одном IP,
 * и общего счётчика у них нет: каждый держит свою долю, сумма ниже 600 с
 * запасом на то, что идёт мимо (скрипты на том же сервере).
 *
 * `worker` получает больше: синк каждые 60 с делает около четырёх запросов на
 * пользователя, и на тысяче подключённых аккаунтов хочет больше половины
 * лимита. Он фоновый и подождёт. `api` — интерактивный, но его основной
 * потребитель, опрос счёта терминала, сведён кэшем к одному запросу на
 * пользователя за 2,5 с (`TerminalService.state`).
 *
 * `all` — локальный запуск одним процессом с домашнего IP.
 *
 * `games` — ноль: процесс игр к Bybit не ходит, и ненулевая доля была бы
 * отнята у `api` и `worker` без причины. Вызов, по ошибке появившийся в его
 * графе, получит отказ сразу, а не тихо съест бюджет.
 */
export const BUDGET: Record<Role, number> = { api: 250, worker: 300, games: 0, all: 500 };

/**
 * Сколько запрос готов ждать места в окне. Интерактивному — несколько секунд:
 * дольше человек уже нажмёт кнопку снова. Фоновому — пока не кончится тик:
 * синк, дождавшийся места, лучше синка, упавшего с ошибкой.
 */
const MAX_WAIT_MS: Record<Role, number> = { api: 8_000, worker: 120_000, games: 0, all: 30_000 };

/** Bybit просит не меньше 10 минут; минута сверху — чтобы не вернуться на границе. */
export const PAUSE_MS = 11 * 60_000;

const paused = (until: number) =>
  new ServiceUnavailableException({
    message: `Bybit временно не принимает запросы с сервера — повторите после ${new Date(until).toISOString().slice(11, 16)} UTC`,
    code: 'BYBIT_PAUSED',
  });

const busy = () =>
  new ServiceUnavailableException({
    message: 'Слишком много запросов к Bybit с сервера — повторите через несколько секунд',
    code: 'BYBIT_BUSY',
  });

export interface GateDeps {
  budget: number;
  maxWaitMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  fetch?: typeof fetch;
}

/**
 * Скользящее окно запусков запросов процесса и пауза после бана.
 *
 * Окно — журнал времён запуска за последние 5 секунд, а не «корзина на
 * секунду»: Bybit считает любые 5 секунд подряд, и корзина, обнулившаяся на
 * границе, пропустила бы два полных бюджета за пару секунд.
 *
 * Класс — ради тестов (часы, сон и сеть подменяются); в продукте он один на
 * процесс, `bybitFetch` ниже.
 */
export class BybitGate {
  private readonly logger = new Logger('BybitGate');
  private readonly sent: number[] = [];
  private pausedUntil = 0;
  private rejected = 0;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly send: typeof fetch;

  constructor(private readonly deps: GateDeps) {
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    // Не `deps.fetch ?? fetch` на месте вызова: глобальный fetch берётся в
    // момент запроса, чтобы его подмена в тестах других модулей работала.
    this.send = deps.fetch ?? ((input, init) => fetch(input, init));
  }

  async fetch(url: string, init?: RequestInit): Promise<Response> {
    await this.acquire();
    const res = await this.send(url, init);
    // 403 от Bybit — это бан IP (или гео-блок, при котором ходить тоже
    // бесполезно). Каждый следующий запрос в бан его только продлевает, поэтому
    // пауза — на весь процесс, а вызывающий получает понятный отказ, а не HTML
    // страницы ошибки вместо JSON.
    if (res.status === 403) {
      this.trip();
      this.rejected++;
      throw paused(this.pausedUntil);
    }
    return res;
  }

  /** Стоит ли пауза после бана — фоновый синк по нему пропускает тик молча. */
  isPaused(): boolean {
    return this.now() < this.pausedUntil;
  }

  /**
   * Сколько запросов шлюз отклонил за жизнь процесса. Синк сравнивает число до
   * и после прогона: упавший из-за нас прогон не должен засчитываться как
   * «ключ пользователя не работает».
   */
  rejections(): number {
    return this.rejected;
  }

  private async acquire(): Promise<void> {
    // Без бюджета ждать нечего: место в пустом окне не освободится никогда, а
    // расчёт ожидания по пустому журналу дал бы NaN и вечный цикл.
    if (this.deps.budget <= 0) {
      this.rejected++;
      throw busy();
    }
    const deadline = this.now() + this.deps.maxWaitMs;
    for (;;) {
      const now = this.now();
      if (now < this.pausedUntil) {
        this.rejected++;
        throw paused(this.pausedUntil);
      }
      while (this.sent.length > 0 && this.sent[0] <= now - WINDOW_MS) this.sent.shift();
      if (this.sent.length < this.deps.budget) {
        this.sent.push(now);
        return;
      }
      // Место освободится, когда самый старый запуск выйдет из окна. Ждущих
      // может быть много; проснувшись, каждый проверяет заново, и место берёт
      // тот, кто успел первым, — остальные ждут следующего.
      const wait = this.sent[0] + WINDOW_MS - now;
      if (now + wait > deadline) {
        this.rejected++;
        throw busy();
      }
      await this.sleep(wait);
    }
  }

  private trip(): void {
    const until = this.now() + PAUSE_MS;
    if (this.now() >= this.pausedUntil) {
      this.logger.error(
        `Bybit ответил 403 — лимит IP превышен или IP заблокирован. Все запросы к Bybit из этого процесса остановлены на ${PAUSE_MS / 60_000} мин.`,
      );
    }
    this.pausedUntil = Math.max(this.pausedUntil, until);
  }
}

const gate = new BybitGate({ budget: BUDGET[ROLE], maxWaitMs: MAX_WAIT_MS[ROLE] });

/** Любой запрос к Bybit — только так. Сигнатура — как у `fetch`. */
export const bybitFetch = (url: string, init?: RequestInit): Promise<Response> => gate.fetch(url, init);

export const bybitPaused = (): boolean => gate.isPaused();

export const bybitRejections = (): number => gate.rejections();
