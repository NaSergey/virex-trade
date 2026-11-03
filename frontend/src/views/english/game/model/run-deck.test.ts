import { describe, expect, it } from 'vitest';
import type { DeckCard } from '../../model/deck';
import { DAY, MIN, type CardState } from '../../model/srs';
import { rand } from './rng';
import {
  buildRunDeck,
  fogCount,
  gradeFor,
  isTypo,
  scheduleIntro,
  scheduleMistake,
  serve,
  settle,
  startDeck,
  type DeckState,
} from './run-deck';
import type { RunCard } from './types';

const NOW = Date.UTC(2026, 10, 4, 12);
const card = (id: string): DeckCard => ({ id, en: id, ru: `ru-${id}`, source: 'vocab', group: 'food' });
const state = (p: Partial<CardState>): CardState => ({
  due: NOW,
  interval: 3,
  ease: 2.5,
  reps: 3,
  lapses: 0,
  firstAt: NOW - 30 * DAY,
  known: false,
  ...p,
});
const run = (id: string, tag: RunCard['tag'] = 'due'): RunCard => ({ id, en: id, ru: id, group: null, tag, overdueDays: 0 });

describe('оценка карточки по ответу в игре', () => {
  it('новая и в изучении: вспомнил — «помню», узнал или опечатка — «трудно», ошибся — «не знаю»', () => {
    expect(gradeFor('recall', undefined, NOW)).toBe(2);
    expect(gradeFor('recognize', undefined, NOW)).toBe(1);
    expect(gradeFor('typo', undefined, NOW)).toBe(1);
    expect(gradeFor('wrong', undefined, NOW)).toBe(0);
    const learning = state({ interval: 0, due: NOW - MIN });
    expect(gradeFor('recognize', learning, NOW)).toBe(1);
    expect(gradeFor('recall', learning, NOW)).toBe(2);
  });

  it('повтор со сроком: узнавание интервал не трогает, вспоминание и ошибка — трогают', () => {
    const due = state({ due: NOW - 2 * DAY });
    expect(gradeFor('recognize', due, NOW)).toBeNull();
    expect(gradeFor('recall', due, NOW)).toBe(2);
    expect(gradeFor('typo', due, NOW)).toBe(1);
    expect(gradeFor('wrong', due, NOW)).toBe(0);
  });

  it('срок не наступил или «знаю» — карточку не трогать', () => {
    expect(gradeFor('recall', state({ due: NOW + DAY }), NOW)).toBeNull();
    expect(gradeFor('wrong', state({ due: NOW + DAY }), NOW)).toBeNull();
    expect(gradeFor('recall', state({ known: true }), NOW)).toBeNull();
  });
});

describe('колода забега', () => {
  const deck = Array.from({ length: 80 }, (_, i) => card(`w${i}`));

  it('просроченные первыми, по сроку; новых — не больше 6 и остатка лимита', () => {
    const states = new Map<string, CardState>([
      ['w5', state({ due: NOW - DAY })],
      ['w3', state({ due: NOW - 5 * DAY })],
      ['w9', state({ due: NOW + 3 * DAY })],
      ['w10', state({ known: true })],
    ]);
    const out = buildRunDeck({ deck, states, now: NOW, newLimit: 20 }, rand(1));
    expect(out.slice(0, 2).map((c) => c.id)).toEqual(['w3', 'w5']);
    expect(out[0]).toMatchObject({ tag: 'due', overdueDays: 5 });
    expect(out.filter((c) => c.tag === 'new')).toHaveLength(6);
    expect(out.find((c) => c.id === 'w9')?.tag).toBe('ahead');
    expect(out.find((c) => c.id === 'w10')?.tag).toBe('filler');
    expect(out.length).toBeLessThanOrEqual(60);
  });

  it('лимит новых на сегодня почти исчерпан — новых столько, сколько осталось', () => {
    const states = new Map<string, CardState>(
      Array.from({ length: 18 }, (_, i) => [`w${60 + i}`, state({ firstAt: NOW - MIN, interval: 1, due: NOW + DAY })]),
    );
    const out = buildRunDeck({ deck, states, now: NOW, newLimit: 20 }, rand(1));
    expect(out.filter((c) => c.tag === 'new')).toHaveLength(2);
  });

  it('туман — карточки со сроком', () => {
    const states = new Map<string, CardState>([
      ['w1', state({ due: NOW - DAY })],
      ['w2', state({ due: NOW + DAY })],
      ['w3', state({ due: NOW - DAY, known: true })],
    ]);
    expect(fogCount(deck, states, NOW)).toBe(1);
  });
});

