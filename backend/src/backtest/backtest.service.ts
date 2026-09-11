import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { BacktestTrade, Prisma, Tag } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataService } from '../market-data/market-data.service';
import {
  MINUTE_MS,
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
  defaultRiskPct: number;
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
}

export interface ModifyTradeInput {
  stopLoss?: number;
  /** null — убрать тейк. */
  takeProfit?: number | null;
}

export interface CloseTradeInput {
  exitTime: Date;
  exitPrice: number;
  reason: ExitReason;
}

const timeInvalid = () =>
  new BadRequestException({ message: 'Время сделки вне сессии или раньше входа', code: 'BACKTEST_TIME_INVALID' });

const tradeClosed = () => new ConflictException({ message: 'Сделка уже закрыта', code: 'BACKTEST_TRADE_CLOSED' });

/** Что подтягивать к сделке, чтобы отдать её с тегами. */
export const TAGS = { tags: { include: { tag: true } } } as const;

type TradeWithTags = BacktestTrade & { tags: { tag: Tag }[] };

/** Сделка наружу: теги плоским списком — так их рисует фронт. */
export function tradeView(t: TradeWithTags) {
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
        defaultRiskPct: input.defaultRiskPct,
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
      include: TAGS,
    });
    const closed = trades
      .filter((t) => t.exitTime != null)
      .sort((a, b) => a.exitTime!.getTime() - b.exitTime!.getTime());
    return {
      session,
      trades: trades.map(tradeView),
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
      const session = await tx.backtestSession.update({
        where: { id },
        data: { status: 'finished', finishedAt: new Date() },
      });
      return { session };
    });
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
      const open = await tx.backtestTrade.count({ where: { sessionId, exitTime: null } });
      if (open > 0) throw new ConflictException({ message: 'Открытая сделка уже есть', code: 'BACKTEST_OPEN_TRADE' });
      // Депозит — под замком: закрытие прошлой сделки могло поменять его после чтения выше.
      const fresh = await tx.backtestSession.findUnique({ where: { id: sessionId }, select: { balance: true } });
      const { riskUsdt, qty } = positionSize(fresh!.balance, input.riskPct, input.entryPrice, input.stopLoss);
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
        },
        include: TAGS,
      });
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
      const updated = await tx.backtestTrade.findUnique({ where: { id: tradeId }, include: TAGS });
      return { trade: tradeView(updated!) };
    });
  }

  async closeTrade(userId: string, tradeId: string, input: CloseTradeInput) {
    const trade = await this.ownedTrade(userId, tradeId);
    if (trade.exitTime) {
      // Повтор того же закрытия (ответ потерялся, браузер отправил снова) — не ошибка.
      if (trade.exitTime.getTime() === input.exitTime.getTime() && trade.exitPrice === input.exitPrice) {
        const same = await this.prisma.backtestTrade.findUnique({ where: { id: tradeId }, include: TAGS });
        return { trade: tradeView(same!), balance: trade.session.balance };
      }
      throw tradeClosed();
    }
    if (input.exitTime.getTime() <= trade.entryTime.getTime()) throw timeInvalid();

    // Какая цена и когда исполнилась — решил браузер; сколько это в деньгах —
    // сервер, одной формулой для всей статистики.
    const { fee, pnl, r } = tradeResult({
      direction: trade.direction as Direction,
      entryPrice: trade.entryPrice,
      exitPrice: input.exitPrice,
      qty: trade.qty,
      riskUsdt: trade.riskUsdt,
    });

    return this.prisma.$transaction(async (tx) => {
      await this.bumpCursor(tx, trade.sessionId, input.exitTime);
      // Условный апдейт — щит от гонки: параллельный дубликат этого же запроса
      // (оба увидели exitTime: null до входа в свою транзакцию) не должен
      // начислить PnL дважды. bumpCursor выше уже держит замок строки сессии,
      // так что вторая транзакция досюда доходит только после коммита первой.
      const result = await tx.backtestTrade.updateMany({
        where: { id: tradeId, exitTime: null },
        data: { exitTime: input.exitTime, exitPrice: input.exitPrice, exitReason: input.reason, fee, pnl, r },
      });
      if (result.count === 0) {
        // Кто-то уже закрыл сделку в гонке — перечитать и разобраться: тот же
        // это запрос (повтор) или другой (отказ).
        const raced = await tx.backtestTrade.findUnique({ where: { id: tradeId }, include: TAGS });
        if (!raced) throw tradeClosed();
        const same = raced.exitTime?.getTime() === input.exitTime.getTime() && raced.exitPrice === input.exitPrice;
        if (!same) throw tradeClosed();
        // Тот же повтор — баланс не трогаем. Берём его свежим, а не из
        // значения, прочитанного до входа в транзакцию: оно может быть
        // устаревшим (сессия могла обновиться под тем же замком).
        const fresh = await tx.backtestSession.findUnique({
          where: { id: trade.sessionId },
          select: { balance: true },
        });
        return { trade: tradeView(raced), balance: fresh!.balance };
      }
      // Сделка реально закрыта нами.
      const session = await tx.backtestSession.update({
        where: { id: trade.sessionId },
        data: { balance: { increment: pnl } },
      });
      const updated = await tx.backtestTrade.findUnique({ where: { id: tradeId }, include: TAGS });
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
        include: TAGS,
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
