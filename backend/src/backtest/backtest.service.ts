import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { BacktestTrade, BacktestTradeEntry, Prisma, Tag } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataService } from '../market-data/market-data.service';
import {
  MINUTE_MS,
  averageIn,
  maxDrawdownPct,
  pickPriceScale,
  pickStart,
  positionSize,
  startWindow,
  stopOnRightSide,
  summarize,
  takeOnRightSide,
  tradeResult,
  type Direction,
  type ExitReason,
} from './backtest-math';

export interface CreateSessionInput {
  startBalance: number;
  hideDate: boolean;
  hidePrice: boolean;
}

export interface OpenTradeInput {
  direction: Direction;
  entryTime: Date;
  entryPrice: number;
  stopLoss: number;
  takeProfit?: number;
  riskPct: number;
  leverage: number;
  entryOrderId?: string;
}

export interface ModifyTradeInput {
  stopLoss?: number;
  /** null — убрать тейк. */
  takeProfit?: number | null;
}

export interface AddToTradeInput {
  entryTime: Date;
  entryPrice: number;
  riskPct: number;
  entryOrderId?: string;
}

export interface CreateEntryOrdersInput {
  direction: Direction;
  stopLoss: number;
  takeProfit?: number;
  riskPct: number;
  leverage: number;
  prices: number[];
}

export interface CloseTradeInput {
  exitTime: Date;
  exitPrice: number;
  reason: ExitReason;
  qty?: number;
  closeOrderId?: string;
}

const timeInvalid = () =>
  new BadRequestException({ message: 'Время сделки вне сессии или раньше входа', code: 'BACKTEST_TIME_INVALID' });

const tradeClosed = () => new ConflictException({ message: 'Сделка уже закрыта', code: 'BACKTEST_TRADE_CLOSED' });

/** Допуск на накопленную погрешность float-сложений closedQty. */
const QTY_EPS = 1e-8;

/** Что подтягивать к сделке, чтобы отдать её с тегами и историей входов —
 * каждое отдельное исполнение (открытие и каждый добор сеткой), а не только
 * усреднённый итог в entryPrice/entryTime. По времени: разметка на графике
 * (одна стрелка на исполнение) обязана идти в порядке заполнения. */
export const TRADE_INCLUDE = { tags: { include: { tag: true } }, entries: { orderBy: { time: 'asc' } } } as const;

type TradeWithRelations = BacktestTrade & { tags: { tag: Tag }[]; entries: BacktestTradeEntry[] };

/** Сделка наружу: теги плоским списком — так их рисует фронт. */
export function tradeView(t: TradeWithRelations) {
  const { tags, ...rest } = t;
  return { ...rest, tags: tags.map(({ tag }) => ({ id: tag.id, name: tag.name, color: tag.color, type: tag.type })) };
}

/** Числа закрытой сделки для итогов; у закрытой pnl и r всегда есть. */
export const closedNumbers = (t: { pnl: number | null; r: number | null }) => ({ pnl: t.pnl ?? 0, r: t.r ?? 0 });

const noHistory = () =>
  new ConflictException({ message: 'История минуток ещё не загружена — сессию не на чем начать', code: 'BACKTEST_NO_HISTORY' });

export const sessionFinished = () =>
  new ConflictException({ message: 'Сессия уже завершена', code: 'BACKTEST_SESSION_FINISHED' });

