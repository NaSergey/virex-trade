import { describe, expect, it } from 'vitest';
import { safeNext } from './AuthForm';

describe('safeNext', () => {
  it('путь внутри продукта проходит', () => {
    expect(safeNext('/saved')).toBe('/saved');
  });

  it('чужой домен — на главную: и //, и /\\ (браузер читает его как //)', () => {
    expect(safeNext('//evil.example')).toBe('/terminal');
    expect(safeNext('/\\evil.example')).toBe('/terminal');
    expect(safeNext('https://evil.example')).toBe('/terminal');
  });

  it('своя главная там, где она другая', () => {
    expect(safeNext(null, '/')).toBe('/');
    expect(safeNext('//evil.example', '/')).toBe('/');
  });
});
