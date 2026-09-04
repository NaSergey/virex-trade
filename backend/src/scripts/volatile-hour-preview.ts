/**
 * Что скажет сигнал «Волатильный час» в каждый день недели — без отправки в
 * чат и без ожидания нужной минуты.
 *
 * Запуск локально:
 *   npx ts-node -r tsconfig-paths/register src/scripts/volatile-hour-preview.ts
 * На проде:
 *   docker compose --env-file .env.prod -f docker-compose.prod.yml \
 *     exec api node dist/scripts/volatile-hour-preview.js
 *
 * Нужен, чтобы пороги пресетов выбирались по данным, а не на глаз. Порог тут
 * особенный: он сравнивает час сам с собой в другие дни недели, а на клетке
 * «день × час» за два года набирается около сотни свечей — шум в среднем
 * порядка десяти процентов. То есть само по себе превышение ×1.1 может
 * ничего не значить, и увидеть, где проходит граница между находкой и шумом,
 * можно только на живой таблице hourly_prices.
 *
 * Скрипт ничего не пишет и ничего не рассылает.
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { WeekdayHourBucket } from '../market-events/market-events.service';
import { hourAverages, peakHourOfWeekday, topQuartileHours } from '../notifications/market-metrics';
import { notifDef } from '../notifications/registry';

const DAYS = 730;
const WEEKDAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const hhmm = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

async function main() {
  const prisma = new PrismaClient();
  try {
    const since = new Date(Date.now() - DAYS * 86_400_000);
    const candles = await prisma.hourlyPrice.findMany({
      where: { symbol: 'BTCUSDT', date: { gte: since } },
      orderBy: { date: 'asc' },
    });
    if (candles.length === 0) {
      console.log('В hourly_prices нет свечей за период — сигналу не на чем считать.');
      return;
    }

    const agg = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({ samples: 0, volSum: 0 })),
    );
    for (const c of candles) {
      const cell = agg[c.date.getUTCDay()][c.date.getUTCHours()];
      cell.samples++;
      if (c.open > 0) cell.volSum += ((c.high - c.low) / c.open) * 100;
    }
    const cells: WeekdayHourBucket[] = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      for (let hour = 0; hour < 24; hour++) {
        const { samples, volSum } = agg[weekday][hour];
        cells.push({
          weekday,
          hour,
          samples,
          avgVolatilityPct: samples > 0 ? volSum / samples : 0,
        });
      }
    }

    const minCell = Math.min(...cells.map((c) => c.samples));
    console.log(`Свечей: ${candles.length}, минимум на клетку «день × час»: ${minCell}`);
    console.log(
      'Верхняя четверть часов суток: ' +
        topQuartileHours(hourAverages(cells))
          .sort((a, b) => a - b)
          .map(hhmm)
          .join(', '),
    );

    for (const preset of notifDef('mkt.hour')?.presets ?? []) {
      console.log(`\n--- порог ${preset.label} ---`);
      for (let weekday = 0; weekday < 7; weekday++) {
        const pick = peakHourOfWeekday(cells, weekday, preset.value);
        console.log(
          `${WEEKDAY_NAMES[weekday]}: ` +
            (pick
              ? `${hhmm(pick.hour)} UTC, размах ${pick.avgVolatilityPct.toFixed(2)}% против ` +
                `${pick.weekAvgPct.toFixed(2)}% в среднем по неделе (×${pick.ratio.toFixed(2)})`
              : 'молчит'),
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
