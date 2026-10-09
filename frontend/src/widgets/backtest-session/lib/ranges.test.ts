import { describe, expect, it } from 'vitest';
import type { Candle } from './candles';
import { H4, atrOf, findRanges, toChartRanges, visibleAt, zigzagOf, type RangeBox } from './ranges';
import btc from './__fixtures__/btc-4h-2024.json';

/** Ряд по закрытиям: каждая свеча открывается закрытием предыдущей. */
function series(closes: number[], spread = 0.5): Candle[] {
  return closes.map((c, i) => {
    const o = i === 0 ? c : closes[i - 1];
    return { t: i * H4, o, h: Math.max(o, c) + spread, l: Math.min(o, c) - spread, c };
  });
}

const range = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let v = from; step > 0 ? v <= to + 1e-9 : v >= to - 1e-9; v += step) out.push(v);
  return out;
};

/** Ровный участок, чуть сползающий: его минимум — у конца, там и начнётся импульс (после разгона ATR). */
const flat = (n: number) => Array.from({ length: n }, (_, i) => 100 + (i % 2 ? 0.3 : -0.3) - i * 0.01);

/** Ровно → импульс вверх → откат → качания в коридоре → пробой вверх. */
function impulseThenRange(): number[] {
  const impulse = range(102, 124, 2);
  const pullback = range(122, 112, -2);
  const swings: number[] = [];
  for (let k = 0; k < 4; k++) swings.push(...range(114, 122, 2), ...range(120, 114, -2));
  const breakout = range(126, 150, 3);
  return [...flat(40), ...impulse, ...pullback, ...swings, ...breakout];
}

describe('atrOf', () => {
  it('у свечей одного размаха без разрывов ATR равен размаху', () => {
    const bars = Array.from({ length: 30 }, (_, i) => ({ t: i * H4, o: 100, h: 101, l: 99, c: 100 }));
    expect(atrOf(bars, 14).at(-1)).toBeCloseTo(2, 6);
  });
});

describe('zigzagOf', () => {
  it('засчитывает вершину, только когда цена отошла от неё на k·ATR, и в момент подтверждения', () => {
    const bars = series([...range(100, 120, 2), ...range(118, 100, -2)], 0.5);
    const atr = bars.map(() => 2);
    const top = zigzagOf(bars, atr, 4).find((s) => s.kind === 'H')!;
    expect(top.price).toBeCloseTo(120.5, 6);
    // Вершина на свече 10; отход на 8 (4·2) от 120,5 — минимум 112,5 у свечи 14.
    expect(top.at).toBe(10);
    expect(top.conf).toBe(14);
  });
});

describe('findRanges', () => {
  it('находит одну рамку после импульса и её пробой вверх', () => {
    const bars = series(impulseThenRange());
    const boxes = findRanges(bars);
    expect(boxes).toHaveLength(1);
    const b = boxes[0];
    expect(b.dir).toBe('up');
    expect(b.steps[0].hi).toBeCloseTo(124.5, 6);
    expect(b.end).toBe('up');
    expect(b.endAt).not.toBeNull();
    expect(b.seenAt).toBeGreaterThan(b.impTo);
    expect(b.endAt!).toBeGreaterThan(b.seenAt);
  });

  it('откат глубже 60 % импульса — разворот, а не боковик', () => {
    const bars = series([...flat(40), ...range(102, 124, 2), ...range(122, 100, -2), ...range(102, 110, 2)]);
    expect(findRanges(bars)).toHaveLength(0);
  });

  it('не перерисовывается: на каждой свече t видно ровно то, что по свечам до t', () => {
    // Случайные ряды с режимами (тренд / боковик) и настоящие 4ч BTC; свеча — каждая.
    const rows: Candle[][] = [];
    for (const start of [7, 11, 13]) {
      const closes: number[] = [];
      let p = 100;
      let seed = start;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
      for (let i = 0; i < 700; i++) {
        const drift = Math.floor(i / 100) % 2 === 0 ? 0.6 : 0;
        p = Math.max(10, p + drift + rnd() * 3);
        closes.push(p);
      }
      rows.push(series(closes, 0.8));
    }
    rows.push((btc as number[][]).map(([t, o, h, l, c]) => ({ t, o, h, l, c })));
    const all: RangeBox[] = [];
    for (const bars of rows) {
      const full = findRanges(bars);
      all.push(...full);
      for (let t = 0; t < bars.length; t++) {
        expect(visibleAt(findRanges(bars.slice(0, t + 1)), t)).toEqual(visibleAt(full, t));
      }
    }
    // Проверка не пустая: в рядах есть рамки со ступенями и с пробоем.
    expect(all.some((b) => b.steps.length > 1)).toBe(true);
    expect(all.some((b) => b.endAt !== null)).toBe(true);
  });

  it('на настоящих 4ч BTC находит рамку июля 2024, как прототип исследования', () => {
    const bars = (btc as number[][]).map(([t, o, h, l, c]) => ({ t, o, h, l, c }));
    const at = (iso: string) => bars.findIndex((b) => b.t === Date.parse(iso));
    const july = findRanges(bars).find((b) => b.impTo === at('2024-07-05T04:00:00Z'));
    expect(july).toBeDefined();
    expect(july!.dir).toBe('down');
    expect(Math.round(july!.steps[0].lo)).toBe(53486);
    expect(Math.round(july!.steps[0].hi)).toBe(58475);
    expect(july!.end).toBe('up');
  });
});

describe('toChartRanges', () => {
  it('переводит индексы во время: рамка известна с закрытия своей свечи', () => {
    const bars = series(impulseThenRange());
    const [box] = findRanges(bars);
    const [cr] = toChartRanges([box], bars, (p) => p * 2);
    expect(cr.kind).toBe('range');
    expect(cr.from).toBe(bars[box.impTo].t);
    expect(cr.seen).toBe(bars[box.seenAt].t + H4);
    expect(cr.end).toBe(bars[box.endAt!].t + H4);
    expect(cr.steps[0].hi).toBeCloseTo(box.steps[0].hi * 2, 6);
  });
});
