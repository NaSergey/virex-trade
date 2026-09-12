import { describe, expect, it } from 'vitest';
import { anchorTimeAt, glidePrice, indexAtOrAfter, resolveWindow, zoomStep } from './motion';

describe('glidePrice', () => {
  it('концы точно совпадают с open и close', () => {
    expect(glidePrice(100, 105, 98, 102, 0)).toBe(100);
    expect(glidePrice(100, 105, 98, 102, 1)).toBe(102);
  });

  it('дальний от open экстремум проходится первым — здесь high', () => {
    // |105-100|=5 > |100-98|=2
    expect(glidePrice(100, 105, 98, 102, 1 / 3)).toBe(105);
    expect(glidePrice(100, 105, 98, 102, 2 / 3)).toBe(98);
  });

  it('если дальше low — сначала он', () => {
    // |103-100|=3 < |100-90|=10
    expect(glidePrice(100, 103, 90, 95, 1 / 3)).toBe(90);
    expect(glidePrice(100, 103, 90, 95, 2 / 3)).toBe(103);
  });

  it('фаза вне [0,1] обрезается', () => {
    expect(glidePrice(100, 105, 98, 102, -1)).toBe(100);
    expect(glidePrice(100, 105, 98, 102, 2)).toBe(102);
  });

  it('плоская минутка (o=h=l=c) не роняет счёт', () => {
    expect(glidePrice(100, 100, 100, 100, 0.5)).toBe(100);
  });
});

describe('indexAtOrAfter', () => {
  const cs = [{ t: 10 }, { t: 20 }, { t: 30 }];
  it('находит первую подходящую', () => {
    expect(indexAtOrAfter(cs, 15)).toBe(1);
    expect(indexAtOrAfter(cs, 20)).toBe(1);
  });
  it('время раньше всех — индекс 0', () => {
    expect(indexAtOrAfter(cs, 0)).toBe(0);
  });
  it('время позже всех — длина массива', () => {
    expect(indexAtOrAfter(cs, 100)).toBe(3);
  });
});

describe('resolveWindow', () => {
  const cs = Array.from({ length: 50 }, (_, i) => ({ t: i * 60_000 }));
  const bounds = { minCount: 5, maxCount: 100 };

  it('живой режим (anchorTime=null) — окно у правого края', () => {
    expect(resolveWindow(cs, { count: 10, anchorTime: null }, bounds)).toEqual({
      frameStart: 40,
      startIdx: 40,
      endIdx: 50,
      count: 10,
      live: true,
    });
  });

  it('якорь внутри диапазона — окно от него, не живое', () => {
    expect(resolveWindow(cs, { count: 10, anchorTime: 5 * 60_000 }, bounds)).toEqual({
      frameStart: 5,
      startIdx: 5,
      endIdx: 15,
      count: 10,
      live: false,
    });
  });

  it('якорь на последней свече — окно тянется в пустоту справа, а не зажимается впритык', () => {
    // Раньше кадр не мог отойти дальше total-count (40): последние свечи были
    // намертво прибиты к правому краю холста. Теперь дозволено уезжать до
    // total-edge (47) — на экране это 3 настоящих свечи (edge) и пустое поле
    // после них, как в «Диапазоне входа».
    const r = resolveWindow(cs, { count: 10, anchorTime: 49 * 60_000 }, bounds);
    expect(r.frameStart).toBe(47);
    expect(r.startIdx).toBe(47);
    expect(r.endIdx).toBe(50);
    expect(r.live).toBe(false);
  });

  it('count зажимается границами', () => {
    const r = resolveWindow(cs, { count: 1000, anchorTime: null }, { minCount: 5, maxCount: 20 });
    expect(r.endIdx - r.startIdx).toBe(20);
  });
});

describe('zoomStep', () => {
  const cs = Array.from({ length: 50 }, (_, i) => ({ t: i * 60_000 }));
  const bounds = { minCount: 5, maxCount: 100 };

  it('приближение держит фокальную свечу на месте', () => {
    // Фокус на полпути кадра [20,30) — это индекс 25; сузили кадр до 5 свечей
    // вокруг той же точки.
    const r = zoomStep(cs, 20, 10, 0.5, 0.5, bounds);
    expect(r.count).toBe(5);
    expect(r.anchorTime).toBe(23 * 60_000);
  });

  it('не откатывает уже оттянутый от края кадр обратно в живой режим', () => {
    // Пан уже отвёл кадр к frameStart=47 (см. resolveWindow выше, edge=3 от
    // total=50): фокус зума стоит там же. Небольшое приближение вокруг той
    // же точки должно остаться в растянутом положении, а не откатиться к
    // total-count, как было до фикса (баг: пан отодвигал, зум откатывал).
    const r = zoomStep(cs, 47, 10, 0, 0.8, bounds);
    expect(r.count).toBe(8);
    expect(r.anchorTime).not.toBeNull();
    expect(r.anchorTime).toBe(anchorTimeAt(cs, 47) as number);
  });

  it('зум умеет тянуть кадр в пустоту за оба края, не только за левый', () => {
    // Фокус у самого правого настоящего края (индекс 49 из 50, focalFrac=1)
    // при приближении до 5 свечей — фокальная точка должна остаться под тем
    // же местом курсора, у edge=3 настоящих свечей и пустого поля после них.
    const r = zoomStep(cs, 45, 10, 1, 0.5, bounds);
    expect(r.count).toBe(5);
    expect(r.anchorTime).toBe(anchorTimeAt(cs, 47) as number);
  });

  it('count зажимается границами', () => {
    const r = zoomStep(cs, 0, 10, 0, 100, { minCount: 5, maxCount: 20 });
    expect(r.count).toBe(20);
  });

  it('новое окно уезжает к правому краю — anchorTime становится null (живой режим)', () => {
    const short = cs.slice(0, 10);
    const r = zoomStep(short, 5, 5, 1, 2, bounds);
    expect(r.count).toBe(10);
    expect(r.anchorTime).toBeNull();
  });
});
