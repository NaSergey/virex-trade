import { describe, expect, it } from 'vitest';
import { pct, profileUrl, shortAddress, usd } from './format';

describe('format', () => {
  it('shortAddress — начало и конец адреса', () => {
    expect(shortAddress('0x399965e15d4e61ec3529cc98b7f7ebb93b733336')).toBe('0x3999…3336');
  });

  it('profileUrl — профиль трейдера на HyperDash', () => {
    expect(profileUrl('0xab')).toBe('https://hyperdash.info/trader/0xab');
  });

  it('pct — доля в целые проценты без знака', () => {
    expect(pct(0.1234)).toBe('12 %');
    expect(pct(null)).toBe('—');
  });

  it('usd — компактно, с K/M/B', () => {
    expect(usd(1_234_567)).toBe('1.23M');
    expect(usd(45_600)).toBe('45.6K');
    expect(usd(2_500_000_000)).toBe('2.5B');
    expect(usd(950)).toBe('950');
    expect(usd(null)).toBe('—');
  });
});
