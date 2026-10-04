import { Injectable, Logger } from '@nestjs/common';
import type { BybitCredentials } from '../../bybit/services/bybit-auth.service';
import { BybitTerminalClient } from '../bybit-terminal.client';
import { roundToTick, toPosition } from '../terminal-math';
import { TerminalMarketService } from '../terminal-market.service';
import { TerminalService } from '../terminal.service';
import { crossed, followTarget } from './follow-rule';
import { StopFollowStore, type FollowPlan, type FollowUpdate } from './stop-follow.store';
import type { StreamState } from './stream-state';

/** Bybit: «стоп и тейк уже такие» — не отказ. */
const LEVELS_NOT_MODIFIED = 34040;
/** Bybit: «ордера уже нет» — исполнен или снят, снимать нечего. */
const ORDER_GONE = 110001;
/** Стоп не встал (шлюз занят, биржа отказала) — повтор через столько. */
const RETRY_MS = 10_000;
/**
 * Тейк пропал из открытых, а история о нём молчит, — столько повторов подряд
 * (три минуты). Дальше сверку подхватит повторный снимок потока (~10 минут):
 * ордер, которого история не знает вовсе, не должен дёргать биржу вечно.
 */
const UNKNOWN_TRIES = 18;
/** Ордер больше не висит: исполнен — шаг переноса; иначе исполниться уже не может. */
const DONE = new Set(['Filled', 'Cancelled', 'Rejected', 'Deactivated']);

/** Что поток знает о пользователе: ключ и живое состояние счёта (берётся в момент шага). */
export interface StreamContext {
  creds: BybitCredentials;
  state(): StreamState | null;
}

/** Слушатель потока счёта (`TerminalStreamService`). */
export interface StreamListener {
  /** Кому держать соединение и без открытого экрана. */
  pinned(): Promise<string[]>;
  /** Событие, уже применённое к состоянию. */
  onEvent(userId: string, msg: { topic: string; data: unknown[] }, ctx: StreamContext): void;
  /** Снимок: подключение или повторный. */
  onSnapshot(userId: string, ctx: StreamContext): void;
  /** Тик потока для живого соединения. */
  onIdle(userId: string, ctx: StreamContext): void;
}
export const STREAM_LISTENER = Symbol('STREAM_LISTENER');

const positive = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Тейки плана, которые ещё могут исполниться. */
const pendingOf = (p: FollowPlan): string[] =>
  p.orderIds.filter((id) => !p.filled.includes(id) && !p.cancelled.includes(id));

/** Стоп `stop` слабее цели — дальше от цены, чем она. */
const followLooser = (direction: 'long' | 'short', stop: number, target: number): boolean =>
  direction === 'long' ? stop < target : stop > target;

/** Строка позиции плана в состоянии потока, или null — позиции нет. */
function positionOf(state: StreamState | null, plan: FollowPlan): { row: any; stop: number | null } | null {
  for (const row of Object.values(state?.positions ?? {})) {
    const p = toPosition(row);
    if (p && p.symbol === plan.symbol && p.direction === plan.direction) return { row, stop: p.stopLoss };
  }
  return null;
}

/**
 * Стоп за тейками на бирже (спека `2026-10-02-terminal-stop-follow-design.md`),
 * роль `worker`. План заводит `api` вместе с сеткой фиксации; здесь — шаги:
 * исполнился тейк — стоп подтягивается по правилу бектеста (`followTarget`).
 *
 * Шаги одного пользователя идут очередью: два тейка, исполнившиеся подряд, не
 * считают стоп по одному и тому же прочитанному плану. План каждый раз
 * перечитывается из базы, а запись шага идёт по его `id` — заменённый новой
 * сеткой план шаг не тронет.
 */
@Injectable()
export class StopFollowService implements StreamListener {
  private readonly logger = new Logger(StopFollowService.name);
  /** Пользователи с активным планом — по последнему `pinned()`. */
  private planned = new Set<string>();
  /** Когда сверить план пользователя: новый план или не вставший стоп. */
  private readonly due = new Map<string, number>();
  private readonly queues = new Map<string, Promise<void>>();
  /** Сколько сверок подряд история не знала о пропавшем тейке — по пользователю. */
  private readonly unknownTries = new Map<string, number>();

  constructor(
    private readonly plans: StopFollowStore,
    private readonly bybit: BybitTerminalClient,
    private readonly market: TerminalMarketService,
    private readonly terminal: TerminalService,
  ) {}

  async pinned(): Promise<string[]> {
    const users = await this.plans.activeUsers();
    const next = new Set(users);
    // План, о котором поток узнал только сейчас, сверяется сразу: тейк мог
    // исполниться между сеткой и этим тиком.
    for (const id of next) if (!this.planned.has(id)) this.due.set(id, 0);
    this.planned = next;
    return users;
  }

