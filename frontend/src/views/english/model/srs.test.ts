import { describe, expect, it } from 'vitest';
import { DAY, MIN, delayLabel, relearn, review, type CardState } from './srs';

const NOW = Date.UTC(2026, 9, 21, 12);

describe('review — новое слово', () => {
  it('шаги: 1 мин, 10 мин, 1 день', () => {
    expect(review(null, 0, NOW).due - NOW).toBe(MIN);
    expect(review(null, 1, NOW).due - NOW).toBe(10 * MIN);
    expect(review(null, 2, NOW).due - NOW).toBe(DAY);
  });

  it('«знаю» — сразу выучено', () => {
    expect(review(null, 3, NOW)).toMatchObject({ known: true, reps: 1, firstAt: NOW });
  });

  it('«не знаю» и «трудно» оставляют слово в изучении', () => {
    expect(review(null, 0, NOW).interval).toBe(0);
    expect(review(null, 1, NOW).interval).toBe(0);
    expect(review(null, 2, NOW).interval).toBe(1);
  });

  it('первый ответ ставит firstAt, следующий его не трогает', () => {
    const first = review(null, 0, NOW);
    expect(first.firstAt).toBe(NOW);
    expect(review(first, 2, NOW + MIN).firstAt).toBe(NOW);
    expect(first).toMatchObject({ reps: 1, lapses: 0, ease: 2.5 });
  });
});

describe('review — выученное слово', () => {
  const learned: CardState = { due: NOW, interval: 4, ease: 2.5, reps: 3, lapses: 0, firstAt: NOW - 10 * DAY, known: false };

  it('«помню» — интервал × ease', () => {
    const next = review(learned, 2, NOW);
    expect(next.interval).toBe(10);
    expect(next.due).toBe(NOW + 10 * DAY);
  });

  it('«трудно» — × 1.2, но не меньше +1 дня; ease падает', () => {
    expect(review(learned, 1, NOW).interval).toBe(5);
    expect(review({ ...learned, interval: 1 }, 1, NOW).interval).toBe(2);
    expect(review(learned, 1, NOW).ease).toBeCloseTo(2.35);
  });

  it('«не знаю» — забыто: снова в изучении через 10 минут', () => {
    const next = review(learned, 0, NOW);
    expect(next).toMatchObject({ interval: 0, lapses: 1, due: NOW + 10 * MIN });
    expect(next.ease).toBeCloseTo(2.3);
  });

  it('ease не ниже 1.3, интервал не больше года', () => {
    expect(review({ ...learned, ease: 1.3 }, 0, NOW).ease).toBe(1.3);
    expect(review({ ...learned, interval: 300 }, 2, NOW).interval).toBe(365);
  });

  it('«знаю» у выученного — тоже насовсем, вернуть — relearn', () => {
    const known = review(learned, 3, NOW);
    expect(known).toMatchObject({ known: true, interval: 4 });
    expect(relearn(known, NOW + 1)).toMatchObject({ known: false, interval: 0, due: NOW + 1 });
  });
});

describe('delayLabel', () => {
  it('минуты, часы, дни, месяцы', () => {
    expect(delayLabel(MIN)).toBe('1 мин');
    expect(delayLabel(10 * MIN)).toBe('10 мин');
    expect(delayLabel(3 * 60 * MIN)).toBe('3 ч');
    expect(delayLabel(DAY)).toBe('1 д');
    expect(delayLabel(45 * DAY)).toBe('1.5 мес');
    expect(delayLabel(365 * DAY)).toBe('1 г');
  });
});
