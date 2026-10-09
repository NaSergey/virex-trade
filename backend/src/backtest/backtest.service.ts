import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import type { BacktestTrade, BacktestTradeEntry, Prisma, Tag } from '@prisma/client';
import { BattlePassService } from '../battlepass/battlepass.service';
import { XP_SOURCES } from '../battlepass/xp-registry';
import { PrismaService } from '../prisma/prisma.service';
import { LiveMarketService } from '../market-data/live-market.service';
import { MarketDataService } from '../market-data/market-data.service';
import { DEFAULT_SYMBOL } from '../market-data/symbols';
import { TIMEFRAMES, isValidTimeframe } from '../market-data/timeframes';
import { botGridError, botLevelOf, botPrices, botQty, botStep, levelRiskPct, splitAtPrice } from './bot-grid';
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

/** 'real' — отрезок истории, 'synthetic' — тренажёр, 'live' — живой рынок в эфире. */
export type DataSource = 'real' | 'synthetic' | 'live';

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
  /** Не задана — BTC. */
  symbol?: string;
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
  /** Не задана — BTC. */
  symbol?: string;
  direction: Direction;
  stopLoss: number;
  takeProfit?: number;
  riskPct: number;
  leverage: number;
  prices: number[];
  /** Риск каждого уровня отдельно (объёмы из таблицы «Сетки»); нет — у всех `riskPct`. */
  riskPcts?: number[];
  /** Цель стопа позиции после исполнения уровня; 0 или нет элемента — стоп не двигается. */
  stopsAfter?: number[];
}

/** Запуск грид-бота: сетка, риск и момент запуска (как у входа по рынку). */
export interface StartBotInput {
  /** Не задана — BTC. */
  symbol?: string;
  lower: number;
  upper: number;
  stopLoss: number;
  levels: number;
  riskPct: number;
  leverage: number;
  entryTime: Date;
  entryPrice: number;
  /** Доли уровней снизу вверх, в сумме 1; нет — поровну. */
  shares?: number[];
  /** «Стоп после тейка»: цель стопа после продажи уровня i; 0 — стоп стоит. */
  stopsAfter?: number[];
  stopFollow?: boolean;
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

const entryOrderNotFound = () =>
  new NotFoundException({ message: 'Ордер не найден', code: 'BACKTEST_ENTRY_ORDER_NOT_FOUND' });

const closeOrderNotFound = () =>
  new NotFoundException({ message: 'Ордер не найден', code: 'BACKTEST_CLOSE_ORDER_NOT_FOUND' });

const qtyExceedsRemaining = () =>
  new BadRequestException({ message: 'Объём больше остатка', code: 'BACKTEST_QTY_EXCEEDS_REMAINING' });

/**
 * Стоп, от которого считается объём исполнившегося ордера на вход, если не от
 * стопа позиции: у покупки бота и у уровня таблицы «Сетки» со «стопом после»
 * (`stopAfter` не null) — свой стоп ордера, от него посчитан объём в таблице.
 */
const sizeStopOf = (order: { botId: string | null; stopAfter: number | null; stopLoss: number } | null) =>
  order && (order.botId || order.stopAfter != null) ? order.stopLoss : undefined;

const gridInvalid = () =>
  new BadRequestException({ message: 'Объёмов или целей стопа не столько, сколько уровней', code: 'BACKTEST_GRID_INVALID' });

/** Допуск на накопленную погрешность float-сложений closedQty. */
const QTY_EPS = 1e-8;

/**
 * Объёмы уровней сетки фиксации: присланные — как есть, если вместе не больше
 * остатка (совпали с ним — последний забирает остаток деления), иначе отказ;
 * не присланы — равные части, последний забирает остаток деления.
 */
function gridQtys(remaining: number, n: number, sent?: number[]): number[] {
  if (!sent) {
    const part = remaining / n;
    return Array.from({ length: n }, (_, i) => (i === n - 1 ? remaining - part * (n - 1) : part));
  }
  const sum = sent.reduce((a, b) => a + b, 0);
  if (sum > remaining + QTY_EPS) throw qtyExceedsRemaining();
  const qtys = [...sent];
  if (Math.abs(sum - remaining) <= QTY_EPS) qtys[n - 1] = remaining - qtys.slice(0, -1).reduce((a, b) => a + b, 0);
  // Остаток деления съел последний уровень — лимита на ноль не бывает.
  if (!(qtys[n - 1] > 0)) throw gridInvalid();
  return qtys;
}

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
 * Сессия в прямом эфире — своя (`dataSource = 'live'`) или турнирная. Отличается
 * от обычной тем, кому верят: время идёт и без человека — у закрытой вкладки
 * стоп обязан сработать, — поэтому цену и время сделки ставит сервер, а стопы,
 * тейки и лимитки исполняет движок эфира (`LiveEngineService`), а не браузер.
 */
type MaybeLive = { dataSource?: string; tournament?: { mode: string } | null; endTime?: Date | null };
const isLive = (s: MaybeLive) => s.dataSource === 'live' || s.tournament?.mode === 'live';
/** Эфирный турнир: на кону призы, и завершить сессию раньше турнира нельзя. */
const isLiveTournament = (s: MaybeLive) => s.tournament?.mode === 'live';

const symbolUnavailable = () =>
  new BadRequestException({
    message: 'Эта монета торгуется только в эфире',
    code: 'BACKTEST_SYMBOL_UNAVAILABLE',
  });

/**
 * Монета сделки или сетки. Не задана — BTC: так ходят прежние клиенты и
 * браузерная прокрутка истории. Не-BTC — только в эфире: у истории и тренажёра
 * свечей другой монеты нет, и сделку по ней нечем было бы проверить.
 */
const symbolFor = (s: MaybeLive, symbol: string | undefined): string => {
  const sym = symbol ?? DEFAULT_SYMBOL;
  if (sym !== DEFAULT_SYMBOL && !isLive(s)) throw symbolUnavailable();
  return sym;
};

/**
 * Уровень на вход, который движок взялся исполнить, уже снят — человек отменил
 * его, пока шёл тик. Не HTTP-ошибка: наружу не уходит, только откатывает
 * транзакцию открытия.
 */
class EntryOrderGone extends Error {}

/**
 * Отказы, после которых ордер на вход не исполнится никогда: снять его, иначе
 * исполнитель (движок эфира или прокрутка браузера) упирался бы в тот же отказ
 * снова — как биржа отклоняет ордер, на который не хватает маржи. Остальные
 * (сессию завершили, время не то) — гонка, и ордер остаётся ждать.
 */
const HOPELESS_ENTRY = new Set([
  'BACKTEST_NO_BALANCE',
  'BACKTEST_MARGIN_EXCEEDS_BALANCE',
  'BACKTEST_STOP_SIDE',
  'BACKTEST_TAKE_SIDE',
]);

const isHopelessEntry = (e: unknown) =>
  e instanceof HttpException && HOPELESS_ENTRY.has((e.getResponse() as { code?: string }).code ?? '');

type SessionForEntry = { id: string; startTime: Date };
type EntryInput = { entryTime: Date; entryPrice: number; riskPct: number };
type TradeForAdd = {
  id: string;
  sessionId: string;
  symbol: string;
  direction: string;
  entryTime: Date;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number | null;
  qty: number;
  closedQty: number;
  riskUsdt: number;
  leverage: number;
};

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
    if (input.dataSource === 'live') return this.createLiveSession(userId, input);
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

