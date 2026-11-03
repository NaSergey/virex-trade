import { describe, expect, it } from 'vitest';
import { buildMap, reachable } from './map';
import { rand } from './rng';
import type { Station } from './types';

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);
const row = (map: Station[], r: number) => map.filter((s) => s.row === r);
const byId = (map: Station[]) => new Map(map.map((s) => [s.id, s]));

describe('карта линии', () => {
  it('ряды 1, 9 и 10 — по правилам спеки', () => {
    for (const seed of SEEDS) {
      const map = buildMap(rand(seed), { weather: 'clear', fog: 0 });
      expect(row(map, 1).map((s) => s.kind)).toEqual(['fight', 'fight']);
      expect(row(map, 9).map((s) => s.kind).sort()).toEqual(['rest', 'shop']);
      expect(row(map, 10).map((s) => s.kind)).toEqual(['boss']);
      for (let r = 2; r <= 8; r++) expect(row(map, r).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('в рядах 3 и 6 есть сцена; элиты — в рядах 4–8, не больше одной в ряду, хотя бы одна', () => {
    for (const seed of SEEDS) {
      const map = buildMap(rand(seed), { weather: 'clear', fog: 0 });
      expect(row(map, 3).some((s) => s.kind === 'scene')).toBe(true);
      expect(row(map, 6).some((s) => s.kind === 'scene')).toBe(true);
      const elites = map.filter((s) => s.kind === 'elite');
      expect(elites.length).toBeGreaterThanOrEqual(1);
      for (const e of elites) expect(e.row).toBeGreaterThanOrEqual(4);
      for (let r = 1; r <= 10; r++) expect(row(map, r).filter((s) => s.kind === 'elite').length).toBeLessThanOrEqual(1);
      for (const s of map) {
        if (s.kind === 'shop' || s.kind === 'rest') expect(s.row === 9 || (s.row >= 3 && s.row <= 7)).toBe(true);
        if (s.kind === 'scene' || s.kind === 'find') expect(s.row >= 2 && s.row <= 8).toBe(true);
      }
    }
  });

  it('туман 4 — элиты бывают с ряда 3', () => {
    const rows = new Set<number>();
    for (const seed of SEEDS) {
      for (const s of buildMap(rand(seed), { weather: 'clear', fog: 4 })) if (s.kind === 'elite') rows.add(s.row);
    }
    expect(rows.has(3)).toBe(true);
    expect(Math.min(...rows)).toBe(3);
  });

  it('переходы: к соседним путям, у каждой станции есть выход, каждая достижима', () => {
    for (const seed of SEEDS) {
      const map = buildMap(rand(seed), { weather: 'clear', fog: 0 });
      const ids = byId(map);
      for (const s of map) {
        if (s.row < 10) expect(s.next.length).toBeGreaterThanOrEqual(1);
        for (const n of s.next) {
          const t = ids.get(n)!;
          expect(t.row).toBe(s.row + 1);
          expect(Math.abs(t.lane - s.lane)).toBeLessThanOrEqual(1);
        }
      }
      const seen = new Set(reachable(map, null));
      for (let r = 1; r < 10; r++) for (const s of row(map, r)) if (seen.has(s.id)) s.next.forEach((n) => seen.add(n));
      expect(seen.size).toBe(map.length);
    }
  });

  it('соседние по переходу небоевые станции — разного типа', () => {
    for (const seed of SEEDS) {
      const map = buildMap(rand(seed), { weather: 'holiday', fog: 0 });
      const ids = byId(map);
      for (const s of map) {
        for (const n of s.next) {
          const t = ids.get(n)!;
          if (s.kind !== 'fight') expect(t.kind).not.toBe(s.kind);
        }
      }
    }
  });

  it('одно зерно — одна карта; reachable ведёт по переходам', () => {
    const a = buildMap(rand(5), { weather: 'rain', fog: 0 });
    expect(buildMap(rand(5), { weather: 'rain', fog: 0 })).toEqual(a);
    expect(reachable(a, null)).toEqual(row(a, 1).map((s) => s.id));
    const first = row(a, 1)[0];
    expect(reachable(a, first.id)).toEqual(first.next);
  });
});
