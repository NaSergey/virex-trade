import { describe, expect, it } from 'vitest';
import type { DeckCard } from '../../model/deck';
import { DAY, type CardState } from '../../model/srs';
import { RELIC_IDS } from '../content/relics';
import { currentExercise, startRun, step, toRunRow, type Action, type Fight, type RunState, type StartInput } from './engine';
import { reachable } from './map';
import type { Effect } from './types';

const NOW = Date.UTC(2026, 10, 4, 12);
const DECK: DeckCard[] = Array.from({ length: 30 }, (_, i) => ({
  id: `v:w${i}`,
  en: `word${i}`,
  ru: `слово${i}`,
  source: 'vocab',
  group: i % 2 ? 'food' : 'home',
  example: [`I like word${i} very much.`, `Мне очень нравится слово${i}.`],
}));
const DUE: CardState = { due: NOW - 2 * DAY, interval: 3, ease: 2.5, reps: 3, lapses: 0, firstAt: NOW - 30 * DAY, known: false };

const input = (p: Partial<StartInput> = {}): StartInput => ({
  id: 'run00000001',
  seed: 7,
  now: NOW,
  day: '2026-11-04',
  weather: 'clear',
  character: 'tourist',
  fog: 0,
  speech: true,
  deck: DECK,
  states: new Map(DECK.map((c) => [c.id, DUE])),
  newLimit: 20,
  lessons: new Set(),
  relics: RELIC_IDS,
  scenes: { open: ['sp'], levels: {}, recent: [] },
  ...p,
});

/** Шаг с проверкой, что действие принято. */
function go(s: RunState, a: Action): { state: RunState; effects: Effect[] } {
  const out = step(s, a);
  expect(out.state).not.toBe(s);
  return out;
}

const fightOf = (s: RunState): Fight => {
  if (s.screen.kind !== 'fight') throw new Error(`не бой: ${s.screen.kind}`);
  return s.screen.fight;
};

/** Первая станция ряда 1 и бой на ней, без знакомства. */
function firstFight(p: Partial<StartInput> = {}): RunState {
  let s = startRun(input(p));
  s = go(s, { type: 'go', station: reachable(s.map, null)[0], now: NOW }).state;
  while (fightOf(s).phase === 'intro') s = go(s, { type: 'next', now: NOW }).state;
  return s;
}

/** Верный ответ на текущее задание (вне окна крита, если `late`). */
function answerRight(s: RunState, late = true) {
  const ch = fightOf(s).challenge!;
  return go(s, { type: 'answer', value: ch.answer, now: NOW + (late ? 60_000 : 0) });
}

