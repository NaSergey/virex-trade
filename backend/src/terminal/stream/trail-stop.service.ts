import { Injectable, Logger } from '@nestjs/common';
import { trailStop } from '../../backtest/fills';
import { BybitTerminalClient } from '../bybit-terminal.client';
import {
  roundToTick,
  stepDecimals,
  toPosition,
  type Direction,
} from '../terminal-math';
import { TerminalMarketService } from '../terminal-market.service';
import {
  LEVELS_NOT_MODIFIED,
  positionOf,
  positive,
  type StreamContext,
  type StreamListener,
} from './stop-follow.service';
import type { StreamState } from './stream-state';
import { TrailStopStore, type TrailPlan } from './trail-stop.store';

/** Сдвиг стопа меньше этой доли цены не пишется: подтяжка на каждый пункт тратила бы запрос на каждый тик. */
const MIN_STEP = 0.0005;
/** Между записями одной позиции — не чаще: состояние потока отстаёт, и до его прихода шаг повторился бы. */
const MIN_GAP_MS = 3_000;
/** Неувиденный план без висящих ордеров ждёт позицию столько: рыночный ордер исполнен, а её строка ещё в пути. */
const UNSEEN_WAIT_MS = 30_000;

/**
 * Цена на шаг цены инструмента — в сторону от цены, то есть свободнее стопа на
 * долю шага, а не теснее: у лонга вниз, у шорта вверх. Стоп у самой цены, округлённый
 * к ней, закрывал бы позицию раньше, чем стоит по правилу.
 */
function awayFromPrice(
  price: number,
  tick: string,
  direction: Direction,
): string {
  const st = Number(tick);
  if (!(st > 0)) return roundToTick(price, tick);
  // Допуск — на двоичную дробь: 59 500 / 0.1 не ровно 595 000.
  const k = price / st;
  const n = direction === 'long' ? Math.floor(k + 1e-9) : Math.ceil(k - 1e-9);
  return (n * st).toFixed(stepDecimals(tick));
}

/**
 * Подводящий стоп на бирже (спека 2026-11-11-trailing-stop-design.md), роль `worker`.
 * План пишет `api` (ордер с галочкой, окно уровней); здесь — шаги на тике потока
 * (2 с): стоп позиции идёт за маркировкой на `distance`, только подтягиваясь и не
 * дальше безубытка — правило `trailStop`, общее с бектестом.
 *
 * Родной трейлинг Bybit не годится: его ставят только на открытую позицию, а его
 * текущую цену API не отдаёт — ни линии на графике, ни сверки со стопом за тейками.
 * Поэтому двигается сам `stopLoss` позиции тем же `trading-stop`: упал `worker` —
 * стоп стоит, а не ослабевает.
 *
 * Перед записью позиция читается свежей: стоп, только что подтянутый стопом за
 * тейками или «стопом после исполнения», поток ещё не показал, и запись от
 * устаревшего стопа его ослабила бы. Шаги одного пользователя — очередью; тик,
 * пришедший, пока прошлый шаг идёт, пропускается — следующий будет через 2 с.
 */
@Injectable()
export class TrailStopService implements StreamListener {
  private readonly logger = new Logger(TrailStopService.name);
  /** Пользователи с активным планом — по последнему `pinned()`. */
  private planned = new Set<string>();
  private readonly queues = new Map<string, Promise<void>>();
  /** Когда стоп позиции плана последний раз писали на биржу — по id плана. */
  private readonly lastWrite = new Map<string, number>();

  constructor(
    private readonly plans: TrailStopStore,
    private readonly bybit: BybitTerminalClient,
    private readonly market: TerminalMarketService,
  ) {}

  async pinned(): Promise<string[]> {
    const users = await this.plans.activeUsers();
    this.planned = new Set(users);
    return users;
  }

  /** Подтяжка идёт по цене, а события счёта о цене молчат: шаги — на тике. */
  onEvent(): void {}

  onSnapshot(): void {}

  onIdle(userId: string, ctx: StreamContext): void {
    if (!this.planned.has(userId) || this.queues.has(userId)) return;
    const run = this.step(userId, ctx)
      .catch((e: Error) =>
        this.logger.warn(
          `user ${userId}: шаг подводящего стопа упал — ${e.message}`,
        ),
      )
      .finally(() => this.queues.delete(userId));
    this.queues.set(userId, run);
  }

