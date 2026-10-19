import { describe, expect, it } from 'vitest';
import { sortRows } from './sort';

describe('sortRows', () => {
  const rows = [
    { address: 'a', pnlMonth: 10 as number | null },
    { address: 'b', pnlMonth: null },
    { address: 'c', pnlMonth: 30 },
  ];

  it('пустые (ещё не разобран) — в конце при любом направлении', () => {
    expect(sortRows(rows, 'pnlMonth', -1).map((r) => r.address)).toEqual(['c', 'a', 'b']);
    expect(sortRows(rows, 'pnlMonth', 1).map((r) => r.address)).toEqual(['a', 'c', 'b']);
  });

  it('не мутирует вход', () => {
    sortRows(rows, 'pnlMonth', 1);
    expect(rows.map((r) => r.address)).toEqual(['a', 'b', 'c']);
  });
});
