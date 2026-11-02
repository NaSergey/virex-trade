import { describe, expect, it } from 'vitest';
import { boxAround, boxStyle, originIn, rectCorners, toScene, viewBoxOf } from './scene-box';

describe('scene-box — геометрия слоёв сцены', () => {
  it('toScene: без поворота — сдвиг на центр', () => {
    expect(toScene([100, 200], 0, [10, -20])).toEqual([110, 180]);
  });

  it('toScene: поворот на 90° по часовой (ось y вниз)', () => {
    const [x, y] = toScene([0, 0], 90, [10, 0]);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(10);
  });

  it('rectCorners без поворота — углы прямоугольника', () => {
    expect(rectCorners([50, 50], 20, 40, 0)).toEqual([
      [40, 30],
      [60, 30],
      [60, 70],
      [40, 70],
    ]);
  });

  it('boxAround охватывает точки с запасом и округляет наружу', () => {
    const b = boxAround(
      [
        [10.4, 20.6],
        [30.2, 40.1],
      ],
      5,
    );
    expect(b).toEqual({ x: 5, y: 15, w: 31, h: 31 });
    // Рамка содержит обе точки с запасом не меньше заданного.
    expect(b.x).toBeLessThanOrEqual(10.4 - 5);
    expect(b.x + b.w).toBeGreaterThanOrEqual(30.2 + 5);
  });

  it('повёрнутая карта целиком внутри своей рамки', () => {
    const corners = rectCorners([244, 224], 150, 212, 9);
    const b = boxAround(corners, 0);
    for (const [x, y] of corners) {
      expect(x).toBeGreaterThanOrEqual(b.x);
      expect(x).toBeLessThanOrEqual(b.x + b.w);
      expect(y).toBeGreaterThanOrEqual(b.y);
      expect(y).toBeLessThanOrEqual(b.y + b.h);
    }
  });

  it('boxStyle — проценты кадра 384×514', () => {
    expect(boxStyle({ x: 0, y: 0, w: 384, h: 514 })).toEqual({
      left: '0%',
      top: '0%',
      width: '100%',
      height: '100%',
    });
    expect(boxStyle({ x: 192, y: 257, w: 96, h: 51.4 })).toEqual({
      left: '50%',
      top: '50%',
      width: '25%',
      height: '10%',
    });
  });

  it('originIn — точка сцены в процентах рамки', () => {
    expect(originIn({ x: 100, y: 100, w: 200, h: 100 }, [200, 200])).toBe('50% 100%');
  });

  it('viewBoxOf — рамка как viewBox', () => {
    expect(viewBoxOf({ x: 1, y: 2, w: 3, h: 4 })).toBe('1 2 3 4');
  });
});
