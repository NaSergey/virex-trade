import { describe, expect, it } from 'vitest';
import { WATCH_DEFAULT_BYBIT, watchAdd, watchDefaults, watchRemove, watchShown } from './watchlist';

const all = Array.from({ length: 20 }, (_, i) => `C${i}USDT`);

describe('watchlist', () => {
  it('по умолчанию: у биржи — первые 12 (они уже по обороту), у эфира — все', () => {
    expect(WATCH_DEFAULT_BYBIT).toBe(12);
    expect(watchDefaults(all, 'bybit')).toEqual(all.slice(0, 12));
    expect(watchDefaults(all.slice(0, 9), 'live')).toEqual(all.slice(0, 9));
  });

  it('при показе выпадает монета, которой больше нет в списке рынка', () => {
    expect(watchShown(['C1USDT', 'GONEUSDT', 'C2USDT'], all)).toEqual(['C1USDT', 'C2USDT']);
  });

  it('добавить — в конец и без дублей', () => {
    expect(watchAdd(['A'], 'B')).toEqual(['A', 'B']);
    expect(watchAdd(['A', 'B'], 'A')).toEqual(['A', 'B']);
  });

  it('убрать', () => {
    expect(watchRemove(['A', 'B'], 'A')).toEqual(['B']);
    expect(watchRemove(['A'], 'X')).toEqual(['A']);
  });
});
