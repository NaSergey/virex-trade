import { describe, expect, it } from 'vitest';
import { FALLBACK_ROWS, PANE_MIN, ROW_H, TABLE_RESERVE, pageOf, rowsFor, tileCols } from './fit';

describe('rowsFor', () => {
  it('сколько целых строк влезает за вычетом шапки таблицы и листалки', () => {
    expect(rowsFor(100 + ROW_H * 6 + 20, 100)).toBe(6);
  });

  it('не меньше трёх и не больше двадцати — столько отдаёт сервер', () => {
    expect(rowsFor(150, 100)).toBe(3);
    expect(rowsFor(5000, 100)).toBe(20);
  });

  it('высота неизвестна (узкое окно, страница листается) — постоянный лист', () => {
    expect(rowsFor(0, 100)).toBe(FALLBACK_ROWS);
  });

  it('нижний предел задаёт вкладка — у открытых позиций хватает и одной строки', () => {
    expect(rowsFor(150, 100, 1)).toBe(1);
  });

  it('в блок наименьшей высоты три строки влезают целиком', () => {
    expect(rowsFor(PANE_MIN, TABLE_RESERVE)).toBe(3);
  });
});

describe('pageOf', () => {
  const rows = [1, 2, 3, 4, 5, 6, 7];

  it('режет лист и считает, сколько всего', () => {
    expect(pageOf(rows, 2, 3)).toEqual({ items: [4, 5, 6], page: 2, total: 7 });
  });

  it('номер за последним листом — последний лист, до первого — первый', () => {
    expect(pageOf(rows, 9, 3)).toEqual({ items: [7], page: 3, total: 7 });
    expect(pageOf(rows, 0, 3)).toEqual({ items: [1, 2, 3], page: 1, total: 7 });
  });

  it('пустой список — первый лист без строк', () => {
    expect(pageOf([], 4, 3)).toEqual({ items: [], page: 1, total: 0 });
  });
});

describe('tileCols', () => {
  it('три ряда плашек не влезают — шесть колонок в два ряда', () => {
    expect(tileCols(200)).toBe(6);
    expect(tileCols(400)).toBe(4);
  });

  it('высота неизвестна — четыре колонки', () => {
    expect(tileCols(0)).toBe(4);
  });
});
