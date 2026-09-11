import { describe, expect, it } from 'vitest';
import { advanceTo } from './advance';
import { MINUTE } from './candles';

const at = (n: number) => Date.UTC(2024, 2, 5, 12, 0) + n * MINUTE;

const mins = (from: number, n: number, price = 100) =>
  Array.from({ length: n }, (_, i) => ({ t: from + i * MINUTE, o: price, h: price + 1, l: price - 1, c: price }));

describe('advanceTo', () => {
  it('доходит до target, когда минутки загружены дальше', () => {
    const r = advanceTo({ from: at(0), target: at(5), minutes: mins(at(0), 10), loadedUntil: at(10), position: null });
    expect(r).toEqual({ reach: at(5), complete: true, exit: null });
  });

  it('останавливается на загруженном крае, если он раньше target', () => {
    const r = advanceTo({ from: at(0), target: at(5), minutes: mins(at(0), 3), loadedUntil: at(3), position: null });
    expect(r).toEqual({ reach: at(3), complete: false, exit: null });
  });

  it('без прогресса (from === target) — срабатывание не проверяется', () => {
    const r = advanceTo({
      from: at(5),
      target: at(5),
      minutes: mins(at(0), 10),
      loadedUntil: at(10),
      position: { direction: 'long', stopLoss: 90, takeProfit: null, entryTime: at(0) },
    });
    expect(r.exit).toBeNull();
  });

  it('стоп сработал внутри окна — exit возвращается', () => {
    const minutes = mins(at(0), 5, 100);
    minutes[2] = { ...minutes[2], l: 89 };
    const r = advanceTo({
      from: at(0),
      target: at(5),
      minutes,
      loadedUntil: at(5),
      position: { direction: 'long', stopLoss: 90, takeProfit: null, entryTime: at(0) },
    });
    expect(r.exit).toEqual({ reason: 'stop', price: 90, time: at(3) });
  });

  it('позиции нет — срабатывания не бывает, даже если цена его коснулась', () => {
    const minutes = mins(at(0), 5, 100);
    minutes[2] = { ...minutes[2], l: 1 };
    const r = advanceTo({ from: at(0), target: at(5), minutes, loadedUntil: at(5), position: null });
    expect(r.exit).toBeNull();
  });
});
