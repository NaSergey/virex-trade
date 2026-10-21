import { describe, expect, it } from 'vitest';
import type { Exercise, Section } from '../content/types';
import { currentSection, nextSection, openUnits, scoreOf, sectionItems, type AnswerRow } from './course';

const sec = (id: string, kind: Section['kind'] = 'unit', covers?: string[]): Section => ({
  id,
  kind,
  title: id,
  topic: '',
  grammar: [],
  sb: [1, 1],
  wb: null,
  covers,
});
const COURSE = [sec('u01'), sec('u02'), sec('r1', 'revision', ['u01', 'u02']), sec('rc1', 'reading')];
const ex = (id: string, unit: string): Exercise => ({ id, unit, type: 'gap', q: '___', answers: ['a'] });
const EXERCISES = [ex('u01-01', 'u01'), ex('u01-02', 'u01'), ex('u02-01', 'u02')];

describe('курс', () => {
  it('текущий — первый не пройденный, даже если дальше есть пройденные', () => {
    expect(currentSection(COURSE, new Set(['u02']))?.id).toBe('u01');
    expect(currentSection(COURSE, new Set(COURSE.map((s) => s.id)))).toBeNull();
  });

  it('открыты пройденные и текущий', () => {
    expect([...openUnits(COURSE, new Set(['u01']))].sort()).toEqual(['u01', 'u02']);
  });

  it('у повторения — упражнения его юнитов, у чтения — нет', () => {
    expect(sectionItems(COURSE[2], EXERCISES).map((e) => e.id)).toEqual(['u01-01', 'u01-02', 'u02-01']);
    expect(sectionItems(COURSE[0], EXERCISES)).toHaveLength(2);
    expect(sectionItems(COURSE[3], EXERCISES)).toEqual([]);
  });

  it('решено — по последнему ответу', () => {
    const row = (itemId: string, lastCorrect: boolean): [string, AnswerRow] => [
      itemId,
      { itemId, unit: 'u01', right: 1, wrong: 1, lastCorrect },
    ];
    const answers = new Map([row('u01-01', true), row('u01-02', false)]);
    expect(scoreOf(sectionItems(COURSE[0], EXERCISES), answers)).toEqual({ right: 1, total: 2 });
  });

  it('следующий раздел с условием', () => {
    expect(nextSection(COURSE, 'u01')?.id).toBe('u02');
    expect(nextSection(COURSE, 'u02', (s) => s.kind === 'reading')?.id).toBe('rc1');
    expect(nextSection(COURSE, 'rc1')).toBeNull();
  });
});