describe('ход колоды в забеге', () => {
  const base = (cards: RunCard[]): DeckState => startDeck(cards);

  it('новое — не чаще раза в 4 хода', () => {
    let ds = base([run('a', 'new'), run('b', 'new'), run('c'), run('d'), run('e'), run('f'), run('g')]);
    const tags: string[] = [];
    for (let i = 0; i < 7; i++) {
      const got = serve(ds, rand(i))!;
      tags.push(got.card.tag);
      ds = settle(got.ds, got.card);
    }
    const firstNew = tags.indexOf('new');
    const secondNew = tags.indexOf('new', firstNew + 1);
    expect(secondNew - firstNew).toBeGreaterThanOrEqual(4);
  });

  it('ошибка возвращает слово через 3–5 ходов, не больше двух раз; знакомство — через 2–4', () => {
    let ds = base(Array.from({ length: 10 }, (_, i) => run(`x${i}`)));
    const first = serve(ds, rand(1))!;
    ds = scheduleMistake(first.ds, first.card, rand(2));
    const back = ds.pending.find((p) => p.card.id === first.card.id)!;
    expect(back.turn - ds.turn).toBeGreaterThanOrEqual(3);
    expect(back.turn - ds.turn).toBeLessThanOrEqual(5);
    ds = scheduleMistake({ ...ds, pending: [] }, first.card, rand(3));
    ds = scheduleMistake({ ...ds, pending: [] }, first.card, rand(4));
    expect(ds.pending).toHaveLength(0);

    const intro = scheduleIntro(base([run('n', 'new')]), run('n', 'new'), rand(5));
    expect(intro.pending[0].turn - intro.turn).toBeGreaterThanOrEqual(2);
    expect(intro.pending[0].turn - intro.turn).toBeLessThanOrEqual(4);
    expect(intro.pending[0].kind).toBe('intro');
  });

  it('возврат, чей ход настал, идёт раньше колоды', () => {
    let ds = base([run('a'), run('b'), run('c'), run('d'), run('e')]);
    const a = serve(ds, rand(1))!;
    ds = { ...a.ds, pending: [{ card: a.card, turn: a.ds.turn + 2, kind: 'mistake' }] };
    const b = serve(ds, rand(1))!;
    expect(b.via).toBe('deck');
    const c = serve(settle(b.ds, b.card), rand(1))!;
    expect(c.card.id).toBe('a');
    expect(c.via).toBe('mistake');
  });

  it('колода кончилась — отвеченные идут по второму кругу, новые уже не знакомятся', () => {
    let ds = base([run('a', 'new'), run('b')]);
    for (let i = 0; i < 2; i++) {
      const got = serve(ds, rand(i))!;
      ds = settle(got.ds, got.card);
    }
    const again = serve(ds, rand(9))!;
    expect(again).not.toBeNull();
    expect(again.card.tag).not.toBe('new');
  });
});

describe('опечатка', () => {
  it('одна правка от 5 букв, две — от 9; короткие слова — только точно', () => {
    expect(isTypo('hosue', 'house')).toBe(true);
    expect(isTypo('cat', 'cut')).toBe(false);
    expect(isTypo('beautifull', 'beautiful')).toBe(true);
    expect(isTypo('beutifull', 'beautiful')).toBe(true);
    expect(isTypo('house', 'house')).toBe(false);
    expect(isTypo('', 'house')).toBe(false);
    expect(isTypo('mouse', 'house')).toBe(true);
    expect(isTypo('horse', 'house')).toBe(true);
    expect(isTypo('hrse', 'house')).toBe(false);
  });
});
