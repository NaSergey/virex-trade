import { describe, expect, it } from 'vitest';
import {
  altOf,
  CRUISE_DEG,
  flightAt,
  formatX,
  historyTone,
  THRUST_MS,
  thrustAt,
  MARKS,
  markY,
  mAt,
  msTo,
  floorMatrix,
  groundShift,
  padAt,
  passAt,
  payout,
  shipSize,
  wrap,
  x100At,
} from './flight';

const RATE = 0.00008;
const W = 800;
const H = 450;

describe('множитель', () => {
  it('та же формула, что на сервере', () => {
    expect(x100At(0, RATE)).toBe(100);
    expect(x100At(msTo(200, RATE) + 1, RATE)).toBeGreaterThanOrEqual(200);
    expect(x100At(msTo(200, RATE) - 1, RATE)).toBeLessThan(200);
  });

  it('подпись и выигрыш', () => {
    expect(formatX(235)).toBe('2.35x');
    expect(formatX(100000)).toBe('1000.00x');
    expect(payout(10, 235)).toBe(23);
  });

  it('непрерывный множитель для движения', () => {
    expect(mAt(0, RATE)).toBe(1);
    expect(mAt(-100, RATE)).toBe(1);
    expect(mAt(msTo(200, RATE), RATE)).toBeCloseTo(2);
  });
});

describe('flightAt', () => {
  it('на старте ракета стоит на площадке вертикально, мир на земле', () => {
    const f = flightAt(1, W, H);
    const pad = padAt(W, H);
    expect(f.x).toBeCloseTo(pad.x);
    expect(f.y).toBeCloseTo(pad.y);
    expect(f.deg).toBe(0);
    expect(f.camY).toBe(0);
    expect(f.dusk).toBe(1);
    expect(f.space).toBe(0);
  });

  it('на взлёте — дуга: вправо и вверх, наклон растёт, мир стоит', () => {
    const a = flightAt(1.05, W, H);
    const b = flightAt(1.15, W, H);
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.y).toBeLessThan(a.y);
    expect(b.deg).toBeGreaterThan(a.deg);
    expect(a.deg).toBeGreaterThan(0);
    expect(b.deg).toBeLessThan(CRUISE_DEG);
    expect(b.camY).toBe(0);
  });

  it('после взлёта ракета держится в точке, камера ведёт мир по курсу', () => {
    const a = flightAt(2, W, H);
    const b = flightAt(10, W, H);
    expect(b.x).toBeCloseTo(a.x);
    expect(b.y).toBeCloseTo(a.y);
    expect(a.deg).toBe(CRUISE_DEG);
    expect(b.camY).toBeGreaterThan(a.camY);
    expect(b.camX / b.camY).toBeCloseTo(Math.tan((CRUISE_DEG * Math.PI) / 180));
  });

  it('конец взлёта без скачка', () => {
    // Взлёт кончается, когда высота равна подъёму до точки кадра: √m = 1 + climb / 2.4h.
    const climb = padAt(W, H).y - 0.34 * H;
    const m = (1 + climb / (2.4 * H)) ** 2;
    const a = flightAt(m - 1e-4, W, H);
    const b = flightAt(m + 1e-4, W, H);
    expect(Math.abs(a.x - b.x)).toBeLessThan(1);
    expect(Math.abs(a.y - b.y)).toBeLessThan(1);
    expect(Math.abs(a.deg - b.deg)).toBeLessThan(1);
  });

  it('на взлёте нос смотрит туда, куда ракета летит', () => {
    for (const m of [1.02, 1.08, 1.15, 1.25]) {
      const a = flightAt(m, W, H);
      const b = flightAt(m + 1e-3, W, H);
      const course = (Math.atan2(b.x - a.x, a.y - b.y) * 180) / Math.PI;
      expect(Math.abs(course - a.deg)).toBeLessThan(1.5);
    }
  });

  it('площадка левее точки кадра — ракета пересекает поле по дуге', () => {
    const pad = padAt(W, H);
    const top = flightAt(3, W, H);
    expect(top.x - pad.x).toBeGreaterThan(0.2 * W);
    expect(pad.y - top.y).toBeGreaterThan(0.35 * H);
  });

  it('метка проходит мимо сопла ровно на своём множителе', () => {
    for (const x of [110, ...MARKS]) {
      const f = flightAt(x / 100, W, H);
      expect(markY(x, H) + f.camY).toBeCloseTo(f.y);
    }
  });

  it('ракета проходит точку встречи слоя на своей высоте', () => {
    for (const [m, k] of [
      [1.1, 1],
      [2, 1],
      [2, 1.3],
      [5, 0.6],
    ] as const) {
      const f = flightAt(m, W, H);
      const at = passAt(altOf(m, H), k, W, H);
      expect(at.x - f.camX * k).toBeCloseTo(f.x);
      expect(at.y + f.camY * k).toBeCloseTo(f.y);
    }
  });

  it('закат гаснет, космос проявляется', () => {
    expect(flightAt(2.2, W, H).dusk).toBe(0);
    expect(flightAt(1.8, W, H).space).toBe(0);
    expect(flightAt(4, W, H).space).toBe(1);
  });
});

