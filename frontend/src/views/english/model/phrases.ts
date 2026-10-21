import type { Exercise, Lesson } from '../content/types';
import { normalize } from './check';

/** Фраза для диктанта и произношения. */
export interface Phrase {
  en: string;
  ru: string;
  unit: string;
}

/**
 * Фразы открытых разделов: примеры уроков и правил, ответы переводов и
 * сборок. Одиночные слова не берутся — их тренируют карточки.
 */
export function phrasesFor(
  open: ReadonlySet<string>,
  lessons: ReadonlyMap<string, Lesson>,
  exercises: readonly Exercise[],
): Phrase[] {
  const out: Phrase[] = [];
  for (const unit of open) {
    for (const block of lessons.get(unit)?.blocks ?? []) {
      if (block.type === 'examples') for (const [en, ru] of block.items) out.push({ en, ru, unit });
      if (block.type === 'rule') for (const [, en, ru] of block.rows) out.push({ en, ru, unit });
    }
  }
  for (const e of exercises) {
    if (!open.has(e.unit)) continue;
    if (e.type === 'translate') out.push({ en: e.answers[0], ru: e.ru, unit: e.unit });
    if (e.type === 'order') out.push({ en: e.answers[0], ru: e.ru ?? '', unit: e.unit });
  }
  const seen = new Set<string>();
  return out.filter((p) => {
    const key = normalize(p.en);
    if (key.split(' ').length < 2 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