  /** Дождаться шага пользователя, если он идёт, — для тестов. */
  async idle(userId: string): Promise<void> {
    await this.queues.get(userId);
  }

  private async step(userId: string, ctx: StreamContext): Promise<void> {
    // Состояния нет — поток переподключается: это не «позиции нет».
    const state = ctx.state();
    if (!state) return;
    const plans = await this.plans.activeOf(userId);
    if (plans.length === 0) return;
    const marks = await this.market.markPrices();
    for (const plan of plans) {
      // Сбой одной позиции — следующий тик, остальные идут своим чередом.
      try {
        await this.stepPlan(plan, state, marks.get(plan.symbol) ?? null, ctx);
      } catch (e) {
        this.logger.warn(
          `user ${userId}: ${plan.symbol} ${plan.direction} — подводящий стоп не встал: ${(e as Error).message}`,
        );
        this.lastWrite.set(plan.id, Date.now());
      }
    }
  }

  private async stepPlan(
    plan: TrailPlan,
    state: StreamState,
    mark: number | null,
    ctx: StreamContext,
  ): Promise<void> {
    const position = positionOf(state, plan);
    if (!position) {
      // Позицию видели, и её не стало — закрыта, план кончился. Неувиденный ждёт
      // свои ордера, а без них — полминуты: рыночный ордер исполнен, строка в пути.
      const waiting =
        !plan.seen &&
        (plan.orderIds.some((id) => id in state.orders) ||
          Date.now() - plan.createdAt.getTime() < UNSEEN_WAIT_MS);
      if (!waiting) {
        await this.plans.update(plan, { active: false });
        this.lastWrite.delete(plan.id);
      }
      return;
    }
    if (!plan.seen) await this.plans.update(plan, { seen: true });

    const entry = positive(position.row.avgPrice);
    if (position.stop == null || entry == null || mark == null) return;
    // Доля цены, а не шаг инструмента: у любого перпа она его больше.
    const step = mark * MIN_STEP;
    if (!this.moves(plan, position.stop, entry, mark, step)) return;
    if (Date.now() - (this.lastWrite.get(plan.id) ?? 0) < MIN_GAP_MS) return;

    const fresh = await this.bybit.privateGet(ctx.creds, '/position/list', {
      category: 'linear',
      symbol: plan.symbol,
    });
    const row = (fresh.list ?? []).find(
      (r: any) => toPosition(r)?.direction === plan.direction,
    );
    const current = row ? toPosition(row) : null;
    const freshEntry = positive(row?.avgPrice);
    if (!current || current.stopLoss == null || freshEntry == null) return;
    if (!this.moves(plan, current.stopLoss, freshEntry, mark, step)) return;

    const inst = await this.market.requireInstrument(plan.symbol);
    const target = trailStop(
      plan.direction,
      current.stopLoss,
      plan.distance,
      freshEntry,
      mark,
    );
    const body: Record<string, string | number | boolean> = {
      category: 'linear',
      symbol: plan.symbol,
      positionIdx: Number(row.positionIdx) || 0,
      tpslMode: 'Full',
      stopLoss: awayFromPrice(target, inst.tickSize, plan.direction),
    };
    // Что делает пропущенный тейк, Bybit не пишет (`0` его снимает) — передаём нынешний.
    if (current.takeProfit != null)
      body.takeProfit = roundToTick(current.takeProfit, inst.tickSize);
    this.lastWrite.set(plan.id, Date.now());
    await this.bybit.privatePost(ctx.creds, '/position/trading-stop', body, [
      LEVELS_NOT_MODIFIED,
    ]);
    this.logger.log(
      `user ${plan.userId}: ${plan.symbol} ${plan.direction} — подводящий стоп на ${body.stopLoss}`,
    );
  }

  /** Подтяжка от этого стопа сдвигает его хотя бы на шаг. */
  private moves(
    plan: TrailPlan,
    stop: number,
    entry: number,
    mark: number,
    step: number,
  ): boolean {
    const target = trailStop(plan.direction, stop, plan.distance, entry, mark);
    return Math.abs(target - stop) >= step && target !== stop;
  }
}
