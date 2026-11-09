import { describe, expect, it } from 'vitest';
import { MINUTE, TIMEFRAMES, bucketStart } from './candles';
import {
  MAX_MINUTES_PER_SEC,
  MAX_TICKS_PER_SEC,
  SPEEDS,
  allowedSpeed,
  clampSpeed,
  paceOf,
  reanchor,
  replayKeyOf,
  tickTarget,
} from './playback';

const H = 60 * MINUTE;

describe('paceOf', () => {
  it('×N — N свечей выбранного ТФ в секунду на любом таймфрейме', () => {
    for (const tf of TIMEFRAMES) {
      for (const s of SPEEDS) {
        if (!allowedSpeed(s, tf)) continue;
        const { stepMin, periodMs } = paceOf(s, tf);
        // Минуток истории за секунду — ровно s свечей по tf минут.
        expect((stepMin * 1000) / periodMs).toBeCloseTo(s * tf, 6);
      }
    }
  });

  it('тиков не больше потолка в секунду', () => {
    for (const tf of TIMEFRAMES) {
      for (const s of SPEEDS) {
        if (!allowedSpeed(s, tf)) continue;
        expect(1000 / paceOf(s, tf).periodMs).toBeLessThanOrEqual(MAX_TICKS_PER_SEC + 1e-9);
      }
    }
  });

  it('шаг — делитель свечи или целое число свечей: тик не режет свечу поперёк', () => {
    for (const tf of TIMEFRAMES) {
      for (const s of SPEEDS) {
        if (!allowedSpeed(s, tf)) continue;
        const { stepMin } = paceOf(s, tf);
        expect(stepMin >= tf ? stepMin % tf : tf % stepMin).toBe(0);
      }
    }
  });

  it('минутки на ×1 — как раньше: минута в секунду', () => {
    expect(paceOf(1, 1)).toEqual({ stepMin: 1, periodMs: 1000 });
  });

  it('дневка на ×1 — сутки за секунду шестнадцатью кусками по полтора часа', () => {
    expect(paceOf(1, 1440)).toEqual({ stepMin: 90, periodMs: 62.5 });
  });

  it('4ч на ×32 — по две свечи за тик', () => {
    expect(paceOf(32, 240).stepMin).toBe(480);
  });
});

describe('allowedSpeed / clampSpeed', () => {
  it('всё, что не быстрее 4ч на ×32, разрешено', () => {
    expect(MAX_MINUTES_PER_SEC).toBe(240 * 32);
    for (const tf of TIMEFRAMES.filter((x) => x <= 240)) {
      for (const s of SPEEDS) expect(allowedSpeed(s, tf)).toBe(true);
    }
  });

  it('на дневке — до ×4', () => {
    expect(SPEEDS.filter((s) => allowedSpeed(s, 1440))).toEqual([1, 4]);
  });

  it('недоступная скорость сводится к самой быстрой доступной', () => {
    expect(clampSpeed(32, 1440)).toBe(4);
    expect(clampSpeed(16, 60)).toBe(16);
    expect(clampSpeed(8, 1440)).toBe(4);
  });
});

describe('tickTarget', () => {
  const day = Date.UTC(2024, 0, 10);

  it('с границы сетки — ровно на шаг', () => {
    expect(tickTarget(day, 90)).toBe(day + 90 * MINUTE);
  });

  it('с середины (после стопа) — до ближайшей границы, а не на шаг вперёд', () => {
    const from = day + 37 * MINUTE;
    expect(tickTarget(from, 90)).toBe(day + 90 * MINUTE);
  });

  it('несколько свечей за тик — граница совпадает с границей свечи', () => {
    const from = day + 4 * H + 13 * MINUTE;
    const target = tickTarget(from, 480);
    expect(target).toBe(bucketStart(target, 240));
    expect(target).toBeGreaterThan(from);
  });
});

describe('reanchor', () => {
  const day = Date.UTC(2024, 0, 10);
  const minutes = Array.from({ length: 3 * 24 * 60 }, (_, i) => ({ t: day + i * MINUTE, o: i, h: i + 1, l: i - 1, c: i + 0.5 }));
  const cut = day + 2 * 24 * H;

  it('свечи до среза собираются в закрытые, опора едет на срез', () => {
    const prev = { 60: { anchor: day + 5 * H, candles: [{ t: day + 4 * H, o: 0, h: 0, l: 0, c: 0 }] } };
    const next = reanchor(prev, minutes, cut, new Set([60]));
    expect(next[60].anchor).toBe(cut);
    expect(next[60].candles[0].t).toBe(day + 4 * H);
    expect(next[60].candles[1]).toEqual({ t: day + 5 * H, o: 300, h: 360, l: 299, c: 359.5 });
    expect(next[60].candles.at(-1)!.t).toBe(cut - H);
    expect(next[60].candles).toHaveLength(1 + (cut - (day + 5 * H)) / H);
  });

  it('набор с опорой не раньше среза не трогается', () => {
    const set = { anchor: cut + H, candles: [] };
    expect(reanchor({ 60: set }, minutes, cut, new Set([60]))[60]).toBe(set);
  });

  it('не нужные сейчас таймфреймы выбрасываются — их перезагрузят при выборе', () => {
    const prev = {
      1: { anchor: day, candles: [] },
      60: { anchor: day, candles: [] },
    };
    expect(Object.keys(reanchor(prev, minutes, cut, new Set([60])))).toEqual(['60']);
  });
});

describe('replayKeyOf', () => {
  const key = (code: string, mods: Partial<KeyboardEvent> = {}) =>
    replayKeyOf({ code, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, ...mods });

  it('цифры — скорости по порядку, и на цифровом блоке тоже', () => {
    expect(key('Digit1')).toEqual({ type: 'speed', speed: SPEEDS[0] });
    expect(key('Digit5')).toEqual({ type: 'speed', speed: SPEEDS[4] });
    expect(key('Numpad3')).toEqual({ type: 'speed', speed: SPEEDS[2] });
  });

  it('цифры без скорости и с модификаторами — не наши', () => {
    expect(key(`Digit${SPEEDS.length + 1}`)).toBeNull();
    expect(key('Digit0')).toBeNull();
    expect(key('Digit1', { ctrlKey: true })).toBeNull();
    expect(key('Digit1', { altKey: true })).toBeNull();
    expect(key('Digit1', { shiftKey: true })).toBeNull();
  });

  it('пробел — пауза и обратно, удержание не переключает каждый повтор', () => {
    expect(key('Space')).toEqual({ type: 'toggle' });
    expect(key('Space', { repeat: true })).toBeNull();
    expect(key('Space', { ctrlKey: true })).toBeNull();
  });
});
