import { describe, expect, it } from 'vitest';
import type { Exercise, Section } from '../content/types';
import type { VocabWord } from '../content/themes';
import type { DayRow } from './activity';
import type { AnswerRow } from './course';
import type { DeckCard } from './deck';
import {
  activityMix,
  advise,
  byType,
  coverage,
  expectedText,
  hardWords,
  missingWords,
  retention,
  speakStage,
  weakUnits,
  wordSets,
  type AdviceInput,
} from './insights';
import { DAY, type CardState } from './srs';

const NOW = Date.UTC(2026, 9, 23, 10);
const st = (p: Partial<CardState>): CardState => ({
  due: NOW,
  interval: 0,
  ease: 2.5,
  reps: 1,
  lapses: 0,
  firstAt: NOW,
  known: false,
  ...p,
});
const vocab = (en: string, rank: number, theme: VocabWord['theme'] = 'home'): VocabWord => ({
  en,
  ru: en,
  rank,
  theme,
  pos: 'n',
});
const vcard = (w: VocabWord): DeckCard => ({ id: `v:${w.en}`, en: w.en, ru: w.ru, source: 'vocab', group: w.theme });
const answer = (itemId: string, unit: string, right: number, wrong: number, lastCorrect: boolean): AnswerRow => ({
  itemId,
  unit,
  right,
  wrong,
  lastCorrect,
});
const section = (id: string): Section => ({
  id,
  kind: 'unit',
  title: `Unit ${id}`,
  topic: 'тема',
  grammar: ['to be'],
  sb: [1, 1],
  wb: null,
});

