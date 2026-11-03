import { describe, expect, it } from 'vitest';
import type { DeckCard } from '../../model/deck';
import { DAY, type CardState } from '../../model/srs';
import { RELIC_IDS, RELICS } from '../content/relics';
import { currentScene, modesOf, startRun, step, type Action, type RunState } from './engine';
import { reachable } from './map';
import { next as rnd, rand, type Rand } from './rng';
import type { Mode, StationKind } from './types';

/**
 * Баланс — прогоном ботов на 100 зёрнах (спека, «Проверка»; владелец: «100
 * забегов хватит»). Бот отвечает верно с вероятностью p, смешивает удары как
 * человек, который учит, а не фармит, и идёт по карте разумно. Коридор держит
 * числа противников и хранителя.
 */
const NOW = Date.UTC(2026, 10, 4, 12);
const DECK: DeckCard[] = Array.from({ length: 60 }, (_, i) => ({
  id: `v:w${i}`,
  en: `word${i}`,
  ru: `слово${i}`,
  source: 'vocab',
  group: ['food', 'home', 'city'][i % 3],
  example: [`I see word${i} every day.`, `Я вижу слово${i} каждый день.`],
}));
const STATES = new Map<string, CardState>(
  DECK.map((c) => [c.id, { due: NOW - DAY, interval: 3, ease: 2.5, reps: 3, lapses: 0, firstAt: NOW - 30 * DAY, known: false }]),
);
const START_RELICS = RELIC_IDS.filter((id) => RELICS[id].unlock === null);

const MIX: [Mode, number][] = [
  ['recall', 0.4],
  ['recognize', 0.25],
  ['listen', 0.2],
  ['speak', 0.15],
];

function pickMode(r: Rand, allowed: Mode[]): Mode {
  let x = rnd(r);
  for (const [m, w] of MIX) {
    x -= w;
    if (x < 0 && allowed.includes(m)) return m;
  }
  return allowed[0];
}

const PREFER: StationKind[] = ['scene', 'fight', 'find', 'elite', 'shop', 'rest', 'boss'];

/** Действие бота на экране. */
/** Сколько человек думает над ответом, мс: от и до. */
const THINK: Record<Mode | 'exercise' | 'other', [number, number]> = {
  recognize: [1500, 5000],
  listen: [2000, 6000],
  recall: [3000, 10000],
  speak: [2000, 7000],
  order: [5000, 15000],
  dictate: [4000, 12000],
  exercise: [4000, 14000],
  other: [500, 1500],
};

function think(s: RunState): keyof typeof THINK {
  if (s.screen.kind !== 'fight' || s.screen.fight.phase !== 'answer') return 'other';
  return s.screen.fight.challenge?.mode ?? 'exercise';
}

