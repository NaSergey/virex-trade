import { describe, expect, it } from 'vitest';
import type { SlotSymbol } from '@/entities/slots';
import { stopPlan, tierOf } from './plan';

const col = (s: SlotSymbol): SlotSymbol[] => [s, 'cherry', 'lemon'];

describe('план остановки', () => {
  it('без скаттеров — ровный шаг', () => {
    const p = stopPlan([col('bar'), col('bar'), col('bar'), col('bar'), col('bar')], false);
    expect(p.at).toEqual([0, 230, 460, 690, 920]);
    expect(p.hot).toEqual([false, false, false, false, false]);
  });

  it('два скаттера — следующие барабаны с предвкушением', () => {
    const p = stopPlan([col('scatter'), col('scatter'), col('bar'), col('bar'), col('bar')], false);
    expect(p.hot).toEqual([false, false, true, true, true]);
    expect(p.at[2] - p.at[1]).toBe(1250);
  });
});

it('сундуки на 1-м и 3-м — пятый горит', () => {
  const p = stopPlan([col('chest'), col('bar'), col('chest'), col('bar'), col('bar')], false);
  expect(p.hot).toEqual([false, false, false, false, true]);
});

describe('сила выигрыша', () => {
  it('по множителю ставки', () => {
    expect(tierOf(0, 10)).toBe('none');
    expect(tierOf(5, 10)).toBe('tiny');
    expect(tierOf(10, 10)).toBe('tiny');
    expect(tierOf(15, 10)).toBe('small');
    expect(tierOf(20, 10)).toBe('nice');
    expect(tierOf(100, 10)).toBe('big');
    expect(tierOf(300, 10)).toBe('mega');
    expect(tierOf(800, 10)).toBe('epic');
    expect(tierOf(2000, 10)).toBe('legendary');
  });
});
