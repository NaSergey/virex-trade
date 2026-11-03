import { describe, expect, it, vi } from 'vitest';
import { DAY, review, type CardState } from '../../model/srs';
import { applyEffects, type EffectDeps } from './effects';

const NOW = Date.UTC(2026, 10, 4, 12);
const DUE: CardState = { due: NOW - DAY, interval: 5, ease: 2.5, reps: 4, lapses: 0, firstAt: NOW - 40 * DAY, known: false };

function deps(states: Record<string, CardState> = {}): EffectDeps & { calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = { saveCard: [], answer: [], count: [], sound: [] };
  const rec =
    (name: string) =>
    (...args: unknown[]) =>
      calls[name].push(args);
  return {
    now: NOW,
    stateOf: (id) => states[id],
    saveCard: vi.fn(rec('saveCard')),
    answer: vi.fn(rec('answer')),
    count: vi.fn(rec('count')),
    sound: vi.fn(rec('sound')),
    calls,
  };
}

describe('исполнение эффектов забега', () => {
  it('узнал выученное со сроком — карточку не трогает, ответ идёт в счётчик игры', () => {
    const d = deps({ 'v:house': DUE });
    applyEffects([{ kind: 'card', cardId: 'v:house', verdict: 'recognize' }], d);
    expect(d.calls.saveCard).toHaveLength(0);
    expect(d.calls.count).toEqual([['game']]);
  });

  it('новое слово: узнал — шаг изучения «трудно» от пустого состояния', () => {
    const d = deps();
    applyEffects([{ kind: 'card', cardId: 'v:cat', verdict: 'recognize' }], d);
    expect(d.calls.saveCard).toEqual([['v:cat', review(null, 1, NOW)]]);
  });

  it('вспомнил выученное — «помню» от свежего состояния', () => {
    const d = deps({ 'v:house': DUE });
    applyEffects([{ kind: 'card', cardId: 'v:house', verdict: 'recall' }], d);
    expect(d.calls.saveCard).toEqual([['v:house', review(DUE, 2, NOW)]]);
  });

  it('упражнение, счётчик и звук — своим исполнителям', () => {
    const d = deps();
    applyEffects(
      [
        { kind: 'exercise', itemId: 'u01-03', unit: 'u01', correct: false },
        { kind: 'count', counter: 'phrases' },
        { kind: 'sound', name: 'hit' },
      ],
      d,
    );
    expect(d.calls.answer).toEqual([['u01-03', 'u01', false]]);
    expect(d.calls.count).toEqual([['phrases']]);
    expect(d.calls.sound).toEqual([['hit']]);
  });
});