function decide(s: RunState, r: Rand, p: number, clock: { t: number }): Action {
  const [lo, hi] = THINK[think(s)];
  clock.t += lo + Math.floor(rnd(r) * (hi - lo));
  const now = clock.t;
  const right = rnd(r) < p;
  const sc = s.screen;
  switch (sc.kind) {
    case 'map': {
      const ids = reachable(s.map, s.at);
      const stations = ids.map((id) => s.map.find((x) => x.id === id)!);
      const hurt = s.hp < s.maxHp * 0.5;
      const rank = (k: StationKind) =>
        hurt && k === 'rest' ? -1 : k === 'elite' && s.hp < s.maxHp * 0.6 ? 99 : PREFER.indexOf(k);
      stations.sort((a, b) => rank(a.kind) - rank(b.kind));
      return { type: 'go', station: stations[0].id, now };
    }
    case 'fight': {
      const f = sc.fight;
      if (f.phase === 'intro' || f.phase === 'result') return { type: 'next', now };
      if (f.foe.kind === 'boss') return { type: 'exercise', correct: right, now };
      if (f.phase === 'choose') return { type: 'mode', mode: pickMode(r, modesOf(s)), now };
      const ch = f.challenge!;
      if (ch.mode === 'order') {
        const words = String(ch.answer).split(/\s+/);
        const order = words.map((w) => ch.bank!.indexOf(w));
        return { type: 'answer', value: right ? order : [...order].reverse(), now };
      }
      if (ch.options) {
        const answer = ch.answer as number;
        return { type: 'answer', value: right ? answer : (answer + 1) % ch.options.length, now };
      }
      return { type: 'answer', value: right ? String(ch.answer) : 'qqq', now };
    }
    case 'scene': {
      const run = sc.run;
      if (run.done) return { type: 'next', now };
      const ok = run.options!.findIndex((o) => o.ok);
      const bad = run.options!.findIndex((o, i) => !o.ok && !run.struck.includes(i));
      if (run.level === 1) return { type: 'reply', value: right || bad < 0 ? ok : bad, voice: false, now };
      const scene = currentScene(s)!;
      void scene;
      return { type: 'reply', value: right ? run.options![ok].en : 'no', voice: false, now };
    }
    case 'reward': {
      const want = s.hp < s.maxHp * 0.5 ? ['heal', 'maxhp'] : ['sharpen', 'maxhp', 'heal'];
      const index = Math.max(
        0,
        sc.options.findIndex((o) => want.includes(o.kind)),
      );
      return { type: 'reward', index, mode: 'recall' };
    }
    case 'shop': {
      const heal = sc.offers.findIndex((o) => o.kind === 'heal' && !o.sold && o.price <= s.coins);
      if (heal >= 0 && s.hp < s.maxHp * 0.7) return { type: 'buy', index: heal };
      return { type: 'next', now };
    }
    case 'rest':
      return s.hp < s.maxHp * 0.7 ? { type: 'rest', choice: 'sleep', now } : { type: 'rest', choice: 'train', mode: 'recall', now };
    case 'find':
      return { type: 'pick', relic: sc.relics[0] ?? null };
    case 'review':
      return sc.last === null ? { type: 'answer', value: right ? String(sc.challenge.answer) : 'qqq', now } : { type: 'next', now };
    case 'bossIntro':
      return { type: 'next', now };
    case 'end':
      throw new Error('забег окончен');
  }
}

export function simulate(seed: number, p: number): { win: boolean; answers: number; depth: number } {
  let s = startRun({
    id: `bot${seed}`,
    seed,
    now: NOW,
    day: '2026-11-04',
    weather: 'clear',
    character: 'tourist',
    fog: 0,
    speech: true,
    deck: DECK,
    states: STATES,
    newLimit: 0,
    lessons: new Set(),
    relics: START_RELICS,
    scenes: { open: ['sp'], levels: {}, recent: [] },
  });
  const r = rand(seed * 7919 + 1);
  const clock = { t: NOW };
  let answers = 0;
  for (let i = 0; i < 2000 && !s.outcome; i++) {
    const a = decide(s, r, p, clock);
    const out = step(s, a);
    if (out.state === s) throw new Error(`бот застрял: ${s.screen.kind} ${JSON.stringify(a)}`);
    if (a.type === 'answer' || a.type === 'exercise' || a.type === 'reply') answers += 1;
    s = out.state;
  }
  const at = s.map.find((x) => x.id === s.at);
  return { win: s.outcome === 'win', answers, depth: s.outcome === 'win' ? 10 : (at?.row ?? 0) };
}

const SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

describe('баланс', () => {
  it('коридор на тумане 0: p = 0,9 побеждает в 55–85 %, p = 0,7 — меньше 35 %, медиана 45–65 ответов', () => {
    const strong = SEEDS.map((seed) => simulate(seed, 0.9));
    const weak = SEEDS.map((seed) => simulate(seed, 0.7));
    const winRate = (xs: { win: boolean }[]) => xs.filter((x) => x.win).length / xs.length;
    const report = {
      strong: winRate(strong),
      weak: winRate(weak),
      medianAnswers: median(strong.map((x) => x.answers)),
      weakDepth: median(weak.map((x) => x.depth)),
      mid: winRate(SEEDS.map((seed) => simulate(seed, 0.8))),
    };
    console.log('баланс', report);
    expect(report.strong).toBeGreaterThanOrEqual(0.55);
    expect(report.strong).toBeLessThanOrEqual(0.85);
    expect(report.weak).toBeLessThan(0.35);
    expect(report.medianAnswers).toBeGreaterThanOrEqual(45);
    expect(report.medianAnswers).toBeLessThanOrEqual(65);
  }, 30_000);
});
