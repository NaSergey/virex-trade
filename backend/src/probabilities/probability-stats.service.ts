import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { START_MS } from '../market-data/timeframes';
import { PrismaService } from '../prisma/prisma.service';
import { runsBackgroundJobs } from '../role';
import { DerivFeed, DERIV_SYMBOL, SERIES_START } from './deriv-feed';
import {
  derivNow,
  derivOdds,
  ZONE_DAYS,
  type DerivKind,
  type DerivPointLike,
} from './deriv-stats';
import {
  DIVERGENCE_TFS,
  divergenceOdds,
  type DivergenceOdds,
} from './divergence-stats';
import type { Bar } from './odds-math';

const TICK_MS = 60 * 60_000;
const DAY = 86_400_000;
const YEAR = 365 * DAY;

/** Частоты пересчитываются раз в сутки; срок — от `computedAt` в базе, не от памяти процесса. */
export const isStale = (computedAt: Date | null, now: number) =>
  computedAt == null || now - computedAt.getTime() >= DAY;

/**
 * Экспериментальные вероятности терминала (спека 2026-10-25), роль `worker`.
 * Раз в час доливает ряды Bybit и пишет «сейчас» (значение и зона каждого ряда),
 * раз в сутки пересчитывает частоты дивергенций RSI (свечи BTC с 2018 года) и
 * зон деривативов. `api` читает готовые строки `probability_stats`.
 */
@Injectable()
export class ProbabilityStatsService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ProbabilityStatsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly feed: DerivFeed,
  ) {}

  onApplicationBootstrap() {
    if (!runsBackgroundJobs()) return;
    void this.tick().catch((e) => this.logger.error(`вероятности: ${e}`));
    this.timer = setInterval(() => {
      this.tick().catch((e) => this.logger.error(`вероятности: ${e}`));
    }, TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now: number = Date.now()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.feed.pull(now);
      await this.writeNow(now);
      const last = await this.prisma.probabilityStat.findUnique({
        where: { key: 'derivs' },
        select: { computedAt: true },
      });
      if (isStale(last?.computedAt ?? null, now)) await this.recompute(now);
    } finally {
      this.running = false;
    }
  }

  async writeNow(now: number): Promise<void> {
    const from = now - (ZONE_DAYS + 2) * DAY;
    const data = derivNow(
      await this.bars(240, from, now),
      await this.points(from),
      now,
    );
    await this.save('now', data, new Date(now));
  }

  async recompute(now: number): Promise<void> {
    const divergence: Record<string, DivergenceOdds> = {};
    for (const tf of DIVERGENCE_TFS)
      divergence[tf] = divergenceOdds(await this.bars(tf, START_MS, now));
    const derivs = derivOdds(
      await this.bars(240, SERIES_START, now),
      await this.points(SERIES_START),
    );
    const at = new Date(now);
    await this.save('divergence', divergence, at);
    // Последней: по её `computedAt` тик решает, пора ли пересчитывать.
    await this.save('derivs', derivs, at);
    this.logger.log('частоты вероятностей пересчитаны');
  }

  /**
   * Свечи BTC таймфрейма кусками по году и только нужными столбцами: 15м с 2018
   * — около 300 тысяч строк, и целые строки Prisma тянули бы впустую.
   */
  private async bars(tf: number, from: number, to: number): Promise<Bar[]> {
    const out: Bar[] = [];
    for (let a = from; a < to; a += YEAR) {
      const rows = await this.prisma.$queryRaw<Bar[]>`
        SELECT (extract(epoch from "time") * 1000)::float8 AS t, "high" AS h, "low" AS l, "close" AS c
        FROM price_candles
        WHERE symbol = ${DERIV_SYMBOL} AND timeframe = ${tf}
          AND "time" >= ${new Date(a)} AND "time" < ${new Date(Math.min(a + YEAR, to))}
        ORDER BY "time"`;
      for (const r of rows) out.push(r);
    }
    return out;
  }

  private async points(from: number): Promise<DerivPointLike[]> {
    const rows = await this.prisma.derivPoint.findMany({
      where: { symbol: DERIV_SYMBOL, time: { gte: new Date(from) } },
      orderBy: { time: 'asc' },
      select: { kind: true, time: true, value: true },
    });
    return rows.map((r) => ({
      kind: r.kind as DerivKind,
      time: r.time.getTime(),
      value: r.value,
    }));
  }

  private save(key: string, data: unknown, computedAt: Date) {
    const json = data as Prisma.InputJsonValue;
    return this.prisma.probabilityStat.upsert({
      where: { key },
      create: { key, data: json, computedAt },
      update: { data: json, computedAt },
    });
  }
}
