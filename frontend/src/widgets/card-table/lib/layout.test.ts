import { describe, expect, it } from 'vitest';
import { initials, seatPoint, slotOf, STAGE_TALL, STAGE_WIDE } from './layout';

/** Расстояние в пикселях сцены (ширина = aspect, высота = 1), а не в процентах. */
const dist = (a: { x: number; y: number }, b: { x: number; y: number }, aspect: number) =>
  Math.hypot(((a.x - b.x) / 100) * aspect, (a.y - b.y) / 100);

describe('card table layout', () => {
  it('при нечётном числе мест своё — ровно внизу по центру', () => {
    for (const n of [3, 5, 7, 9]) {
      const p = seatPoint(2, n, 2);
      expect(p.x, `n=${n}`).toBeCloseTo(50);
      expect(p.y, `n=${n}`).toBeGreaterThan(85);
    }
  });

  it('следующее место — по часовой стрелке, то есть левее', () => {
    expect(seatPoint(4, 6, 3).x).toBeLessThan(seatPoint(3, 6, 3).x);
  });

  it('место крупье (верх) не занято никем', () => {
    for (let n = 2; n <= 9; n++) {
      for (let me = 0; me < n; me++) {
        for (let i = 0; i < n; i++) expect(slotOf(i, n, me)).not.toBe(0);
      }
    }
  });

  it('у каждого места свой номер на овале', () => {
    for (let n = 2; n <= 9; n++) {
      const slots = Array.from({ length: n }, (_, i) => slotOf(i, n, 0));
      expect(new Set(slots).size).toBe(n);
    }
  });

  it.each([
    ['широкая сцена', STAGE_WIDE],
    ['телефон', STAGE_TALL],
  ])('соседи стоят на равном расстоянии друг от друга (%s)', (_label, aspect) => {
    for (let n = 2; n <= 9; n++) {
      const byslot = Array.from({ length: n }, (_, i) => i)
        .sort((a, b) => slotOf(a, n, 0) - slotOf(b, n, 0))
        .map((i) => seatPoint(i, n, 0, aspect));
      const gaps = byslot.slice(1).map((p, i) => dist(p, byslot[i], aspect));
      const min = Math.min(...gaps);
      const max = Math.max(...gaps);
      // Хорды между равными дугами почти равны; на изгибе овала — чуть короче.
      expect(max / min, `n=${n}`).toBeLessThan(1.25);
    }
  });

  it('раскладка симметрична относительно вертикали стола', () => {
    for (let n = 2; n <= 9; n++) {
      const xs = Array.from({ length: n }, (_, i) => seatPoint(i, n, 0).x - 50).sort((a, b) => a - b);
      const mirrored = xs.map((x) => -x).sort((a, b) => a - b);
      xs.forEach((x, i) => expect(x, `n=${n}`).toBeCloseTo(mirrored[i], 1));
    }
  });

  it('инициалы', () => {
    expect(initials('Иван Петров', 'X')).toBe('ИП');
    expect(initials(null, 'Игрок')).toBe('ИГ');
  });
});
