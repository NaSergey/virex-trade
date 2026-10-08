import { describe, expect, it } from 'vitest';
import { RSI_DEFAULTS, divergencesOf, emaOf, rsiOf, rsiSeries } from './rsi';

// Пример Уайлдера из таблицы StockCharts: RSI(14) по этим закрытиям — 70.46, 66.25, 66.48, 69.35, 66.29, 57.92.
const WILDER = [
  44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03,
  46.41, 46.22, 45.64,
];

describe('rsiOf', () => {
  it('совпадает с классическим примером Уайлдера', () => {
    const rsi = rsiOf(WILDER, 14);
    expect(rsi.slice(0, 14).every(Number.isNaN)).toBe(true);
    expect(rsi.slice(14).map((v) => Number(v.toFixed(2)))).toEqual([70.46, 66.25, 66.48, 69.35, 66.29, 57.92]);
  });

  it('только рост — 100, только падение — 0, поровну — около 50', () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    const down = Array.from({ length: 30 }, (_, i) => 100 - i);
    const flipping = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 100 : 101));
    expect(rsiOf(up, 14)[29]).toBe(100);
    expect(rsiOf(down, 14)[29]).toBe(0);
    // Качели ±1: после шага вниз чуть ниже 50, после шага вверх — чуть выше.
    const r = rsiOf(flipping, 14);
    expect(r[28]).toBeLessThan(50);
    expect(r[29]).toBeGreaterThan(50);
    expect(Math.abs((r[28] + r[29]) / 2 - 50)).toBeLessThan(1);
  });

  it('на коротком ряду значений нет вовсе', () => {
    expect(rsiOf([1, 2, 3], 14).every(Number.isNaN)).toBe(true);
  });
});

describe('emaOf', () => {
  it('начинается с первого определённого значения и пропускает разгон', () => {
    const ema = emaOf([NaN, NaN, 10, 20], 3);
    expect(ema[0]).toBeNaN();
    expect(ema[1]).toBeNaN();
    expect(ema[2]).toBe(10);
    // α = 2/(3+1) = 0.5.
    expect(ema[3]).toBe(15);
  });
});

/** Ряд RSI с заданными вершинами на ровном фоне. */
function series(n: number, base: number, peaks: Record<number, number>): number[] {
  return Array.from({ length: n }, (_, i) => peaks[i] ?? base);
}

const O = RSI_DEFAULTS;