  onEvent(userId: string, msg: { topic: string; data: unknown[] }, ctx: StreamContext): void {
    if (!this.planned.has(userId)) return;
    if (msg.topic === 'order.linear') {
      const done = (msg.data as any[]).filter((o) => DONE.has(o?.orderStatus));
      if (done.length > 0) this.enqueue(userId, () => this.onOrders(userId, done, ctx));
    } else if (msg.topic === 'position.linear') {
      this.enqueue(userId, () => this.closeGone(userId, ctx));
    }
  }

  onSnapshot(userId: string, ctx: StreamContext): void {
    if (!this.planned.has(userId)) return;
    this.enqueue(userId, () => this.reconcile(userId, ctx));
  }

  onIdle(userId: string, ctx: StreamContext): void {
    const at = this.due.get(userId);
    if (at == null || Date.now() < at) return;
    this.due.delete(userId);
    this.enqueue(userId, () => this.reconcile(userId, ctx));
  }

  private enqueue(userId: string, op: () => Promise<void>): void {
    const next = (this.queues.get(userId) ?? Promise.resolve())
      .then(op)
      .catch((e: Error) => {
        this.logger.error(`user ${userId}: шаг стопа за тейками упал — ${e.message}`);
        // Упавший шаг (база мигнула) повторяется сверкой, а не ждёт следующего снимка.
        this.due.set(userId, Date.now() + RETRY_MS);
      });
    this.queues.set(userId, next);
    void next.then(() => {
      if (this.queues.get(userId) === next) this.queues.delete(userId);
    });
  }

  private async onOrders(userId: string, rows: any[], ctx: StreamContext): Promise<void> {
    for (const plan of await this.plans.activeOf(userId)) {
      const mine = rows.filter((r) => plan.orderIds.includes(String(r.orderId)));
      if (mine.length > 0) await this.advance(plan, mine, ctx);
    }
  }

  /** Исполненные и снятые тейки плана → новая цель → стоп на бирже. */
  private async advance(plan: FollowPlan, rows: any[], ctx: StreamContext): Promise<void> {
    const p = { ...plan };
    let moved = false;
    for (const row of rows) {
      const id = String(row.orderId);
      if (p.filled.includes(id) || p.cancelled.includes(id)) continue;
      if (row.orderStatus !== 'Filled') {
        p.cancelled = [...p.cancelled, id];
        continue;
      }
      const price = positive(row.avgPrice) ?? p.prices[p.orderIds.indexOf(id)];
      p.filled = [...p.filled, id];
      p.fillPrices = [...p.fillPrices, price];
      const position = positionOf(ctx.state(), p);
      const current = position?.stop ?? null;
      // Свою прежнюю цель считаем стоящей, даже если событие о ней ещё в пути.
      const tightest = p.target != null && (current == null || (p.direction === 'long' ? p.target > current : p.target < current)) ? p.target : current;
      // Безубыток — вход позиции сейчас, как у бектеста: долитая после сетки
      // позиция сменила среднюю цену, и стоп по старой был бы не в безубытке.
      const entry = positive(position?.row.avgPrice) ?? p.entryPrice;
      // Цель, заданная этому тейку в сетке; 0 или нет — правило (`followTarget`).
      const target = followTarget(p.direction, entry, p.fillPrices, tightest, p.stops[p.orderIds.indexOf(id)] ?? null);
      if (target != null) {
        p.target = target;
        p.applied = false;
        moved = true;
      }
    }
    const saved = await this.save(p, {
      filled: p.filled,
      fillPrices: p.fillPrices,
      cancelled: p.cancelled,
      target: p.target,
      applied: p.applied,
    });
    if (!saved) return;
    if (moved) await this.place(p, ctx);
    await this.finishIfDone(p, ctx);
  }