  /**
   * Эфир начинается «сейчас» — временем живой цены сервера. Нет цены — нет и
   * эфира: 503 из `quote`, а не сессия, у которой не с чего начать график.
   *
   * Дата и цена не скрываются: их прячут, чтобы трейдер не узнал отрезок и не
   * вспомнил, куда пошла цена, а у живого рынка будущего нет. `processedUntil` —
   * с того же момента: раньше старта движку проверять нечего.
   */
  protected async createLiveSession(userId: string, input: CreateSessionInput) {
    const { time } = await this.live.quote();
    const session = await this.prisma.backtestSession.create({
      data: {
        userId,
        dataSource: 'live',
        startTime: time,
        cursorTime: time,
        processedUntil: time,
        startBalance: input.startBalance,
        balance: input.startBalance,
        hideDate: false,
        hidePrice: false,
        priceScale: 1,
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
    const botRows = await this.prisma.backtestBot.findMany({ where: { sessionId: id }, orderBy: { createdAt: 'asc' } });
    // Результат бота — по выходам его позиций, частичные тоже: тейки бота закрывают позицию частями.
    const botExits = botRows.length
      ? await this.prisma.backtestTradeExit.findMany({
          where: { trade: { sessionId: id, botId: { not: null } } },
          select: { pnl: true, trade: { select: { botId: true } } },
        })
      : [];
    const bots = botRows.map((b) => ({
      ...b,
      closedPnl: botExits.filter((e) => e.trade.botId === b.id).reduce((a, e) => a + e.pnl, 0),
    }));
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
      bots,
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
    if (isLive(s)) return { cursorTime: s.cursorTime };
    await this.bumpCursor(this.prisma, id, cursorTime);
    const moved = await this.prisma.backtestSession.findUnique({ where: { id }, select: { cursorTime: true } });
    return { cursorTime: moved!.cursorTime };
  }

  async finish(userId: string, id: string) {
    const s = await this.ownedSession(userId, id);
    if (s.status !== 'active') throw sessionFinished();
    // Эфирную сессию турнира участник не завершает: она кончается вместе с
    // турниром, и ранний выход означал бы фиксацию результата в удобный момент.
    // Своя сессия эфира завершается как обычная — кона у неё нет.
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
        // Висящие ордера на вход после завершения не исполнит никто — снимаются
        // сами. Требовать их отмены значило бы запереть сессию: история кончилась,
        // браузер завершает её сам, и кнопки повторить у человека нет.
        await tx.backtestEntryOrder.deleteMany({ where: { sessionId: id } });
      }
      // Боты кончаются вместе с сессией: их ордера сняты выше, исполнять больше нечего.
      await tx.backtestBot.updateMany({
        where: { sessionId: id, status: 'active' },
        data: { status: 'stopped', stopReason: 'finish', stoppedAt: s.cursorTime },
      });
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
    const symbol = symbolFor(s, rawInput.symbol);
    // В эфире вход исполняется по живой цене в момент запроса, как на бирже:
    // присланные браузером время и цена — только его представление о рынке.
    const input = await this.withServerEntry(s, { ...rawInput, symbol }, symbol);
    try {
      // Ордер, который исполняет прокрутка, обязан ещё стоять: его могли снять
      // (остановка бота, его же стоп в той же минутке, перенос, другая вкладка).
      // Тогда исполнять нечего — пустой ответ, как у движка эфира (`systemEnter`).
      // Раньше браузерный путь открывал позицию и без ордера — и после стопа
      // бота в той же минутке открывал ручную позицию без продажи, уже за стопом.
      return await this.openChecked(s, input, input.entryOrderId != null);
    } catch (e) {
      if (e instanceof EntryOrderGone) return { trade: null };
      // Ордер на вход, исполненный прокруткой браузера, но неисполнимый в
      // принципе, снимается — тем же правилом, что у движка эфира (`systemEnter`).
      // Иначе он висел бы на графике, и цена проходила бы сквозь него.
      if (input.entryOrderId && isHopelessEntry(e)) {
        const order = await this.prisma.backtestEntryOrder.findFirst({ where: { id: input.entryOrderId, sessionId } });
        await this.prisma.backtestEntryOrder.deleteMany({ where: { id: input.entryOrderId, sessionId } });
        // Покупка бота без шансов — и бот без уровня: держал бы лонг монеты, ничего не торгуя.
        if (order?.botId) await this.prisma.$transaction((tx) => this.haltBot(tx, order.botId!, 'hopeless', input.entryTime));
      }
      throw e;
    }
  }

  /**
   * Вход — общий у человека и у движка эфира (`systemEnter`): рынок, сработавший
   * ордер. Владельца и серверную цену проверяет вызывающий.
   *
   * Позиция на монету и сторону одна, как в режиме хеджа на бирже: вход в
   * сторону, где она уже открыта, её доливает (`addInTx`), и решается это здесь,
   * под замком сессии, а не у вызывающего. Браузер знает о позиции с опозданием
   * на перечитку сессии, и два ордера одной стороны, сработавшие подряд, иначе
   * оба решили бы «позиции нет» — второй получил бы отказ.
   *
   * `requireOrder` — путь движка: уровень, породивший сделку, обязан ещё
   * существовать, иначе откат. Человек мог отменить его, пока шёл тик, и
   * сделка по отменённому ордеру хуже пропущенной. Браузер в истории исполняет
   * уровни сам, и у его пути прежнее поведение.
   */
  protected async openChecked(s: SessionForEntry, input: OpenTradeInput, requireOrder = false) {
    const sessionId = s.id;
    const symbol = input.symbol ?? DEFAULT_SYMBOL;
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
      const order = await this.takeEntryOrder(tx, sessionId, input.entryOrderId, requireOrder);
      await this.assertLongFree(tx, sessionId, symbol, input.direction, order);
      const { trade, filledQty } = await this.openInTx(
        tx,
        sessionId,
        symbol,
        { ...input, botId: order?.botId ?? undefined },
        sizeStopOf(order),
      );
      if (order?.botId) await this.sellAfterBotBuy(tx, order.botId, trade.id, order.price, filledQty);
      if (order?.stopAfter) await this.tightenStop(tx, trade.id, order.stopAfter, input.entryPrice);
      return { trade: tradeView(order?.stopAfter ? (await tx.backtestTrade.findUnique({ where: { id: trade.id }, include: TRADE_INCLUDE }))! : trade) };
    });
  }

