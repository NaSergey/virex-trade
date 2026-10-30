import { describe, expect, it } from 'vitest';
import { initials, seatPoint, slotOf, STAGE_TALL, STAGE_WIDE } from './layout';

/** Расстояние в пикселях сцены (ширина = aspect, высота = 1), а не в процентах. */
const dist = (a: { x: number; y: number }, b: { x: number; y: number }, aspect: number) =>
  Math.hypot(((a.x - b.x) / 100) * aspect, (a.y - b.y) / 100);

describe('card table layout', () => {
  it('своё место — ровно внизу по центру при любом числе мест', () => {
    for (let n = 2; n <= 9; n++) {
      for (const aspect of [STAGE_WIDE, STAGE_TALL, 1]) {
        const p = seatPoint(n - 1, n, n - 1, aspect);
        expect(p.x, `n=${n}`).toBeCloseTo(50);
        expect(p.y, `n=${n}`).toBeGreaterThan(85);
      }
    }
  });

  it('у зрителя внизу нулевое место', () => {
    expect(seatPoint(0, 6, null).x).toBeCloseTo(50);
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

  it('у каждого места своя точка на овале', () => {
    for (let n = 2; n <= 9; n++) {
      const slots = Array.from({ length: n }, (_, i) => slotOf(i, n, 0));
      expect(new Set(slots).size).toBe(n);
    }
  });

  it.each([
    ['широкая сцена', STAGE_WIDE],
    ['телефон', STAGE_TALL],
  ])('на каждой половине овала соседи стоят на равном расстоянии (%s)', (_label, aspect) => {
    for (let n = 4; n <= 9; n++) {
      const pts = Array.from({ length: n }, (_, i) => ({ f: slotOf(i, n, 0), p: seatPoint(i, n, 0, aspect) }));
      for (const half of [pts.filter((q) => q.f > 0.5), pts.filter((q) => q.f < 0.5)]) {
        if (half.length < 2) continue;
        const sorted = half.sort((a, b) => a.f - b.f).map((q) => q.p);
        const gaps = sorted.slice(1).map((p, i) => dist(p, sorted[i], aspect));
        expect(Math.max(...gaps) / Math.min(...gaps), `n=${n}`).toBeLessThan(1.25);
      }
    }
  });

  it('при чётном числе соседей раскладка симметрична относительно вертикали', () => {
    for (const n of [3, 5, 7, 9]) {
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
