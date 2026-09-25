import { describe, expect, it } from 'vitest';
import { blob, cloudField, hills, puddles, rng, windowStrips } from './landscape';

describe('rng', () => {
  it('одно зерно — одна последовательность, в [0, 1)', () => {
    const a = rng(7);
    const b = rng(7);
    const xs = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe('hills', () => {
  it('гладкий замкнутый силуэт в пределах полосы, на всю ширину', () => {
    const d = hills(1000, 100, 3, [120, 240], [0.2, 0.7]);
    expect(d.endsWith('Z')).toBe(true);
    expect(d).toContain('Q');
    const nums = [...d.matchAll(/-?[\d.]+/g)].map((m) => Number(m[0]));
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(ys.every((y) => y >= 0 && y <= 100)).toBe(true);
    expect(Math.min(...nums.filter((_, i) => i % 2 === 0))).toBeLessThanOrEqual(0);
    expect(Math.max(...nums.filter((_, i) => i % 2 === 0))).toBeGreaterThanOrEqual(1000);
    expect(hills(1000, 100, 3, [120, 240], [0.2, 0.7])).toBe(d);
  });
});

describe('windowStrips', () => {
  it('полосы внутри корпуса, по рядам', () => {
    const strips = windowStrips(200, 5, 12, 11, 3);
    expect(strips.length).toBeGreaterThan(5);
    for (const s of strips) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x + s.len).toBeLessThanOrEqual(200);
      expect(s.y % 12).toBe(0);
      expect(s.tone).toBeLessThan(3);
    }
  });
});

describe('blob', () => {
  it('гладкий замкнутый контур вокруг центра, в пределах разброса', () => {
    const d = blob(100, 50, 40, 10, 7);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    const nums = [...d.matchAll(/-?[\d.]+/g)].map((m) => Number(m[0]));
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThan(100 - 40 * 1.13);
    expect(Math.max(...xs)).toBeLessThan(100 + 40 * 1.13);
    expect(Math.min(...ys)).toBeGreaterThan(50 - 10 * 1.13);
    expect(Math.max(...ys)).toBeLessThan(50 + 10 * 1.13);
  });
});

describe('puddles', () => {
  it('лужи с бликом, по глубине, одно зерно — одна картинка', () => {
    const ps = puddles(800, 100, 12, 4, [20, 60]);
    expect(ps).toHaveLength(12);
    for (let i = 1; i < ps.length; i++) expect(ps[i].y).toBeGreaterThan(ps[i - 1].y);
    expect(ps.every((p) => p.d.endsWith('Z') && p.shine.endsWith('Z'))).toBe(true);
    expect(puddles(800, 100, 12, 4, [20, 60])).toEqual(ps);
  });
});

describe('cloudField', () => {
  it('облака идут по высотам вдоль коридора', () => {
    const clouds = cloudField(6, 5, [100, 700], (alt) => ({ x: alt, y: -alt }), {
      dx: [0, 0],
      dy: [0, 0],
      w: [100, 200],
    });
    expect(clouds).toHaveLength(6);
    for (let i = 1; i < clouds.length; i++) expect(clouds[i].y).toBeLessThan(clouds[i - 1].y);
  });
});
