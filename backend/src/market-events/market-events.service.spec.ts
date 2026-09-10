import { MarketEventsService } from './market-events.service';
import { Candle } from '../market-data/market-data.service';

const candle = (iso: string, open: number, close: number, high = close, low = open): Candle => ({
  time: new Date(iso),
  open,
  high,
  low,
  close,
  volume: 1,
});

function makeService(candles: Candle[]) {
  const getCandles = jest.fn().mockResolvedValue(candles);
  return { service: new MarketEventsService({ getCandles } as never), getCandles };
}

describe('MarketEventsService', () => {
  it('берёт дневные свечи из MarketDataService, а не из prisma.dailyPrice', async () => {
    const { service, getCandles } = makeService([]);

    await service.getCorrelation(730);

    expect(getCandles).toHaveBeenCalledWith(
      expect.objectContaining({ timeframe: 1440, from: expect.any(Date) }),
    );
  });

  it('берёт часовые свечи таймфреймом 60', async () => {
    const { service, getCandles } = makeService([]);

    await service.getHourlyStats(730);

    expect(getCandles).toHaveBeenCalledWith(
      expect.objectContaining({ timeframe: 60, from: expect.any(Date) }),
    );
  });

  // changePct больше не колонка — он считается на месте, и это единственное
  // место, где ошибка знака или деления прошла бы незамеченной.
  it('считает changePct из open и close', async () => {
    // 2026-01-01 — четверг (getUTCDay() === 4)
    const { service } = makeService([candle('2026-01-01T00:00:00Z', 100, 110)]);

    const { weekday } = await service.getCorrelation(730);

    expect(weekday[4].days).toBe(1);
    expect(weekday[4].upDays).toBe(1);
    expect(weekday[4].avgChangePct).toBeCloseTo(10, 6);
  });

  it('считает убыточный день как down', async () => {
    const { service } = makeService([candle('2026-01-01T00:00:00Z', 100, 90)]);

    const { weekday } = await service.getCorrelation(730);

    expect(weekday[4].upDays).toBe(0);
    expect(weekday[4].avgChangePct).toBeCloseTo(-10, 6);
  });

  it('считает часовой размах как (high-low)/open', async () => {
    const { service } = makeService([candle('2026-01-01T05:00:00Z', 100, 105, 120, 100)]);

    const { hourly } = await service.getHourlyStats(730);

    expect(hourly[5].samples).toBe(1);
    expect(hourly[5].avgVolatilityPct).toBeCloseTo(20, 6);
  });

  it('раскладывает свечи по 168 клеткам «день недели × час»', async () => {
    const { service } = makeService([candle('2026-01-01T05:00:00Z', 100, 105, 120, 100)]);

    const { cells, totalSamples } = await service.getWeekdayHourStats(730);

    expect(cells).toHaveLength(168);
    expect(totalSamples).toBe(1);
    const cell = cells.find((c) => c.weekday === 4 && c.hour === 5);
    expect(cell?.samples).toBe(1);
    expect(cell?.avgVolatilityPct).toBeCloseTo(20, 6);
  });
});
