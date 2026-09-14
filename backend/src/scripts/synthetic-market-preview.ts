/**
 * Похож ли сгенерированный рынок на BTC — таблица «настоящий против генератора».
 *
 * Запуск локально:
 *   npx ts-node -r tsconfig-paths/register src/scripts/synthetic-market-preview.ts
 * На проде:
 *   docker compose --env-file .env.prod -f docker-compose.prod.yml \
 *     exec api node dist/scripts/synthetic-market-preview.js
 *
 * Параметры генератора (backtest/synthetic/params.ts) подбираются по этой
 * таблице. Правка, меняющая путь цены, поднимает SYNTH_VERSION.
 * Скрипт ничего не пишет.
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { marketProfile, syntheticProfile, type MarketProfile, type Ohlc } from '../backtest/synthetic/market-stats';
import { buildSeries } from '../backtest/synthetic/series';

const SEEDS = Array.from({ length: 20 }, (_, i) => 1000 + i);
const DAY = 86_400_000;

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const num = (x: number) => x.toFixed(2);

async function loadReal(prisma: PrismaClient): Promise<MarketProfile | null> {
  const load = async (timeframe: number, days: number): Promise<Ohlc[]> =>
    (
      await prisma.priceCandle.findMany({
        where: { symbol: 'BTCUSDT', timeframe, time: { gte: new Date(Date.now() - days * DAY) } },
        orderBy: { time: 'asc' },
      })
    ).map((c) => ({ t: c.time.getTime(), o: c.open, h: c.high, l: c.low, c: c.close }));
  try {
    const [daily, hourly, minutes] = await Promise.all([load(1440, 730), load(60, 730), load(1, 7)]);
    if (daily.length < 60 || hourly.length < 24 * 60 || minutes.length < 1440) return null;
    return marketProfile(daily, hourly, minutes);
  } catch (e) {
    console.log(`База недоступна (${(e as Error).message.split('\n')[0]}) — колонка «BTC» пустая.`);
    return null;
  }
}

function row(
  label: string,
  real: MarketProfile | null,
  synth: MarketProfile[],
  pick: (p: MarketProfile) => number,
  fmt: (x: number) => string,
) {
  const xs = synth.map(pick).sort((a, b) => a - b);
  const median = xs[Math.floor(xs.length / 2)];
  console.log(
    `${label.padEnd(34)} ${(real ? fmt(pick(real)) : '—').padStart(10)}   ${fmt(median).padStart(10)}  [${fmt(xs[0])} … ${fmt(xs[xs.length - 1])}]`,
  );
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const real = await loadReal(prisma);
    const t0 = Date.now();
    const series = SEEDS.map((seed) => buildSeries(seed));
    const synth = series.map(syntheticProfile);
    console.log(`Генератор: ${SEEDS.length} зёрен за ${Date.now() - t0} мс\n`);

    console.log(`${'метрика'.padEnd(34)} ${'BTC'.padStart(10)}   ${'генератор'.padStart(10)}  [мин … макс]`);
    row('суточная волатильность', real, synth, (p) => p.dailyVol, pct);
    row('30-дн. волатильность, p10', real, synth, (p) => p.monthlyVol[0], pct);
    row('30-дн. волатильность, p90', real, synth, (p) => p.monthlyVol[1], pct);
    row('эксцесс часовых доходностей', real, synth, (p) => p.hourlyKurtosis, num);
    row('автокорр. |r| 1ч, лаг 1', real, synth, (p) => p.absAutocorr[0], num);
    row('автокорр. |r| 1ч, лаг 6', real, synth, (p) => p.absAutocorr[1], num);
    row('автокорр. |r| 1ч, лаг 24', real, synth, (p) => p.absAutocorr[2], num);
    row('выходные / будни', real, synth, (p) => p.weekendRatio, num);
    row('эффективность суток, q25', real, synth, (p) => p.dailyEfficiency[0], num);
    row('эффективность суток, медиана', real, synth, (p) => p.dailyEfficiency[1], num);
    row('эффективность суток, q75', real, synth, (p) => p.dailyEfficiency[2], num);
    row('размах / тело минутки, медиана', real, synth, (p) => p.wickToBody, num);
    for (let h = 0; h < 24; h += 3) {
      row(`час ${String(h).padStart(2, '0')}:00 UTC к среднему`, real, synth, (p) => p.hourProfile[h], num);
    }

    console.log('\nЦена за год истории, к якорю (мин … макс по зёрнам):');
    const ratios = series.map((s) => {
      const closes = s.daily.map((d) => d.c);
      return [Math.min(...closes) / s.axis.anchorPrice, Math.max(...closes) / s.axis.anchorPrice];
    });
    console.log(
      `  минимум ${num(Math.min(...ratios.map((r) => r[0])))} … ${num(Math.max(...ratios.map((r) => r[0])))}; ` +
        `максимум ${num(Math.min(...ratios.map((r) => r[1])))} … ${num(Math.max(...ratios.map((r) => r[1])))}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
