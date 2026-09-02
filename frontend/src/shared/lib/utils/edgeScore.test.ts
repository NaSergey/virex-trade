import { describe, expect, it } from 'vitest';
import { sqnToScore, sqnTier } from './edgeScore';

describe('sqnToScore', () => {
  it('опорные точки шкалы Тарпа переводятся ровно', () => {
    expect(sqnToScore(0)).toBe(0);
    expect(sqnToScore(1.6)).toBe(25);
    expect(sqnToScore(2.0)).toBe(40);
    expect(sqnToScore(2.5)).toBe(55);
    expect(sqnToScore(3.0)).toBe(70);
    expect(sqnToScore(5.0)).toBe(88);
    expect(sqnToScore(7.0)).toBe(100);
  });

  it('между опорными точками — линейная интерполяция', () => {
    expect(sqnToScore(2.25)).toBe(48); // середина 2.0(40)–2.5(55)
    expect(sqnToScore(1.8)).toBe(33); // середина 1.6(25)–2.0(40)
  });

  it('клампится по краям', () => {
    expect(sqnToScore(-3)).toBe(0);
    expect(sqnToScore(10)).toBe(100);
  });
});

describe('sqnTier', () => {
  it('границы уровней — нижняя включена в верхний, не в нижний', () => {
    expect(sqnTier(1.59)).toBe('poor');
    expect(sqnTier(1.6)).toBe('belowAverage');
    expect(sqnTier(1.99)).toBe('belowAverage');
    expect(sqnTier(2.0)).toBe('average');
    expect(sqnTier(2.49)).toBe('average');
    expect(sqnTier(2.5)).toBe('good');
    expect(sqnTier(2.99)).toBe('good');
    expect(sqnTier(3.0)).toBe('excellent');
    expect(sqnTier(4.99)).toBe('excellent');
    expect(sqnTier(5.0)).toBe('superb');
    expect(sqnTier(6.99)).toBe('superb');
    expect(sqnTier(7.0)).toBe('holyGrail');
  });
});
