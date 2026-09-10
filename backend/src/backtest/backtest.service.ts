import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { BacktestTrade, Prisma, Tag } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataService } from '../market-data/market-data.service';
import { MINUTE_MS, maxDrawdownPct, pickPriceScale, pickStart, startWindow, summarize } from './backtest-math';

export interface CreateSessionInput {
  startBalance: number;
  defaultRiskPct: number;
  hideDate: boolean;
  hidePrice: boolean;
}

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
    // Позицию закрывает браузер (он знает цену момента), сервер только проверяет.
    const open = await this.prisma.backtestTrade.count({ where: { sessionId: id, exitTime: null } });
    if (open > 0) throw new ConflictException({ message: 'Сначала закройте открытую сделку', code: 'BACKTEST_OPEN_TRADE' });
    const session = await this.prisma.backtestSession.update({
      where: { id },
      data: { status: 'finished', finishedAt: new Date() },
    });
    return { session };
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
