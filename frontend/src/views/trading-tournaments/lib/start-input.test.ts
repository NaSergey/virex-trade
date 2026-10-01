import { describe, expect, it } from 'vitest';
import { defaultStartInput, localInputValue, startInputOk } from './start-input';

const at = (h: number, m: number, s = 0) => new Date(2026, 8, 26, h, m, s).getTime();

describe('поле времени старта', () => {
  it('значение поля — местное время браузера до минуты', () => {
    expect(localInputValue(at(13, 7, 42))).toBe('2026-09-26T13:07');
  });

  it('по умолчанию — через час, вверх до пяти минут', () => {
    expect(defaultStartInput(at(12, 3))).toBe('2026-09-26T13:05');
  });

  it('меньше двух минут до старта — нельзя', () => {
    expect(startInputOk('2026-09-26T12:04', at(12, 3))).toBe(false);
    expect(startInputOk('2026-09-26T12:05', at(12, 3))).toBe(true);
  });

  it('дальше тридцати дней — нельзя', () => {
    expect(startInputOk('2026-10-27T12:04', at(12, 3))).toBe(false);
  });

  it('пустое поле — нельзя', () => {
    expect(startInputOk('', at(12, 3))).toBe(false);
  });
});
