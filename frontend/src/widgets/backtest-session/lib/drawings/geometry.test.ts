import { describe, expect, it } from 'vitest';
import {
  anchorsOf,
  extend,
  fibLevels,
  magnetPrice,
  makePosition,
  moveAnchor,
  positionOutcome,
  positionStats,
  rulerStats,
  simplifyIdx,
  translate,
} from './geometry';
import type { Drawing } from './types';

const base = { id: 'x', color: 'fg', width: 1 } as const;

describe('fibLevels', () => {
  it('1 у первой точки, 0 у второй', () => {
    const lv = fibLevels({ t: 0, p: 100 }, { t: 1, p: 200 });
    expect(lv.find((l) => l.level === 1)?.price).toBe(100);
    expect(lv.find((l) => l.level === 0)?.price).toBe(200);
    expect(lv.find((l) => l.level === 0.5)?.price).toBe(150);
    expect(lv.find((l) => l.level === 1.618)?.price).toBeCloseTo(38.2);
  });
});

describe('makePosition и positionStats', () => {
  it('лонг: стоп ниже, тейк на 2R выше', () => {
    const [entry, stop, take] = makePosition('long', { t: 0, p: 100 }, 5, 60);
    expect(stop).toEqual({ t: 60, p: 95 });
    expect(take).toEqual({ t: 60, p: 110 });
    expect(positionStats(entry.p, stop.p, take.p)).toEqual({ riskPct: 5, rewardPct: 10, rr: 2 });
  });
  it('шорт: стоп выше, тейк ниже', () => {
    const [, stop, take] = makePosition('short', { t: 0, p: 100 }, 5, 60);
    expect(stop.p).toBe(105);
    expect(take.p).toBe(90);
  });
  it('R:R неизвестен, пока стоп на входе', () => {
    expect(positionStats(100, 100, 110).rr).toBeNull();
  });
});

describe('moveAnchor у позиции', () => {
  const pos: Drawing = { ...base, kind: 'long', points: makePosition('long', { t: 0, p: 100 }, 5, 60) };

  it('четыре якоря: вход, стоп, тейк слева и правый край', () => {
    expect(anchorsOf(pos)).toEqual([
      { t: 0, p: 100 },
      { t: 0, p: 95 },
      { t: 0, p: 110 },
      { t: 60, p: 100 },
    ]);
  });
  it('стоп лонга не поднимается выше входа', () => {
    expect(moveAnchor(pos, 1, { t: 0, p: 120 }).points[1].p).toBe(100);
  });
  it('тейк лонга не опускается ниже входа', () => {
    expect(moveAnchor(pos, 2, { t: 0, p: 50 }).points[2].p).toBe(100);
  });
  it('правый край не уходит левее входа и двигает стоп с тейком', () => {
    const moved = moveAnchor(pos, 3, { t: -10, p: 0 });
    expect(moved.points[1].t).toBe(0);
    expect(moved.points[2].t).toBe(0);
  });
  it('вход, перешедший за стоп, тянет стоп за собой', () => {
    const moved = moveAnchor(pos, 0, { t: 0, p: 90 });
    expect(moved.points[0].p).toBe(90);
    expect(moved.points[1].p).toBe(90);
  });
});

describe('moveAnchor и translate у обычной фигуры', () => {
  const trend: Drawing = { ...base, kind: 'trend', points: [{ t: 0, p: 1 }, { t: 10, p: 2 }] };
  it('двигает только свою точку', () => {
    expect(moveAnchor(trend, 1, { t: 20, p: 3 }).points).toEqual([{ t: 0, p: 1 }, { t: 20, p: 3 }]);
  });
  it('translate сдвигает все точки', () => {
    expect(translate(trend, 5, 1).points).toEqual([{ t: 5, p: 2 }, { t: 15, p: 3 }]);
  });
});

describe('simplifyIdx', () => {
  it('прямая схлопывается до концов', () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = [0, 1, 2, 3, 4];
    expect(simplifyIdx(xs, ys, 0.5)).toEqual([0, 4]);
  });
  it('угол остаётся', () => {
    expect(simplifyIdx([0, 5, 10], [0, 5, 0], 1)).toEqual([0, 1, 2]);
  });
});

describe('magnetPrice', () => {
  const candle = { o: 10, h: 20, l: 5, c: 15 };
  const yOf = (p: number) => -p;
  it('прилипает к ближайшему уровню в пределах порога', () => {
    expect(magnetPrice(candle, 19, yOf, 3)).toBe(20);
  });
  it('дальше порога не трогает', () => {
    expect(magnetPrice(candle, 30, yOf, 3)).toBe(30);
  });
  it('без свечи не трогает', () => {
    expect(magnetPrice(null, 19, yOf, 3)).toBe(19);
  });
});