describe('divergencesOf', () => {
  it('медвежья: цена выше, RSI ниже — обе вершины в перекупленности', () => {
    const rsi = series(40, 50, { 10: 85, 25: 78 });
    const highs = series(40, 90, { 10: 100, 25: 105 });
    expect(divergencesOf(rsi, highs, highs, O)).toEqual([
      { kind: 'bear', from: 10, to: 25, fromPrice: 100, toPrice: 105, rsiFrom: 10, rsiTo: 25, fromValue: 85, toValue: 78 },
    ]);
  });

  it('бычья: цена ниже, RSI выше — обе впадины в перепроданности', () => {
    const rsi = series(40, 50, { 10: 15, 25: 22 });
    const lows = series(40, 110, { 10: 100, 25: 95 });
    expect(divergencesOf(rsi, lows, lows, O)).toEqual([
      { kind: 'bull', from: 10, to: 25, fromPrice: 100, toPrice: 95, rsiFrom: 10, rsiTo: 25, fromValue: 15, toValue: 22 },
    ]);
  });

  it('вершины берутся на цене: пик RSI посреди импульса — не вершина', () => {
    // Импульс: RSI на пике уже на 7-й свече, а цена растёт до 13-й. Прежний
    // поиск по вершинам RSI вёл линию цены от 7-й — от середины рывка.
    const rsi = series(45, 50, { 7: 88, 8: 70, 9: 70, 10: 70, 11: 70, 12: 70, 13: 76, 30: 66 });
    const highs = series(45, 90, { 7: 95, 8: 96, 9: 97, 10: 98, 11: 99, 12: 99.5, 13: 100, 30: 104 });
    expect(divergencesOf(rsi, highs, highs, O)).toEqual([
      { kind: 'bear', from: 13, to: 30, fromPrice: 100, toPrice: 104, rsiFrom: 13, rsiTo: 30, fromValue: 76, toValue: 66 },
    ]);
  });

  it('пик RSI берётся рядом с вершиной цены — импульс выдыхается раньше цены', () => {
    // Вершины цены — 13 и 30, пики RSI — на две свечи раньше каждой.
    const rsi = series(45, 50, { 11: 80, 28: 68 });
    const highs = series(45, 90, { 13: 100, 30: 104 });
    expect(divergencesOf(rsi, highs, highs, O)).toEqual([
      { kind: 'bear', from: 13, to: 30, fromPrice: 100, toPrice: 104, rsiFrom: 11, rsiTo: 28, fromValue: 80, toValue: 68 },
    ]);
  });

  it('вторая вершина может не дотянуть до 70 — это и есть самая частая дивергенция', () => {
    // Исходный скрипт такую пару пропускал: он требовал обе вершины выше 70.
    const rsi = series(40, 45, { 10: 82, 25: 64 });
    const highs = series(40, 90, { 10: 100, 25: 104 });
    expect(divergencesOf(rsi, highs, highs, O)).toEqual([
      expect.objectContaining({ kind: 'bear', from: 10, to: 25, toValue: 64 }),
    ]);
  });

  it('вторая вершина ниже 50 — не дивергенция', () => {
    const rsi = series(40, 30, { 10: 82, 25: 45 });
    const highs = series(40, 90, { 10: 100, 25: 104 });
    expect(divergencesOf(rsi, highs, highs, O)).toEqual([]);
  });

  it('якорь вне зоны пару не начинает', () => {
    // Первая вершина — 65: ослаблять нечего, рынок не был перекуплен.
    const rsi = series(40, 45, { 10: 65, 25: 60 });
    const highs = series(40, 90, { 10: 100, 25: 104 });
    expect(divergencesOf(rsi, highs, highs, O)).toEqual([]);
  });

  it('пары дальше maxRange свечей не бывает', () => {
    const rsi = series(90, 45, { 10: 82, 75: 64 });
    const highs = series(90, 90, { 10: 100, 75: 104 });
    expect(divergencesOf(rsi, highs, highs, O)).toEqual([]);
  });

  it('промежуточный провал пару не сбивает, а продолжение ослабления идёт цепочкой', () => {
    // 82 → (провал 60 при цене ниже) → 70 при цене выше → 62 при цене ещё выше:
    // два отрезка подряд, 10→30 и 30→45, а не веер из десятого бара.
    const rsi = series(60, 45, { 10: 82, 20: 60, 30: 70, 45: 62 });
    const highs = series(60, 90, { 10: 100, 20: 97, 30: 103, 45: 106 });
    expect(divergencesOf(rsi, highs, highs, O).map((d) => [d.from, d.to])).toEqual([
      [10, 30],
      [30, 45],
    ]);
  });

  it('вершина, продолжающая ту же дивергенцию, удлиняет линию, а не добавляет вторую', () => {
    // 25-я — дивергенция к 10-й; 40-я выше по RSI, чем 25-я, но ниже 10-й:
    // это та же дивергенция от 10-й, только длиннее, — веера из 10-й нет.
    const rsi = series(55, 45, { 10: 85, 25: 70, 40: 75 });
    const highs = series(55, 90, { 10: 100, 25: 102.5, 40: 106 });
    expect(divergencesOf(rsi, highs, highs, O).map((d) => [d.from, d.to])).toEqual([[10, 40]]);
  });

  it('без расхождения — без дивергенции', () => {
    // Цена выше, и RSI выше — это подтверждение, а не дивергенция.
    const rsi = series(40, 50, { 10: 78, 25: 85 });
    const highs = series(40, 90, { 10: 100, 25: 105 });
    expect(divergencesOf(rsi, highs, highs, O)).toEqual([]);
  });

  it('промежуточная вершина с ценой ниже якоря не рвёт пару', () => {
    // Между якорем и второй вершиной — вершина на 60 с ценой ниже: не дивергенция и не якорь.
    const rsi = series(50, 50, { 10: 85, 20: 60, 32: 78 });
    const highs = series(50, 90, { 10: 100, 20: 95, 32: 105 });
    expect(divergencesOf(rsi, highs, highs, O).map((d) => [d.from, d.to])).toEqual([[10, 32]]);
  });

  it('свеча между вершинами выше линии цены — пары нет', () => {
    // 18-я выше линии 10→30: смотрят на неё, и к 30-й RSI вырос — не дивергенция.
    const rsi = series(45, 50, { 10: 80, 18: 75, 30: 77 });
    const highs = series(45, 90, { 10: 100, 18: 103, 30: 104 });
    expect(divergencesOf(rsi, highs, highs, O).map((d) => [d.from, d.to])).toEqual([[10, 18]]);
  });

  it('RSI между вершинами выше своей линии — пары нет', () => {
    // Всплеск RSI до 90 без вершины цены: линия 80→70 прошла бы под ним.
    const rsi = series(45, 50, { 10: 80, 20: 90, 30: 70 });
    const highs = series(45, 90, { 10: 100, 30: 104 });
    expect(divergencesOf(rsi, highs, highs, O)).toEqual([]);
  });

  it('плато RSI у самой вершины линию не пересекает', () => {
    // RSI держится у 90 ещё две свечи — это всё та же вершина, а не новая.
    const rsi = series(45, 50, { 10: 90, 11: 89.5, 12: 89.5, 30: 70 });
    const highs = series(45, 90, { 10: 100, 30: 104 });
    expect(divergencesOf(rsi, highs, highs, O).map((d) => [d.from, d.to])).toEqual([[10, 30]]);
  });

  it('вершина подтверждается только через rightBars баров', () => {
    // Вторая вершина — за три бара до конца: справа от неё меньше пяти баров.
    const rsi = series(40, 50, { 10: 85, 36: 78 });
    const highs = series(40, 90, { 10: 100, 36: 105 });
    expect(divergencesOf(rsi, highs, highs, O)).toEqual([]);
  });
});

describe('rsiSeries', () => {
  it('отдаёт RSI, среднюю и дивергенции по свечам', () => {
    const candles = WILDER.map((c) => ({ h: c + 0.5, l: c - 0.5, c }));
    const s = rsiSeries(candles);
    expect(s.rsi).toHaveLength(candles.length);
    expect(s.avg).toHaveLength(candles.length);
    expect(s.avg[14]).toBeCloseTo(s.rsi[14], 10);
    expect(Array.isArray(s.divergences)).toBe(true);
  });
});
