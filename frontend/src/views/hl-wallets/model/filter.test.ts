import { describe, expect, it } from 'vitest';
import type { HlWalletRow } from '../api/hooks';
import { applyFilters, EMPTY_FILTERS, hasFilters } from './filter';

const row = (o: Partial<HlWalletRow>): HlWalletRow => ({
  address: '0xa',
  accountValue: 50_000,
  pnlWeek: 100,
  pnlMonth: 1000,
  pnl90: 3000,
  pnlAllTime: 9000,
  roiMonth: 0.02,
  weeks: 26,
  weeksMoving: 20,
  weeksUp: 16,
  bestWeekShare: 0.2,
  maxDrawdown: 0.1,
  volumeWeek: 1,
  openPositions: 0,
  analyzedAt: '2026-10-19T00:00:00Z',
  qualified: true,
  rejectReason: null,
  alive: true,
  savedAt: null,
  note: null,
  viewedAt: null,
  starred: false,
  netExposure: 0.8,
  grossExposure: 1,
  style: 'directional',
  ...o,
});

describe('applyFilters', () => {
  it('пустые фильтры пропускают всё, и hasFilters это знает', () => {
    expect(applyFilters([row({})], EMPTY_FILTERS)).toHaveLength(1);
    expect(hasFilters(EMPTY_FILTERS)).toBe(false);
  });

  it('«от» режет меньшие, «до» — большие; проценты вводятся числом', () => {
    const rows = [row({ address: 'a', pnlMonth: 500 }), row({ address: 'b', pnlMonth: 2000 })];
    expect(applyFilters(rows, { ...EMPTY_FILTERS, pnlMonthMin: '1000' }).map((r) => r.address)).toEqual(['b']);
    const dd = [row({ address: 'a', maxDrawdown: 0.1 }), row({ address: 'b', maxDrawdown: 0.35 })];
    expect(applyFilters(dd, { ...EMPTY_FILTERS, drawdownMax: '20' }).map((r) => r.address)).toEqual(['a']);
    const roi = [row({ address: 'a', roiMonth: 0.005 }), row({ address: 'b', roiMonth: 0.05 })];
    expect(applyFilters(roi, { ...EMPTY_FILTERS, roiMin: '1' }).map((r) => r.address)).toEqual(['b']);
  });

  it('доля недель в плюсе — от недель с движением', () => {
    const rows = [row({ address: 'a', weeksUp: 12, weeksMoving: 20 }), row({ address: 'b', weeksUp: 18, weeksMoving: 20 })];
    expect(applyFilters(rows, { ...EMPTY_FILTERS, upShareMin: '75' }).map((r) => r.address)).toEqual(['b']);
  });

  it('мусор в поле — фильтр не действует, запятая — десятичный разделитель', () => {
    expect(applyFilters([row({})], { ...EMPTY_FILTERS, pnlMonthMin: 'abc' })).toHaveLength(1);
    expect(applyFilters([row({ roiMonth: 0.015 })], { ...EMPTY_FILTERS, roiMin: '1,5' })).toHaveLength(1);
  });

  it('число не задано (кошелёк не разобран) — под заданный фильтр не проходит', () => {
    expect(applyFilters([row({ pnl90: null })], { ...EMPTY_FILTERS, pnl90Min: '0' })).toHaveLength(0);
  });

  it('новые и просмотренные', () => {
    const rows = [row({ address: 'a', viewedAt: null }), row({ address: 'b', viewedAt: '2026-10-19T00:00:00Z' })];
    expect(applyFilters(rows, { ...EMPTY_FILTERS, view: 'new' }).map((r) => r.address)).toEqual(['a']);
    expect(applyFilters(rows, { ...EMPTY_FILTERS, view: 'viewed' }).map((r) => r.address)).toEqual(['b']);
    expect(hasFilters({ ...EMPTY_FILTERS, view: 'new' })).toBe(true);
  });

  it('«направленные» убирают хедж, пары и кошельки без позиций и без снимка', () => {
    const rows = [
      row({ address: 'a', style: 'directional' }),
      row({ address: 'b', style: 'neutral' }),
      row({ address: 'c', style: 'flat' }),
      row({ address: 'd', style: null }),
    ];
    expect(applyFilters(rows, { ...EMPTY_FILTERS, style: 'directional' }).map((r) => r.address)).toEqual(['a']);
    expect(hasFilters({ ...EMPTY_FILTERS, style: 'directional' })).toBe(true);
  });
});
