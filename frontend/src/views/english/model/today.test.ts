import { describe, expect, it } from 'vitest';
import type { Exercise, Section } from '../content/types';
import type { DayRow } from './activity';
import { activityLevel, dayTitle, doneLessons, mistakeCount, plural, practiceTarget } from './today';

const day = (p: Partial<DayRow>): DayRow => ({ day: '2026-10-21', cards: 0, answers: 0, correct: 0, phrases: 0, ...p });
const section = (id: string, kind: Section['kind'] = 'unit'): Section => ({
  id,
  kind,
  title: id,
  topic: '',
  grammar: [],
  sb: [1, 1],
  wb: null,
});
const ex = (unit: string): Exercise => ({ id: `${unit}-1`, unit, type: 'gap', q: 'a ___', answers: ['b'] });

describe('сегодня', () => {
  it('склонение', () => {
    const forms = ['карточка', 'карточки', 'карточек'] as const;
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111].map((n) => plural(n, forms))).toEqual([
      'карточка',
      'карточки',
      'карточек',
      'карточек',
      'карточек',
      'карточка',
      'карточки',
      'карточек',
      'карточек',
    ]);
  });

  it('ступени календаря', () => {
    expect([0, 1, 9, 10, 29, 30, 200].map(activityLevel)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });

  it('подсказка клетки', () => {
    expect(dayTitle('21 окт', day({ cards: 34, answers: 12, phrases: 3 }))).toBe(
      '21 окт: 34 карточки, 12 заданий, 3 фразы',
    );
    expect(dayTitle('21 окт', day({ cards: 1 }))).toBe('21 окт: 1 карточка');
    expect(dayTitle('21 окт', undefined)).toBe('21 окт: занятий нет');
  });

  it('практика — первый не пройденный раздел с заданиями', () => {
    const course = [section('a'), section('b', 'reading'), section('c'), section('d')];
    const items = [ex('a'), ex('c'), ex('d')];
    expect(practiceTarget(course, new Set(), items)?.id).toBe('a');
    expect(practiceTarget(course, new Set(['a']), items)?.id).toBe('c');
    expect(practiceTarget(course, new Set(['a', 'c', 'd']), items)).toBeNull();
  });

  it('ошибки и пройденные уроки', () => {
    const a = (id: string, lastCorrect: boolean) =>
      [id, { itemId: id, unit: 'u', right: 0, wrong: 0, lastCorrect }] as const;
    const items = [ex('x'), ex('y'), ex('z'), ex('w')].map((e, i) => ({ ...e, id: 'xyzw'[i] }));
    expect(mistakeCount(items, new Map([a('x', false), a('y', true), a('z', false), a('gone', false)]))).toBe(2);
    const dates = new Map([
      ['a', 1],
      ['b', 3],
      ['c', 2],
    ]);
    expect(doneLessons(dates).map((l) => l.id)).toEqual(['b', 'c', 'a']);
  });
});
