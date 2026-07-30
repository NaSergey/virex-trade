import { describe, expect, it } from 'vitest';
import { buildEquityGeometry } from './EquityChart';
import type { EquityPoint } from '@/shared/api/bybit/hooks';

const points = (...values: number[]): EquityPoint[] =>
  values.map((value, i) => ({ time: 1_760_000_000 + i * 3600, value }));

describe('buildEquityGeometry', () => {
  it('нет точек — нет геометрии', () => {
    expect(buildEquityGeometry([], 300)).toBeNull();
  });

  it('держит ноль в кадре, даже когда кривая целиком в плюсе', () => {
    const g = buildEquityGeometry(points(100, 200, 300), 300)!;
    expect(g.zeroY).toBeGreaterThan(0);
    expect(g.zeroY).toBeLessThan(300);
  });

  it('считает пик и худшую просадку по ходу кривой, а не по итогу', () => {
    // Итог (120) выше старта, но по дороге кривая теряла 90 от пика 150.
    const g = buildEquityGeometry(points(50, 150, 60, 120), 300)!;
    expect(g.peak).toBe(150);
    expect(g.worstDrawdown?.depth).toBe(90);
    expect(g.worstDrawdown?.fromIdx).toBe(1);
    expect(g.worstDrawdown?.troughIdx).toBe(2);
  });

  it('тянет область просадки до возврата к вершине, а не до дна', () => {
    // Вершина 100 на i=1, дно 40 на i=3, возврат к 100 только на i=5.
    const g = buildEquityGeometry(points(10, 100, 70, 40, 80, 100, 130), 300)!;
    expect(g.worstDrawdown?.fromIdx).toBe(1);
    expect(g.worstDrawdown?.troughIdx).toBe(3);
    expect(g.worstDrawdown?.endIdx).toBe(5);
    expect(g.worstDrawdown?.recovered).toBe(true);
  });

  it('неотыгранная просадка тянется до последней сделки', () => {
    const g = buildEquityGeometry(points(10, 100, 60, 70), 300)!;
    expect(g.worstDrawdown?.endIdx).toBe(3);
    expect(g.worstDrawdown?.recovered).toBe(false);
  });

  it('у кривой без единого провала ям нет вовсе', () => {
    const g = buildEquityGeometry(points(10, 20, 40), 300)!;
    expect(g.underwater).toEqual([]);
    expect(g.worstDrawdown).toBeNull();
  });

  it('находит каждую яму, а не только худшую', () => {
    // Две ямы: мелкая 100→80 с возвратом и глубокая 120→50, ещё не отыгранная.
    const g = buildEquityGeometry(points(10, 100, 80, 100, 120, 50, 70), 300)!;
    expect(g.underwater).toHaveLength(2);
    expect(g.underwater.map((s) => s.depth)).toEqual([20, 70]);
    expect(g.worstDrawdown?.depth).toBe(70);
    expect(g.underwater[0].recovered).toBe(true);
    expect(g.underwater[1].recovered).toBe(false);
  });

  it('заливка ямы не содержит NaN даже на плоском участке перед ней', () => {
    const g = buildEquityGeometry(points(10, 10, 10, 4, 10), 300)!;
    expect(g.underwater[0].path).not.toContain('NaN');
    // Яма начинается с вершины — точки, предшествующей первой подводной.
    expect(g.underwater[0].fromIdx).toBe(2);
  });

  it('размечает лучшую сделку по приращению, а не по уровню кривой', () => {
    const g = buildEquityGeometry(points(10, 210, 160, 180), 300)!;
    expect(g.notes.map((n) => n.i)).toEqual([1]);
    expect(g.notes[0].text).toContain('лучшая');
  });

  it('не выдаёт NaN на вырожденной кривой в нуле', () => {
    const g = buildEquityGeometry(points(0, 0, 0), 300)!;
    expect(g.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(g.line).not.toContain('NaN');
    expect(g.area).not.toContain('NaN');
  });

  it('одна точка ставится в середину холста', () => {
    const g = buildEquityGeometry(points(42), 300)!;
    expect(g.points[0].x).toBe(680);
    expect(g.area).toBe('');
  });
});
