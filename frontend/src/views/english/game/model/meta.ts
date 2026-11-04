import type { RunRow } from '../../api/hooks';
import { localDay, shiftDay } from '../../model/activity';
import { CHARACTERS, CHARACTER_IDS, type CharacterId } from '../content/characters';
import { QUESTS, type QuestDef, type QuestMetric } from '../content/quests';
import { RELICS, RELIC_IDS, type RelicId, type UnlockId } from '../content/relics';
import { WEATHER_IDS } from '../content/weather';
import { pick, rand, seedOf, weighted } from './rng';
import type { RunStats, WeatherId } from './types';

/**
 * Мета игры — всё выводится из законченных забегов, ничего отдельно не
 * хранится (тот же приём, что у уровней и достижений продукта): открытия,
 * рекорды, задания дня, серия, уровни тумана.
 */

const dayOf = (run: RunRow) => localDay(Date.parse(run.finishedAt));

export interface Totals {
  voice: number;
  revenge: number;
  /** Разных сцен, пройденных на три звезды. */
  scenes3: number;
  runs: number;
  reachedBoss: number;
  bossBeaten: number;
  bestCombo: number;
  /** Выполненных заданий дня за всё время. */
  quests: number;
}

export function totals(runs: readonly RunRow[]): Totals {
  const scenes3 = new Set<string>();
  const quests = new Set<string>();
  const t: Totals = { voice: 0, revenge: 0, scenes3: 0, runs: runs.length, reachedBoss: 0, bossBeaten: 0, bestCombo: 0, quests: 0 };
  for (const run of runs) {
    const s = run.stats;
    t.voice += s.modes?.speak?.right ?? 0;
    t.revenge += s.revenge ?? 0;
    if (s.boss?.reached) t.reachedBoss += 1;
    if (s.boss?.beaten) t.bossBeaten += 1;
    t.bestCombo = Math.max(t.bestCombo, s.maxCombo ?? 0);
    for (const sc of s.scenes ?? []) if (sc.stars === 3) scenes3.add(sc.id);
    for (const q of s.quests ?? []) quests.add(`${dayOf(run)}:${q}`);
  }
  t.scenes3 = scenes3.size;
  t.quests = quests.size;
  return t;
}

const UNLOCKS: Record<UnlockId, (t: Totals) => boolean> = {
  bossBeaten: (t) => t.bossBeaten >= 1,
  voice20: (t) => t.voice >= 20,
  voice30: (t) => t.voice >= 30,
  revenge20: (t) => t.revenge >= 20,
  scenes3: (t) => t.scenes3 >= 3,
  scenes5: (t) => t.scenes3 >= 5,
  runs10: (t) => t.runs >= 10,
  reachedBoss: (t) => t.reachedBoss >= 1,
  combo12: (t) => t.bestCombo >= 12,
  quests15: (t) => t.quests >= 15,
};

export function unlocked(runs: readonly RunRow[]): Set<UnlockId> {
  const t = totals(runs);
  return new Set((Object.keys(UNLOCKS) as UnlockId[]).filter((id) => UNLOCKS[id](t)));
}

export function availableRelics(runs: readonly RunRow[], speech: boolean): RelicId[] {
  const open = unlocked(runs);
  return RELIC_IDS.filter((id) => {
    const r = RELICS[id];
    return (r.unlock === null || open.has(r.unlock)) && (speech || !r.speech);
  });
}

export function availableCharacters(runs: readonly RunRow[], speech: boolean): CharacterId[] {
  const open = unlocked(runs);
  return CHARACTER_IDS.filter((id) => {
    const c = CHARACTERS[id];
    return (c.unlock === null || open.has(c.unlock)) && (speech || !c.speech);
  });
}

/** Наибольший открытый уровень тумана: победа на N открывает N+1. */
export function maxFog(runs: readonly RunRow[]): number {
  const won = new Set(runs.filter((r) => r.outcome === 'win').map((r) => r.fog));
  let level = 0;
  while (won.has(level) && level < 8) level += 1;
  return level;
}

/** С какого дня погода идёт цепочкой «не как вчера». */
const WEATHER_EPOCH = '2026-01-01';
const weatherMemo = new Map<string, WeatherId>();

/** Погода дня: зерно — дата, два дня подряд одной погоды не бывает. */
export function weatherOf(day: string): WeatherId {
  const cached = weatherMemo.get(day);
  if (cached) return cached;
  const base = (d: string) => WEATHER_IDS[seedOf(`w${d}`) % WEATHER_IDS.length];
  if (day <= WEATHER_EPOCH) return base(day);
  let d = WEATHER_EPOCH;
  let w = weatherMemo.get(d) ?? base(d);
  weatherMemo.set(d, w);
  while (d < day) {
    d = shiftDay(d, -1);
    const memo = weatherMemo.get(d);
    if (memo) {
      w = memo;
      continue;
    }
    const prev = w;
    const options = WEATHER_IDS.filter((x) => x !== prev);
    w = options[seedOf(`w${d}`) % options.length];
    weatherMemo.set(d, w);
  }
  return w;
}