  /**
   * Вход под уже взятым замком сессии: долив открытой позиции той же монеты и
   * стороны или новая позиция. Общий у человека, движка эфира и запуска бота.
   * Одна позиция на монету и сторону: лонг BTC рядом с лонгом ETH законен.
   * Стоп и тейк входа при доборе не нужны — у позиции свои.
   */
  protected async openInTx(
    tx: Prisma.TransactionClient,
    sessionId: string,
    symbol: string,
    input: OpenTradeInput & { botId?: string },
    sizeStop?: number,
  ): Promise<{ trade: TradeWithRelations; filledQty: number }> {
    const open = await tx.backtestTrade.findFirst({ where: { sessionId, symbol, exitTime: null, direction: input.direction } });
    if (open) return this.addCore(tx, open, input, sizeStop);
    const balance = await this.balanceForEntry(tx, sessionId);
    const { riskUsdt, qty } = positionSize(balance, input.riskPct, input.entryPrice, input.stopLoss);
    const notional = qty * input.entryPrice;
    const margin = notional / input.leverage;
    if (margin > balance) {
      throw new BadRequestException({ message: 'Маржа больше депозита', code: 'BACKTEST_MARGIN_EXCEEDS_BALANCE' });
    }
    const trade = await tx.backtestTrade.create({
      data: {
        sessionId,
        symbol,
        direction: input.direction,
        entryTime: input.entryTime,
        entryPrice: input.entryPrice,
        stopLoss: input.stopLoss,
        takeProfit: input.takeProfit ?? null,
        riskPct: input.riskPct,
        riskUsdt,
        qty,
        leverage: input.leverage,
        botId: input.botId ?? null,
        // Первое исполнение — сразу вложенным create: у сделки ещё нет id
        // ни для одного отдельного запроса, а второй запрос тем же id
        // потребовал бы отдельного круга к базе только ради истории входов.
        entries: { create: { qty, price: input.entryPrice, time: input.entryTime } },
      },
      include: TRADE_INCLUDE,
    });
    return { trade, filledQty: qty };
  }

  /**
   * Снимает сработавший уровень на вход — в той же транзакции, что и вход, тем
   * же приёмом, что у closeOrderId в closeTrade: вторым запросом обрыв сети
   * между ними оставил бы уровень висеть, и он сработал бы ещё раз. Снимается
   * сразу после замка сессии, до проверок: у движка пропавший уровень
   * откатывает вход целиком (`requireOrder`).
   */
  protected async takeEntryOrder(
    tx: Prisma.TransactionClient,
    sessionId: string,
    entryOrderId: string | undefined,
    requireOrder: boolean,
  ) {
    if (!entryOrderId) return null;
    // Строка читается до снятия: ордер бота несёт `botId`, и продажа после
    // покупки ставится по нему. Замок сессии уже взят — между чтением и снятием
    // строку никто не тронет.
    const order = await tx.backtestEntryOrder.findFirst({ where: { id: entryOrderId, sessionId } });
    const { count } = await tx.backtestEntryOrder.deleteMany({ where: { id: entryOrderId, sessionId } });
    if (requireOrder && count === 0) throw new EntryOrderGone();
    return count > 0 ? order : null;
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
    // См. openTrade: в эфире цену и время добора тоже ставит сервер — по монете сделки.
    const input = await this.withServerEntry(trade.session, rawInput, trade.symbol);
    return this.addChecked(trade, input);
  }

  /** Добор по id сделки — ручной «Лонг/Шорт» по занятой стороне; см. `openChecked`. */
  protected async addChecked(trade: TradeForAdd, input: AddToTradeInput) {
    return this.prisma.$transaction(async (tx) => {
      // Добор — содержательный момент сессии (как открытие и закрытие), а не
      // просто повторная проверка замка (как у modifyTrade): курсор двигаем
      // на его время, а не на уже известное trade.session.cursorTime.
      const bumped = await this.bumpCursor(tx, trade.sessionId, input.entryTime);
      if (bumped === 0) throw sessionFinished();
      // См. openTrade.entryOrderId — тот же атомарный приём для ордера на вход,
      // который долил уже открытую сделку, а не создал новую.
      const order = await this.takeEntryOrder(tx, trade.sessionId, input.entryOrderId, false);
      await this.assertLongFree(tx, trade.sessionId, trade.symbol, trade.direction, order);
      // Сделка — свежим чтением под замком: средняя и маржа добора считаются от
      // остатка, а частичное закрытие между чтением снаружи и замком его меняет.
      const fresh = await tx.backtestTrade.findUnique({ where: { id: trade.id } });
      if (!fresh || fresh.exitTime) throw tradeClosed();
      const { trade: updated, filledQty } = await this.addCore(tx, fresh, input, sizeStopOf(order));
      if (order?.botId) await this.sellAfterBotBuy(tx, order.botId, trade.id, order.price, filledQty);
      if (order?.stopAfter) await this.tightenStop(tx, trade.id, order.stopAfter, input.entryPrice);
      return { trade: tradeView(order?.stopAfter ? (await tx.backtestTrade.findUnique({ where: { id: trade.id }, include: TRADE_INCLUDE }))! : updated) };
    });
  }

  /**
   * Депозит для входа — под замком: закрытие прошлой сделки могло поменять его
   * после чтения снаружи транзакции. Слитый депозит — отказ: риск от него уже не
   * считается — от нулевого или отрицательного баланса qty/riskUsdt выходят
   * некорректными (r и pnl расходятся в знаке, при balance === 0 — NaN), и
   * сессию отсюда можно только завершить. Общее у открытия и добора.
   */
  protected async balanceForEntry(tx: Prisma.TransactionClient, sessionId: string): Promise<number> {
    const fresh = await tx.backtestSession.findUnique({ where: { id: sessionId }, select: { balance: true } });
    if (fresh!.balance <= 0) {
      throw new ConflictException({
        message: 'Депозит сессии исчерпан — сессию можно только завершить',
        code: 'BACKTEST_NO_BALANCE',
      });
    }
    return fresh!.balance;
  }

