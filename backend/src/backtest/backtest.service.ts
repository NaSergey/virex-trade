import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { BacktestTrade, BacktestTradeEntry, Prisma, Tag } from '@prisma/client';
import { BattlePassService } from '../battlepass/battlepass.service';
import { XP_SOURCES } from '../battlepass/xp-registry';
import { PrismaService } from '../prisma/prisma.service';
import { LiveMarketService } from '../market-data/live-market.service';
import { MarketDataService } from '../market-data/market-data.service';
import { TIMEFRAMES, isValidTimeframe } from '../market-data/timeframes';
import { SYNTH_VERSION } from './synthetic/params';
import { SyntheticMarketService } from './synthetic/synthetic-market.service';
import {
  MINUTE_MS,
  averageIn,
  closedNumbers,
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

export type DataSource = 'real' | 'synthetic';

export interface CreateSessionInput {
  startBalance: number;
  hideDate: boolean;
  hidePrice: boolean;
  /** Не задан — реальная история. */
  dataSource?: DataSource;
}

export interface SessionCandlesInput {
  timeframe: number;
  from?: Date;
  to?: Date;
  limit: number;
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

const noHistory = () =>
  new ConflictException({ message: 'История минуток ещё не загружена — сессию не на чем начать', code: 'BACKTEST_NO_HISTORY' });

export const sessionFinished = () =>
  new ConflictException({ message: 'Сессия уже завершена', code: 'BACKTEST_SESSION_FINISHED' });

/** Сессия построена прежней версией генератора: её график больше не построить. */
export const isSynthOutdated = (s: { dataSource: string; synthVersion: number | null }) =>
  s.dataSource === 'synthetic' && s.synthVersion !== SYNTH_VERSION;

const synthOutdated = () =>
  new ConflictException({
    message: 'Генератор рынка обновился — график этой сессии больше не построить',
    code: 'BACKTEST_SYNTH_OUTDATED',
  });

const tournamentEnded = () =>
  new ConflictException({ message: 'Турнир завершён', code: 'TOURNAMENT_ENDED' });

/**
 * Сессия турнира в прямом эфире. Отличается от обычной тем, кому верят: время
 * идёт и без участника — у закрытой вкладки стоп обязан сработать, — поэтому
 * цену и время сделки ставит сервер, а стопы, тейки и лимитки исполняет
 * `TournamentRunner`, а не браузер.
 */
type MaybeTournament = { tournament?: { mode: string } | null; endTime?: Date | null };
const isLiveTournament = (s: MaybeTournament) => s.tournament?.mode === 'live';

@Injectable()
export class BacktestService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly marketData: MarketDataService,
    protected readonly synthetic: SyntheticMarketService,
    protected readonly live: LiveMarketService,
    protected readonly battlePass: BattlePassService,
  ) {}

  /** Вынесено полем, чтобы тесты задавали случай. */
  protected rnd: () => number = Math.random;

  async createSession(userId: string, input: CreateSessionInput) {
    if (input.dataSource === 'synthetic') return this.createSyntheticSession(userId, input);
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

  protected async createSyntheticSession(userId: string, input: CreateSessionInput) {
    // Зерно выбирает сервер тем же случаем, что и старт реальной сессии.
    const seed = Math.floor(this.rnd() * 2 ** 31);
    const { start, price } = this.synthetic.start(seed);
    const session = await this.prisma.backtestSession.create({
      data: {
        userId,
        dataSource: 'synthetic',
        seed,
        synthVersion: SYNTH_VERSION,
        startTime: new Date(start),
        cursorTime: new Date(start),
        startBalance: input.startBalance,
        balance: input.startBalance,
        // Даты у сгенерированного рынка вымышленные — показывать их незачем.
        hideDate: true,
        hidePrice: input.hidePrice,
        priceScale: input.hidePrice ? pickPriceScale(price, this.rnd) : 1,
        status: 'active',
      },
    });
    return { session };
  }

  async sessionCandles(userId: string, id: string, q: SessionCandlesInput) {
    const s = await this.ownedSession(userId, id);
    if (s.dataSource !== 'synthetic') {
      throw new BadRequestException({
        message: 'У этой сессии реальный график, а не сгенерированный',
        code: 'BACKTEST_NOT_SYNTHETIC',
      });
    }
    if (isSynthOutdated(s)) throw synthOutdated();
    if (!isValidTimeframe(q.timeframe)) {
      throw new BadRequestException(`Неизвестный таймфрейм: ${q.timeframe}. Допустимы: ${TIMEFRAMES.join(', ')}`);
    }
    return this.synthetic.getCandles(s.seed, {
      timeframe: q.timeframe,
      from: q.from?.getTime(),
      to: q.to?.getTime(),
      limit: q.limit,
    });
  }

  /**
   * Сессии бектеста — без турнирных (`tournamentId: null`). Результат под
   * давлением соревнования говорит о соревновании, а не о системе сетапов, и
   * в списке своих тренировок ему делать нечего.
   */
  async listSessions(userId: string) {
    const rows = await this.prisma.backtestSession.findMany({
      where: { userId, tournamentId: null },
      orderBy: { createdAt: 'desc' },
      include: { trades: { where: { exitTime: { not: null } }, select: { pnl: true, r: true } } },
    });
    return {
      sessions: rows.map(({ trades, ...s }) => ({ ...s, summary: summarize(trades.map(closedNumbers)) })),
    };
  }

  async getSession(userId: string, id: string) {
    const { tournament, ...session } = await this.ownedSession(userId, id);
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
      // Турнир — рядом с сессией, а не внутри неё: терминалу нужны только эти
      // поля, и вторая копия турнира в составе сессии могла бы с ними разойтись.
      tournament: tournament
        ? {
            id: tournament.id,
            name: tournament.name,
            mode: tournament.mode,
            status: tournament.status,
            endsAt: tournament.endsAt,
          }
        : null,
      synthOutdated: isSynthOutdated(session),
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
    const s = await this.ownedSession(userId, id);
    // В эфире момент сессии ведёт время, а не браузер: двигать его присланным
    // значением значило бы разрешить перемотку вперёд.
    if (isLiveTournament(s)) return { cursorTime: s.cursorTime };
    await this.bumpCursor(this.prisma, id, cursorTime);
    const moved = await this.prisma.backtestSession.findUnique({ where: { id }, select: { cursorTime: true } });
    return { cursorTime: moved!.cursorTime };
  }

  async finish(userId: string, id: string) {
    const s = await this.ownedSession(userId, id);
    if (s.status !== 'active') throw sessionFinished();
    // Эфирную сессию участник не завершает: она кончается вместе с турниром, и
    // ранний выход означал бы фиксацию результата в удобный момент.
    if (isLiveTournament(s)) {
      throw new ConflictException({
        message: 'Сессия турнира завершается вместе с турниром',
        code: 'TOURNAMENT_LIVE_FINISH',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      // Лок строки сессии + защита статуса — тот же bumpCursor, что у входа и
      // выхода сделки; GREATEST с уже известным cursorTime дальше его не
      // сдвинет, но замок и проверку status='active' даёт.
      const bumped = await this.bumpCursor(tx, id, s.cursorTime);
      if (bumped === 0) throw sessionFinished();
      if (isSynthOutdated(s)) {
        // Цены момента у такой сессии больше нет — закрыть по рынку браузеру нечем.
        await this.closeAtEntry(tx, id, s.cursorTime);
        // Уровни сетки без цены тоже не сработают никогда — снимаем их вместе с позициями.
        await tx.backtestEntryOrder.deleteMany({ where: { sessionId: id } });
      } else {
        // Позицию закрывает браузер (он знает цену момента), сервер только проверяет.
        const open = await tx.backtestTrade.count({ where: { sessionId: id, exitTime: null } });
        if (open > 0) throw new ConflictException({ message: 'Сначала закройте открытую сделку', code: 'BACKTEST_OPEN_TRADE' });
        const pendingEntries = await tx.backtestEntryOrder.count({ where: { sessionId: id } });
        if (pendingEntries > 0) {
          throw new ConflictException({ message: 'Сначала отмените ордера сетки', code: 'BACKTEST_ENTRY_ORDERS_PENDING' });
        }
      }
      const session = await tx.backtestSession.update({
        where: { id },
        data: { status: 'finished', finishedAt: new Date() },
      });
      // XP только за свою сессию: турнирная кончается вместе с турниром и
      // оплачена источником game.tournament. Сюда такая сессия и не доходит —
      // `finish` отказывает ей выше, — но источник начисления должен быть
      // назван в одном месте, а не выводиться из порядка проверок.
      await this.battlePass.award(tx, userId, 'game.backtest', id, XP_SOURCES['game.backtest'].base);
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

  async openTrade(userId: string, sessionId: string, rawInput: OpenTradeInput) {
    const s = await this.ownedSession(userId, sessionId);
    if (s.status !== 'active') throw sessionFinished();
    // В эфире вход исполняется по живой цене в момент запроса, как на бирже:
    // присланные браузером время и цена — только его представление о рынке.
    const input = await this.withServerEntry(s, rawInput);
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

  async addToTrade(userId: string, tradeId: string, rawInput: AddToTradeInput) {
    const trade = await this.ownedTrade(userId, tradeId);
    if (trade.exitTime) throw tradeClosed();
    if (trade.session.status !== 'active') throw sessionFinished();
    // См. openTrade: в эфире цену и время добора тоже ставит сервер.
    const input = await this.withServerEntry(trade.session, rawInput);
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

  async closeTrade(userId: string, tradeId: string, rawInput: CloseTradeInput) {
    const trade = await this.ownedTrade(userId, tradeId);
    const input = await this.withServerExit(trade.session, rawInput);
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
      const applied = await this.applyClose(tx, trade, { ...input, qty });
      if (!applied) {
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

      const updated = await tx.backtestTrade.findUnique({ where: { id: tradeId }, include: TRADE_INCLUDE });
      return { trade: tradeView(updated!), balance: applied.balance };
    });
  }

  /**
   * Одно закрытие — общее для запроса участника и для движка турнира: CAS по
   * остатку, строка выхода, депозит, снятие ордеров и финализация сделки, когда
   * остаток исчерпан. Разные вызывающие расходятся только в том, что делать с
   * проигранным CAS: участнику нужно разобрать повтор запроса, движку — просто
   * перечитать сделку на следующем тике.
   *
   * `null` — CAS проигран: остаток изменился между чтением и записью.
   */
  protected async applyClose(
    tx: Prisma.TransactionClient,
    trade: { id: string; sessionId: string; direction: string; entryPrice: number; riskUsdt: number; qty: number; closedQty: number },
    input: CloseTradeInput & { qty: number },
  ): Promise<{ balance: number } | null> {
    const { fee, pnl } = tradeResult({
      direction: trade.direction as Direction,
      entryPrice: trade.entryPrice,
      exitPrice: input.exitPrice,
      qty: input.qty,
      riskUsdt: trade.riskUsdt,
    });

    await this.bumpCursor(tx, trade.sessionId, input.exitTime);
    // CAS по closedQty — тот же замысел, что раньше был у `exitTime: null`:
    // параллельный дубликат этого же запроса не должен начислить PnL дважды.
    const cas = await tx.backtestTrade.updateMany({
      where: { id: trade.id, closedQty: trade.closedQty },
      data: { closedQty: { increment: input.qty } },
    });
    if (cas.count === 0) return null;

    await tx.backtestTradeExit.create({
      data: { tradeId: trade.id, qty: input.qty, price: input.exitPrice, time: input.exitTime, reason: input.reason, fee, pnl },
    });
    if (input.closeOrderId) {
      await tx.backtestCloseOrder.deleteMany({ where: { id: input.closeOrderId, tradeId: trade.id } });
    }
    const session = await tx.backtestSession.update({
      where: { id: trade.sessionId },
      data: { balance: { increment: pnl } },
    });

    const newClosedQty = trade.closedQty + input.qty;
    if (newClosedQty >= trade.qty - QTY_EPS) {
      const exits = await tx.backtestTradeExit.findMany({ where: { tradeId: trade.id } });
      const totalFee = exits.reduce((s, e) => s + e.fee, 0);
      const totalPnl = exits.reduce((s, e) => s + e.pnl, 0);
      await tx.backtestTrade.update({
        where: { id: trade.id },
        data: {
          exitTime: input.exitTime,
          exitPrice: input.exitPrice,
          exitReason: input.reason,
          fee: totalFee,
          pnl: totalPnl,
          r: totalPnl / trade.riskUsdt,
        },
      });
      await tx.backtestCloseOrder.deleteMany({ where: { tradeId: trade.id } });
      // Сделка закрыта целиком — остаток сетки, что её докармливала, метит в
      // никуда: у следующей сделки этого направления будут другие стоп/тейк.
      await tx.backtestEntryOrder.deleteMany({ where: { sessionId: trade.sessionId, direction: trade.direction } });
    }

    return { balance: session.balance };
  }

  /**
   * Закрытие движком турнира: стоп, тейк или лимитка, сработавшие по живым
   * минуткам. Владельца в запросе нет — исполняет сервер, не человек.
   *
   * Проигранный CAS возвращает `false` и ошибкой не считается: сделку закрыли
   * между чтением и записью (участник успел сам), движок перечитает её на
   * следующем тике и не должен из-за этого прерывать обход остальных.
   */
  async systemClose(tradeId: string, input: CloseTradeInput): Promise<boolean> {
    const trade = await this.prisma.backtestTrade.findUnique({ where: { id: tradeId } });
    if (!trade || trade.exitTime) return false;
    const remaining = trade.qty - trade.closedQty;
    const qty = Math.min(input.qty ?? remaining, remaining);
    if (qty <= QTY_EPS) return false;

    return this.prisma.$transaction(async (tx) => {
      const applied = await this.applyClose(tx, trade, { ...input, qty });
      return applied != null;
    });
  }

  /**
   * Финал турнирной сессии: остаток открытых позиций закрывается по цене
   * последней минутки турнира, висящие ордера снимаются, сессия завершается.
   * Вызывает `TournamentRunner` — у финала один исполнитель, чтобы у всех
   * участников был один и тот же момент подсчёта.
   */
  async finishTournamentSession(sessionId: string, time: Date, price: number): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.closeRemaining(tx, sessionId, time, () => price);
      // Уровни сетки исполнять больше некому — снимаем, чтобы они не висели у
      // завершённой сессии.
      await tx.backtestEntryOrder.deleteMany({ where: { sessionId } });
      await tx.backtestSession.update({
        where: { id: sessionId },
        data: { status: 'finished', finishedAt: new Date() },
      });
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

  /**
   * Сделки тренажёра и реальной истории не смешиваются: генератор сам содержит
   * тренды и отбои, и результат тега на нём — о генераторе, а не о рынке.
   * Турнирные сессии не входят сюда вовсе — см. `listSessions`.
   */
  async stats(userId: string, source: DataSource = 'real') {
    const [sessions, trades] = await Promise.all([
      this.prisma.backtestSession.count({ where: { userId, dataSource: source, tournamentId: null } }),
      this.prisma.backtestTrade.findMany({
        where: { session: { userId, dataSource: source, tournamentId: null }, exitTime: { not: null } },
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

  /**
   * Закрывает открытый остаток по цене входа: движение ноль, комиссия по обычной
   * формуле. Любая другая цена была бы выдуманной, а удалить сделку нельзя — её
   * частичные закрытия уже в депозите.
   */
  protected closeAtEntry(tx: Prisma.TransactionClient, sessionId: string, time: Date) {
    return this.closeRemaining(tx, sessionId, time, (t) => t.entryPrice);
  }

  /**
   * Закрывает открытые остатки всех сделок сессии по цене, которую задаёт
   * вызывающий: у бектеста это цена входа (движение ноль — см. `closeAtEntry`),
   * у финала турнира — закрытие последней минутки, одно на всех участников.
   */
  protected async closeRemaining(
    tx: Prisma.TransactionClient,
    sessionId: string,
    time: Date,
    priceOf: (t: { entryPrice: number }) => number,
  ) {
    const open = await tx.backtestTrade.findMany({ where: { sessionId, exitTime: null } });
    for (const trade of open) {
      const exitPrice = priceOf(trade);
      const qty = trade.qty - trade.closedQty;
      if (qty > QTY_EPS) {
        const { fee, pnl } = tradeResult({
          direction: trade.direction as Direction,
          entryPrice: trade.entryPrice,
          exitPrice,
          qty,
          riskUsdt: trade.riskUsdt,
        });
        await tx.backtestTradeExit.create({
          data: { tradeId: trade.id, qty, price: exitPrice, time, reason: 'finish', fee, pnl },
        });
        await tx.backtestSession.update({ where: { id: sessionId }, data: { balance: { increment: pnl } } });
      }
      const exits = await tx.backtestTradeExit.findMany({ where: { tradeId: trade.id } });
      const totalFee = exits.reduce((a, e) => a + e.fee, 0);
      const totalPnl = exits.reduce((a, e) => a + e.pnl, 0);
      await tx.backtestTrade.update({
        where: { id: trade.id },
        data: {
          closedQty: trade.qty,
          exitTime: time,
          exitPrice,
          exitReason: 'finish',
          fee: totalFee,
          pnl: totalPnl,
          r: totalPnl / trade.riskUsdt,
        },
      });
    }
    await tx.backtestCloseOrder.deleteMany({ where: { trade: { sessionId } } });
  }

  protected async ownedTrade(userId: string, id: string) {
    const trade = await this.prisma.backtestTrade.findUnique({
      where: { id },
      include: { session: { include: { tournament: true } } },
    });
    if (!trade || trade.session.userId !== userId) {
      throw new NotFoundException({ message: 'Сделка не найдена', code: 'BACKTEST_TRADE_NOT_FOUND' });
    }
    return trade;
  }

  protected async ownedSession(userId: string, id: string) {
    // Турнир подтягивается всегда: от него зависит, кому верить в ценах и
    // времени, и отдельным чтением по месту это расходилось бы.
    const s = await this.prisma.backtestSession.findUnique({ where: { id }, include: { tournament: true } });
    // 404, а не 403: чужая сессия не должна подтверждать, что она существует.
    if (!s || s.userId !== userId) {
      throw new NotFoundException({ message: 'Сессия не найдена', code: 'BACKTEST_SESSION_NOT_FOUND' });
    }
    return s;
  }

  /**
   * Правки эфирной сессии после конца турнира не принимаются: итоги подводит
   * движок по цене последней минутки, и сделка, доехавшая после неё, меняла бы
   * уже подсчитанный результат.
   */
  protected ensureNotEnded(s: MaybeTournament) {
    if (s.endTime && Date.now() >= s.endTime.getTime()) throw tournamentEnded();
  }

  /**
   * Цена и время сделки в эфире. Браузер присылает свои — сервер их не читает:
   * иначе «закрыть по цене месячной давности» было бы вопросом одной правки в
   * devtools, а на кону призовой фонд.
   */
  protected async serverPrice(): Promise<{ time: Date; price: number }> {
    return this.live.quote();
  }

  /**
   * Вход (открытие или добор) в эфире: время и цена — серверные. У обычной
   * сессии бектеста возвращает присланное без изменений, поэтому вызывается
   * безусловно и ветки «а если турнир» по коду не расползаются.
   */
  protected async withServerEntry<T extends { entryTime: Date; entryPrice: number }>(
    s: MaybeTournament,
    input: T,
  ): Promise<T> {
    if (!isLiveTournament(s)) return input;
    this.ensureNotEnded(s);
    const { time, price } = await this.serverPrice();
    return { ...input, entryTime: time, entryPrice: price };
  }

  /**
   * Выход в эфире. Участнику доступно только закрытие по рынку: стопы, тейки и
   * лимитки исполняет серверный движок по живым минуткам, и принять такой выход
   * от браузера значило бы разрешить назначить себе цену срабатывания.
   */
  protected async withServerExit(s: MaybeTournament, input: CloseTradeInput): Promise<CloseTradeInput> {
    if (!isLiveTournament(s)) return input;
    if (input.reason !== 'manual') {
      throw new BadRequestException({
        message: 'Стопы, тейки и лимит-ордера турнира исполняет сервер',
        code: 'TOURNAMENT_LIVE_EXIT',
      });
    }
    this.ensureNotEnded(s);
    const { time, price } = await this.serverPrice();
    return { ...input, exitTime: time, exitPrice: price };
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
