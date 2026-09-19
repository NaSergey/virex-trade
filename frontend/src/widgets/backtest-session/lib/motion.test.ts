import { describe, expect, it } from 'vitest';
import {
  anchorTimeAt,
  frameAtTime,
  glidePrice,
  indexAtOrAfter,
  liveAnchorAt,
  niceStep,
  priceTicks,
  resolveWindow,
  zoomStep,
} from './motion';

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
    // 25 - 0.5*5 = 22.5: позиция кадра дробная и не округляется, иначе каждый
    // щелчок колеса дёргал бы картинку ещё и на полсвечи вбок.
    expect(r.anchorTime).toBe(22.5 * 60_000);
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

describe('дробная позиция кадра', () => {
  const cs = Array.from({ length: 50 }, (_, i) => ({ t: i * 60_000 }));

  it('frameAtTime отдаёт долю свечи, а не целый индекс', () => {
    expect(frameAtTime(cs, 22 * 60_000 + 30_000)).toBe(22.5);
  });

  it('позиция → время → позиция не теряет долю (внутри, слева и справа от данных)', () => {
    for (const f of [-4.25, 0, 0.4, 22.5, 47.75]) {
      expect(frameAtTime(cs, anchorTimeAt(cs, f) as number)).toBeCloseTo(f, 9);
    }
  });

  it('пропуск бакета: доля берётся между соседями, а не делением на общий шаг', () => {
    // Между свечами 20 и 21 в истории дыра шириной в три бакета.
    const gap = [...cs.slice(0, 21), ...cs.slice(21).map((c) => ({ t: c.t + 3 * 60_000 }))];
    const mid = anchorTimeAt(gap, 20.5) as number;
    expect(mid).toBe(22 * 60_000);
    expect(frameAtTime(gap, mid)).toBe(20.5);
  });

  it('resolveWindow при дробном кадре берёт крайние свечи целиком', () => {
    const r = resolveWindow(cs, { count: 10, anchorTime: 22.5 * 60_000 }, { minCount: 5, maxCount: 100 });
    expect(r.frameStart).toBe(22.5);
    expect(r.startIdx).toBe(22);
    expect(r.endIdx).toBe(33);
    expect(r.live).toBe(false);
  });

  it('liveAnchorAt: у самого края — живой режим, дальше — якорь', () => {
    expect(liveAnchorAt(cs, 40.1, 10)).toBeNull();
    expect(liveAnchorAt(cs, 39, 10)).toBe(39 * 60_000);
  });
});

describe('niceStep', () => {
  it('округляет вверх до ближайшего 1/2/5×10^n', () => {
    expect(niceStep(0.9)).toBe(1);
    expect(niceStep(1)).toBe(1);
    expect(niceStep(1.1)).toBe(2);
    expect(niceStep(2)).toBe(2);
    expect(niceStep(3)).toBe(5);
    expect(niceStep(5)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(120)).toBe(200);
    expect(niceStep(450)).toBe(500);
  });

  it('неположительный вход не роняет счёт', () => {
    expect(niceStep(0)).toBe(1);
    expect(niceStep(-5)).toBe(1);
  });
});

describe('priceTicks', () => {
  it('линии стоят на круглых числах с шагом niceStep', () => {
    expect(priceTicks(72680, 83420, 900)).toEqual([73000, 74000, 75000, 76000, 77000, 78000, 79000, 80000, 81000, 82000, 83000]);
  });

  it('более узкий диапазон — более мелкий шаг, линий физически помещается больше', () => {
    // Тот же порядок цены, что и выше, но диапазон в разы уже — при
    // одинаковом minGap (в цене) шаг обязан стать мельче, а линий — больше.
    expect(priceTicks(79100, 80100, 150)).toEqual([79200, 79400, 79600, 79800, 80000]);
  });

  it('вырожденный диапазон — пустой список, а не бесконечный цикл', () => {
    expect(priceTicks(100, 100, 10)).toEqual([]);
    expect(priceTicks(100, 200, 0)).toEqual([]);
  });

  it('соседние вызовы с почти тем же lo дают то же число для той же линии', () => {
    // На этом строится React-ключ линии сетки в ReplayChart: соседние кадры
    // вертикального пана обязаны давать побитово одинаковое значение, иначе
    // линия пересоздавалась бы, а не просто сдвигалась по y.
    const a = priceTicks(79987.3, 81234.5, 150);
    const b = priceTicks(79987.9, 81234.9, 150);
    expect(a).toContain(80000);
    expect(b).toContain(80000);
    expect(a[a.indexOf(80000)]).toBe(b[b.indexOf(80000)]);
  });
});