@Injectable()
export class BacktestService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly marketData: MarketDataService,
  ) {}

  /** Вынесено полем, чтобы тесты задавали случай. */
  protected rnd: () => number = Math.random;

  async createSession(userId: string, input: CreateSessionInput) {
    const coverage = await this.marketData.getCoverage();
    const win = startWindow(
      coverage.find((c) => c.timeframe === 1440),
      coverage.find((c) => c.timeframe === 1),
    );
    if (!win) throw noHistory();

    // Точку старта и масштаб выбирает сервер: иначе создание сессии можно было
    // бы перезапускать из браузера, пока не выпадет узнаваемый отрезок.
    const start = pickStart(win, this.rnd);
    // Цена в точке старта — закрытие минутки, которая кончается в момент старта.
    const [last] = await this.marketData.getCandles({ timeframe: 1, to: new Date(start - MINUTE_MS), limit: 1 });
    if (!last) throw noHistory();

    const session = await this.prisma.backtestSession.create({
      data: {
        userId,
        startTime: new Date(start),
        cursorTime: new Date(start),
        startBalance: input.startBalance,
        balance: input.startBalance,
        hideDate: input.hideDate,
        hidePrice: input.hidePrice,
        priceScale: input.hidePrice ? pickPriceScale(last.close, this.rnd) : 1,
        status: 'active',
      },
    });
    return { session };
  }

  async listSessions(userId: string) {
    const rows = await this.prisma.backtestSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { trades: { where: { exitTime: { not: null } }, select: { pnl: true, r: true } } },
    });
    return {
      sessions: rows.map(({ trades, ...s }) => ({ ...s, summary: summarize(trades.map(closedNumbers)) })),
    };
  }

  async getSession(userId: string, id: string) {
    const session = await this.ownedSession(userId, id);
    const trades = await this.prisma.backtestTrade.findMany({
      where: { sessionId: id },
      orderBy: { entryTime: 'asc' },
      include: TRADE_INCLUDE,
    });
    const closeOrders = await this.prisma.backtestCloseOrder.findMany({
      where: { trade: { sessionId: id, exitTime: null } },
    });
    const entryOrders = await this.prisma.backtestEntryOrder.findMany({
      where: { sessionId: id },
      orderBy: { price: 'asc' },
    });
    const closed = trades
      .filter((t) => t.exitTime != null)
      .sort((a, b) => a.exitTime!.getTime() - b.exitTime!.getTime());
    return {
      session,
      trades: trades.map(tradeView),
      closeOrders,
      entryOrders,
      summary: {
        ...summarize(closed.map(closedNumbers)),
        maxDrawdownPct: maxDrawdownPct(session.startBalance, closed.map((t) => t.pnl ?? 0)),
      },
    };
  }

  async advance(userId: string, id: string, cursorTime: Date) {
    await this.ownedSession(userId, id);
    await this.bumpCursor(this.prisma, id, cursorTime);
    const s = await this.prisma.backtestSession.findUnique({ where: { id }, select: { cursorTime: true } });
    return { cursorTime: s!.cursorTime };
  }

  async finish(userId: string, id: string) {
    const s = await this.ownedSession(userId, id);
    if (s.status !== 'active') throw sessionFinished();
    return this.prisma.$transaction(async (tx) => {
      // Лок строки сессии + защита статуса — тот же bumpCursor, что у входа и
      // выхода сделки; GREATEST с уже известным cursorTime дальше его не
      // сдвинет, но замок и проверку status='active' даёт.
      const bumped = await this.bumpCursor(tx, id, s.cursorTime);
      if (bumped === 0) throw sessionFinished();
      // Позицию закрывает браузер (он знает цену момента), сервер только проверяет.
      const open = await tx.backtestTrade.count({ where: { sessionId: id, exitTime: null } });
      if (open > 0) throw new ConflictException({ message: 'Сначала закройте открытую сделку', code: 'BACKTEST_OPEN_TRADE' });
      const pendingEntries = await tx.backtestEntryOrder.count({ where: { sessionId: id } });
      if (pendingEntries > 0) {
        throw new ConflictException({ message: 'Сначала отмените ордера сетки', code: 'BACKTEST_ENTRY_ORDERS_PENDING' });
      }
      const session = await tx.backtestSession.update({
        where: { id },
        data: { status: 'finished', finishedAt: new Date() },
      });
      return { session };
    });
  }

  /**
   * Сессию, которую не собираются доигрывать, отменяет удаление — не
   * `finish`: тот требует закрытую позицию и оставляет сессию в статистике
   * как сыгранную. Каскад в схеме (`onDelete: Cascade` от сессии к сделкам,
   * их выходам, ордерам и тегам) снимает необходимость чистить их здесь.
   */
  async deleteSession(userId: string, id: string) {
    await this.ownedSession(userId, id);
    await this.prisma.backtestSession.delete({ where: { id } });
  }

  async openTrade(userId: string, sessionId: string, input: OpenTradeInput) {
    const s = await this.ownedSession(userId, sessionId);
    if (s.status !== 'active') throw sessionFinished();
    if (input.entryTime.getTime() < s.startTime.getTime()) throw timeInvalid();
    // Сторона — только при входе: дальше стоп можно тянуть в безубыток и в
    // прибыль, а текущей цены сервер не знает (её проверяет браузер).
    if (!stopOnRightSide(input.direction, input.entryPrice, input.stopLoss)) {
      throw new BadRequestException({ message: 'Стоп стоит не по ту сторону от входа', code: 'BACKTEST_STOP_SIDE' });
    }
    if (input.takeProfit != null && !takeOnRightSide(input.direction, input.entryPrice, input.takeProfit)) {
      throw new BadRequestException({ message: 'Тейк стоит не по ту сторону от входа', code: 'BACKTEST_TAKE_SIDE' });
    }

    return this.prisma.$transaction(async (tx) => {
      // Первым делом — строка сессии: она двигает момент и держит замок (см. bumpCursor).
      // Результат проверяем: сессию могли завершить между внешней проверкой
      // выше и входом сюда — тогда WHERE status='active' не заденет ни одной
      // строки, и создавать сделку в уже завершённой сессии нельзя.
      const bumped = await this.bumpCursor(tx, sessionId, input.entryTime);
      if (bumped === 0) throw sessionFinished();
      const open = await tx.backtestTrade.count({ where: { sessionId, exitTime: null, direction: input.direction } });
      if (open > 0) throw new ConflictException({ message: 'Открытая сделка уже есть', code: 'BACKTEST_OPEN_TRADE' });
      // Депозит — под замком: закрытие прошлой сделки могло поменять его после чтения выше.
      const fresh = await tx.backtestSession.findUnique({ where: { id: sessionId }, select: { balance: true } });
      if (fresh!.balance <= 0) {
        // Слитый депозит: риск от него уже не считается — от нулевого или
        // отрицательного баланса qty/riskUsdt выходят некорректными (r и pnl
        // расходятся в знаке, при balance === 0 — NaN). Сессию отсюда можно
        // только завершить.
        throw new ConflictException({
          message: 'Депозит сессии исчерпан — сессию можно только завершить',
          code: 'BACKTEST_NO_BALANCE',
        });
      }
      const { riskUsdt, qty } = positionSize(fresh!.balance, input.riskPct, input.entryPrice, input.stopLoss);
      const notional = qty * input.entryPrice;
      const margin = notional / input.leverage;
      if (margin > fresh!.balance) {
        throw new BadRequestException({ message: 'Маржа больше депозита', code: 'BACKTEST_MARGIN_EXCEEDS_BALANCE' });
      }
      const trade = await tx.backtestTrade.create({
        data: {
          sessionId,
          direction: input.direction,
          entryTime: input.entryTime,
          entryPrice: input.entryPrice,
          stopLoss: input.stopLoss,
          takeProfit: input.takeProfit ?? null,
          riskPct: input.riskPct,
          riskUsdt,
          qty,
          leverage: input.leverage,
          // Первое исполнение — сразу вложенным create: у сделки ещё нет id
          // ни для одного отдельного запроса, а второй запрос тем же id
          // потребовал бы отдельного круга к базе только ради истории входов.
          entries: { create: { qty, price: input.entryPrice, time: input.entryTime } },
        },
        include: TRADE_INCLUDE,
      });
      // Тот же приём, что у closeOrderId в closeTrade: удаление сработавшего
      // уровня сетки — в одной транзакции с открытием, а не вторым запросом,
      // иначе обрыв сети между ними оставил бы уровень висеть и он сработал бы ещё раз.
      if (input.entryOrderId) {
        await tx.backtestEntryOrder.deleteMany({ where: { id: input.entryOrderId, sessionId } });
      }
      return { trade: tradeView(trade) };
    });
  }

  async modifyTrade(userId: string, tradeId: string, input: ModifyTradeInput) {
    const trade = await this.ownedTrade(userId, tradeId);
    if (trade.exitTime) throw tradeClosed();
    if (trade.session.status !== 'active') throw sessionFinished();
    const data: { stopLoss?: number; takeProfit?: number | null } = {};
    if (input.stopLoss !== undefined) data.stopLoss = input.stopLoss;
    if (input.takeProfit !== undefined) data.takeProfit = input.takeProfit;

    return this.prisma.$transaction(async (tx) => {
      // Тот же замок + защита статуса сессии, что у входа и выхода сделки —
      // сессию или саму сделку могли завершить между чтением выше и сюда.
      const bumped = await this.bumpCursor(tx, trade.sessionId, trade.session.cursorTime);
      if (bumped === 0) throw sessionFinished();
      const result = await tx.backtestTrade.updateMany({ where: { id: tradeId, exitTime: null }, data });
      if (result.count === 0) throw tradeClosed();
      const updated = await tx.backtestTrade.findUnique({ where: { id: tradeId }, include: TRADE_INCLUDE });
      return { trade: tradeView(updated!) };
    });
  }

  async addToTrade(userId: string, tradeId: string, input: AddToTradeInput) {
    const trade = await this.ownedTrade(userId, tradeId);
    if (trade.exitTime) throw tradeClosed();
    if (trade.session.status !== 'active') throw sessionFinished();
    // Добор не может быть раньше открытия — тот же порядок времени, что
    // closeTrade требует от exitTime относительно entryTime.
    if (input.entryTime.getTime() < trade.entryTime.getTime()) throw timeInvalid();

    return this.prisma.$transaction(async (tx) => {
      // Добор — содержательный момент сессии (как открытие и закрытие), а не
      // просто повторная проверка замка (как у modifyTrade): курсор двигаем
      // на его время, а не на уже известное trade.session.cursorTime.
      const bumped = await this.bumpCursor(tx, trade.sessionId, input.entryTime);
      if (bumped === 0) throw sessionFinished();
      const fresh = await tx.backtestSession.findUnique({ where: { id: trade.sessionId }, select: { balance: true } });

      const { riskUsdt: addRiskUsdt, qty: addQty } = positionSize(
        fresh!.balance,
        input.riskPct,
        input.entryPrice,
        trade.stopLoss,
      );
      const newQty = trade.qty + addQty;
      const newEntry = averageIn(trade.qty, trade.entryPrice, addQty, input.entryPrice);
      const newRiskUsdt = trade.riskUsdt + addRiskUsdt;
      const newRiskPct = (newRiskUsdt / fresh!.balance) * 100;
      const direction = trade.direction as Direction;

      if (!stopOnRightSide(direction, newEntry, trade.stopLoss)) {
        throw new BadRequestException({ message: 'Добор загоняет средний вход за стоп', code: 'BACKTEST_STOP_SIDE' });
      }
      if (trade.takeProfit != null && !takeOnRightSide(direction, newEntry, trade.takeProfit)) {
        throw new BadRequestException({ message: 'Добор загоняет средний вход за тейк', code: 'BACKTEST_TAKE_SIDE' });
      }
      const margin = (newQty * newEntry) / trade.leverage;
      if (margin > fresh!.balance) {
        throw new BadRequestException({ message: 'Маржа добора больше депозита', code: 'BACKTEST_MARGIN_EXCEEDS_BALANCE' });
      }

      const result = await tx.backtestTrade.updateMany({
        where: { id: tradeId, exitTime: null },
        data: { qty: newQty, entryPrice: newEntry, riskUsdt: newRiskUsdt, riskPct: newRiskPct },
      });
      if (result.count === 0) throw tradeClosed();
      // Своя строка истории на каждый добор — тем же приёмом, что и
      // BacktestTradeExit у частичных закрытий: без неё entryPrice/entryTime
      // сделки после доборов — только усреднённый итог, и разметить на
      // графике каждый отдельный вход сеткой было бы нечем.
      await tx.backtestTradeEntry.create({ data: { tradeId, qty: addQty, price: input.entryPrice, time: input.entryTime } });
      // См. openTrade.entryOrderId — тот же атомарный приём для уровня сетки,
      // который долил уже открытую сделку, а не создал новую.
      if (input.entryOrderId) {
        await tx.backtestEntryOrder.deleteMany({ where: { id: input.entryOrderId, sessionId: trade.sessionId } });
      }
      const updated = await tx.backtestTrade.findUnique({ where: { id: tradeId }, include: TRADE_INCLUDE });
      return { trade: tradeView(updated!) };
    });
  }

  /**
   * Сетка отложенных лимит-ордеров на вход (Scaled order): создаётся одним
   * пакетом, дальше каждая строка живёт как самостоятельный BacktestEntryOrder
   * до срабатывания цены в реплее (клиент вызывает openTrade/addToTrade с её
   * id) или ручной отмены. Общие стоп/тейк/плечо продублированы по всем
   * строкам — сработает первая, откроет сделку с ними; остальные лягут в неё
   * же через addToTrade, который смотрит уже на стоп открытой сделки, а не на
   * значение здесь.
   */
  async createEntryOrders(userId: string, sessionId: string, input: CreateEntryOrdersInput) {
    const s = await this.ownedSession(userId, sessionId);
    if (s.status !== 'active') throw sessionFinished();
    for (const price of input.prices) {
      if (!stopOnRightSide(input.direction, price, input.stopLoss)) {
        throw new BadRequestException({ message: 'Стоп стоит не по ту сторону от входа', code: 'BACKTEST_STOP_SIDE' });
      }
      if (input.takeProfit != null && !takeOnRightSide(input.direction, price, input.takeProfit)) {
        throw new BadRequestException({ message: 'Тейк стоит не по ту сторону от входа', code: 'BACKTEST_TAKE_SIDE' });
      }
    }
    const open = await this.prisma.backtestTrade.count({ where: { sessionId, exitTime: null, direction: input.direction } });
    if (open > 0) throw new ConflictException({ message: 'Открытая сделка уже есть', code: 'BACKTEST_OPEN_TRADE' });
    const pending = await this.prisma.backtestEntryOrder.count({ where: { sessionId, direction: input.direction } });
    if (pending > 0) {
      throw new ConflictException({ message: 'Сетка в эту сторону уже стоит', code: 'BACKTEST_ENTRY_ORDERS_EXIST' });
    }
    const entryOrders = await this.prisma.$transaction(
      input.prices.map((price) =>
        this.prisma.backtestEntryOrder.create({
          data: {
            sessionId,
            direction: input.direction,
            price,
            riskPct: input.riskPct,
            stopLoss: input.stopLoss,
            takeProfit: input.takeProfit ?? null,
            leverage: input.leverage,
          },
        }),
      ),
    );
    return { entryOrders };
  }

  async cancelEntryOrder(userId: string, orderId: string) {
    const order = await this.prisma.backtestEntryOrder.findUnique({ where: { id: orderId }, include: { session: true } });
    if (!order || order.session.userId !== userId) {
      throw new NotFoundException({ message: 'Ордер не найден', code: 'BACKTEST_ENTRY_ORDER_NOT_FOUND' });
    }
    await this.prisma.backtestEntryOrder.delete({ where: { id: orderId } });
    return { success: true as const };
  }

  async setLeverage(userId: string, sessionId: string, leverage: number) {
    const s = await this.ownedSession(userId, sessionId);
    if (s.status !== 'active') throw sessionFinished();

    return this.prisma.$transaction(async (tx) => {
      // cursorTime — свежим чтением внутри транзакции, а не из `s` выше: у modifyTrade
      // для той же цели (bumpCursor как замок, без содержательного нового момента) есть
      // готовое значение под рукой через ownedTrade (trade.session.cursorTime), но
      // ownedSession отдаёт только то, что уже проверено выше (status) — своё чтение
      // надёжнее, чем полагаться на непроверенный состав остальных полей.
      const fresh = await tx.backtestSession.findUnique({ where: { id: sessionId }, select: { balance: true, cursorTime: true } });
      const bumped = await this.bumpCursor(tx, sessionId, fresh!.cursorTime);
      if (bumped === 0) throw sessionFinished();
      const open = await tx.backtestTrade.findMany({ where: { sessionId, exitTime: null } });
      for (const trade of open) {
        const margin = (trade.qty * trade.entryPrice) / leverage;
        if (margin > fresh!.balance) {
          throw new BadRequestException({ message: 'Маржа больше депозита', code: 'BACKTEST_MARGIN_EXCEEDS_BALANCE' });
        }
      }
      await tx.backtestTrade.updateMany({ where: { sessionId, exitTime: null }, data: { leverage } });
      const trades = await tx.backtestTrade.findMany({ where: { sessionId, exitTime: null }, include: TRADE_INCLUDE });
      return { trades: trades.map(tradeView) };
    });
  }

  async createCloseOrder(userId: string, tradeId: string, input: { price: number; qty: number }) {
    const trade = await this.ownedTrade(userId, tradeId);
    if (trade.exitTime) throw tradeClosed();
    if (trade.session.status !== 'active') throw sessionFinished();
    const remaining = trade.qty - trade.closedQty;
    if (input.qty > remaining + QTY_EPS) {
      throw new BadRequestException({ message: 'Объём больше остатка', code: 'BACKTEST_QTY_EXCEEDS_REMAINING' });
    }
    const order = await this.prisma.backtestCloseOrder.create({
      data: { tradeId, price: input.price, qty: input.qty },
    });
    return { closeOrder: order };
  }

  async cancelCloseOrder(userId: string, orderId: string) {
    const order = await this.prisma.backtestCloseOrder.findUnique({
      where: { id: orderId },
      include: { trade: { include: { session: true } } },
    });
    if (!order || order.trade.session.userId !== userId) {
      throw new NotFoundException({ message: 'Ордер не найден', code: 'BACKTEST_CLOSE_ORDER_NOT_FOUND' });
    }
    await this.prisma.backtestCloseOrder.delete({ where: { id: orderId } });
    return { success: true as const };
  }

  async closeTrade(userId: string, tradeId: string, input: CloseTradeInput) {
    const trade = await this.ownedTrade(userId, tradeId);
    if (trade.exitTime) {
      // Уже закрыта целиком — повтор того же финального запроса не ошибка.
      if (trade.exitTime.getTime() === input.exitTime.getTime() && trade.exitPrice === input.exitPrice) {
        const same = await this.prisma.backtestTrade.findUnique({ where: { id: tradeId }, include: TRADE_INCLUDE });
        return { trade: tradeView(same!), balance: trade.session.balance };
      }
      throw tradeClosed();
    }
    if (input.exitTime.getTime() <= trade.entryTime.getTime()) throw timeInvalid();

    const remaining = trade.qty - trade.closedQty;
    const qty = input.qty ?? remaining;
    if (qty > remaining + QTY_EPS) {
      throw new BadRequestException({ message: 'Объём закрытия больше остатка', code: 'BACKTEST_QTY_EXCEEDS_REMAINING' });
    }

    const { fee, pnl } = tradeResult({
      direction: trade.direction as Direction,
      entryPrice: trade.entryPrice,
      exitPrice: input.exitPrice,
      qty,
      riskUsdt: trade.riskUsdt,
    });

    return this.prisma.$transaction(async (tx) => {
      await this.bumpCursor(tx, trade.sessionId, input.exitTime);
      // CAS по closedQty — тот же замысел, что раньше был у `exitTime: null`:
      // параллельный дубликат этого же запроса не должен начислить PnL дважды.
      const cas = await tx.backtestTrade.updateMany({
        where: { id: tradeId, closedQty: trade.closedQty },
        data: { closedQty: { increment: qty } },
      });
      if (cas.count === 0) {
        // Гонка или потерянный-и-повторённый ответ — разбираемся по последнему exit.
        const raced = await tx.backtestTrade.findUnique({ where: { id: tradeId }, include: TRADE_INCLUDE });
        if (!raced) throw tradeClosed();
        const exits = await tx.backtestTradeExit.findMany({ where: { tradeId }, orderBy: { createdAt: 'desc' }, take: 1 });
        const last = exits[0];
        const same =
          last != null &&
          last.qty === qty &&
          last.price === input.exitPrice &&
          last.time.getTime() === input.exitTime.getTime() &&
          last.reason === input.reason;
        if (!same) throw tradeClosed();
        const fresh = await tx.backtestSession.findUnique({ where: { id: trade.sessionId }, select: { balance: true } });
        return { trade: tradeView(raced), balance: fresh!.balance };
      }

      await tx.backtestTradeExit.create({
        data: { tradeId, qty, price: input.exitPrice, time: input.exitTime, reason: input.reason, fee, pnl },
      });
      if (input.closeOrderId) {
        await tx.backtestCloseOrder.deleteMany({ where: { id: input.closeOrderId, tradeId } });
      }
      const session = await tx.backtestSession.update({
        where: { id: trade.sessionId },
        data: { balance: { increment: pnl } },
      });

      const newClosedQty = trade.closedQty + qty;
      if (newClosedQty >= trade.qty - QTY_EPS) {
        const exits = await tx.backtestTradeExit.findMany({ where: { tradeId } });
        const totalFee = exits.reduce((s, e) => s + e.fee, 0);
        const totalPnl = exits.reduce((s, e) => s + e.pnl, 0);
        await tx.backtestTrade.update({
          where: { id: tradeId },
          data: {
            exitTime: input.exitTime,
            exitPrice: input.exitPrice,
            exitReason: input.reason,
            fee: totalFee,
            pnl: totalPnl,
            r: totalPnl / trade.riskUsdt,
          },
        });
        await tx.backtestCloseOrder.deleteMany({ where: { tradeId } });
        // Сделка закрыта целиком — остаток сетки, что её докармливала, метит в
        // никуда: у следующей сделки этого направления будут другие стоп/тейк.
        await tx.backtestEntryOrder.deleteMany({ where: { sessionId: trade.sessionId, direction: trade.direction } });
      }

      const updated = await tx.backtestTrade.findUnique({ where: { id: tradeId }, include: TRADE_INCLUDE });
      return { trade: tradeView(updated!), balance: session.balance };
    });
  }

  async setTradeTags(userId: string, tradeId: string, tagIds: string[]) {
    await this.ownedTrade(userId, tradeId);
    const unique = [...new Set(tagIds)];
    if (unique.length > 0) {
      const owned = await this.prisma.tag.count({ where: { userId, id: { in: unique } } });
      if (owned !== unique.length) {
        throw new BadRequestException({ message: 'Некоторые теги не найдены', code: 'TAGS_NOT_FOUND' });
      }
    }
    await this.prisma.$transaction([
      this.prisma.backtestTradeTag.deleteMany({ where: { tradeId } }),
      ...(unique.length > 0
        ? [this.prisma.backtestTradeTag.createMany({ data: unique.map((tagId) => ({ tradeId, tagId })) })]
        : []),
    ]);
    return { success: true as const };
  }

  async stats(userId: string) {
    const [sessions, trades] = await Promise.all([
      this.prisma.backtestSession.count({ where: { userId } }),
      this.prisma.backtestTrade.findMany({
        where: { session: { userId }, exitTime: { not: null } },
        include: TRADE_INCLUDE,
      }),
    ]);

    type TagRef = { id: string; name: string; color: string; type: string };
    const buckets = new Map<string, { tag: TagRef; rows: { pnl: number; r: number }[] }>();
    for (const t of trades) {
      // Сделка засчитывается целиком каждому своему тегу, как в журнале
      // (statsByTag): деление поровну обессмыслило бы число. Поэтому строки по
      // тегам пересекаются и в общий итог не складываются.
      for (const { tag } of t.tags) {
        const bucket = buckets.get(tag.id) ?? {
          tag: { id: tag.id, name: tag.name, color: tag.color, type: tag.type },
          rows: [],
        };
        bucket.rows.push(closedNumbers(t));
        buckets.set(tag.id, bucket);
      }
    }

    return {
      overall: { sessions, ...summarize(trades.map(closedNumbers)) },
      byTag: [...buckets.values()]
        .map(({ tag, rows }) => ({ tag, ...summarize(rows) }))
        .sort((a, b) => b.trades - a.trades || a.tag.name.localeCompare(b.tag.name)),
    };
  }

  protected async ownedTrade(userId: string, id: string) {
    const trade = await this.prisma.backtestTrade.findUnique({ where: { id }, include: { session: true } });
    if (!trade || trade.session.userId !== userId) {
      throw new NotFoundException({ message: 'Сделка не найдена', code: 'BACKTEST_TRADE_NOT_FOUND' });
    }
    return trade;
  }

  protected async ownedSession(userId: string, id: string) {
    const s = await this.prisma.backtestSession.findUnique({ where: { id } });
    // 404, а не 403: чужая сессия не должна подтверждать, что она существует.
    if (!s || s.userId !== userId) {
      throw new NotFoundException({ message: 'Сессия не найдена', code: 'BACKTEST_SESSION_NOT_FOUND' });
    }
    return s;
  }

  /**
   * Двигает момент сессии вперёд — и только вперёд: GREATEST в самом UPDATE, а
   * не сравнение в коде. Браузер сохраняет момент с задержкой, и запоздавшее
   * сохранение иначе отмотало бы назад момент, который уже продвинул вход в
   * сделку.
   *
   * В транзакциях входа и выхода этот же UPDATE — замок строки сессии: вход из
   * второй вкладки ждёт здесь, пока первый не закоммитится, и дальше видит уже
   * открытую сделку. `::timestamp(3)` — колонки Prisma хранят UTC без зоны.
   */
  protected bumpCursor(db: Prisma.TransactionClient, id: string, t: Date) {
    return db.$executeRaw`UPDATE "backtest_sessions" SET "cursorTime" = GREATEST("cursorTime", ${t}::timestamp(3)) WHERE "id" = ${id} AND "status" = 'active'`;
  }
}
