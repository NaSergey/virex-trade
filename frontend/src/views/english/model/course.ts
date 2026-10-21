import type { Exercise, Section } from '../content/types';

/** Строка ответов с сервера (`english_answers`). */
export interface AnswerRow {
  itemId: string;
  unit: string;
  right: number;
  wrong: number;
  lastCorrect: boolean;
}

/** Текущий раздел — первый не пройденный; пройдено всё — null. */
export function currentSection(course: readonly Section[], done: ReadonlySet<string>): Section | null {
  return course.find((s) => !done.has(s.id)) ?? null;
}

/** Разделы, чьи слова и фразы открыты: пройденные и текущий. */
export function openUnits(course: readonly Section[], done: ReadonlySet<string>): Set<string> {
  const open = new Set(course.filter((s) => done.has(s.id)).map((s) => s.id));
  const current = currentSection(course, done);
  if (current) open.add(current.id);
  return open;
}

/** Упражнения раздела: у юнита — свои, у повторения — юнитов блока, у чтения — нет. */
export function sectionItems(section: Section, exercises: readonly Exercise[]): Exercise[] {
  if (section.kind === 'reading') return [];
  const units = new Set(section.kind === 'revision' ? section.covers : [section.id]);
  return exercises.filter((e) => units.has(e.unit));
}

/** Сколько упражнений решено: последний ответ верный. */
export function scoreOf(
  items: readonly Exercise[],
  answers: ReadonlyMap<string, AnswerRow>,
): { right: number; total: number } {
  const right = items.filter((e) => answers.get(e.id)?.lastCorrect).length;
  return { right, total: items.length };
}

/** Следующий раздел курса после `id`, подходящий под условие. */
export function nextSection(
  course: readonly Section[],
  id: string,
  accept: (s: Section) => boolean = () => true,
): Section | null {
  const from = course.findIndex((s) => s.id === id);
  return course.slice(from + 1).find(accept) ?? null;
}
