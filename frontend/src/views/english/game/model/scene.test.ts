import { describe, expect, it } from 'vitest';
import type { RunRow } from '../../api/hooks';
import type { Scene } from '../content/scenes/types';
import { rand } from './rng';
import { combos, fill, peek, pickScene, replyScene, sceneLevels, starsOf, startScene } from './scene';
import { emptyStats } from './types';

const SCENE: Scene = {
  id: 'cafe',
  unit: 'sp',
  title: 'Кафе',
  place: { en: 'CAFÉ', ru: 'Кафе' },
  npc: { name: 'Mia', role: 'бариста' },
  goal: 'Возьми кофе',
  vars: { price: ['£2', '£3', '£4'], size: ['small', 'large'] },
  steps: [
    { npc: 'Hello! What can I get you?', ru: 'Здравствуйте! Что вам?' },
    {
      reply: [
        { en: 'A {size} coffee, please.', ru: 'Кофе, пожалуйста.', ok: true },
        { en: 'A coffee, thanks you.', ru: '', why: 'w1', react: 'Sorry?' },
        { en: 'I am coffee.', ru: '', why: 'w2', react: 'Ha!' },
      ],
    },
    { npc: "That's {price}.", ru: 'С вас {price}.' },
    {
      reply: [
        {
          en: '{price}? Here you are.',
          ru: '',
          ok: true,
          distract: 'price',
          why: 'Она сказала {price}.',
          react: 'No, {price}.',
        },
      ],
    },
  ],
  phrases: [
    ['Here you are.', 'Вот, пожалуйста.'],
    ['A coffee, please.', 'Кофе, пожалуйста.'],
  ],
};

const okIndex = (opts: { en: string }[], text: string) => opts.findIndex((o) => o.en === text);

describe('сцена', () => {
  it('переменные подставляются, сочетания перебираются все', () => {
    expect(fill('That is {price}.', { price: '£3' })).toBe('That is £3.');
    expect(combos(SCENE, 'A {size} coffee for {price}')).toHaveLength(6);
    expect(combos(SCENE, 'Hello')).toEqual(['Hello']);
  });

  it('уровень 1: неверный вычёркивается, терпение −1, шаг тот же; верный ведёт дальше', () => {
    let run = startScene(SCENE, 1, rand(1), { patience: 3, guide: false });
    expect(run.log[0]).toMatchObject({ who: 'npc', en: 'Hello! What can I get you?' });
    expect(run.options).toHaveLength(3);
    const wrong = okIndex(run.options!, 'I am coffee.');
    run = replyScene(run, SCENE, wrong, rand(2)).run;
    expect(run).toMatchObject({ patience: 2, mistakes: 1, struck: [wrong], step: 1 });
    expect(run.log.at(-1)).toMatchObject({ who: 'npc', en: 'Ha!', why: 'w2' });
    const right = run.options!.findIndex((o) => o.ok);
    const res = replyScene(run, SCENE, right, rand(3));
    expect(res.correct).toBe(true);
    expect(res.run.log.at(-1)).toMatchObject({ who: 'npc', en: `That's ${run.vars.price}.` });
    expect(res.run.options).toHaveLength(3);
  });

  it('вариант на слух: неверные — с другими значениями переменной', () => {
    let run = startScene(SCENE, 1, rand(4), { patience: 3, guide: false });
    run = replyScene(run, SCENE, run.options!.findIndex((o) => o.ok), rand(5)).run;
    const texts = run.options!.map((o) => o.en).sort();
    expect(texts).toEqual(['£2? Here you are.', '£3? Here you are.', '£4? Here you are.']);
    const bad = run.options!.findIndex((o) => !o.ok);
    run = replyScene(run, SCENE, bad, rand(6)).run;
    expect(run.log.at(-1)!.why).toBe(`Она сказала ${run.vars.price}.`);
    run = replyScene(run, SCENE, run.options!.findIndex((o) => o.ok), rand(7)).run;
    expect(run.done).toBe('ok');
    expect(starsOf(run)).toBe(2);
  });

  it('уровень 2: собрать верную реплику из слов', () => {
    const run = startScene(SCENE, 2, rand(8), { patience: 3, guide: false });
    const target = `A ${run.vars.size} coffee, please.`.split(' ');
    const indices = target.map((w) => run.bank!.indexOf(w));
    expect(replyScene(run, SCENE, indices, rand(9)).correct).toBe(true);
  });

  it('уровень 3: две неудачи — верная реплика показана, шаг засчитан ошибкой; терпение 0 — провал', () => {
    let run = startScene(SCENE, 3, rand(10), { patience: 3, guide: false });
    expect(replyScene(run, SCENE, `a ${run.vars.size} coffee please`, rand(1)).correct).toBe(true);
    run = replyScene(run, SCENE, 'tea', rand(1)).run;
    expect(run).toMatchObject({ patience: 2, tries: 1, step: 1 });
    run = replyScene(run, SCENE, 'milk', rand(1)).run;
    expect(run).toMatchObject({ patience: 1, step: 3, mistakes: 2 });
    run = replyScene(run, SCENE, 'nothing', rand(1)).run;
    expect(run.done).toBe('fail');
    expect(starsOf(run)).toBe(0);
  });

  it('Путеводитель: первая ошибка терпение не тратит; подсмотренный текст на уровне 3 стоит звезды', () => {
    let run = startScene(SCENE, 1, rand(11), { patience: 3, guide: true });
    run = replyScene(run, SCENE, okIndex(run.options!, 'I am coffee.'), rand(1)).run;
    expect(run.patience).toBe(3);
    let three = startScene(SCENE, 3, rand(12), { patience: 3, guide: false });
    three = peek(three);
    three = replyScene(three, SCENE, `A ${three.vars.size} coffee, please.`, rand(1)).run;
    three = replyScene(three, SCENE, `${three.vars.price}? Here you are.`, rand(1)).run;
    expect(three.done).toBe('ok');
    expect(starsOf(three)).toBe(2);
  });
});

