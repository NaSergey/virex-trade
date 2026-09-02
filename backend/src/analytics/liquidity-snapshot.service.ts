import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const SNAPSHOT_INTERVAL_MS = 15 * 60_000;
// 200 — глубина, на которой центр тяжести стороны книги уже что-то значит:
// топ-10, которых хватает для лесенки, почти не отклоняются от середины и
// давали бы плоскую линию впритык к цене. 200 — допустимое для category=linear
// значение у Bybit (1 / 50 / 200 / 500), следующее за 50 вверх.
const DEPTH_LEVELS = 200;

/**
 * Раз в 15 минут снимает стакан BTC/ETH/SOL и пишет в `liquidity_snapshots`
 * средневзвешенную по объёму цену каждой стороны книги — центр тяжести
 * бидов и центр тяжести асков, вместе с ценой в тот момент. Это единственный
 * способ получить историю такого ряда: у Bybit, как и у любой другой биржи,
 * нет ручки «стакан вчера в 14:00» — прошлые состояния книги никто не
 * архивирует, поэтому ряд можно только копить вперёд с момента первого
 * запуска, не бэкфилля.
 *
 * Тот же приём, что у HourlyPriceSyncService: OnApplicationBootstrap запускает
 * первый снимок и таймер, OnModuleDestroy его гасит, `syncing` не даёт двум
 * прогонам наложиться, если один почему-то не уложился в интервал.
 */
@Injectable()
export class LiquiditySnapshotService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(LiquiditySnapshotService.name);
  private timer?: NodeJS.Timeout;
  private syncing = false;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    this.sync().catch((e) => this.logger.error('initial liquidity snapshot failed', e));
    this.timer = setInterval(() => {
      this.sync().catch((e) => this.logger.error('periodic liquidity snapshot failed', e));
    }, SNAPSHOT_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async sync(): Promise<{ written: number }> {
    if (this.syncing) return { written: 0 };
    this.syncing = true;
    try {
      // Промах по одному символу (сеть, редкий отказ Bybit) не должен стоить
      // двух остальных — снимаем все три параллельно и считаем упавшие как
      // «в этот раз без этого символа», а не роняем весь прогон.
      const results = await Promise.allSettled(SYMBOLS.map((symbol) => this.snapshotOne(symbol)));
      const written = results.filter((r) => r.status === 'fulfilled' && r.value).length;
      results.forEach((r, i) => {
        if (r.status === 'rejected') this.logger.warn(`liquidity snapshot failed for ${SYMBOLS[i]}: ${r.reason}`);
      });
      return { written };
    } finally {
      this.syncing = false;
    }
  }

  private async snapshotOne(symbol: string): Promise<boolean> {
    const response = await fetch(
      `https://api.bybit.com/v5/market/orderbook?category=linear&symbol=${encodeURIComponent(symbol)}&limit=${DEPTH_LEVELS}`,
    );
    if (!response.ok) throw new Error(`Bybit orderbook responded with status ${response.status}`);
    const json = await response.json();
    const raw = json.result;
    const bids: [string, string][] = raw?.b ?? [];
    const asks: [string, string][] = raw?.a ?? [];
    if (bids.length === 0 || asks.length === 0) throw new Error('Bybit orderbook returned no levels');

    // Средневзвешенная по объёму цена стороны: Σ(цена × объём) / Σ(объём) —
    // «на каких уровнях сосредоточен объём», а не просто лучшая котировка.
    const weightedCenter = (levels: [string, string][]): number => {
      let sumPriceQty = 0;
      let sumQty = 0;
      for (const [priceStr, qtyStr] of levels) {
        const price = parseFloat(priceStr);
        const qty = parseFloat(qtyStr);
        sumPriceQty += price * qty;
        sumQty += qty;
      }
      return sumQty > 0 ? sumPriceQty / sumQty : 0;
    };

    const bidCenter = weightedCenter(bids);
    const askCenter = weightedCenter(asks);
    const price = (parseFloat(bids[0][0]) + parseFloat(asks[0][0])) / 2;
    if (bidCenter <= 0 || askCenter <= 0 || price <= 0) throw new Error('degenerate orderbook weights');

    await this.prisma.liquiditySnapshot.create({
      data: { symbol, ts: new Date(), price, bidCenter, askCenter },
    });
    return true;
  }
}