describe('разбор', () => {
  it('усвоено — «знаю» или интервал от недели; начато — любое состояние', () => {
    const cards = ['a', 'b', 'c', 'd'].map((en) => vcard(vocab(en, 200)));
    const states = new Map([
      ['v:a', st({ known: true })],
      ['v:b', st({ interval: 7 })],
      ['v:c', st({ interval: 3 })],
    ]);
    const { settled, started } = wordSets(cards, states);
    expect([...settled].sort()).toEqual(['a', 'b']);
    expect([...started].sort()).toEqual(['a', 'b', 'c']);
  });

  it('покрытие частотного словаря — по рангу', () => {
    const v = [vocab('one', 50), vocab('two', 400), vocab('three', 900), vocab('extra', 3005)];
    expect(coverage(v, new Set(['one', 'three', 'extra']), [100, 500, 1000])).toEqual([
      { top: 100, settled: 1 },
      { top: 500, settled: 1 },
      { top: 1000, settled: 2 },
    ]);
  });

  it('ступени разговора', () => {
    expect(speakStage(10).next).toBe(300);
    expect(speakStage(300).next).toBe(800);
    expect(speakStage(3000).next).toBeNull();
  });

  it('занятия — только за окно', () => {
    const days = new Map<string, DayRow>([
      ['2026-10-23', { day: '2026-10-23', cards: 5, answers: 4, correct: 3, phrases: 2, quiz: 1 }],
      ['2026-10-10', { day: '2026-10-10', cards: 1, answers: 0, correct: 0, phrases: 0, quiz: 0 }],
      ['2026-10-09', { day: '2026-10-09', cards: 99, answers: 0, correct: 0, phrases: 0, quiz: 0 }],
    ]);
    const m = activityMix(days, '2026-10-23', 14);
    expect(m).toMatchObject({ cards: 6, answers: 4, correct: 3, phrases: 2, quiz: 1, activeDays: 2, total: 13 });
  });

  it('эталонная фраза задания', () => {
    expect(expectedText({ id: 'x', unit: 'u', type: 'choice', q: 'I ___ tired.', options: ['is', 'am'], answer: 1 })).toBe(
      'I am tired.',
    );
    expect(expectedText({ id: 'x', unit: 'u', type: 'translate', ru: 'Я дома', answers: ['I am at home.'] })).toBe(
      'I am at home.',
    );
  });

  it('слабый урок — точность ниже 70 % на пяти попытках', () => {
    const ex: Exercise[] = [
      { id: 'e1', unit: 'u01', type: 'gap', q: 'a ___', answers: ['b'] },
      { id: 'e2', unit: 'u02', type: 'gap', q: 'a ___', answers: ['b'] },
    ];
    const answers = new Map([
      ['e1', answer('e1', 'u01', 2, 3, true)],
      ['e2', answer('e2', 'u02', 4, 1, true)],
    ]);
    const weak = weakUnits([section('u01'), section('u02')], ex, answers);
    expect(weak.map((w) => w.section.id)).toEqual(['u01']);
  });

  it('трудные слова — забытые дважды, «знаю» не трудное', () => {
    const cards = ['a', 'b', 'c'].map((en) => vcard(vocab(en, 200)));
    const states = new Map([
      ['v:a', st({ lapses: 3 })],
      ['v:b', st({ lapses: 5, known: true })],
      ['v:c', st({ lapses: 2 })],
    ]);
    expect(hardWords(cards, states).map((h) => h.card.en)).toEqual(['a', 'c']);
  });

  it('слова, которых не хватает: ошибки → пройденный урок → разговорные → частые', () => {
    const v = [vocab('kitchen', 900), vocab('opinion', 1500, 'talk'), vocab('house', 300), vocab('the', 1, 'func')];
    const book: DeckCard = { id: 'u01:hello', en: 'hello', ru: 'привет', source: 'book', group: 'u01' };
    const cards = [book, ...v.map(vcard)];
    const ex: Exercise[] = [{ id: 'e1', unit: 'u01', type: 'translate', ru: 'Кухня', answers: ['The kitchen is big.'] }];
    const missing = missingWords({
      cards,
      states: new Map([['v:house', st({})]]),
      vocab: v,
      exercises: ex,
      answers: new Map([['e1', answer('e1', 'u01', 0, 1, false)]]),
      done: new Set(['u01']),
    });
    // «the» — слишком частое, «house» уже начато; «opinion» (ранг 1500, разговор) идёт по половине ранга — 750 < 900,
    // но «kitchen» раньше — из ошибки.
    expect(missing.map((m) => [m.card.en, m.reason])).toEqual([
      ['kitchen', 'mistake'],
      ['hello', 'book'],
      ['opinion', 'speak'],
    ]);
  });

  it('удержание считается от 20 слов, «знаю» с первого показа не учитывается', () => {
    const few = new Map(Array.from({ length: 5 }, (_, i) => [`v:${i}`, st({ reps: 3 })]));
    expect(retention(few)).toBeNull();
    const many = new Map<string, CardState>(
      Array.from({ length: 20 }, (_, i) => [`v:${i}`, st({ reps: 3, lapses: i < 10 ? 1 : 0 })]),
    );
    many.set('v:x', st({ reps: 1, known: true }));
    expect(retention(many)).toBe(0.5);
  });

  describe('советы', () => {
    const base: AdviceInput = {
      now: NOW,
      mix: { cards: 100, answers: 40, correct: 35, phrases: 40, quiz: 0, activeDays: 12, total: 180 },
      settled: 600,
      top500: { top: 500, settled: 450 },
      types: byType([], new Map()),
      weak: [],
      hard: 0,
      due: 0,
      retention: 0.9,
      mistakes: 0,
      current: null,
      lastLessonAt: NOW,
      gaps: [],
    };
    const ids = (i: Partial<AdviceInput>) => advise({ ...base, ...i }).map((a) => a.id);

    it('всё ровно — остаётся только метод', () => {
      expect(ids({})).toEqual(['method']);
    });

    it('без занятий — один совет начать', () => {
      expect(ids({ mix: { ...base.mix, cards: 0, answers: 0, correct: 0, phrases: 0, total: 0, activeDays: 0 } })).toEqual([
        'start',
      ]);
    });

    it('мало речи и рывками', () => {
      expect(ids({ mix: { ...base.mix, phrases: 5, total: 145, activeDays: 4 } })).toEqual(['regular', 'speak', 'method']);
    });

    it('узнавание сильно лучше своей фразы', () => {
      const types = byType([], new Map());
      types.choice = { right: 9, wrong: 1 };
      types.translate = { right: 6, wrong: 4 };
      expect(ids({ types, mistakes: 3 })).toEqual(['produce', 'method']);
    });

    it('долги, частые слова, стоящий учебник', () => {
      expect(
        ids({
          due: 80,
          top500: { top: 500, settled: 100 },
          current: section('u05'),
          lastLessonAt: NOW - 10 * DAY,
        }),
      ).toEqual(['due', 'core', 'lesson', 'method']);
    });
  });
});
