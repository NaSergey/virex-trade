import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BinanceKlinesClient } from './binance-klines.client';
import { SYMBOL, START_MS, SYNC_ORDER, isClosed } from './timeframes';
import { runsBackgroundJobs } from '../role';

const SYNC_INTERVAL_MS = 15 * 60_000;
const PAGE_LIMIT = 1000;
// ~3.3 запроса в секунду. Вес klines с limit=1000 у Binance равен 5, то есть
// около 1000 единиц веса в минуту при лимите 1200 — запас есть, но небольшой.
const PAGE_DELAY_MS = 300;

/**
 * Держит `price_candles` заполненной свечами BTCUSDT с Binance spot.
 *
 * Отдельного режима первоначальной заливки НЕТ: цикл всегда идёт вперёд от
 * последней сохранённой свечи. На пустой базе он стартует от 2018 года и
 * упирается в «сегодня» примерно через полчаса, на заполненной делает один
 * запрос и выходит — это один и тот же код, разница только в числе итераций.
 *
 * Отсюда три свойства, ради которых так и сделано: курсор нигде не хранится
 * (нечему разъехаться с таблицей), прерывание безопасно в любой момент
 * (следующий старт продолжит с той же свечи), и пробел в истории невозможен,
 * потому что запись всегда идёт строго вперёд от максимума — именно это и
 * делает MAX(time) законным курсором, а не догадкой.
 */
@Injectable()
export class PriceSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PriceSyncService.name);
  private timer?: NodeJS.Timeout;
  private syncing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly binance: BinanceKlinesClient,
  ) {}

  onApplicationBootstrap() {
    // T11: фоновый сервис — только роль worker (и дефолтная all).
    if (!runsBackgroundJobs()) return;
    this.sync().catch((e) => this.logger.error('первый прогон синка свечей упал', e));
    this.timer = setInterval(() => {
      this.sync().catch((e) => this.logger.error('периодический синк свечей упал', e));
    }, SYNC_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Вынесено полем, чтобы тесты не ждали по-настоящему. */
  protected pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  async sync(): Promise<{ inserted: number }> {
    if (this.syncing) return { inserted: 0 };
    this.syncing = true;
    try {
      let inserted = 0;
      for (const timeframe of SYNC_ORDER) {
        // Порядок «от крупного к мелкому» не должен значить, что сбой на
        // крупном таймфрейме голодом кладёт мелкие: 1440 может упасть от сети
        // или лимита Binance, а 60/15/5/1 нужны графику независимо от этого.
        try {
          inserted += await this.syncTimeframe(timeframe);
        } catch (e) {
          this.logger.error(`синк таймфрейма ${timeframe} упал`, e as Error);
        }
      }
      if (inserted > 0) this.logger.log(`записано свечей: ${inserted}`);
      return { inserted };
    } finally {
      this.syncing = false;
    }
  }

  async syncTimeframe(timeframe: number): Promise<number> {
    const latest = await this.prisma.priceCandle.findFirst({
      where: { symbol: SYMBOL, timeframe },
      orderBy: { time: 'desc' },
      select: { time: true },
    });

    // На пустой базе первый запрос уйдёт ровно от START_MS.
    let cursor = latest ? latest.time.getTime() : START_MS - 1;
    let inserted = 0;

    for (;;) {
      const now = Date.now();
      const page = await this.binance.fetchKlines(SYMBOL, timeframe, cursor + 1, PAGE_LIMIT);
      if (page.length === 0) break;

      const closed = page.filter((c) => isClosed(c.time, timeframe, now));
      if (closed.length === 0) break; // догнали хвост: дальше только текущая свеча

      const { count } = await this.prisma.priceCandle.createMany({
        data: closed.map((c) => ({
          symbol: SYMBOL,
          timeframe,
          time: new Date(c.time),
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        })),
        skipDuplicates: true,
      });
      inserted += count;

      // Курсор двигается по ПОЛУЧЕННОЙ свече, а не по числу вставленных:
      // skipDuplicates вернёт ноль на странице, которая уже лежит в базе, и
      // курсор, привязанный к вставкам, застрял бы навсегда.
      cursor = closed[closed.length - 1].time;

      await this.pause(PAGE_DELAY_MS);
    }

    return inserted;
  }
}