  /** Поставить цель на бирже — или закрыть остаток, если цена уже за ней. */
  private async place(p: FollowPlan, ctx: StreamContext): Promise<void> {
    const state = ctx.state();
    // Состояния нет — поток переподключается; сверка после снимка повторит шаг.
    if (!state || p.target == null) return;
    const position = positionOf(state, p);
    if (!position) return;
    // Стоп на бирже уже не слабее цели: человек подтянул его руками, пока шаг
    // ждал повтора, или прошлая запись дошла, а ответ — нет. Повтор не должен
    // вернуть стоп назад.
    if (position.stop != null && !followLooser(p.direction, position.stop, p.target)) {
      p.applied = true;
      await this.save(p, { applied: true });
      return;
    }
    try {
      const mark = (await this.market.markPrices()).get(p.symbol);
      if (mark != null && crossed(p.direction, mark, p.target)) {
        // Сначала сняты оставшиеся тейки плана: reduce-only лимиты на остаток
        // и рыночное закрытие того же остатка вместе биржа может не принять.
        for (const orderId of pendingOf(p)) {
          await this.bybit.privatePost(ctx.creds, '/order/cancel', { category: 'linear', symbol: p.symbol, orderId }, [
            ORDER_GONE,
          ]);
        }
        await this.terminal.closePosition(p.userId, { symbol: p.symbol, direction: p.direction, kind: 'market' });
        this.logger.log(`user ${p.userId}: ${p.symbol} ${p.direction} — цена за стопом ${p.target}, остаток закрыт по рынку`);
        p.applied = true;
        p.active = false;
        await this.save(p, { applied: true, active: false });
        return;
      }
      const inst = await this.market.requireInstrument(p.symbol);
      const body: Record<string, string | number | boolean> = {
        category: 'linear',
        symbol: p.symbol,
        positionIdx: Number(position.row.positionIdx) || 0,
        tpslMode: 'Full',
        stopLoss: roundToTick(p.target, inst.tickSize),
      };
      // Что делает пропущенный тейк, Bybit не пишет (`0` его снимает) — передаём
      // нынешний: снять человеку тейк переносом стопа нельзя.
      const take = positive(position.row.takeProfit);
      if (take != null) body.takeProfit = roundToTick(take, inst.tickSize);
      await this.bybit.privatePost(ctx.creds, '/position/trading-stop', body, [LEVELS_NOT_MODIFIED]);
      p.applied = true;
      await this.save(p, { applied: true });
      this.logger.log(`user ${p.userId}: ${p.symbol} ${p.direction} — стоп за тейками на ${p.target}`);
    } catch (e) {
      this.logger.warn(`user ${p.userId}: стоп за тейками не встал — ${(e as Error).message}`);
      this.due.set(p.userId, Date.now() + RETRY_MS);
    }
  }

  /**
   * Сверка: после обрыва (событий за него биржа не пришлёт), для нового плана и
   * для не вставшего стопа. Тейк, пропавший из открытых и ещё не учтённый,
   * читается из истории ордеров.
   */
  private async reconcile(userId: string, ctx: StreamContext): Promise<void> {
    if (!ctx.state()) return;
    for (const plan of await this.plans.activeOf(userId)) {
      // Сбой одного плана — повтор позже, а не тишина до следующего снимка.
      try {
        await this.reconcilePlan(plan, ctx);
      } catch (e) {
        this.logger.warn(`user ${userId}: сверка стопа за тейками не прошла — ${(e as Error).message}`);
        this.due.set(userId, Date.now() + RETRY_MS);
      }
    }
  }

  private async reconcilePlan(plan: FollowPlan, ctx: StreamContext): Promise<void> {
    const before = ctx.state();
    if (!before) return;
    if (!positionOf(before, plan)) {
      await this.save(plan, { active: false });
      return;
    }
    const missing = pendingOf(plan).filter((id) => !(id in before.orders));
    const rows: any[] = [];
    let unknown = false;
    for (const orderId of missing) {
      const res = await this.bybit.privateGet(ctx.creds, '/order/history', {
        category: 'linear',
        symbol: plan.symbol,
        orderId,
      });
      const row = res.list?.[0];
      if (row && DONE.has(row.orderStatus)) rows.push(row);
      // Пропал из открытых, а в истории его нет или он ещё висит — история отстаёт: спросим позже.
      else unknown = true;
    }
    if (unknown) {
      const tries = (this.unknownTries.get(plan.userId) ?? 0) + 1;
      this.unknownTries.set(plan.userId, tries);
      if (tries <= UNKNOWN_TRIES) this.due.set(plan.userId, Date.now() + RETRY_MS);
    } else {
      this.unknownTries.delete(plan.userId);
    }
    rows.sort((a, b) => Number(a.updatedTime) - Number(b.updatedTime));
    if (rows.length > 0) {
      await this.advance(plan, rows, ctx);
    } else {
      if (!plan.applied) await this.place(plan, ctx);
      await this.finishIfDone(plan, ctx);
    }
  }

  private async closeGone(userId: string, ctx: StreamContext): Promise<void> {
    for (const plan of await this.plans.activeOf(userId)) {
      // Состояния нет (поток переподключается) — это не «позиции нет».
      const state = ctx.state();
      if (state && !positionOf(state, plan)) await this.save(plan, { active: false });
    }
  }

  /** Позиции нет — или ни один тейк уже не исполнится, а цель стоит. */
  private async finishIfDone(p: FollowPlan, ctx: StreamContext): Promise<void> {
    const state = ctx.state();
    if (!p.active || !state) return;
    const live = pendingOf(p).length > 0;
    if (!positionOf(state, p) || (!live && p.applied)) await this.save(p, { active: false });
  }

  private async save(p: FollowPlan, data: FollowUpdate): Promise<boolean> {
    Object.assign(p, data);
    return this.plans.update(p.id, data);
  }
}
