import { qualityIntervalFor, withinTrade, computeTradeQuality } from './trade-context.service';
import type { Candle } from './indicators.service';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function candle(time: number, low: number, high: number): Candle {
  return { time, open: (low + high) / 2, high, low, close: (low + high) / 2, volume: 100 };
}

describe('qualityIntervalFor', () => {
  it('меньше 4ч — 5-минутки', () => {
    expect(qualityIntervalFor(2 * HOUR).interval).toBe('5');
  });
  it('4ч–3д — 15 минут', () => {
    expect(qualityIntervalFor(1 * DAY).interval).toBe('15');
  });
  it('3д–30д — час', () => {
    expect(qualityIntervalFor(10 * DAY).interval).toBe('60');
  });
  it('30д и больше — 4 часа', () => {
    expect(qualityIntervalFor(45 * DAY).interval).toBe('240');
  });
  it('границы включительно в сторону более крупного интервала', () => {
    expect(qualityIntervalFor(4 * HOUR).interval).toBe('15');
    expect(qualityIntervalFor(3 * DAY).interval).toBe('60');
    expect(qualityIntervalFor(30 * DAY).interval).toBe('240');
  });
});

describe('withinTrade', () => {
  it('оставляет только свечи, полностью закрытые внутри [fromMs, toMs]', () => {
    const tfMs = HOUR;
    const candles = [candle(0, 1, 2), candle(HOUR, 1, 2), candle(2 * HOUR, 1, 2), candle(3 * HOUR, 1, 2)];
    // Окно [HOUR, 3*HOUR): свеча в HOUR закрывается в 2*HOUR (входит), свеча в
    // 2*HOUR закрывается в 3*HOUR (входит ровно по границе), свеча в 3*HOUR
    // закрывается позже toMs (не входит).
    const result = withinTrade(candles, HOUR, 3 * HOUR, tfMs);
    expect(result.map((c) => c.time)).toEqual([HOUR, 2 * HOUR]);
  });
});

describe('computeTradeQuality', () => {
  it('меньше QUALITY_MIN_CANDLES свечей — null у обоих чисел', () => {
    const window = [candle(0, 90, 120), candle(HOUR, 90, 120)]; // 2 свечи < 3
    expect(computeTradeQuality('long', 100, 110, window)).toEqual({
      entryQuality: null,
      exitQuality: null,
    });
  });

  it('лонг: вход ближе к низу — выше entryQuality, выход ближе к верху — выше exitQuality', () => {
    const window = [candle(0, 90, 120), candle(HOUR, 90, 120), candle(2 * HOUR, 90, 120)];
    // low=90, high=120, span=30. entry=100 → pos=33.33 → entryQuality=66.67.
    // exit=118 → pos=93.33 → exitQuality=93.33.
    expect(computeTradeQuality('long', 100, 118, window)).toEqual({
      entryQuality: 66.67,
      exitQuality: 93.33,
    });
  });

  it('шорт — зеркально лонгу', () => {
    const window = [candle(0, 90, 120), candle(HOUR, 90, 120), candle(2 * HOUR, 90, 120)];
    // low=90, high=120, span=30. entry=112 → pos=73.33 → entryQuality=73.33 (шорт: как есть).
    // exit=93 → pos=10 → exitQuality=90 (шорт: 100-pos).
    expect(computeTradeQuality('short', 112, 93, window)).toEqual({
      entryQuality: 73.33,
      exitQuality: 90,
    });
  });

  it('клампится в [0,100] — не как rangePos', () => {
    const window = [candle(0, 90, 120), candle(HOUR, 90, 120), candle(2 * HOUR, 90, 120)];
    // Цена входа ниже low окна (числовая погрешность/пограничный случай) —
    // pos дал бы отрицательное значение, entryQuality (100-pos) — больше 100.
    const result = computeTradeQuality('long', 80, 110, window);
    expect(result.entryQuality).toBeLessThanOrEqual(100);
    expect(result.entryQuality).toBeGreaterThanOrEqual(0);
  });
});
