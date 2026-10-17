import { describe, expect, it } from 'vitest';
import { SHARDS, type Pt } from './tradePlayMarkGeometry';

/** Расстояние от точки до отрезка a–b. */
function toSegment([x, y]: Pt, [ax, ay]: Pt, [bx, by]: Pt): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
}

describe('геометрия знака Trade Play', () => {
  // Каркас первого экрана главной рисует грани линиями поверх контура: вершина
  // грани, стоящая рядом с кромкой, а не на ней, даёт вторую линию, которая
  // отходит от контура и возвращается — кромка читается кривой.
  it('вершина грани у кромки лежит ровно на кромке', () => {
    const off: string[] = [];
    for (const { id, outline, facets } of SHARDS) {
      for (const [a, b, c] of facets) {
        for (const p of [a, b, c]) {
          const d = Math.min(...outline.map((q, i) => toSegment(p, q, outline[(i + 1) % outline.length])));
          if (d > 1e-6 && d < 2) off.push(`${id} ${p.join(',')}: ${d.toFixed(3)}`);
        }
      }
    }
    expect([...new Set(off)]).toEqual([]);
  });
});
