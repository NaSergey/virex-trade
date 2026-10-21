import type { Exercise, Section } from '../content/types';
import { activityOf, type DayRow } from './activity';
import { sectionItems, type AnswerRow } from './course';

/** Цели дня: ответов в практике и фраз в слухе и речи. */
export const GOAL_ANSWERS = 10;
export const GOAL_PHRASES = 5;

/** Склонение по числу: `plural(2, ['карточка', 'карточки', 'карточек'])`. */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const m100 = Math.abs(n) % 100;
  const m10 = m100 % 10;
  if (m100 > 10 && m100 < 20) return forms[2];
  if (m10 === 1) return forms[0];
  if (m10 >= 2 && m10 <= 4) return forms[1];
  return forms[2];
}

/** Ступень заливки клетки календаря: 0 — пусто, 1 — 1–9, 2 — 10–29, 3 — 30 и больше. */
export function activityLevel(n: number): 0 | 1 | 2 | 3 {
  if (n <= 0) return 0;
  if (n < 10) return 1;
  if (n < 30) return 2;
  return 3;
}

/** Подсказка клетки: «21 окт: 34 карточки, 12 заданий, 3 фразы»; пустой день — «21 окт: занятий нет». */
export function dayTitle(label: string, row: DayRow | undefined): string {
  if (!row || activityOf(row) === 0) return `${label}: занятий нет`;
  const parts = [
    row.cards ? `${row.cards} ${plural(row.cards, ['карточка', 'карточки', 'карточек'])}` : '',
    row.answers ? `${row.answers} ${plural(row.answers, ['задание', 'задания', 'заданий'])}` : '',
    row.phrases ? `${row.phrases} ${plural(row.phrases, ['фраза', 'фразы', 'фраз'])}` : '',
  ].filter(Boolean);
  return `${label}: ${parts.join(', ')}`;
}

/**
 * Раздел для сегодняшней практики: первый не пройденный, у которого есть задания
 * (чтение и разделы без упражнений пропускаются). Пройдено всё — null.
 */
export function practiceTarget(
  course: readonly Section[],
  done: ReadonlySet<string>,
  exercises: readonly Exercise[],
): Section | null {
  return course.find((s) => !done.has(s.id) && sectionItems(s, exercises).length > 0) ?? null;
}

/** Сколько заданий курса сейчас с неверным последним ответом — как считает «Работа над ошибками». */
export function mistakeCount(exercises: readonly Exercise[], answers: ReadonlyMap<string, AnswerRow>): number {
  return exercises.filter((e) => answers.get(e.id)?.lastCorrect === false).length;
}

/** Пройденные разделы, свежие сверху: id и время отметки. */
export function doneLessons(dates: ReadonlyMap<string, number>): { id: string; at: number }[] {
  return [...dates].map(([id, at]) => ({ id, at })).sort((a, b) => b.at - a.at);
}
