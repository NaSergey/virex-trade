import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { runsBackgroundJobs } from '../role';
import { SYMBOL } from '../market-data/timeframes';
import { buildReport, REPORT_ID, STRATEGY_VERSION } from './report';
import { CandleRow, Series, toSeries } from './series';
import { Bar, minuteKey } from './simulate';

const DAY_MS = 86_400_000;
/** Как часто проверять, не пора ли пересчитать. */
const CHECK_MS = 60 * 60_000;
/** Первый расчёт — после старта остальных фоновых сервисов. */
const START_DELAY_MS = 60_000;
const PAGE = 50_000;

/**
 * Отчёт стратегии в админке. Считает только `worker` (роль `all` — локально):
 * раз в сутки и сразу, если отчёта нет или он посчитан другой версией правил.
 * `api` строку только читает.
 */
@Injectable()
export class StrategyReportService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(StrategyReportService.name);
  private timers: NodeJS.Timeout[] = [];
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (!runsBackgroundJobs()) return;
    const run = () =>
      this.tick().catch((e) => this.logger.error(`отчёт стратегии: ${e}`));
    this.timers.push(setTimeout(run, START_DELAY_MS));
    this.timers.push(setInterval(run, CHECK_MS));
  }

  onModuleDestroy() {
    for (const t of this.timers) clearTimeout(t);
  }

  read() {
    return this.prisma.strategyReport.findUnique({
      where: { id: REPORT_ID },
      select: { version: true, computedAt: true, data: true },
    });
  }

  async tick(): Promise<void> {
    if (this.running) return;
    const row = await this.prisma.strategyReport.findUnique({
      where: { id: REPORT_ID },
      select: { version: true, computedAt: true },
    });
    const fresh =
      row &&
      row.version === STRATEGY_VERSION &&
      Date.now() - row.computedAt.getTime() < DAY_MS;
    if (fresh) return;
    this.running = true;
    try {
      await this.compute();
    } finally {
      this.running = false;
    }
  }

  private async compute(): Promise<void> {
    const started = Date.now();
    const m15 = await this.load(15);
    const h1 = await this.load(60);
    const h4 = await this.load(240);
    const d1 = await this.load(1440);
    if (!m15.n || !h1.n || !h4.n || !d1.n) {
      this.logger.warn('отчёт стратегии: свечей BTC ещё нет — расчёт отложен');
      return;
    }
    const report = await buildReport(
      { m15, h1, h4, d1, nowMs: Date.now() },
      (ranges) => this.minutes(ranges),
    );
    const data = report as unknown as Prisma.InputJsonValue;
    const computedAt = new Date(report.computedAt);
    await this.prisma.strategyReport.upsert({
      where: { id: REPORT_ID },
      create: { id: REPORT_ID, version: STRATEGY_VERSION, computedAt, data },
      update: { version: STRATEGY_VERSION, computedAt, data },
    });
    this.logger.log(
      `отчёт стратегии: ${report.main.variant.summary.n} сделок, ${Math.round((Date.now() - started) / 1000)} с`,
    );
  }

  private async load(tf: number): Promise<Series> {
    const rows: CandleRow[] = [];
    let cursor: Date | undefined;
    for (;;) {
      const page = await this.prisma.priceCandle.findMany({
        where: {
          symbol: SYMBOL,
          timeframe: tf,
          ...(cursor ? { time: { gt: cursor } } : {}),
        },
        orderBy: { time: 'asc' },
        take: PAGE,
        select: { time: true, open: true, high: true, low: true, close: true },
      });
      for (const r of page) rows.push(r);
      if (page.length < PAGE) break;
      cursor = page[page.length - 1].time;
    }
    return toSeries(tf, rows);
  }

  private async minutes(
    ranges: [number, number][],
  ): Promise<Map<string, Bar[]>> {
    const out = new Map<string, Bar[]>();
    for (const [from, to] of ranges) {
      const rows = await this.prisma.priceCandle.findMany({
        where: {
          symbol: SYMBOL,
          timeframe: 1,
          time: { gte: new Date(from), lt: new Date(to) },
        },
        orderBy: { time: 'asc' },
        select: { time: true, open: true, high: true, low: true, close: true },
      });
      out.set(
        minuteKey(from, to),
        rows.map((r) => ({
          t0: r.time.getTime(),
          t1: r.time.getTime() + 60_000,
          o: r.open,
          h: r.high,
          l: r.low,
          c: r.close,
        })),
      );
    }
    return out;
  }
}
