import type { Exercise } from '../content/types';
import { fillGap } from './check';

/** Полная фраза с ответом — для показа и озвучки. Подсказки в скобках из неё уходят. */
export function fullSentence(e: Exercise): string {
  switch (e.type) {
    case 'choice':
      return fillGap(e.q, e.options[e.answer]).replace(/\s*\([^)]*\)/g, '');
    case 'gap':
      return fillGap(e.q, e.answers[0]).replace(/\s*\([^)]*\)/g, '');
    default:
      return e.answers[0];
  }
}
