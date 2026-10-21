/**
 * Материал учебника английского — статика фронта (спека
 * docs/superpowers/specs/2026-10-21-english-course-design.md). Книга —
 * Friends Starter, Students' Book (SB) и Workbook (WB); номер страницы PDF
 * совпадает с номером в книге. Тексты и упражнения книги не копируются: слова —
 * из её словаря (SB 92–95), остальное написано своё, со ссылками на страницы.
 */

/** `unit` — урок с грамматикой и практикой; `revision` — повторение блока; `reading` — чтение. */
export type SectionKind = 'unit' | 'revision' | 'reading';

/** Раздел курса, в порядке книги (`COURSE`). */
export interface Section {
  /** `sp`, `u01`…`u24`, `r1`…`r8`, `rc1`, `cc1`, `rc2`, `cc2`, `autumn`…`summer`, `play`. */
  id: string;
  kind: SectionKind;
  /** Название как в книге: «Unit 4 · My World». */
  title: string;
  /** Тема по-русски. */
  topic: string;
  /** Грамматика раздела короткими строками по-русски. */
  grammar: string[];
  /** Страницы Students' Book, с — по. */
  sb: [number, number];
  /** Страницы Workbook; null — в тетради раздела нет. */
  wb: [number, number] | null;
  /** У повторения — какие юниты оно повторяет. */
  covers?: string[];
}

export interface Word {
  /** Как в словаре книги: «Nice to meet you.», «colour (n / v)» → «colour». */
  en: string;
  ru: string;
  /** id раздела, в словаре которого стоит слово. */
  unit: string;
  /** Свой пример: [английский, русский]. */
  example?: [string, string];
}

/**
 * Блок урока. В `p` и `note` звёздочки выделяют: `*am*` → жирное. Пары
 * `examples` и примеры `rule` озвучиваются.
 */
export type Block =
  | { type: 'p'; text: string }
  /** Строки — [форма, пример, перевод примера]. */
  | { type: 'rule'; title?: string; rows: [string, string, string][] }
  /** Пары [английский, русский]. */
  | { type: 'examples'; items: [string, string][] }
  /** На что обратить внимание — чаще всего типичная ошибка русскоговорящего. */
  | { type: 'note'; text: string }
  /** Задание по книге: «SB стр. 16–17: …», «WB стр. 10: …». */
  | { type: 'book'; items: string[] };

export interface Lesson {
  unit: string;
  blocks: Block[];
}

/**
 * Упражнение. Пропуск в `q` — `___` (ровно один). Ответы сравниваются
 * нормализованными (`model/check.ts`): регистр, пунктуация и сокращения не важны.
 */
export type Exercise = { id: string; unit: string } & (
  /** Выбрать вариант для пропуска; `answer` — индекс в `options`. */
  | { type: 'choice'; q: string; options: string[]; answer: number; ru?: string }
  /** Вписать пропущенное; допустимые ответы — все. */
  | { type: 'gap'; q: string; answers: string[]; ru?: string }
  /** Собрать предложение из слов; первое в `answers` — основное. */
  | { type: 'order'; words: string[]; answers: string[]; ru?: string }
  /** Перевести с русского; первое в `answers` — основное. */
  | { type: 'translate'; ru: string; answers: string[] }
);

/** Файл материала — блок книги из трёх юнитов с их повторением и чтением. */
export interface ContentBlock {
  words: Word[];
  lessons: Lesson[];
  exercises: Exercise[];
}