const METRIC: Record<QuestMetric, (s: RunStats) => number> = {
  voice: (s) => s.modes?.speak?.right ?? 0,
  recall: (s) => s.modes?.recall?.right ?? 0,
  newWords: (s) => s.newWords ?? 0,
  revenge: (s) => s.revenge ?? 0,
  elites: (s) => s.elites ?? 0,
  reachedBoss: (s) => (s.boss?.reached ? 1 : 0),
  maxCombo: (s) => s.maxCombo ?? 0,
  cleanFights: (s) => s.cleanFights ?? 0,
  scenes3: (s) => (s.scenes ?? []).filter((x) => x.stars === 3).length,
  scenes: (s) => (s.scenes ?? []).filter((x) => x.stars > 0).length,
  sceneUp: (s) => (s.scenes ?? []).filter((x) => x.stars >= 2 && x.level < 3).length,
};

/** Прогресс задания: сумма по забегам дня, у серии — лучшая. */
export function questProgress(q: QuestDef, stats: readonly RunStats[]): number {
  const values = stats.map(METRIC[q.metric]);
  return q.metric === 'maxCombo' ? Math.max(0, ...values) : values.reduce((a, b) => a + b, 0);
}

/**
 * Три задания дня: учебное, игровое и на сцену. Учебное чаще выпадает про
 * навык, которого за неделю до этого дня было меньше всего (голос, ввод,
 * новые слова). Недоступное не выпадает.
 */
export function questsOf(day: string, runs: readonly RunRow[], speech: boolean, hasNew: boolean): QuestDef[] {
  const r = rand(seedOf(`q${day}`));
  const from = shiftDay(day, 7);
  const week = runs.filter((x) => {
    const d = dayOf(x);
    return d >= from && d < day;
  });
  const ok = (q: QuestDef) => (speech || !q.speech) && (hasNew || !q.needsNew);
  const learn = QUESTS.filter((q) => q.group === 'learn' && ok(q));
  const skills = learn.filter((q) => q.metric === 'voice' || q.metric === 'recall' || q.metric === 'newWords');
  const sum = (q: QuestDef) => week.reduce((n, x) => n + METRIC[q.metric](x.stats), 0);
  const weakest = skills.length > 0 ? skills.reduce((a, b) => (sum(b) < sum(a) ? b : a)) : null;
  const first = weighted(
    r,
    learn.map((q) => [q, q === weakest ? 3 : 1] as const),
  );
  const play = pick(
    r,
    QUESTS.filter((q) => q.group === 'play' && ok(q)),
  );
  const scene = pick(
    r,
    QUESTS.filter((q) => q.group === 'scene' && ok(q)),
  );
  return [first, play, scene];
}

/** Статистика забегов, законченных в этот день. */
export const statsOfDay = (runs: readonly RunRow[], day: string): RunStats[] =>
  runs.filter((x) => dayOf(x) === day).map((x) => x.stats);

/** Серия игры: дни подряд с законченным забегом; сегодня ещё не играл — до вчера. */
export function gameStreak(runs: readonly RunRow[], today: string): number {
  const days = new Set(runs.map(dayOf));
  let day = days.has(today) ? today : shiftDay(today, 1);
  let n = 0;
  while (days.has(day)) {
    n += 1;
    day = shiftDay(day, 1);
  }
  return n;
}

/** Полоса последних `n` дней, старые слева: золото — все три задания, сыграно — хоть один забег. */
export function goldDays(runs: readonly RunRow[], today: string, n: number): ('none' | 'played' | 'gold')[] {
  const out: ('none' | 'played' | 'gold')[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = shiftDay(today, i);
    const of = runs.filter((x) => dayOf(x) === day);
    const done = new Set(of.flatMap((x) => x.stats.quests ?? []));
    out.push(done.size >= 3 ? 'gold' : of.length > 0 ? 'played' : 'none');
  }
  return out;
}

export interface Records {
  /** Лучшие очки по уровню тумана. */
  best: Map<number, number>;
  depth: number;
  wins: number;
  combo: number;
  runs: number;
  /** Слов вспомнено за всё время. */
  recalled: number;
}

export function records(runs: readonly RunRow[]): Records {
  const r: Records = { best: new Map(), depth: 0, wins: 0, combo: 0, runs: runs.length, recalled: 0 };
  for (const run of runs) {
    r.best.set(run.fog, Math.max(r.best.get(run.fog) ?? 0, run.score));
    r.depth = Math.max(r.depth, run.depth);
    if (run.outcome === 'win') r.wins += 1;
    r.combo = Math.max(r.combo, run.stats.maxCombo ?? 0);
    r.recalled += run.stats.recalled ?? 0;
  }
  return r;
}
