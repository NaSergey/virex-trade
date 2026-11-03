import { COURSE } from '../../content';
import { B1 } from '../../content/units/b1';
import { B2 } from '../../content/units/b2';
import { B3 } from '../../content/units/b3';
import { B4 } from '../../content/units/b4';
import { B5 } from '../../content/units/b5';
import { B6 } from '../../content/units/b6';
import { B7 } from '../../content/units/b7';
import { B8 } from '../../content/units/b8';

/**
 * Хранители линий — по блоку книги текущего раздела. Блок — файл материала
 * `b1`…`b8`, где лежат слова, уроки и упражнения раздела.
 */
export interface BossDef {
  block: number;
  name: string;
  /** Чем держит туман — строкой на экране хранителя. */
  grammar: string;
}

export const BOSSES: BossDef[] = [
  { block: 1, name: 'Смотритель Am-Is-Are', grammar: 'to be, a / an, my / your, his / her' },
  { block: 2, name: 'Мистер Апостроф', grammar: 'вопросы с to be, притяжательный ’s, множественное число' },
  { block: 3, name: 'Леди This-That', grammar: 'отрицание, this / that / these / those, предлоги места' },
  { block: 4, name: 'Барон Have-Got', grammar: 'have got' },
  { block: 5, name: 'Капитан There-Is', grammar: 'there is / are, повелительное, let’s' },
  { block: 6, name: 'Мадам Can', grammar: 'can, like, him / her' },
  { block: 7, name: 'Профессор Present', grammar: 'Present Simple, who / what / where' },
  { block: 8, name: 'Король Do-Does', grammar: 'Present Simple: отрицание и вопросы' },
];

const BLOCK_OF: ReadonlyMap<string, number> = new Map(
  [B1, B2, B3, B4, B5, B6, B7, B8].flatMap((b, i) =>
    [...b.words.map((w) => w.unit), ...b.lessons.map((l) => l.unit), ...b.exercises.map((e) => e.unit)].map(
      (unit) => [unit, i + 1] as const,
    ),
  ),
);

/**
 * Блок раздела. Раздела нет в файлах материала (пустое повторение) — блок
 * ближайшего раздела перед ним по курсу.
 */
export function blockOf(sectionId: string): number {
  const at = COURSE.findIndex((s) => s.id === sectionId);
  for (let i = at; i >= 0; i--) {
    const block = BLOCK_OF.get(COURSE[i].id);
    if (block) return block;
  }
  return BLOCK_OF.get(sectionId) ?? 1;
}

/** Разделы курса блока по порядку. */
export const unitsOfBlock = (block: number): string[] => COURSE.filter((s) => blockOf(s.id) === block).map((s) => s.id);
