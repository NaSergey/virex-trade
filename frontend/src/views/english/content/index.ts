import { COURSE } from './course';
import type { Exercise, Lesson, Section, Word } from './types';
import { B1 } from './units/b1';
import { B2 } from './units/b2';
import { B3 } from './units/b3';
import { B4 } from './units/b4';
import { B5 } from './units/b5';
import { B6 } from './units/b6';
import { B7 } from './units/b7';
import { B8 } from './units/b8';

const BLOCKS = [B1, B2, B3, B4, B5, B6, B7, B8];

export { COURSE };
export const WORDS: Word[] = BLOCKS.flatMap((b) => b.words);
export const EXERCISES: Exercise[] = BLOCKS.flatMap((b) => b.exercises);
export const LESSONS: ReadonlyMap<string, Lesson> = new Map(
  BLOCKS.flatMap((b) => b.lessons).map((l) => [l.unit, l]),
);
export const SECTION_BY_ID: ReadonlyMap<string, Section> = new Map(COURSE.map((s) => [s.id, s]));
