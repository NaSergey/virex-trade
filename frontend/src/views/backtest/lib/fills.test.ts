import { describe, expect, it } from 'vitest';
import { MINUTE, type Candle } from './candles';
import { checkMinute, findExit, type Position } from './fills';

const T = Date.UTC(2024, 2, 5, 12, 0);
const m = (o: number, h: number, l: number, c: number, t = T): Candle => ({ t, o, h, l, c });
const LONG: Position = { direction: 'long', stopLoss: 98, takeProfit: 105 };
const SHORT: Position = { direction: 'short', stopLoss: 102, takeProfit: 95 };

describe('checkMinute', () => {
  it('касание стопа лонга — по стопу, в закрытие минутки', () => {
    expect(checkMinute(LONG, m(100, 101, 97.5, 99))).toEqual({ reason: 'stop', price: 98, time: T + MINUTE });
  });

  it('стоп ровно на минимуме — сработал', () => {
    expect(checkMinute(LONG, m(100, 101, 98, 99))?.reason).toBe('stop');
  });

  // Как на бирже: при гэпе стоп исполняется хуже заявленного.
  it('гэп за стопом — по цене открытия', () => {
    expect(checkMinute(LONG, m(97, 97.5, 96, 96.5))).toMatchObject({ reason: 'stop', price: 97 });
  });

  // Лучше заявленного тейк не исполняется — иначе гэп работал бы в пользу трейдера.
  it('гэп за тейком — по тейку, а не по открытию', () => {
    expect(checkMinute(LONG, m(106, 107, 105.5, 106.5))).toMatchObject({ reason: 'take', price: 105 });
  });

  it('касание тейка — по тейку', () => {
    expect(checkMinute(LONG, m(104, 105.2, 103, 105))).toMatchObject({ reason: 'take', price: 105 });
  });

  it('стоп и тейк в одной минутке — стоп', () => {
    expect(checkMinute(LONG, m(100, 106, 97, 101))?.reason).toBe('stop');
  });

  it('шорт зеркально: стоп сверху, тейк снизу', () => {
    expect(checkMinute(SHORT, m(100, 102.5, 99, 101))).toMatchObject({ reason: 'stop', price: 102 });
    expect(checkMinute(SHORT, m(96, 97, 94, 95.5))).toMatchObject({ reason: 'take', price: 95 });
  });

  it('без тейка проверяется только стоп', () => {
    expect(checkMinute({ ...LONG, takeProfit: null }, m(104, 200, 103, 150))).toBeNull();
  });
});

describe('findExit', () => {
  const series = [m(100, 101, 99, 100, T), m(100, 101, 97, 98, T + MINUTE), m(98, 110, 90, 100, T + 2 * MINUTE)];

  it('первая сработавшая минутка в окне', () => {
    expect(findExit(LONG, series, T, T + 3 * MINUTE)).toMatchObject({ reason: 'stop', time: T + 2 * MINUTE });
  });

  it('минутки раньше from не проверяются', () => {
    expect(findExit(LONG, series, T + 2 * MINUTE, T + 3 * MINUTE)).toMatchObject({ time: T + 3 * MINUTE });
  });

  it('минутка, которая закрывается после to, не проверяется', () => {
    expect(findExit(LONG, series, T, T + MINUTE)).toBeNull();
  });
});
