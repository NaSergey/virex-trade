import { Injectable, Logger } from '@nestjs/common';
import { BybitTerminalClient } from '../bybit-terminal.client';
import { roundToTick } from '../terminal-math';
import { TerminalMarketService } from '../terminal-market.service';
import { TerminalService } from '../terminal.service';
import { EntryFollowStore, type EntryFollow, type EntryFollowUpdate } from './entry-follow.store';
import { crossed, followTarget } from './follow-rule';
import {
  DONE,
  LEVELS_NOT_MODIFIED,
  positionOf,
  positive,
  type StreamContext,
  type StreamListener,
} from './stop-follow.service';

/** Стоп не встал (шлюз занят, биржа отказала) или позиции ещё не видно — повтор через столько. */
const RETRY_MS = 10_000;
/** Лимит пропал из открытых, а история о нём молчит, — столько повторов подряд, дальше ждём повторный снимок. */
const UNKNOWN_TRIES = 18;
/** Лимит исполнен, а позиции в состоянии потока нет дольше этого — она закрылась, цели вести не за чем. */
const POSITION_WAIT_MS = 30_000;
/** Свежую запись цели помним столько: событие о ней ещё в пути, и следующий лимит не должен её ослабить. */
const RECENT_MS = 15_000;

/** Лимит исполнился (хотя бы частью): снятый с частичным исполнением тоже открыл позицию. */
const executed = (row: any): boolean => row?.orderStatus === 'Filled' || positive(row?.cumExecQty) != null;

/**
 * «Стоп после исполнения» сетки входа на бирже, роль `worker`. Строку на каждый
 * лимит с целью пишет `api` вместе с сеткой; здесь — шаги: лимит исполнился —
 * стоп позиции подтягивается на его цель. То же правило, что у сессии
 * (`BacktestService.tightenStop`): цель по свою сторону от цены исполнения и
 * теснее нынешнего стопа, стоп только подтягивается.
 *
 * Шаги одного пользователя идут очередью, как у стопа за тейками: два лимита,
 * исполнившиеся подряд, не считают стоп по одному и тому же прочитанному.
 */
@Injectable()
export class EntryFollowService implements StreamListener {
  private readonly logger = new Logger(EntryFollowService.name);
  /** Пользователи с активной строкой — по последнему `pinned()`. */
  private planned = new Set<string>();
  private readonly due = new Map<string, number>();
  private readonly queues = new Map<string, Promise<void>>();
  private readonly unknownTries = new Map<string, number>();
  /** С какого момента исполненному лимиту не видно позиции — по id строки. */
  private readonly waitingSince = new Map<string, number>();
  /** Последняя цель, записанная на биржу, — по `пользователь:монета:сторона`. */
  private readonly recent = new Map<string, { target: number; at: number }>();

  constructor(
    private readonly plans: EntryFollowStore,
    private readonly bybit: BybitTerminalClient,
    private readonly market: TerminalMarketService,
    private readonly terminal: TerminalService,
  ) {}

