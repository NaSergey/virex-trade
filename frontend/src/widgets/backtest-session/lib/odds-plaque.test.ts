import { describe, expect, it } from 'vitest';
import { derivValueText, freshDivergence, FRESH_BARS } from './odds-plaque';
import { RSI_DEFAULTS, type Divergence } from './rsi';

const div = (kind: 'bull' | 'bear', to: number): Divergence => ({
  kind,
  from: to - 10,
  to,
  fromPrice: 1,
  toPrice: 1,
  rsiFrom: to - 10,
  rsiTo: to,
  fromValue: 30,
  toValue: 40,
});

describe('freshDivergence', () => {
  const R = RSI_DEFAULTS.rightBars;
  it('нет дивергенций — null', () => {
    expect(freshDivergence([], 100)).toBeNull();
  });
  it('считает свечи от подтверждения, а не от вершины', () => {
    expect(freshDivergence([div('bull', 90)], 90 + R + 3)).toEqual({ kind: 'bull', ago: 3 });
  });
  it('старше горизонта — не свежая', () => {
    expect(freshDivergence([div('bear', 50)], 50 + R + FRESH_BARS + 1)).toBeNull();
    expect(freshDivergence([div('bear', 50)], 50 + R + FRESH_BARS)).toEqual({ kind: 'bear', ago: FRESH_BARS });
  });
  it('берёт последнюю', () => {
    expect(freshDivergence([div('bull', 40), div('bear', 60)], 60 + R)).toEqual({ kind: 'bear', ago: 0 });
  });
});

describe('derivValueText', () => {
  it('фандинг, доля лонгов, изменение открытого интереса', () => {
    expect(derivValueText('funding', 0.00031)).toBe('0.0310 %');
    expect(derivValueText('ratio', 0.6421)).toBe('64 %');
    expect(derivValueText('oi', 0.0604)).toBe('+6.0 %');
    expect(derivValueText('oi', -0.012)).toBe('−1.2 %');
  });
});
