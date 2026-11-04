import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../model/random';
import { next, rand, seedOf, shuffle, weighted } from './rng';

describe('генератор забега', () => {
  it('та же последовательность, что у mulberry32 учебника, и то же зерно — те же числа', () => {
    const r = rand(42);
    const m = mulberry32(42);
    for (let i = 0; i < 5; i++) expect(next(r)).toBe(m());
    const a = rand(7);
    const b = rand(7);
    expect([next(a), next(a)]).toEqual([next(b), next(b)]);
  });

  it('состояние — одно число: сохранённое и восстановленное продолжает ту же последовательность', () => {
    const r = rand(9);
    next(r);
    const copy = JSON.parse(JSON.stringify(r));
    expect(next(copy)).toBe(next(r));
  });

  it('перемешивание — перестановка', () => {
    const list = [1, 2, 3, 4, 5, 6];
    expect(shuffle(rand(3), list).sort()).toEqual(list);
  });

  it('нулевой вес не выпадает', () => {
    const r = rand(1);
    for (let i = 0; i < 200; i++) expect(weighted(r, [['a', 0], ['b', 1], ['c', 0]])).toBe('b');
  });

  it('зерно строки устойчиво и различает даты', () => {
    expect(seedOf('2026-11-04')).toBe(seedOf('2026-11-04'));
    expect(seedOf('2026-11-04')).not.toBe(seedOf('2026-11-05'));
  });
});