const runRow = (at: string, scenes: { id: string; level: 1 | 2 | 3; stars: 0 | 1 | 2 | 3 }[]): RunRow => ({
  id: at,
  startedAt: at,
  finishedAt: at,
  character: 'tourist',
  fog: 0,
  outcome: 'dead',
  depth: 3,
  score: 10,
  stats: { ...emptyStats(), scenes },
});

describe('уровни сцен и выбор', () => {
  it('2–3 звезды на текущем уровне поднимают уровень, 1 звезда — нет, потолок 3', () => {
    const runs = [
      runRow('2026-11-01T10:00:00Z', [{ id: 'cafe', level: 1, stars: 1 }]),
      runRow('2026-11-02T10:00:00Z', [{ id: 'cafe', level: 1, stars: 2 }]),
      runRow('2026-11-03T10:00:00Z', [{ id: 'cafe', level: 2, stars: 3 }]),
      runRow('2026-11-04T10:00:00Z', [{ id: 'cafe', level: 3, stars: 3 }]),
    ].reverse();
    const levels = sceneLevels(runs);
    expect(levels.get('cafe')).toMatchObject({ level: 3, best: [2, 3, 3] });
  });

  it('выбор: только открытые, сыгранные недавно — пока есть другие', () => {
    const other: Scene = { ...SCENE, id: 'shop' };
    const locked: Scene = { ...SCENE, id: 'bank', unit: 'u22' };
    const scenes = [SCENE, other, locked];
    const open = new Set(['sp']);
    for (let i = 0; i < 20; i++) {
      expect(pickScene(scenes, open, new Map(), ['cafe'], rand(i))?.id).toBe('shop');
    }
    expect(pickScene(scenes, open, new Map(), ['cafe', 'shop'], rand(1))).not.toBeNull();
    expect(pickScene([locked], open, new Map(), [], rand(1))).toBeNull();
  });
});