describe('земля — одна плоскость', () => {
  // Точка пола на глубине y под горизонтом после преобразования floorMatrix.
  const onFloor = (m: string, y: number) => {
    const [, , c, d, e, f] = m.slice(7, -1).split(',').map(Number);
    return { x: c * y + e, y: d * y + f - y };
  };

  it('предмет на глубине t едет ровно с точкой пола под ним — щелей нет', () => {
    const depth = 120;
    for (const cam of [0, 50, 400, 3000]) {
      const f = { camX: cam * 1.9, camY: cam };
      const m = floorMatrix(f, depth);
      for (const t of [0, 0.25, 0.6, 1]) {
        const g = groundShift(f, t);
        const p = onFloor(m, t * depth);
        expect(p.x).toBeCloseTo(g.x);
        expect(p.y).toBeCloseTo(g.y);
      }
    }
  });

  it('перрон едет с камерой, горизонт — медленнее', () => {
    const f = { camX: 190, camY: 100 };
    expect(groundShift(f, 1)).toEqual({ x: -190, y: 100 });
    expect(groundShift(f, 0).y).toBeCloseTo(35);
  });
});

describe('wrap', () => {
  it('сдвиг слоя — по модулю плитки, без отрицательных', () => {
    expect(wrap(250, 240)).toBe(10);
    expect(wrap(-10, 240)).toBe(230);
  });
});

describe('shipSize', () => {
  it('корпус — пятая часть поля, в пределах 56–136 px', () => {
    expect(shipSize(100).hull).toBe(56);
    expect(shipSize(2000).hull).toBe(136);
    expect(shipSize(400).hull).toBeCloseTo(80);
  });
});

describe('thrustAt', () => {
  it('до старта огня нет, на старте — факел зажигания, полный — не сразу', () => {
    expect(thrustAt(0)).toBe(0);
    expect(thrustAt(1)).toBeGreaterThan(0.15);
    expect(thrustAt(1)).toBeLessThan(0.25);
    expect(thrustAt(THRUST_MS / 2)).toBeGreaterThan(0.5);
    expect(thrustAt(THRUST_MS / 2)).toBeLessThan(0.7);
    expect(thrustAt(THRUST_MS)).toBe(1);
    expect(thrustAt(THRUST_MS * 3)).toBe(1);
  });

  it('растёт монотонно', () => {
    let prev = 0;
    for (let ms = 1; ms <= THRUST_MS; ms += 100) {
      const t = thrustAt(ms);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });
});

describe('historyTone', () => {
  it('по порогам 2x и 10x', () => {
    expect(historyTone(150)).toBe('low');
    expect(historyTone(200)).toBe('mid');
    expect(historyTone(1000)).toBe('high');
  });
});
