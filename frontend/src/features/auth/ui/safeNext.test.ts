import { describe, expect, it } from 'vitest';
import { safeNext } from './AuthForm';

describe('safeNext', () => {
  it('путь внутри продукта проходит', () => {
    expect(safeNext('/saved')).toBe('/saved');
    expect(safeNext('/games/trading?t=abc')).toBe('/games/trading?t=abc');
  });

  it('чужой домен — на главную: и //, и /\\ (браузер читает его как //)', () => {
    expect(safeNext('//evil.example')).toBe('/terminal');
    expect(safeNext('/\\evil.example')).toBe('/terminal');
    expect(safeNext('https://evil.example')).toBe('/terminal');
  });

  it('управляющие символы браузер выбрасывает из адреса: / и таб и / — это //', () => {
    expect(safeNext('/\t/evil.example')).toBe('/terminal');
    expect(safeNext('/\n/evil.example')).toBe('/terminal');
    expect(safeNext('/\r/evil.example')).toBe('/terminal');
    expect(safeNext('/\t\\evil.example')).toBe('/terminal');
  });

  it('что бы ни прошло, браузер прочитает это как адрес своего сайта', () => {
    const site = 'https://trade-play.com';
    for (const raw of ['/.//evil.example', '/./\\evil.example', '/x/..//evil.example', '/%09/evil.example', '/ /evil']) {
      expect(new URL(safeNext(raw), site).origin).toBe(site);
    }
  });

  it('не путь — на главную', () => {
    expect(safeNext('saved')).toBe('/terminal');
    expect(safeNext('javascript:alert(1)')).toBe('/terminal');
    expect(safeNext('')).toBe('/terminal');
  });

  it('своя главная там, где она другая', () => {
    expect(safeNext(null, '/')).toBe('/');
    expect(safeNext('//evil.example', '/')).toBe('/');
  });
});