  /**
   * Добор внутри транзакции, уже взявшей замок сессии. Объём — от риска входа и
   * стопа позиции, а не стопа входа: уровни у позиции одни на всю.
   *
   * Исключение — `sizeStop`: ордер таблицы «Сетки» со «стопом после» и покупка
   * бота посчитаны от своего стопа, и стоп позиции, подтянутый прежним уровнем,
   * раздул бы их объём против таблицы (у бота — до маржи больше депозита).
   */
  protected async addCore(
    tx: Prisma.TransactionClient,
    trade: TradeForAdd,
    input: EntryInput,
    sizeStop?: number,
  ): Promise<{ trade: TradeWithRelations; filledQty: number }> {
    const tradeId = trade.id;
    // Добор не может быть раньше открытия — тот же порядок времени, что
    // closeTrade требует от exitTime относительно entryTime.
    if (input.entryTime.getTime() < trade.entryTime.getTime()) throw timeInvalid();
    const balance = await this.balanceForEntry(tx, trade.sessionId);

    const { riskUsdt: addRiskUsdt, qty: addQty } = positionSize(balance, input.riskPct, input.entryPrice, sizeStop ?? trade.stopLoss);
    // `qty` сделки — всё, что в неё когда-либо вошло: закрытия растят `closedQty`,
    // а не уменьшают `qty`. Средняя и маржа — от остатка, как у биржи: после
    // частичного закрытия средняя остатка прежняя, добор усредняет с ним. Иначе
    // проданный объём тянул бы среднюю и маржу за собой — у грид-бота, который
    // продаёт и докупает по кругу, через несколько циклов маржа «превышала» бы депозит.
    const remaining = trade.qty - trade.closedQty;
    const newQty = trade.qty + addQty;
    const newEntry = averageIn(remaining, trade.entryPrice, addQty, input.entryPrice);
    const newRiskUsdt = trade.riskUsdt + addRiskUsdt;
    const newRiskPct = (newRiskUsdt / balance) * 100;
    const direction = trade.direction as Direction;

    if (!stopOnRightSide(direction, newEntry, trade.stopLoss)) {
      throw new BadRequestException({ message: 'Добор загоняет средний вход за стоп', code: 'BACKTEST_STOP_SIDE' });
    }
    if (trade.takeProfit != null && !takeOnRightSide(direction, newEntry, trade.takeProfit)) {
      throw new BadRequestException({ message: 'Добор загоняет средний вход за тейк', code: 'BACKTEST_TAKE_SIDE' });
    }
    const margin = ((remaining + addQty) * newEntry) / trade.leverage;
    if (margin > balance) {
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
    // графике каждый отдельный вход было бы нечем.
    await tx.backtestTradeEntry.create({ data: { tradeId, qty: addQty, price: input.entryPrice, time: input.entryTime } });
    const updated = await tx.backtestTrade.findUnique({ where: { id: tradeId }, include: TRADE_INCLUDE });
    return { trade: updated!, filledQty: addQty };
  }

  /**
   * Отложенные лимит-ордера на вход — одиночный («Ордер») или пакет (сетка,
   * Scaled order): дальше каждая строка живёт самостоятельным ордером до
   * срабатывания цены (прокрутка браузера вызывает openTrade с её id, в эфире —
   * движок) или ручной отмены.
   *
   * Как на бирже, ограничений по числу нет: ордеров в одну сторону сколько
   * угодно, и открытая позиция им не мешает. Сработавший ордер открывает
   * позицию со своими стопом/тейком/плечом, а если позиция этой стороны уже
   * открыта — доливает её по её стопу (`openChecked`).
   */
  async createEntryOrders(userId: string, sessionId: string, input: CreateEntryOrdersInput) {
    const s = await this.ownedSession(userId, sessionId);
    if (s.status !== 'active') throw sessionFinished();
    const symbol = symbolFor(s, input.symbol);
    await this.assertLongFree(this.prisma, sessionId, symbol, input.direction, null);
    if (
      (input.riskPcts && input.riskPcts.length !== input.prices.length) ||
      (input.stopsAfter && input.stopsAfter.length !== input.prices.length)
    ) {
      throw gridInvalid();
    }
    for (const [i, price] of input.prices.entries()) {
      if (!stopOnRightSide(input.direction, price, input.stopLoss)) {
        throw new BadRequestException({ message: 'Стоп стоит не по ту сторону от входа', code: 'BACKTEST_STOP_SIDE' });
      }
      // Цель стопа после исполнения уровня — по свою сторону от его цены, как сам стоп.
      const after = input.stopsAfter?.[i];
      if (after && !stopOnRightSide(input.direction, price, after)) {
        throw new BadRequestException({ message: 'Стоп после исполнения стоит не по ту сторону от входа', code: 'BACKTEST_STOP_SIDE' });
      }
      if (input.takeProfit != null && !takeOnRightSide(input.direction, price, input.takeProfit)) {
        throw new BadRequestException({ message: 'Тейк стоит не по ту сторону от входа', code: 'BACKTEST_TAKE_SIDE' });
      }
    }
    const entryOrders = await this.prisma.$transaction(
      input.prices.map((price, i) =>
        this.prisma.backtestEntryOrder.create({
          data: {
            sessionId,
            symbol,
            direction: input.direction,
            price,
            riskPct: input.riskPcts?.[i] ?? input.riskPct,
            stopLoss: input.stopLoss,
            takeProfit: input.takeProfit ?? null,
            leverage: input.leverage,
            // 0 — уровень таблицы со «стопом после», но без своей цели: стоп он не
            // двигает, а объём считается от стопа ордера (`sizeStopOf`).
            stopAfter: input.stopsAfter ? input.stopsAfter[i] || 0 : null,
          },
        }),
      ),
    );
    return { entryOrders };
  }

  /**
   * Перенос лимита на вход — жестом на графике. Стоп и тейк лимита остаются где
   * стояли и обязаны остаться по свою сторону от новой цены.
   *
   * Снять и выставить заново, а не поправить цену: движок эфира исполняет только
   * ордера, выставленные до начала отрезка (`fillEntries`), и держит ордер по id
   * (`takeEntryOrder`). Правка цены на месте дала бы ему исполнить лимит по цене,
   * которой при новой цене на отрезке не было, или по старой уже после переноса.
   * Новый id делает обе гонки невозможными: старого ордера больше нет.
   */
  async moveEntryOrder(userId: string, orderId: string, price: number) {
    const order = await this.prisma.backtestEntryOrder.findUnique({ where: { id: orderId }, include: { session: true } });
    if (!order || order.session.userId !== userId) throw entryOrderNotFound();
    if (order.session.status !== 'active') throw sessionFinished();
    const direction = order.direction as Direction;
    if (!stopOnRightSide(direction, price, order.stopLoss)) {
      throw new BadRequestException({ message: 'Стоп стоит не по ту сторону от входа', code: 'BACKTEST_STOP_SIDE' });
    }
    if (order.takeProfit != null && !takeOnRightSide(direction, price, order.takeProfit)) {
      throw new BadRequestException({ message: 'Тейк стоит не по ту сторону от входа', code: 'BACKTEST_TAKE_SIDE' });
    }
    if (order.stopAfter && !stopOnRightSide(direction, price, order.stopAfter)) {
      throw new BadRequestException({ message: 'Стоп после исполнения стоит не по ту сторону от входа', code: 'BACKTEST_STOP_SIDE' });
    }

    return this.prisma.$transaction(async (tx) => {
      // Замок сессии и проверка статуса — тем же приёмом, что у modifyTrade.
      const bumped = await this.bumpCursor(tx, order.sessionId, order.session.cursorTime);
      if (bumped === 0) throw sessionFinished();
      // Ордер успели исполнить или снять — переставлять нечего.
      const { count } = await tx.backtestEntryOrder.deleteMany({ where: { id: orderId, sessionId: order.sessionId } });
      if (count === 0) throw entryOrderNotFound();
      const entryOrder = await tx.backtestEntryOrder.create({
        data: {
          sessionId: order.sessionId,
          symbol: order.symbol,
          direction: order.direction,
          price,
          riskPct: order.riskPct,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
          leverage: order.leverage,
          botId: order.botId,
          stopAfter: order.stopAfter,
        },
      });
      return { entryOrder };
    });
  }

  async cancelEntryOrder(userId: string, orderId: string) {
    const order = await this.prisma.backtestEntryOrder.findUnique({ where: { id: orderId }, include: { session: true } });
    if (!order || order.session.userId !== userId) throw entryOrderNotFound();
    // deleteMany, а не delete: в эфире уровень мог исполнить движок между
    // чтением выше и этой строкой, и delete ответил бы на это 500.
    await this.prisma.backtestEntryOrder.deleteMany({ where: { id: orderId } });
    return { success: true as const };
  }

  /**
   * Запуск грид-бота (спека 2026-10-09): строка бота, вход по рынку на уровни на
   * цене и выше — с продажами на шаг выше, — и лимиты на остальные, одной
   * транзакцией под замком сессии. Лонг монеты обязан быть свободен: позиция
   * бота одна, и ручная покупка, доливая её, развела бы продажи бота с позицией.
   */
  async startBot(userId: string, sessionId: string, raw: StartBotInput) {
    const s = await this.ownedSession(userId, sessionId);
    if (s.status !== 'active') throw sessionFinished();
    const symbol = symbolFor(s, raw.symbol);
    // В эфире момент и цену запуска ставит сервер — как у входа по рынку.
    const input = await this.withServerEntry(s, raw, symbol);
    const grid = { lower: input.lower, upper: input.upper, levels: input.levels, stopLoss: input.stopLoss, shares: input.shares ?? [] };
    const err =
      botGridError(grid, input.entryPrice) ??
      (input.stopsAfter && input.stopsAfter.length !== input.levels ? 'BACKTEST_BOT_LEVELS' : null);
    if (err) throw new BadRequestException({ message: 'Сетка бота задана неверно', code: err });
    if (input.entryTime.getTime() < s.startTime.getTime()) throw timeInvalid();

    return this.prisma.$transaction(async (tx) => {
      const bumped = await this.bumpCursor(tx, sessionId, input.entryTime);
      if (bumped === 0) throw sessionFinished();
      if (await tx.backtestBot.findFirst({ where: { sessionId, symbol, status: 'active' } })) {
        throw new ConflictException({ message: 'На этой монете бот уже работает', code: 'BACKTEST_BOT_EXISTS' });
      }
      const busy =
        (await tx.backtestTrade.findFirst({ where: { sessionId, symbol, direction: 'long', exitTime: null } })) != null ||
        (await tx.backtestEntryOrder.count({ where: { sessionId, symbol, direction: 'long' } })) > 0;
      if (busy) {
        throw new ConflictException({ message: 'Лонг этой монеты занят', code: 'BACKTEST_BOT_SIDE_BUSY' });
      }
      const bot = await tx.backtestBot.create({
        data: {
          sessionId,
          symbol,
          lower: grid.lower,
          upper: grid.upper,
          stopLoss: grid.stopLoss,
          levels: grid.levels,
          riskPct: input.riskPct,
          leverage: input.leverage,
          shares: grid.shares,
          stopsAfter: input.stopsAfter ?? [],
          stopFollow: input.stopFollow ?? false,
          startedAt: input.entryTime,
        },
      });
      const step = botStep(grid);
      const prices = botPrices(grid);
      const { market, limit } = splitAtPrice(prices, input.entryPrice);
      const balance = await this.balanceForEntry(tx, sessionId);
      const qOf = (price: number) => botQty(grid, balance, input.riskPct, botLevelOf(grid, price));
      // Маржа всей сетки, если исполнятся все покупки: иначе бот запустится и
      // упрётся в депозит на первой же глубокой покупке.
      if (prices.reduce((a, p) => a + qOf(p) * p, 0) / input.leverage > balance) {
        throw new BadRequestException({ message: 'Маржа сетки бота больше депозита', code: 'BACKTEST_MARGIN_EXCEEDS_BALANCE' });
      }
      if (market.length > 0) {
        // Один вход объёмом всех верхних уровней: риск входа — тот, что даёт этот объём от его цены.
        const marketQty = market.reduce((a, p) => a + qOf(p), 0);
        const riskPct = (marketQty * (input.entryPrice - grid.stopLoss) * 100) / balance;
        const { trade } = await this.openInTx(tx, sessionId, symbol, {
          symbol,
          direction: 'long',
          entryTime: input.entryTime,
          entryPrice: input.entryPrice,
          stopLoss: grid.stopLoss,
          riskPct,
          leverage: input.leverage,
          botId: bot.id,
        });
        for (const price of market) {
          await tx.backtestCloseOrder.create({
            data: { tradeId: trade.id, price: price + step, qty: qOf(price), botId: bot.id, botBuyPrice: price },
          });
        }
      }
      for (const price of limit) {
        await tx.backtestEntryOrder.create({
          data: {
            sessionId,
            symbol,
            direction: 'long',
            price,
            riskPct: levelRiskPct(grid, input.riskPct, price),
            stopLoss: grid.stopLoss,
            takeProfit: null,
            leverage: input.leverage,
            botId: bot.id,
          },
        });
      }
      return { bot };
    });
  }

  /** «Остановить»: снимаются покупки бота; позиция и её продажи остаются человеку. */
  async stopBot(userId: string, botId: string) {
    const bot = await this.prisma.backtestBot.findUnique({ where: { id: botId }, include: { session: true } });
    if (!bot || bot.session.userId !== userId) {
      throw new NotFoundException({ message: 'Бот не найден', code: 'BACKTEST_BOT_NOT_FOUND' });
    }
    const s = bot.session;
    return this.prisma.$transaction(async (tx) => {
      const bumped = await this.bumpCursor(tx, s.id, s.cursorTime);
      if (bumped === 0) throw sessionFinished();
      await this.haltBot(tx, botId, 'user', isLive(s) ? new Date() : s.cursorTime);
      return { bot: await tx.backtestBot.findUnique({ where: { id: botId } }) };
    });
  }

  /** Бот перестаёт работать: статус, причина и его покупки, которые больше никто не поведёт. */
  protected async haltBot(tx: Prisma.TransactionClient, botId: string, reason: string, time: Date): Promise<boolean> {
    const { count } = await tx.backtestBot.updateMany({
      where: { id: botId, status: 'active' },
      data: { status: 'stopped', stopReason: reason, stoppedAt: time },
    });
    if (count > 0) await tx.backtestEntryOrder.deleteMany({ where: { botId } });
    return count > 0;
  }

  /** Покупка бота исполнилась — продажа на шаг выше на исполненный объём, если бот ещё работает. */
  protected async sellAfterBotBuy(tx: Prisma.TransactionClient, botId: string, tradeId: string, buyPrice: number, qty: number) {
    const bot = await tx.backtestBot.findUnique({ where: { id: botId } });
    if (!bot || bot.status !== 'active') return;
    await tx.backtestCloseOrder.create({
      data: { tradeId, price: buyPrice + botStep(bot), qty, botId, botBuyPrice: buyPrice },
    });
  }

  /**
   * Продажа бота исполнилась — покупка снова встаёт там, откуда был куплен этот
   * объём. Если продажа закрыла позицию целиком, покупка откроет новую со стопом бота.
   */
  protected async buyAfterBotSell(
    tx: Prisma.TransactionClient,
    botId: string,
    trade: { id: string; symbol: string; stopLoss: number },
    price: number,
    exitPrice: number,
    positionOpen: boolean,
  ) {
    const bot = await tx.backtestBot.findUnique({ where: { id: botId } });
    if (!bot || bot.status !== 'active') return;
    const j = botLevelOf(bot, price);
    // «Стоп после тейка»: стоп позиции — на цель уровня, если теснее; покупки
    // бота на стопе и ниже снимаются — их исполнение сервер всё равно отклонил бы.
    let stop = trade.stopLoss;
    if (positionOpen && bot.stopFollow && bot.stopsAfter[j] > 0) {
      const moved = await this.tightenStop(tx, trade.id, bot.stopsAfter[j], exitPrice);
      if (moved != null) {
        stop = moved;
        await tx.backtestEntryOrder.deleteMany({ where: { sessionId: bot.sessionId, botId, price: { lte: moved } } });
      }
    }
    // Покупка на стопе и ниже не встаёт: открытая позиция её не примет.
    if (positionOpen && price <= stop) return;
    // Позиция закрыта целиком — подтянутого стопа больше нет, и покупки, снятые
    // им, встают снова: все уровни ниже цены продажи, у которых покупки нет.
    const prices = positionOpen ? [price] : botPrices(bot).filter((p) => p < exitPrice);
    const standing = positionOpen
      ? []
      : (await tx.backtestEntryOrder.findMany({ where: { sessionId: bot.sessionId, botId }, select: { price: true } })).map((o) => o.price);
    for (const p of prices) {
      if (standing.some((s) => botLevelOf(bot, s) === botLevelOf(bot, p))) continue;
      await tx.backtestEntryOrder.create({
        data: {
          sessionId: bot.sessionId,
          symbol: trade.symbol,
          direction: 'long',
          price: p,
          riskPct: levelRiskPct(bot, bot.riskPct, p, botLevelOf(bot, p)),
          stopLoss: bot.stopLoss,
          takeProfit: null,
          leverage: bot.leverage,
          botId,
        },
      });
    }
  }

  /**
   * Стоп позиции — на цель, если она теснее прежнего и по свою сторону от цены
   * исполнения (правило `followStop`: стоп только подтягивается, и не встаёт за
   * цену, иначе закрыл бы остаток на следующей же минутке). Возвращает новый
   * стоп или null, если он не сдвинулся. Общий у «Стопа после» «Сетки» и
   * «Стопа после тейка» бота.
   */
  protected async tightenStop(tx: Prisma.TransactionClient, tradeId: string, target: number, fillPrice: number): Promise<number | null> {
    const cur = await tx.backtestTrade.findUnique({ where: { id: tradeId } });
    if (!cur || cur.exitTime) return null;
    const direction = cur.direction as Direction;
    if (!stopOnRightSide(direction, fillPrice, target)) return null;
    const tighter = direction === 'long' ? target > cur.stopLoss : target < cur.stopLoss;
    if (!tighter) return null;
    await tx.backtestTrade.update({ where: { id: tradeId }, data: { stopLoss: target } });
    return target;
  }

  /**
   * Пока бот работает, лонг его монеты — его: ручная покупка долила бы позицию
   * бота без продажи. На входе проверяется под замком сессии и после снятия
   * ордера: пропускается только исполнение ордера этого же бота, а не любой
   * присланный `entryOrderId` (чужой или уже снятый — повтор запроса).
   */
  protected async assertLongFree(
    tx: Prisma.TransactionClient,
    sessionId: string,
    symbol: string,
    direction: string,
    order: { botId: string | null } | null,
  ) {
    if (direction !== 'long') return;
    const bot = await tx.backtestBot.findFirst({ where: { sessionId, symbol, status: 'active' } });
    if (bot && order?.botId !== bot.id) {
      throw new ConflictException({ message: 'Лонг этой монеты ведёт бот', code: 'BACKTEST_BOT_SIDE' });
    }
  }

  /** Плечо открытых сделок одной монеты: на бирже плечо задаётся на символ. */
  async setLeverage(userId: string, sessionId: string, leverage: number, symbol: string = DEFAULT_SYMBOL) {
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
      const where = { sessionId, symbol, exitTime: null };
      const open = await tx.backtestTrade.findMany({ where });
      for (const trade of open) {
        // От остатка: `qty` — всё, что когда-либо вошло в сделку (см. addCore).
        const margin = ((trade.qty - trade.closedQty) * trade.entryPrice) / leverage;
        if (margin > fresh!.balance) {
          throw new BadRequestException({ message: 'Маржа больше депозита', code: 'BACKTEST_MARGIN_EXCEEDS_BALANCE' });
        }
      }
      await tx.backtestTrade.updateMany({ where, data: { leverage } });
      const trades = await tx.backtestTrade.findMany({ where, include: TRADE_INCLUDE });
      return { trades: trades.map(tradeView) };
    });
  }

  async createCloseOrder(userId: string, tradeId: string, input: { price: number; qty: number }) {
    const trade = await this.ownedTrade(userId, tradeId);
    if (trade.exitTime) throw tradeClosed();
    if (trade.session.status !== 'active') throw sessionFinished();
    const remaining = trade.qty - trade.closedQty;
    if (input.qty > remaining + QTY_EPS) throw qtyExceedsRemaining();
    const order = await this.prisma.backtestCloseOrder.create({
      data: { tradeId, price: input.price, qty: input.qty },
    });
    return { closeOrder: order };
  }

  /**
   * Сетка фиксации позиции: N лимитов закрытия и флаг «стоп за тейками»
   * (`followStop`). Заменяет прежние лимиты закрытия сделки — иначе сумма
   * ордеров превысила бы остаток.
   *
   * Объёмы уровней — присланные экраном (`qtys`: закреплённые руками и
   * поделённые остальными), без них — равные части. Сумма не больше остатка;
   * совпала с ним — последний уровень забирает остаток деления, и сетка
   * закрывает позицию целиком, без хвоста double. Цель стопа уровня (`stops`,
   * null — правило) ложится в `stopAfter` его лимита: на исполнении стоп идёт
   * на неё (спека `2026-10-04-close-grid-custom-levels-design.md`).
   */
  async createCloseGrid(
    userId: string,
    tradeId: string,
    input: { prices: number[]; qtys?: number[]; stops?: (number | null)[]; stopFollow: boolean },
  ) {
    const n = input.prices.length;
    if ((input.qtys && input.qtys.length !== n) || (input.stops && input.stops.length !== n)) throw gridInvalid();
    const trade = await this.ownedTrade(userId, tradeId);
    if (trade.exitTime) throw tradeClosed();
    if (trade.session.status !== 'active') throw sessionFinished();

    return this.prisma.$transaction(async (tx) => {
      // Замок сессии: частичное закрытие между чтением выше и записью ниже
      // поменяло бы остаток, и сетка разошлась бы с позицией.
      const bumped = await this.bumpCursor(tx, trade.sessionId, trade.session.cursorTime);
      if (bumped === 0) throw sessionFinished();
      const fresh = await tx.backtestTrade.findUnique({ where: { id: tradeId } });
      if (!fresh || fresh.exitTime) throw tradeClosed();
      const remaining = fresh.qty - fresh.closedQty;
      const qtys = gridQtys(remaining, n, input.qtys);

      await tx.backtestCloseOrder.deleteMany({ where: { tradeId } });
      // Сетка фиксации заменяет все лимиты закрытия, продажи бота тоже: позицию
      // забрал человек, и бот, продолжая докупать, ставил бы продажи поверх его сетки.
      if (fresh.botId) await this.haltBot(tx, fresh.botId, 'user', trade.session.cursorTime);
      const closeOrders = [];
      for (const [i, price] of input.prices.entries()) {
        const stopAfter = input.stops?.[i] || null; // 0 — правило, как и null
        closeOrders.push(await tx.backtestCloseOrder.create({ data: { tradeId, price, qty: qtys[i], stopAfter } }));
      }
      await tx.backtestTrade.update({ where: { id: tradeId }, data: { stopFollow: input.stopFollow } });
      return { closeOrders };
    });
  }

  /**
   * Перенос лимита закрытия — жестом на графике. Правкой на месте: у лимитов
   * закрытия нет правила «выставлен до отрезка», и движок читает их вместе со
   * сделкой на каждом отрезке заново. У продажи бота `botBuyPrice` не меняется:
   * исполнившись на новой цене, она вернёт покупку туда, откуда та куплена.
   */
  async moveCloseOrder(userId: string, orderId: string, price: number) {
    const order = await this.prisma.backtestCloseOrder.findUnique({
      where: { id: orderId },
      include: { trade: { include: { session: true } } },
    });
    if (!order || order.trade.session.userId !== userId) throw closeOrderNotFound();
    if (order.trade.exitTime) throw tradeClosed();
    if (order.trade.session.status !== 'active') throw sessionFinished();
    const { count } = await this.prisma.backtestCloseOrder.updateMany({ where: { id: orderId }, data: { price } });
    // Успел исполниться или его сняли — как у снятия, 404, а не 500.
    if (count === 0) throw closeOrderNotFound();
    return { closeOrder: { id: order.id, tradeId: order.tradeId, price, qty: order.qty, createdAt: order.createdAt } };
  }

  async cancelCloseOrder(userId: string, orderId: string) {
    const order = await this.prisma.backtestCloseOrder.findUnique({
      where: { id: orderId },
      include: { trade: { include: { session: true } } },
    });
    if (!order || order.trade.session.userId !== userId) throw closeOrderNotFound();
    await this.prisma.backtestCloseOrder.delete({ where: { id: orderId } });
    return { success: true as const };
  }

  async closeTrade(userId: string, tradeId: string, rawInput: CloseTradeInput) {
    const trade = await this.ownedTrade(userId, tradeId);
    const input = await this.withServerExit(trade.session, rawInput, trade.symbol);
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

    return this.prisma.$transaction(async (tx) => {
      // Объём «закрыть всё» считает applyClose под замком: позицию могли долить
      // между чтением выше и замком (покупка грид-бота в той же минутке).
      const applied = await this.applyClose(tx, trade, input);
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
    trade: {
      id: string;
      sessionId: string;
      symbol: string;
      direction: string;
      entryPrice: number;
      riskUsdt: number;
      qty: number;
      closedQty: number;
      botId?: string | null;
    },
    input: CloseTradeInput,
  ): Promise<{ balance: number } | null> {
    await this.bumpCursor(tx, trade.sessionId, input.exitTime);
    // Сделка — свежим чтением под замком. Её `closedQty` обязан совпасть с тем,
    // что видел вызывающий: иначе это дубликат того же закрытия (CAS ниже ради
    // того же) или его обогнало другое. А объём, средняя и риск — свежие: между
    // чтением снаружи и замком позицию могли долить (покупка грид-бота в той же
    // минутке, что и стоп), и закрытие по старой строке оставило бы долитое
    // внутри уже «закрытой» сделки, а его убыток — не списанным.
    const fresh = await tx.backtestTrade.findUnique({ where: { id: trade.id } });
    if (!fresh || fresh.exitTime || Math.abs(fresh.closedQty - trade.closedQty) > QTY_EPS) return null;
    const remaining = fresh.qty - fresh.closedQty;
    const qty = Math.min(input.qty ?? remaining, remaining);
    if (qty <= QTY_EPS) return null;
    const { fee, pnl } = tradeResult({
      direction: fresh.direction as Direction,
      entryPrice: fresh.entryPrice,
      exitPrice: input.exitPrice,
      qty,
      riskUsdt: fresh.riskUsdt,
    });
    // CAS по closedQty — тот же замысел, что раньше был у `exitTime: null`:
    // параллельный дубликат этого же запроса не должен начислить PnL дважды.
    const cas = await tx.backtestTrade.updateMany({
      where: { id: trade.id, closedQty: trade.closedQty },
      data: { closedQty: { increment: qty } },
    });
    if (cas.count === 0) return null;

    await tx.backtestTradeExit.create({
      data: { tradeId: trade.id, qty, price: input.exitPrice, time: input.exitTime, reason: input.reason, fee, pnl },
    });
    // Цель стопа сработавшего лимита (сетка фиксации) — до того, как он снят.
    let stopAfter: number | null = null;
    let botSell: { botId: string; botBuyPrice: number } | null = null;
    if (input.closeOrderId) {
      const order = await tx.backtestCloseOrder.findUnique({
        where: { id: input.closeOrderId },
        select: { stopAfter: true, botId: true, botBuyPrice: true },
      });
      stopAfter = order?.stopAfter ?? null;
      if (order?.botId && order.botBuyPrice != null) botSell = { botId: order.botId, botBuyPrice: order.botBuyPrice };
      await tx.backtestCloseOrder.deleteMany({ where: { id: input.closeOrderId, tradeId: trade.id } });
    }
    const session = await tx.backtestSession.update({
      where: { id: trade.sessionId },
      data: { balance: { increment: pnl } },
    });

    const newClosedQty = fresh.closedQty + qty;
    if (newClosedQty >= fresh.qty - QTY_EPS) {
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
          r: totalPnl / fresh.riskUsdt,
        },
      });
      // Лимиты закрытия принадлежат позиции и уходят с ней. Ордера на вход —
      // нет: как на бирже, они остаются стоять и, сработав, откроют новую
      // позицию со своими стопом и тейком.
      await tx.backtestCloseOrder.deleteMany({ where: { tradeId: trade.id } });
    } else if (input.reason === 'limit') {
      await this.followStop(tx, trade.id, input.exitPrice, stopAfter);
    }

    if (botSell) {
      const positionOpen = newClosedQty < fresh.qty - QTY_EPS;
      await this.buyAfterBotSell(tx, botSell.botId, fresh, botSell.botBuyPrice, input.exitPrice, positionOpen);
    } else if (fresh.botId) {
      // Позицию бота закрыла не его продажа: стоп, тейк, рука, финал. Целиком —
      // бот кончился; частью — тоже, и его продажи снимаются: их сумма больше не
      // сходится с остатком, дальше позицию ведёт человек.
      // Продажи снимаются, только если бот остановлен этим закрытием: после
      // «Остановить» они уже лимиты человека, и частичное закрытие их не трогает.
      const halted = await this.haltBot(tx, fresh.botId, input.reason, input.exitTime);
      if (halted && newClosedQty < fresh.qty - QTY_EPS) {
        await tx.backtestCloseOrder.deleteMany({ where: { tradeId: trade.id, botId: fresh.botId } });
      }
    }

    return { balance: session.balance };
  }

  /**
   * Стоп за тейками (`BacktestTrade.stopFollow`, ставит сетка фиксации):
   * исполнился лимит закрытия, позиция ещё открыта — стоп подтягивается. Цель —
   * своя у лимита (`stopAfter`, задана в сетке), а без неё правило: после
   * первого — в безубыток (цена входа позиции), после каждого следующего — на
   * цену предыдущего исполненного лимита. Так делают «умные ордера» торговых
   * терминалов.
   *
   * Стоп только подтягивается: более тесный, поставленный руками, не
   * ослабляется. Кандидат не по свою сторону от цены только что исполненного
   * лимита (лимиты исполнялись не по порядку) не ставится — стоп над ценой
   * лонга закрыл бы остаток на следующей же минутке.
   *
   * Сделка читается здесь, под замком сессии, а не берётся у вызывающего: стоп
   * мог поменяться правкой между его чтением и транзакцией.
   */
  protected async followStop(tx: Prisma.TransactionClient, tradeId: string, fillPrice: number, explicit: number | null = null) {
    const cur = await tx.backtestTrade.findUnique({ where: { id: tradeId } });
    if (!cur?.stopFollow) return;
    let target = explicit;
    if (target == null) {
      const limits = await tx.backtestTradeExit.findMany({
        where: { tradeId, reason: 'limit' },
        orderBy: [{ time: 'asc' }, { createdAt: 'asc' }],
        select: { price: true },
      });
      // Последний в списке — только что записанный выход; предыдущий — перед ним.
      target = limits.length >= 2 ? limits[limits.length - 2].price : cur.entryPrice;
    }
    const direction = cur.direction as Direction;
    if (!stopOnRightSide(direction, fillPrice, target)) return;
    const tighter = direction === 'long' ? target > cur.stopLoss : target < cur.stopLoss;
    if (!tighter) return;
    await tx.backtestTrade.update({ where: { id: tradeId }, data: { stopLoss: target } });
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
    if (trade.qty - trade.closedQty <= QTY_EPS) return false;

    return this.prisma.$transaction(async (tx) => {
      // Объём (не больше остатка) applyClose считает сам, свежей строкой под замком.
      const applied = await this.applyClose(tx, trade, input);
      return applied != null;
    });
  }

  /**
   * Вход движком эфира: уровень на вход, задетый живым рынком, становится
   * сделкой по своей цене — открытием с риском, стопом, тейком и плечом уровня
   * или добором к открытой позиции той же стороны (решает `openChecked`).
   * Владельца в запросе нет.
   *
   * `false` — сделки нет: уровень уже снят, сессия не активна, проиграна гонка
   * (уровень ждёт следующего отрезка) или вход безнадёжен (`HOPELESS_ENTRY`,
   * уровень снимается). Ошибки базы уходят вызывающему.
   */
  async systemEnter(orderId: string, time: Date): Promise<boolean> {
    const order = await this.prisma.backtestEntryOrder.findUnique({ where: { id: orderId }, include: { session: true } });
    if (!order || order.session.status !== 'active') return false;

    try {
      await this.openChecked(
        order.session,
        {
          symbol: order.symbol,
          direction: order.direction as Direction,
          entryTime: time,
          entryPrice: order.price,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit ?? undefined,
          riskPct: order.riskPct,
          leverage: order.leverage,
          entryOrderId: order.id,
        },
        true,
      );
      return true;
    } catch (e) {
      if (e instanceof EntryOrderGone) return false;
      if (e instanceof HttpException) {
        if (isHopelessEntry(e)) {
          await this.prisma.backtestEntryOrder.deleteMany({ where: { id: orderId } });
          // См. openTrade: безнадёжная покупка бота останавливает бота.
          if (order.botId) await this.prisma.$transaction((tx) => this.haltBot(tx, order.botId!, 'hopeless', time));
        }
        return false;
      }
      throw e;
    }
  }

  /**
   * Финал турнирной сессии: остаток открытых позиций закрывается по цене
   * последней минутки турнира — у каждой монеты своей, — висящие ордера
   * снимаются, сессия завершается. Вызывает `TournamentRunner` — у финала один
   * исполнитель, чтобы у всех участников был один и тот же момент подсчёта.
   *
   * Нет цены монеты открытой сделки — исключение и откат: закрыть её нечем, а
   * выдуманная цена попала бы в призы. Раннер повторит финал следующим тиком.
   */
  async finishTournamentSession(sessionId: string, time: Date, prices: Record<string, number>): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.closeRemaining(tx, sessionId, time, (t) => {
        const price = prices[t.symbol];
        if (price == null) throw new Error(`Нет финальной цены ${t.symbol}`);
        return price;
      });
      // Уровни сетки исполнять больше некому — снимаем, чтобы они не висели у
      // завершённой сессии. Боты кончаются вместе с турниром.
      await tx.backtestEntryOrder.deleteMany({ where: { sessionId } });
      await tx.backtestBot.updateMany({
        where: { sessionId, status: 'active' },
        data: { status: 'stopped', stopReason: 'finish', stoppedAt: time },
      });
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
   *
   * Эфир считается вместе с реальной историей: это тот же настоящий рынок, и
   * результат тега на нём — о рынке, а не о генераторе.
   */
  async stats(userId: string, source: 'real' | 'synthetic' = 'real') {
    const dataSource = source === 'real' ? { in: ['real', 'live'] } : source;
    const [sessions, trades] = await Promise.all([
      this.prisma.backtestSession.count({ where: { userId, dataSource, tournamentId: null } }),
      this.prisma.backtestTrade.findMany({
        where: { session: { userId, dataSource, tournamentId: null }, exitTime: { not: null } },
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
    priceOf: (t: { entryPrice: number; symbol: string }) => number,
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
  protected ensureNotEnded(s: MaybeLive) {
    if (s.endTime && Date.now() >= s.endTime.getTime()) throw tournamentEnded();
  }

  /**
   * Цена и время сделки в эфире. Браузер присылает свои — сервер их не читает:
   * иначе «закрыть по цене месячной давности» было бы вопросом одной правки в
   * devtools, а на кону призовой фонд.
   */
  protected async serverPrice(symbol: string): Promise<{ time: Date; price: number }> {
    return this.live.quote(symbol);
  }

  /**
   * Вход (открытие или добор) в эфире: время и цена — серверные. У обычной
   * сессии бектеста возвращает присланное без изменений, поэтому вызывается
   * безусловно и ветки «а если турнир» по коду не расползаются.
   */
  protected async withServerEntry<T extends { entryTime: Date; entryPrice: number }>(
    s: MaybeLive,
    input: T,
    symbol: string,
  ): Promise<T> {
    if (!isLive(s)) return input;
    this.ensureNotEnded(s);
    const { time, price } = await this.serverPrice(symbol);
    return { ...input, entryTime: time, entryPrice: price };
  }

  /**
   * Выход в эфире. Участнику доступно только закрытие по рынку: стопы, тейки и
   * лимитки исполняет серверный движок по живым минуткам, и принять такой выход
   * от браузера значило бы разрешить назначить себе цену срабатывания.
   */
  protected async withServerExit(s: MaybeLive, input: CloseTradeInput, symbol: string): Promise<CloseTradeInput> {
    if (!isLive(s)) return input;
    if (input.reason !== 'manual') {
      throw new BadRequestException({
        message: 'Стопы, тейки и лимит-ордера турнира исполняет сервер',
        code: 'TOURNAMENT_LIVE_EXIT',
      });
    }
    this.ensureNotEnded(s);
    const { time, price } = await this.serverPrice(symbol);
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
