import { review, type CardState } from '../../model/srs';
import { gradeFor } from './run-deck';
import type { Effect, SoundName } from './types';

/** Чем страница исполняет побочное движка: мутации учебника и звук. */
export interface EffectDeps {
  now: number;
  /** Состояние карточки сейчас — из кэша, а не со старта забега. */
  stateOf: (cardId: string) => CardState | undefined;
  saveCard: (cardId: string, state: CardState) => void;
  answer: (itemId: string, unit: string, correct: boolean) => void;
  count: (counter: 'game' | 'phrases') => void;
  sound: (name: SoundName) => void;
}

/**
 * Эффекты шага — в мутации. Оценка карточки решается по её состоянию в момент
 * ответа (`gradeFor`): не тронутая карточка — всё равно занятие, и ответ идёт в
 * счётчик игры.
 */
export function applyEffects(effects: readonly Effect[], d: EffectDeps): void {
  for (const e of effects) {
    switch (e.kind) {
      case 'card': {
        const prev = d.stateOf(e.cardId);
        const grade = gradeFor(e.verdict, prev, d.now);
        if (grade === null) d.count('game');
        else d.saveCard(e.cardId, review(prev ?? null, grade, d.now));
        break;
      }
      case 'exercise':
        d.answer(e.itemId, e.unit, e.correct);
        break;
      case 'count':
        d.count(e.counter);
        break;
      case 'sound':
        d.sound(e.name);
        break;
    }
  }
}