describe('движок забега', () => {
  it('старт: полное здоровье персонажа, карта, пустая статистика', () => {
    const s = startRun(input());
    expect(s).toMatchObject({ hp: 30, maxHp: 30, coins: 0, relics: ['umbrella'], screen: { kind: 'map' }, outcome: null });
    expect(s.map.some((x) => x.kind === 'boss')).toBe(true);
    expect(s.stats.v).toBe(1);
    expect(s.pool).not.toContain('umbrella');
  });

  it('недостижимая станция и чужое действие не меняют состояния', () => {
    const s = startRun(input());
    const boss = s.map.find((x) => x.kind === 'boss')!;
    expect(step(s, { type: 'go', station: boss.id, now: NOW }).state).toBe(s);
    expect(step(s, { type: 'mode', mode: 'recall', now: NOW }).state).toBe(s);
  });

  it('вспомнил слово со сроком: урон 5, карточка — «вспомнил»', () => {
    let s = firstFight();
    s = go(s, { type: 'mode', mode: 'recall', now: NOW }).state;
    const card = fightOf(s).card!;
    const hp = fightOf(s).foe.hp;
    const out = answerRight(s);
    expect(fightOf(out.state).foe.hp).toBe(hp - 5);
    expect(out.effects).toContainEqual({ kind: 'card', cardId: card.id, verdict: 'recall' });
    expect(out.state.stats.recalled).toBe(1);
  });

  it('быстрый ответ — крит', () => {
    let s = firstFight();
    s = go(s, { type: 'mode', mode: 'recall', now: NOW }).state;
    const hp = fightOf(s).foe.hp;
    s = answerRight(s, false).state;
    expect(fightOf(s).foe.hp).toBe(hp - 8);
    expect(fightOf(s).last?.crit).toBe(true);
  });

  it('ошибка: удар противника, карточка «не знаю», слово вернётся и второй раз карточку не трогает', () => {
    let s = firstFight();
    // Противник покрепче: слово вернётся через 3–5 ходов, бой должен дожить.
    s = structuredClone(s);
    Object.assign(fightOf(s).foe, { hp: 999, maxHp: 999 });
    s = go(s, { type: 'mode', mode: 'recall', now: NOW }).state;
    const card = fightOf(s).card!;
    let out = go(s, { type: 'answer', value: 'zzz', now: NOW + 60_000 });
    expect(out.effects).toContainEqual({ kind: 'card', cardId: card.id, verdict: 'wrong' });
    expect(out.state.hp).toBeLessThan(30 + 1);
    expect(out.state.combo).toBe(0);
    expect(out.state.cards.pending.some((p) => p.card.id === card.id)).toBe(true);
    s = out.state;
    for (let i = 0; i < 12; i++) {
      s = go(s, { type: 'next', now: NOW }).state;
      if (s.screen.kind !== 'fight') break;
      const f = fightOf(s);
      if (f.card?.id === card.id) {
        s = go(s, { type: 'mode', mode: 'recall', now: NOW }).state;
        out = answerRight(s);
        expect(out.effects.some((e) => e.kind === 'card')).toBe(false);
        expect(out.effects).toContainEqual({ kind: 'count', counter: 'game' });
        expect(out.state.stats.revenge).toBe(1);
        return;
      }
      s = go(s, { type: 'mode', mode: 'recall', now: NOW }).state;
      s = answerRight(s).state;
    }
    throw new Error('слово не вернулось');
  });

  it('голос: первая неудача — ещё попытка; две неудачи карточку не трогают; «Не помню» — трогает', () => {
    let s = firstFight();
    s = go(s, { type: 'mode', mode: 'speak', now: NOW }).state;
    let out = go(s, { type: 'answer', value: 'blah', now: NOW });
    expect(fightOf(out.state).phase).toBe('answer');
    expect(out.effects).toEqual([]);
    out = go(out.state, { type: 'answer', value: 'blah', now: NOW });
    expect(fightOf(out.state).phase).toBe('result');
    expect(out.effects.some((e) => e.kind === 'card')).toBe(false);

    let t = firstFight({ seed: 8 });
    t = go(t, { type: 'mode', mode: 'speak', now: NOW }).state;
    const card = fightOf(t).card!;
    out = go(t, { type: 'dontKnow', now: NOW });
    expect(out.effects).toContainEqual({ kind: 'card', cardId: card.id, verdict: 'wrong' });
  });

  it('противник убит — награда, выбор награды — карта', () => {
    let s = firstFight();
    for (let i = 0; i < 20 && s.screen.kind === 'fight'; i++) {
      const f = fightOf(s);
      if (f.phase === 'intro' || f.phase === 'result') s = go(s, { type: 'next', now: NOW }).state;
      else if (f.phase === 'choose') s = go(s, { type: 'mode', mode: 'recall', now: NOW }).state;
      else s = answerRight(s).state;
    }
    expect(s.screen.kind).toBe('reward');
    expect(s.coins).toBe(5);
    const reward = s.screen.kind === 'reward' ? s.screen.options.findIndex((o) => o.kind !== 'sharpen') : -1;
    s = go(s, { type: 'reward', index: reward }).state;
    expect(s.screen.kind).toBe('map');
    expect(s.stats.cleanFights).toBe(1);
  });

  it('хранитель: упражнение, ошибка пишется ответом упражнения', () => {
    let s = startRun(input());
    const boss = s.map.find((x) => x.kind === 'boss')!;
    s = { ...s, relics: [], at: boss.id, screen: { kind: 'bossIntro' } };
    s = go(s, { type: 'next', now: NOW }).state;
    const ex = currentExercise(s)!;
    expect(ex.type).toBe('choice');
    const out = go(s, { type: 'exercise', correct: false, now: NOW });
    expect(out.effects).toContainEqual({ kind: 'exercise', itemId: ex.id, unit: ex.unit, correct: false });
    expect(out.state.hp).toBe(30 - 7);
    expect(out.state.stats.boss).toMatchObject({ wrong: 1, reached: false });
  });

  it('здоровье кончилось — конец забега', () => {
    let s = firstFight();
    s = { ...s, hp: 1, relics: [] };
    s = go(s, { type: 'mode', mode: 'recall', now: NOW }).state;
    s = go(s, { type: 'answer', value: 'zzz', now: NOW }).state;
    s = go(s, { type: 'next', now: NOW }).state;
    expect(s.outcome).toBe('dead');
    expect(s.screen.kind).toBe('end');
    expect(toRunRow(s, NOW)).toMatchObject({ outcome: 'dead', depth: 1, character: 'tourist' });
  });

  it('сдаться можно с любого экрана', () => {
    const s = go(startRun(input()), { type: 'quit', now: NOW }).state;
    expect(s.outcome).toBe('quit');
  });

  it('состояние сериализуемо: после JSON тот же следующий шаг', () => {
    let s = firstFight();
    s = go(s, { type: 'mode', mode: 'recognize', now: NOW }).state;
    const copy = JSON.parse(JSON.stringify(s)) as RunState;
    const a: Action = { type: 'answer', value: 0, now: NOW + 1000 };
    expect(step(copy, a)).toEqual(step(s, a));
  });
});
