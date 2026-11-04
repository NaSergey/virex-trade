import { describe, expect, it } from 'vitest';
import { rand } from '../../game/model/rng';
import { REACTION_HINT, SAVES, battleOrder, fight, finishBattle, intentOf, react, startBattle } from './battle';
import { glossOf, tokens } from './gloss';
import {
  BUILDINGS,
  OBJECTS,
  ROLE_PERK,
  VERBS,
  endDay,
  giveOrder,
  newGame,
  present,
  type HoldState,
  type Order,
  type PersonId,
} from './rules';
import { makePlaces, makeReport } from './scout';
import { answerVisitor, rollVisitor } from './visitors';

/** Все тексты, которые игра показывает по-английски: прогон ботом плюс справочные строки. */
function allTexts(): string[] {
  const out = new Set<string>();
  const add = (...xs: (string | undefined | null)[]) => xs.forEach((x) => x && out.add(x));
  add(...VERBS, ...OBJECTS, ...Object.values(ROLE_PERK), ...Object.values(REACTION_HINT));
  for (const b of Object.values(BUILDINGS)) add(b.gives);
  for (let seed = 1; seed <= 40; seed++) {
    let s: HoldState = newGame(seed);
    add(...s.report);
    for (let d = 0; d < 30 && !s.outcome; d++) {
      const plan: [PersonId, Order][] = [
        ['mira', d % 5 === 3 ? { verb: 'search', object: 'the mill' } : { verb: 'go', object: 'hunting' }],
        [
          'ash',
          d % 4 === 0
            ? {
                verb: 'scout',
                object: (['the north', 'the east', 'the south', 'the west'] as const)[d % 4 === 0 ? (d / 4) % 4 : 0],
              }
            : { verb: 'fetch', object: 'water' },
        ],
        ['tom', d % 3 === 0 ? { verb: 'build', object: 'the wall' } : { verb: 'guard', object: 'the gate' }],
        ['ezra', d % 2 ? { verb: 'chop', object: 'wood' } : { verb: 'mine', object: 'iron' }],
      ];
      for (const [id, o] of plan) s = giveOrder(s, id, o).state;
      if (s.visitor) {
        add(s.visitor.speech, s.visitor.detail, ...s.visitor.options.map((o) => o.text));
        for (const o of s.visitor.options) add(...answerVisitor(s, o.id).lines);
        s = answerVisitor(s, s.visitor.options[seed % s.visitor.options.length].id).state;
      }
      if (s.tonight) {
        s = startBattle(s);
        for (let round = 0; round < 6 && s.battle && s.battle.phase !== 'over'; round++) {
          const b = s.battle;
          for (const e of b.enemies) add(intentOf(s, e), e.name);
          const foe = b.enemies.find((e) => e.hp > 0);
          for (const p of present(s)) {
            const label = (seed + round) % 3 === 0 && foe ? foe.name : seed % 2 ? 'Mira' : (foe?.name ?? 'Mira');
            s = battleOrder(s, p.id, p.id === 'ezra' ? 'heal' : p.id === 'tom' ? 'cover' : 'attack', label).state;
          }
          s = fight(s);
          s.battle?.hits.forEach((h, i) => (s = react(s, i, (seed + i) % 2 ? SAVES[h.verb] : null)));
          add(...(s.battle?.last ?? []));
        }
        s = finishBattle(s);
      }
      s = endDay(s);
      add(...s.report);
      for (const r of s.reports ?? []) add(...r.lines, r.question, ...r.options);
      s = { ...s, reports: [] };
    }
  }
  const r = rand(5);
  for (let i = 0; i < 300; i++) {
    const places = makePlaces(r);
    for (const id of ['mill', 'ruins', 'farm', 'cave'] as const) {
      const rep = makeReport(r, 'ash', id, places[id]);
      add(...rep.lines, rep.question, ...rep.options);
    }
    const v = rollVisitor(r, { ...newGame(i), day: 5 });
    if (v) add(v.speech, v.detail, ...v.options.map((o) => o.text));
  }
  return [...out];
}

describe('перевод по нажатию', () => {
  it('у каждого слова в текстах игры есть перевод', () => {
    const missing = new Set<string>();
    for (const t of allTexts()) for (const k of tokens(t)) if (k.word && !glossOf(k.text)) missing.add(k.text.toLowerCase());
    expect([...missing].sort()).toEqual([]);
  });

  it('формы сводятся к словарной', () => {
    expect(glossOf('wolves')?.en).toBe('wolf');
    expect(glossOf('Killed')?.en).toBe('kill');
    expect(glossOf('Ash’s')?.en).toBe('Ash');
    expect(glossOf('xqzv')).toBeNull();
  });

  it('текст режется на слова и промежутки без потерь', () => {
    const t = '“I will bite the healer!”';
    expect(
      tokens(t)
        .map((k) => k.text)
        .join(''),
    ).toBe(t);
    expect(
      tokens(t)
        .filter((k) => k.word)
        .map((k) => k.text),
    ).toEqual(['I', 'will', 'bite', 'the', 'healer']);
  });
});
