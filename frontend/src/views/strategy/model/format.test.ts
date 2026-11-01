import { describe, expect, it } from 'vitest';
import { clock, coinOf, fmtPct, fmtPrice, fmtR, priceDigits, ruleText, tone } from './format';

describe('format', () => {
  it('fmtR — знак, два знака, R', () => {
    expect(fmtR(0.35)).toBe('+0,35R');
    expect(fmtR(-1)).toBe('−1,00R');
    expect(fmtR(0)).toBe('0,00R');
    expect(fmtR(null)).toBe('—');
  });

  it('fmtPct', () => {
    expect(fmtPct(0.412)).toBe('41,2 %');
    expect(fmtPct(0.5, 0)).toBe('50 %');
    expect(fmtPct(null)).toBe('—');
  });

  it('ruleText — признак и корзина по-русски', () => {
    expect(ruleText({ feature: 'session', value: 'night' })).toBe('Сессия: ночь');
    expect(ruleText({ feature: 'stopAtr', value: '>1.5' })).toBe('Стоп: > 1,5 ATR');
  });

  it('цена — столько знаков, сколько нужно монете', () => {
    const plain = (x: number) => fmtPrice(x).replace(/\s/g, '');
    expect(plain(69123.45)).toBe('69123,5');
    expect(plain(151.234)).toBe('151,23');
    expect(plain(0.21234)).toBe('0,21234');
    expect(plain(0.005061)).toBe('0,005061');
    expect(priceDigits(-0.005)).toBe(6);
  });

  it('монета по инструменту', () => {
    expect(coinOf('BTCUSDT')).toBe('BTC');
    expect(coinOf('1000PEPEUSDT')).toBe('PEPE');
  });

  it('clock и tone', () => {
    expect(clock(2214)).toBe('36:54');
    expect(tone(0.1)).toBe('pos');
    expect(tone(-0.1)).toBe('neg');
    expect(tone(0)).toBeUndefined();
  });
});
