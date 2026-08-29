import { describe, expect, it } from 'vitest';
import { habitAdvice, habitLabel, habitSearchParams } from './habit-labels';
import type { Habit } from '@/entities/trade';

// Фейковый t(): возвращает сам ключ (плюс JSON подставленных значений) — тест
// проверяет, какой ключ и с какими params выбрала функция, а не текст
// перевода из каталога (его сверяет messages.test.ts).
const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

function makeHabit(overrides: Partial<Habit>): Habit {
  return {
    key: 'k',
    group: 'behaviour',
    kind: 'tilt',
    params: {},
    label: 'RAW_LABEL',
    advice: 'RAW_ADVICE',
    n: 20,
    nRest: 40,
    avgPnl: -10,
    avgRest: 5,
    lift: -15,
    cost: -150,
    absolute: 150,
    winRate: 30,
    winRateRest: 50,
    p: 0.01,
    confidence: 'confirmed',
    outlierSafe: true,
    oos: 'pass',
    lab: null,
    ...overrides,
  };
}

describe('habitLabel', () => {
  it('tilt — без параметров', () => {
    expect(habitLabel(makeHabit({ kind: 'tilt' }), t)).toBe('habitLabelTilt');
  });

  it('overtrading — подставляет nth', () => {
    const h = makeHabit({ kind: 'overtrading', params: { nth: 3, limit: 2 } });
    expect(habitLabel(h, t)).toBe('habitLabelOvertrading:{"nth":3}');
  });

  it('size_up — подставляет mult', () => {
    const h = makeHabit({ kind: 'size_up', params: { mult: 1.5 } });
    expect(habitLabel(h, t)).toBe('habitLabelSizeUp:{"mult":1.5}');
  });

  it('dir long/short — разные ключи на одном kind', () => {
    expect(habitLabel(makeHabit({ kind: 'dir', params: { direction: 'long' } }), t)).toBe('habitLabelDirLong');
    expect(habitLabel(makeHabit({ kind: 'dir', params: { direction: 'short' } }), t)).toBe('habitLabelDirShort');
  });

  it('dir — незнакомое значение направления откатывается на сырой label', () => {
    const h = makeHabit({ kind: 'dir', params: { direction: 'sideways' }, label: 'RAW_LABEL' });
    expect(habitLabel(h, t)).toBe('RAW_LABEL');
  });

  it('hour — часы дополняются нулём слева', () => {
    const h = makeHabit({ kind: 'hour', params: { hourFrom: 8, hourTo: 11 } });
    expect(habitLabel(h, t)).toBe('habitLabelHour:{"hourFrom":"08","hourTo":"11"}');
  });

  it('weekday — индекс выбирает один из семи ключей', () => {
    expect(habitLabel(makeHabit({ kind: 'weekday', params: { weekday: 0 } }), t)).toBe('habitLabelWeekday0');
    expect(habitLabel(makeHabit({ kind: 'weekday', params: { weekday: 6 } }), t)).toBe('habitLabelWeekday6');
  });

  it('session — по имени сессии', () => {
    expect(habitLabel(makeHabit({ kind: 'session', params: { session: 'london' } }), t)).toBe(
      'habitLabelSessionLondon',
    );
  });

  it('trend4h — по режиму тренда', () => {
    expect(habitLabel(makeHabit({ kind: 'trend4h', params: { trend: 'trend_up' } }), t)).toBe('habitLabelTrendUp');
  });

  it('ema200 — above/below', () => {
    expect(habitLabel(makeHabit({ kind: 'ema200', params: { side: 'above' } }), t)).toBe('habitLabelEma200Above');
    expect(habitLabel(makeHabit({ kind: 'ema200', params: { side: 'below' } }), t)).toBe('habitLabelEma200Below');
  });

  it('atr — high/low', () => {
    expect(habitLabel(makeHabit({ kind: 'atr', params: { level: 'high' } }), t)).toBe('habitLabelAtrHigh');
    expect(habitLabel(makeHabit({ kind: 'atr', params: { level: 'low' } }), t)).toBe('habitLabelAtrLow');
  });

  it('vol — high/low', () => {
    expect(habitLabel(makeHabit({ kind: 'vol', params: { level: 'high' } }), t)).toBe('habitLabelVolHigh');
    expect(habitLabel(makeHabit({ kind: 'vol', params: { level: 'low' } }), t)).toBe('habitLabelVolLow');
  });

  it('range4h — low/mid/high', () => {
    expect(habitLabel(makeHabit({ kind: 'range4h', params: { bucket: 'mid' } }), t)).toBe('habitLabelRange4hMid');
  });

  it('tag — подставляет имя тега', () => {
    const h = makeHabit({ kind: 'tag', params: { tagName: 'Пробой' } });
    expect(habitLabel(h, t)).toBe('habitLabelTag:{"tagName":"Пробой"}');
  });

  it('symbol — подставляет тикер', () => {
    const h = makeHabit({ kind: 'symbol', params: { symbol: 'BTCUSDT' } });
    expect(habitLabel(h, t)).toBe('habitLabelSymbol:{"symbol":"BTCUSDT"}');
  });

  it('незнакомый kind откатывается на сырой label с бэкенда', () => {
    const h = makeHabit({ kind: 'future_kind' as unknown as Habit['kind'], label: 'RAW_LABEL' });
    expect(habitLabel(h, t)).toBe('RAW_LABEL');
  });
});

describe('habitAdvice', () => {
  it('overtrading — подставляет limit, а не nth', () => {
    const h = makeHabit({ kind: 'overtrading', params: { nth: 3, limit: 2 } });
    expect(habitAdvice(h, t)).toBe('habitAdviceOvertrading:{"limit":2}');
  });

  it('atr high/low — разные советы', () => {
    expect(habitAdvice(makeHabit({ kind: 'atr', params: { level: 'high' } }), t)).toBe('habitAdviceAtrHigh');
    expect(habitAdvice(makeHabit({ kind: 'atr', params: { level: 'low' } }), t)).toBe('habitAdviceAtrLow');
  });

  it('ema200 above/below — общий совет на оба', () => {
    expect(habitAdvice(makeHabit({ kind: 'ema200', params: { side: 'above' } }), t)).toBe('habitAdviceEma200');
    expect(habitAdvice(makeHabit({ kind: 'ema200', params: { side: 'below' } }), t)).toBe('habitAdviceEma200');
  });

  it('незнакомый kind откатывается на сырой advice с бэкенда', () => {
    const h = makeHabit({ kind: 'future_kind' as unknown as Habit['kind'], advice: 'RAW_ADVICE' });
    expect(habitAdvice(h, t)).toBe('RAW_ADVICE');
  });
});

describe('habitSearchParams', () => {
  it('null lab — не кликабельно', () => {
    expect(habitSearchParams(null)).toBeNull();
  });

  it('сериализует словарь lab как query-строку', () => {
    expect(habitSearchParams({ direction: 'long' })).toBe('direction=long');
  });

  it('сохраняет все ключи многосоставного словаря (range4h)', () => {
    const qs = habitSearchParams({ rangeTf: '4h', range: 'low' });
    const params = new URLSearchParams(qs ?? '');
    expect(params.get('rangeTf')).toBe('4h');
    expect(params.get('range')).toBe('low');
  });
});
