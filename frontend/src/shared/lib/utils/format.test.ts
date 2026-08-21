import { describe, expect, it } from 'vitest';
import { fmtPctSigned, formatMoney, formatPriceGrouped, formatTradeDate, moneyClass } from './format';

// Тонкий пробел (U+2009) — разрядный разделитель денег и цен.
const T = ' ';

describe('formatMoney', () => {
  it('разбивает разряды тонким пробелом и ставит явный плюс', () => {
    expect(formatMoney(1284.4)).toBe(`+1${T}284.40`);
  });

  it('у убытка — типографский минус, а не дефис', () => {
    expect(formatMoney(-231.9)).toBe('−231.90');
  });

  it('ноль показывает со знаком плюс: безубыток — не потеря', () => {
    expect(formatMoney(0)).toBe('+0.00');
  });

  it('разбивает и миллионы', () => {
    expect(formatMoney(-1234567.5)).toBe(`−1${T}234${T}567.50`);
  });

  it('нечисло превращает в прочерк, а не в NaN', () => {
    expect(formatMoney(Number.NaN)).toBe('—');
  });
});

describe('formatPriceGrouped', () => {
  it('крупная цена — два знака и разбитые разряды', () => {
    expect(formatPriceGrouped(118420.5)).toBe(`118${T}420.50`);
  });

  it('мелкий инструмент — четыре знака', () => {
    expect(formatPriceGrouped(0.23456)).toBe('0.2346');
  });

  it('пустое значение — прочерк', () => {
    expect(formatPriceGrouped(null)).toBe('—');
  });
});

describe('moneyClass', () => {
  it('прибыль и ноль — pos, убыток — neg', () => {
    expect(moneyClass(1)).toBe('pos');
    expect(moneyClass(0)).toBe('pos');
    expect(moneyClass(-0.01)).toBe('neg');
  });
});

describe('fmtPctSigned', () => {
  it('знак и отбивка перед процентом — те же, что у денег', () => {
    expect(fmtPctSigned(2.345)).toBe('+2.35 %');
    expect(fmtPctSigned(-1.1)).toBe('−1.10 %');
  });
});

describe('formatTradeDate', () => {
  it('formats an ISO date as ru-RU day/month, hour:minute', () => {
    const iso = '2026-07-09T14:23:00Z';
    const expected = new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(formatTradeDate(iso)).toBe(expected);
  });

  it('принимает locale и форматирует по нему', () => {
    const iso = '2026-07-09T14:23:00Z';
    const expected = new Date(iso).toLocaleString('en-US', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    expect(formatTradeDate(iso, 'en-US')).toBe(expected);
  });
});
