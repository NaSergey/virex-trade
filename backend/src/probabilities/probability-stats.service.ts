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
import {
  DIVERGENCE_TFS,
  divergenceOdds,
  type DivergenceOdds,
} from './divergence-stats';
import type { Bar } from './odds-math';

const SYMBOL = 'BTCUSDT';
const TICK_MS = 60 * 60_000;
const DAY = 86_400_000;
const YEAR = 365 * DAY;

/**
 * Отдать цикл событий между тяжёлыми шагами пересчёта: в том же `worker` живут
 * синк сделок и опрос Telegram, и счёт по всем таймфреймам подряд держал бы их
 * секундами.
 */
const breathe = () => new Promise<void>((r) => setImmediate(r));

/** Частоты пересчитываются раз в сутки; срок — от `computedAt` в базе, не от памяти процесса. */
export const isStale = (computedAt: Date | null, now: number) =>
  computedAt == null || now - computedAt.getTime() >= DAY;

/**
 * Экспериментальные вероятности терминала (спека 2026-10-25), роль `worker`:
 * раз в сутки пересчитывает частоты после дивергенций RSI по свечам BTC с 2018
 * года. Проверка — раз в час, срок — по `computedAt` строки в базе. `api` читает
 * готовую строку `probability_stats`.
 */
@Injectable()
export class ProbabilityStatsService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ProbabilityStatsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

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
      const last = await this.prisma.probabilityStat.findUnique({
        where: { key: 'divergence' },
        select: { computedAt: true },
      });
      if (isStale(last?.computedAt ?? null, now)) await this.recompute(now);
    } finally {
      this.running = false;
    }
  }

  async recompute(now: number): Promise<void> {
    const divergence: Record<string, DivergenceOdds> = {};
    for (const tf of DIVERGENCE_TFS) {
      divergence[tf] = divergenceOdds(await this.bars(tf, START_MS, now));
      await breathe();
    }
    const json = divergence as unknown as Prisma.InputJsonValue;
    const computedAt = new Date(now);
    await this.prisma.probabilityStat.upsert({
      where: { key: 'divergence' },
      create: { key: 'divergence', data: json, computedAt },
      update: { data: json, computedAt },
    });
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
        WHERE symbol = ${SYMBOL} AND timeframe = ${tf}
          AND "time" >= ${new Date(a)} AND "time" < ${new Date(Math.min(a + YEAR, to))}
        ORDER BY "time"`;
      for (const r of rows) out.push(r);
    }
    return out;
  }
}