describe('positionOutcome', () => {
  // Лонг: вход 100 на свече t=0, стоп 95, тейк 110, правый край t=5.
  const long = makePosition('long', { t: 0, p: 100 }, 5, 5);
  const bar = (t: number, l: number, h: number, c: number, o = c) => ({ t, o, l, h, c });

  it('ничего не задето — конец на закрытии последней свечи диапазона', () => {
    const candles = [bar(0, 99, 101, 100), bar(1, 98, 104, 103), bar(2, 101, 106, 105)];
    expect(positionOutcome('long', long, candles)).toEqual({ from: 0, t: 2, p: 105, result: 'open' });
  });
  it('тейк задет — конец на этой свече по цене тейка, дальше не идёт', () => {
    const candles = [bar(0, 99, 101, 100), bar(1, 101, 111, 109), bar(2, 90, 120, 115)];
    expect(positionOutcome('long', long, candles)).toEqual({ from: 0, t: 1, p: 110, result: 'take' });
  });
  it('стоп задет раньше тейка', () => {
    const candles = [bar(0, 99, 101, 100), bar(1, 94, 101, 96), bar(2, 96, 120, 115)];
    expect(positionOutcome('long', long, candles)).toEqual({ from: 0, t: 1, p: 95, result: 'stop' });
  });
  it('стоп и тейк в одной свече — стоп', () => {
    const candles = [bar(0, 99, 101, 100), bar(1, 90, 120, 100)];
    expect(positionOutcome('long', long, candles)?.result).toBe('stop');
  });
  it('на свече входа выход не проверяется, даже если её хвост за стопом', () => {
    const candles = [bar(0, 90, 101, 100), bar(1, 99, 102, 101)];
    expect(positionOutcome('long', long, candles)).toEqual({ from: 0, t: 1, p: 101, result: 'open' });
  });
  it('свечи правее края зоны не участвуют', () => {
    const candles = [bar(0, 99, 101, 100), bar(5, 99, 102, 101), bar(6, 50, 200, 150)];
    expect(positionOutcome('long', long, candles)).toEqual({ from: 0, t: 5, p: 101, result: 'open' });
  });
  it('цена так и не дошла до входа — позиции нет, хоть она и на стороне тейка', () => {
    const candles = [bar(0, 104, 108, 106), bar(1, 105, 109, 107), bar(2, 103, 108, 104)];
    expect(positionOutcome('long', long, candles)).toBeNull();
  });
  it('вход исполнился на более поздней свече — подсветка с неё', () => {
    const candles = [bar(0, 104, 108, 106), bar(1, 99, 105, 101, 104), bar(2, 100, 106, 105)];
    expect(positionOutcome('long', long, candles)).toEqual({ from: 1, t: 2, p: 105, result: 'open' });
  });
  it('в свече исполнения стоп засчитан, если он точно после входа', () => {
    // Открытие 104 выше входа: к лою 94 цена шла через 100, то есть сначала вход, потом стоп.
    const candles = [bar(0, 104, 108, 106), bar(1, 94, 105, 97, 104), bar(2, 100, 106, 105)];
    expect(positionOutcome('long', long, candles)).toEqual({ from: 1, t: 1, p: 95, result: 'stop' });
  });
  it('в свече исполнения тейк не засчитан, если мог случиться до входа', () => {
    // Открытие 104: хай 111 мог быть раньше, чем цена спустилась ко входу.
    const candles = [bar(0, 104, 108, 106), bar(1, 99, 111, 101, 104)];
    expect(positionOutcome('long', long, candles)).toEqual({ from: 1, t: 1, p: 101, result: 'open' });
  });
  it('шорт: тейк снизу', () => {
    const short = makePosition('short', { t: 0, p: 100 }, 5, 5);
    const candles = [bar(0, 99, 101, 100), bar(1, 89, 101, 92)];
    expect(positionOutcome('short', short, candles)).toEqual({ from: 0, t: 1, p: 90, result: 'take' });
  });
});

describe('rulerStats и extend', () => {
  it('считает свечи по ТФ', () => {
    expect(rulerStats({ t: 0, p: 100 }, { t: 3_600_000, p: 110 }, 900_000)).toEqual({ dp: 10, pct: 10, bars: 4, ms: 3_600_000 });
  });
  it('extend продолжает луч на заданную длину', () => {
    expect(extend(0, 0, 3, 4, 10)).toEqual([6, 8]);
  });
});