  async pinned(): Promise<string[]> {
    const users = await this.plans.activeUsers();
    const next = new Set(users);
    // Лимит мог исполниться между сеткой и этим тиком — новый пользователь сверяется сразу.
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
      // Позиция исполненного лимита могла прийти позже его события.
      this.enqueue(userId, () => this.placeWaiting(userId, ctx));
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
        this.logger.error(`user ${userId}: шаг стопа после исполнения упал — ${e.message}`);
        this.due.set(userId, Date.now() + RETRY_MS);
      });
    this.queues.set(userId, next);
    void next.then(() => {
      if (this.queues.get(userId) === next) this.queues.delete(userId);
    });
  }

  private async onOrders(userId: string, rows: any[], ctx: StreamContext): Promise<void> {
    for (const f of await this.plans.activeOf(userId)) {
      const row = rows.find((r) => String(r.orderId) === f.orderId);
      if (row) await this.advance(f, row, ctx);
    }
  }

  /** Лимит снят или исполнен: снятый без исполнения вести не за чем, исполненный — цель на биржу. */
  private async advance(f: EntryFollow, row: any, ctx: StreamContext): Promise<void> {
    if (f.fillPrice == null) {
      if (!executed(row)) {
        await this.save(f, { active: false });
        return;
      }
      f.fillPrice = positive(row.avgPrice) ?? f.price;
      if (!(await this.save(f, { fillPrice: f.fillPrice }))) return;
    }
    await this.place(f, ctx);
  }

  /** Исполненные лимиты, чья цель ещё не встала: после события позиции и из сверки. */
  private async placeWaiting(userId: string, ctx: StreamContext): Promise<void> {
    for (const f of await this.plans.activeOf(userId)) {
      if (f.fillPrice != null) await this.place(f, ctx);
    }
  }

  private async place(f: EntryFollow, ctx: StreamContext): Promise<void> {
    const state = ctx.state();
    // Состояния нет — поток переподключается; сверка после снимка повторит шаг.
    if (!state || f.fillPrice == null) return;
    const position = positionOf(state, f);
    if (!position) {
      const since = this.waitingSince.get(f.id) ?? Date.now();
      this.waitingSince.set(f.id, since);
      if (Date.now() - since > POSITION_WAIT_MS) {
        // Позиция так и не появилась (закрыта сразу после входа): цели вести не за чем.
        this.waitingSince.delete(f.id);
        await this.save(f, { active: false });
      } else {
        this.due.set(f.userId, Date.now() + RETRY_MS);
      }
      return;
    }
    this.waitingSince.delete(f.id);

    const key = `${f.userId}:${f.symbol}:${f.direction}`;
    const memo = this.recent.get(key);
    // Стоп с биржи может отставать от только что записанного нами: берём более тесный.
    let current = position.stop;
    if (memo && Date.now() - memo.at < RECENT_MS) {
      const tighter = current == null || (f.direction === 'long' ? memo.target > current : memo.target < current);
      if (tighter) current = memo.target;
    }
    const target = followTarget(f.direction, f.fillPrice, [f.fillPrice], current, f.stopAfter);
    if (target == null) {
      // Цель не теснее нынешнего стопа или не по ту сторону от цены исполнения — двигать нечего.
      await this.save(f, { active: false });
      return;
    }

    try {
      const mark = (await this.market.markPrices()).get(f.symbol);
      if (mark != null && crossed(f.direction, mark, target)) {
        // Цена уже за целью: стоп на такой уровень биржа не примет. Остаток закрывается по рынку,
        // как сработал бы стоп; лимиты на вход не снимаются, как и при обычном стопе.
        await this.terminal.closePosition(f.userId, { symbol: f.symbol, direction: f.direction, kind: 'market' });
        this.logger.log(`user ${f.userId}: ${f.symbol} ${f.direction} — цена за стопом ${target}, позиция закрыта по рынку`);
        await this.save(f, { active: false });
        return;
      }
      const inst = await this.market.requireInstrument(f.symbol);
      const body: Record<string, string | number | boolean> = {
        category: 'linear',
        symbol: f.symbol,
        positionIdx: Number(position.row.positionIdx) || 0,
        tpslMode: 'Full',
        stopLoss: roundToTick(target, inst.tickSize),
      };
      // Что делает пропущенный тейк, Bybit не пишет (`0` его снимает) — передаём нынешний.
      const take = positive(position.row.takeProfit);
      if (take != null) body.takeProfit = roundToTick(take, inst.tickSize);
      await this.bybit.privatePost(ctx.creds, '/position/trading-stop', body, [LEVELS_NOT_MODIFIED]);
      this.recent.set(key, { target, at: Date.now() });
      await this.save(f, { active: false });
      this.logger.log(`user ${f.userId}: ${f.symbol} ${f.direction} — стоп после исполнения на ${target}`);
    } catch (e) {
      this.logger.warn(`user ${f.userId}: стоп после исполнения не встал — ${(e as Error).message}`);
      this.due.set(f.userId, Date.now() + RETRY_MS);
    }
  }

  /**
   * Сверка: после обрыва (событий за него биржа не пришлёт), для новой строки и
   * для не вставшей цели. Лимит, пропавший из открытых, читается из истории ордеров.
   */
  private async reconcile(userId: string, ctx: StreamContext): Promise<void> {
    if (!ctx.state()) return;
    for (const f of await this.plans.activeOf(userId)) {
      try {
        await this.reconcileOne(f, ctx);
      } catch (e) {
        this.logger.warn(`user ${userId}: сверка стопа после исполнения не прошла — ${(e as Error).message}`);
        this.due.set(userId, Date.now() + RETRY_MS);
      }
    }
  }

  private async reconcileOne(f: EntryFollow, ctx: StreamContext): Promise<void> {
    const state = ctx.state();
    if (!state) return;
    if (f.fillPrice != null) return this.place(f, ctx);
    if (f.orderId in state.orders) return;
    const res = await this.bybit.privateGet(ctx.creds, '/order/history', {
      category: 'linear',
      symbol: f.symbol,
      orderId: f.orderId,
    });
    const row = res.list?.[0];
    if (row && DONE.has(row.orderStatus)) {
      this.unknownTries.delete(f.id);
      return this.advance(f, row, ctx);
    }
    // Пропал из открытых, а в истории его нет или он ещё висит — история отстаёт: спросим позже.
    const tries = (this.unknownTries.get(f.id) ?? 0) + 1;
    this.unknownTries.set(f.id, tries);
    if (tries <= UNKNOWN_TRIES) this.due.set(f.userId, Date.now() + RETRY_MS);
  }

  private async save(f: EntryFollow, data: EntryFollowUpdate): Promise<boolean> {
    Object.assign(f, data);
    return this.plans.update(f.id, data);
  }
}
