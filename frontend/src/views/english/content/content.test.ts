import { describe, expect, it } from 'vitest';
import { COURSE, EXERCISES, LESSONS, SECTION_BY_ID, WORDS } from './index';
import type { Exercise } from './types';

/**
 * Целостность материала. Проверки «у юнита есть слова и упражнения» идут по
 * заполненным разделам — тем, у кого уже есть урок; что заполнены все, держит
 * последний тест.
 */

const CYRILLIC = /[а-яё]/i;
const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort();

const filled = COURSE.filter((s) => LESSONS.has(s.id));
const englishOf = (e: Exercise): string[] => {
  switch (e.type) {
    case 'choice':
      return [e.q, ...e.options];
    case 'gap':
      return [e.q, ...e.answers];
    case 'order':
      return [...e.words, ...e.answers];
    case 'translate':
      return e.answers;
  }
};

describe('материал курса', () => {
  it('id разделов уникальны, повторения ссылаются на юниты', () => {
    expect(new Set(COURSE.map((s) => s.id)).size).toBe(COURSE.length);
    for (const s of COURSE) {
      if (s.kind !== 'revision') continue;
      expect(s.covers?.length, s.id).toBeGreaterThan(0);
      for (const c of s.covers ?? []) expect(SECTION_BY_ID.get(c)?.kind, `${s.id} → ${c}`).toBe('unit');
    }
  });

  it('слова: раздел из курса, id карточки уникален, английский — латиницей, перевод — по-русски', () => {
    const ids = new Set<string>();
    for (const w of WORDS) {
      const id = `${w.unit}:${w.en}`;
      expect(SECTION_BY_ID.has(w.unit), id).toBe(true);
      expect(SECTION_BY_ID.get(w.unit)?.kind, id).not.toBe('revision');
      expect(ids.has(id), `повтор ${id}`).toBe(false);
      ids.add(id);
      expect(w.en.trim(), id).toBe(w.en);
      // Пометки части речи словаря («(n)», «(adj)») озвучка прочла бы вслух.
      expect(/\((?:n|v|adj|adv)\b/.test(w.en), id).toBe(false);
      expect(CYRILLIC.test(w.en), id).toBe(false);
      expect(CYRILLIC.test(w.ru), id).toBe(true);
      if (w.example) {
        expect(CYRILLIC.test(w.example[0]), id).toBe(false);
        expect(CYRILLIC.test(w.example[1]), id).toBe(true);
      }
    }
  });

  it('упражнения: id уникальны и начинаются с раздела, раздел — юнит', () => {
    const ids = new Set<string>();
    for (const e of EXERCISES) {
      expect(ids.has(e.id), `повтор ${e.id}`).toBe(false);
      ids.add(e.id);
      expect(e.id.startsWith(`${e.unit}-`), e.id).toBe(true);
      expect(SECTION_BY_ID.get(e.unit)?.kind, e.id).toBe('unit');
      for (const s of englishOf(e)) expect(CYRILLIC.test(s), `${e.id}: ${s}`).toBe(false);
    }
  });

  it('упражнения: каждое решаемо', () => {
    for (const e of EXERCISES) {
      if (e.type === 'choice') {
        expect(e.q.split('___').length, e.id).toBe(2);
        expect(e.options.length, e.id).toBeGreaterThanOrEqual(2);
        expect(new Set(e.options).size, e.id).toBe(e.options.length);
        expect(e.answer >= 0 && e.answer < e.options.length, e.id).toBe(true);
      } else if (e.type === 'gap') {
        expect(e.q.split('___').length, e.id).toBe(2);
        expect(e.answers.length, e.id).toBeGreaterThan(0);
      } else if (e.type === 'order') {
        expect(e.answers.length, e.id).toBeGreaterThan(0);
        for (const a of e.answers) expect(tokens(a), `${e.id}: ${a}`).toEqual(tokens(e.words.join(' ')));
      } else {
        expect(CYRILLIC.test(e.ru), e.id).toBe(true);
        expect(e.answers.length, e.id).toBeGreaterThan(0);
      }
      if ('ru' in e && e.ru && e.type !== 'translate') expect(CYRILLIC.test(e.ru), e.id).toBe(true);
    }
  });

  it('уроки: раздел из курса, есть задание по книге', () => {
    for (const [unit, lesson] of LESSONS) {
      expect(SECTION_BY_ID.has(unit), unit).toBe(true);
      expect(lesson.blocks.some((b) => b.type === 'book'), unit).toBe(true);
      for (const b of lesson.blocks) {
        if (b.type === 'rule') for (const r of b.rows) expect(r.length, unit).toBe(3);
        if (b.type === 'examples') for (const [en] of b.items) expect(CYRILLIC.test(en), `${unit}: ${en}`).toBe(false);
      }
    }
  });

  it('заполненные разделы: у юнита — слова и все четыре вида упражнений, у остальных упражнений нет', () => {
    for (const s of filled) {
      const words = WORDS.filter((w) => w.unit === s.id);
      const items = EXERCISES.filter((e) => e.unit === s.id);
      if (s.kind === 'unit') {
        expect(words.length, s.id).toBeGreaterThanOrEqual(5);
        expect(items.length, s.id).toBeGreaterThanOrEqual(10);
        expect(new Set(items.map((e) => e.type)).size, s.id).toBe(4);
      } else if (s.kind === 'reading') {
        expect(words.length, s.id).toBeGreaterThan(0);
        expect(items.length, s.id).toBe(0);
      } else {
        expect(words.length + items.length, s.id).toBe(0);
      }
    }
  });
});
