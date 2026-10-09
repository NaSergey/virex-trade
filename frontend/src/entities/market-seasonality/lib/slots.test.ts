import { describe, expect, it } from 'vitest';
import { leanOf, localDay, slotIndex, slotKey, slotOf, verdictOf } from './slots';
import type { TimeSlot } from '../api/types';

const slot = (weekday: number, minute: number, upPct = 50): TimeSlot => ({
  weekday,
  minute,
  samples: 100,
  upSamples: upPct,
  downSamples: 100 - upPct,
  upPct,
  avgChangePct: 0,
});

describe('slotOf', () => {
  // 2026-01-01 — четверг.
  const T = Date.UTC(2026, 0, 1, 14, 37);

  it('время открытия свечи своего таймфрейма, по UTC', () => {
    expect(slotOf(T, 60)).toBe(slotKey(4, 14 * 60));
    expect(slotOf(T, 15)).toBe(slotKey(4, 14 * 60 + 30));
    expect(slotOf(T, 240)).toBe(slotKey(4, 12 * 60));
    expect(slotOf(T, 5)).toBe(slotKey(4, 14 * 60 + 35));
  });

  it('у дневной свечи слот — день целиком', () => {
    expect(slotOf(T, 1440)).toBe(slotKey(4, 0));
  });

  it('совпадает с ключом слота сервера', () => {
    const index = slotIndex([slot(4, 14 * 60, 58)]);
    expect(index.get(slotOf(T, 60))?.upPct).toBe(58);
  });
});

describe('leanOf', () => {
  it('сторона и её доля — по округлённому проценту', () => {
    expect(leanOf(50)).toEqual({ dir: null, pct: 50 });
    expect(leanOf(50.3)).toEqual({ dir: null, pct: 50 });
    expect(leanOf(54.6)).toEqual({ dir: 'up', pct: 55 });
    expect(leanOf(42)).toEqual({ dir: 'down', pct: 58 });
  });
});

describe('verdictOf', () => {
  it('частота и средний ход говорят одно — сторона частоты', () => {
    expect(verdictOf({ upPct: 57.6, avgChangePct: 0.333 })).toEqual({ dir: 'up', freqDir: 'up', pct: 58, avg: 0.33 });
    expect(verdictOf({ upPct: 40, avgChangePct: -0.42 })).toEqual({ dir: 'down', freqDir: 'down', pct: 60, avg: -0.42 });
  });

  it('спорят — «смешанно»: чаще росло, а падения были крупнее', () => {
    expect(verdictOf({ upPct: 52, avgChangePct: -0.1 })).toEqual({ dir: 'mixed', freqDir: 'up', pct: 52, avg: -0.1 });
  });

  it('средний ход, округлённый до нуля, частоте не спорит', () => {
    expect(verdictOf({ upPct: 55, avgChangePct: -0.004 })).toEqual({ dir: 'up', freqDir: 'up', pct: 55, avg: 0 });
  });

  it('частота поровну — вывода нет, средний ход остаётся числом', () => {
    expect(verdictOf({ upPct: 50.2, avgChangePct: 0.12 })).toEqual({ dir: null, freqDir: null, pct: 50, avg: 0.12 });
  });
});

describe('localDay', () => {
  it('строки местного дня: UTC плюс сдвиг, по времени', () => {
    // Москва, UTC+3: среда 22:00 UTC — это четверг 01:00 по местному.
    const slots = [slot(3, 22 * 60), slot(4, 0), slot(4, 21 * 60), slot(4, 20 * 60)];
    const rows = localDay(slots, 4, 180);
    expect(rows.map((r) => [r.slot.weekday, r.slot.minute, r.start])).toEqual([
      [3, 22 * 60, 60],
      [4, 0, 180],
      [4, 20 * 60, 23 * 60],
    ]);
  });

  it('отрицательный сдвиг переносит начало недели назад', () => {
    // Нью-Йорк, UTC−5: воскресенье 02:00 UTC — суббота 21:00 по местному.
    const rows = localDay([slot(0, 120)], 6, -300);
    expect(rows.map((r) => r.start)).toEqual([21 * 60]);
  });
});
