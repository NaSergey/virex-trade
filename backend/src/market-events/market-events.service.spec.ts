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

  describe('getTimeSlots — «когда BTC чаще растёт»', () => {
    // 2026-01-01 — четверг; шаг в неделю держит день недели и время.
    const weekly = (n: number, time: string, up: (i: number) => boolean | null) =>
      Array.from({ length: n }, (_, i) => {
        const iso = new Date(Date.parse(`2026-01-01T${time}:00Z`) + i * 7 * 86_400_000).toISOString();
        const dir = up(i);
        return dir === null ? candle(iso, 100, 100) : dir ? candle(iso, 100, 101) : candle(iso, 100, 99);
      });

    it('читает свечи того таймфрейма, о котором спрашивают', async () => {
      const { service, getCandles } = makeService([]);

      await service.getTimeSlots(240, 730);

      expect(getCandles).toHaveBeenCalledWith(expect.objectContaining({ timeframe: 240, from: expect.any(Date) }));
    });

    it('слот — день недели и время открытия свечи по UTC; доля роста — среди свечей, которые сдвинулись', async () => {
      const { service } = makeService([
        ...weekly(6, '14:15', (i) => i < 3), // 3 роста, 3 падения
        ...weekly(4, '14:30', (i) => (i === 0 ? null : i < 3)), // свеча на месте, 2 роста, 1 падение
      ]);

      const { timeframe, slots, totalSamples } = await service.getTimeSlots(15, 730);

      expect(timeframe).toBe(15);
      expect(totalSamples).toBe(10);
      expect(slots).toEqual([
        { weekday: 4, minute: 14 * 60 + 15, samples: 6, upSamples: 3, downSamples: 3, upPct: 50, avgChangePct: 0 },
        expect.objectContaining({ weekday: 4, minute: 14 * 60 + 30, samples: 4, upSamples: 2, downSamples: 1 }),
      ]);
      expect(slots[1].upPct).toBeCloseTo((2 / 3) * 100, 6);
      expect(slots[1].avgChangePct).toBeCloseTo(0.25, 6); // (0 + 1 + 1 − 1) / 4
    });

    it('слоты идут по неделе: с воскресенья, внутри дня по времени', async () => {
      const { service } = makeService([
        candle('2026-01-05T08:00:00Z', 100, 101), // понедельник
        candle('2026-01-04T23:00:00Z', 100, 101), // воскресенье
        candle('2026-01-04T01:00:00Z', 100, 99), // воскресенье
      ]);

      const { slots } = await service.getTimeSlots(60, 730);

      expect(slots.map((s) => [s.weekday, s.minute])).toEqual([
        [0, 60],
        [0, 23 * 60],
        [1, 8 * 60],
      ]);
    });

    it('слот без единого движения — доля роста 50, а не деление на ноль', async () => {
      const { service } = makeService([candle('2026-01-01T00:00:00Z', 100, 100)]);

      const { slots } = await service.getTimeSlots(1440, 730);

      expect(slots[0]).toEqual(expect.objectContaining({ samples: 1, upSamples: 0, downSamples: 0, upPct: 50 }));
    });

    it('кэш — на таймфрейм и окно: другой ТФ читает свечи заново, тот же — нет', async () => {
      const { service, getCandles } = makeService([]);

      await service.getTimeSlots(60, 730);
      await service.getTimeSlots(60, 730);
      await service.getTimeSlots(240, 730);

      expect(getCandles).toHaveBeenCalledTimes(2);
    });
  });

  describe('кэш агрегатов (TTL 1 час, ключ — метрика + days)', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('getHourlyStats: второй вызов в пределах TTL не читает свечи заново', async () => {
      const { service, getCandles } = makeService([]);

      await service.getHourlyStats(730);
      await service.getHourlyStats(730);

      expect(getCandles).toHaveBeenCalledTimes(1);
    });

    it('getHourlyStats: после протухания TTL свечи читаются заново', async () => {
      let now = 1_000_000;
      jest.spyOn(Date, 'now').mockImplementation(() => now);
      const { service, getCandles } = makeService([]);

      await service.getHourlyStats(730);
      now += 60 * 60_000 + 1;
      await service.getHourlyStats(730);

      expect(getCandles).toHaveBeenCalledTimes(2);
    });

    it('getHourlyStats: разные days кэшируются раздельно', async () => {
      const { service, getCandles } = makeService([]);

      await service.getHourlyStats(730);
      await service.getHourlyStats(30);

      expect(getCandles).toHaveBeenCalledTimes(2);
    });

    it('getWeekdayHourStats: второй вызов в пределах TTL не читает свечи заново (учитывает и опрос market-alerts раз в 5 минут)', async () => {
      const { service, getCandles } = makeService([]);

      await service.getWeekdayHourStats(730);
      await service.getWeekdayHourStats(730);
      await service.getWeekdayHourStats(730);

      expect(getCandles).toHaveBeenCalledTimes(1);
    });

    it('getCorrelation: второй вызов в пределах TTL не читает свечи заново', async () => {
      const { service, getCandles } = makeService([]);

      await service.getCorrelation(730);
      await service.getCorrelation(730);

      expect(getCandles).toHaveBeenCalledTimes(1);
    });

    it('getHourlyStats и getWeekdayHourStats кэшируются раздельно (разная метрика — общий days)', async () => {
      const { service, getCandles } = makeService([]);

      await service.getHourlyStats(730);
      await service.getWeekdayHourStats(730);

      expect(getCandles).toHaveBeenCalledTimes(2);
    });
  });
});

/**
 * Два запроса на пустой кэш одновременно — один расчёт: агрегат читает
 * тысячи свечей из базы, и второму хватает ответа первого.
 */
describe('MarketEventsService — расчёт в полёте общий', () => {
  it('параллельные запросы одной метрики ждут один расчёт', async () => {
    const { service, getCandles } = makeService([]);
    await Promise.all([service.getHourlyStats(730), service.getHourlyStats(730), service.getHourlyStats(730)]);
    expect(getCandles).toHaveBeenCalledTimes(1);
  });

  it('разные окна не делят расчёт', async () => {
    const { service, getCandles } = makeService([]);
    await Promise.all([service.getHourlyStats(730), service.getHourlyStats(90)]);
    expect(getCandles).toHaveBeenCalledTimes(2);
  });

  it('упавший расчёт не кэшируется и не залипает в полёте', async () => {
    const { service, getCandles } = makeService([]);
    getCandles.mockRejectedValueOnce(new Error('db down'));
    await expect(service.getHourlyStats(730)).rejects.toThrow('db down');
    await expect(service.getHourlyStats(730)).resolves.toBeDefined();
    expect(getCandles).toHaveBeenCalledTimes(2);
  });
});
