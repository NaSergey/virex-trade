import { COURSE, EXERCISES } from '../../content';
import type { Exercise } from '../../content/types';
import { currentSection, openUnits } from '../../model/course';
import { normalize } from '../../model/check';
import type { DeckCard } from '../../model/deck';
import type { CardState } from '../../model/srs';
import { BOSSES, blockOf, unitsOfBlock } from '../content/bosses';
import { CHARACTERS, type CharacterId } from '../content/characters';
import { ELITES, ENEMIES, bossStats, eliteStats, enemyStats } from '../content/enemies';
import { ITEMS, ITEM_IDS, POCKET, RELICS, type ItemId, type RelicId } from '../content/relics';
import { SCENES, SCENE_BY_ID } from '../content/scenes';
import type { Scene } from '../content/scenes/types';
import { judge, makeChallenge, type Challenge } from './challenge';
import { absorb, critWindow, damageOf, enemyTurn, type Foe } from './combat';
import { buildMap, reachable } from './map';
import { int, pick, rand, shuffle, type Rand } from './rng';
import { buildRunDeck, scheduleIntro, scheduleMistake, serve, settle, startDeck, type DeckState } from './run-deck';
import { peek, pickScene, replyScene, starsOf, startScene, type SceneLevel, type SceneRun } from './scene';
import {
  emptyStats,
  type Effect,
  type Mode,
  type Outcome,
  type RunCard,
  type RunStats,
  type SoundName,
  type Station,
  type Verdict,
  type WeatherId,
} from './types';
import type { RunRow } from '../../api/hooks';

/**
 * Движок забега (спека, разделы «Бой», «Хранитель», «Сцены», «Лавка,
 * скамейка, находка», «Итог»). Состояние сериализуемо целиком; шаг чистый:
 * побочное — оценки карточек, ответы упражнений, счётчики дня, звуки — уходит
 * списком эффектов, их исполняет страница.
 */

/** Удары обычного боя. */
export const FIGHT_MODES: readonly Mode[] = ['recognize', 'listen', 'recall', 'speak'];

export interface BossPlan {
  block: number;
  name: string;
  grammar: string;
  /** Разделы блока — для «Освежить правило». */
  units: string[];
  /** id упражнений хранителя. */
  pool: string[];
}

export interface FightLast {
  outcome: 'right' | 'typo' | 'wrong';
  damage: number;
  taken: number;
  crit: boolean;
  blockedBy: 'umbrella' | 'brolly' | null;
  healed: number;
}

export interface Fight {
  foe: Foe;
  phase: 'intro' | 'choose' | 'answer' | 'result';
  card: RunCard | null;
  via: 'deck' | 'intro' | 'mistake' | null;
  mode: Mode | null;
  challenge: Challenge | null;
  /** Упражнение хранителя. */
  exercise: string | null;
  shownAt: number;
  /** Неудачные попытки голоса в этом задании. */
  tries: number;
  /** Подсказка: скрытые неверные варианты; у ввода — половина букв (решает экран). */
  hidden: number[] | null;
  hint: boolean;
  dictionaryUsed: boolean;
  /** Зонт ещё не сработал в этом бою. */
  umbrella: boolean;
  /** Первый ответ боя ещё не дан (Газета). */
  first: boolean;
  mistakes: number;
  last: FightLast | null;
  bossPhase: 1 | 2 | 3;
  bossUsed: string[];
  /** Упражнения хранителя с ошибкой, которые вернутся (один раз). */
  bossBack: string[];
  bossReturned: string[];
}

export type RewardOption =
  | { kind: 'maxhp' }
  | { kind: 'sharpen' }
  | { kind: 'coins'; n: number }
  | { kind: 'heal'; n: number }
  | { kind: 'item'; item: ItemId };

export type Offer = { price: number; sold: boolean } & (
  | { kind: 'item'; item: ItemId }
  | { kind: 'relic'; relic: RelicId }
  | { kind: 'heal'; n: number }
  | { kind: 'sharpen' }
);

export type Screen =
  | { kind: 'map' }
  | { kind: 'fight'; fight: Fight }
  | { kind: 'reward'; coins: number; options: RewardOption[] }
  | { kind: 'shop'; offers: Offer[] }
  | { kind: 'rest' }
  | { kind: 'review'; cards: RunCard[]; i: number; challenge: Challenge; last: 'right' | 'typo' | 'wrong' | null; healed: number }
  | { kind: 'find'; relics: RelicId[]; coins: number }
  | { kind: 'scene'; run: SceneRun; coins: number | null; stars: 0 | 1 | 2 | 3 | null }
  | { kind: 'bossIntro' }
  | { kind: 'end' };

export interface RunState {
  v: 1;
  id: string;
  rng: number;
  startedAt: number;
  finishedAt: number | null;
  day: string;
  weather: WeatherId;
  fog: number;
  character: CharacterId;
  speech: boolean;
  map: Station[];
  at: string | null;
  hp: number;
  maxHp: number;
  coins: number;
  combo: number;
  sharpen: Partial<Record<Mode, number>>;
  relics: RelicId[];
  items: ItemId[];
  /** Складной зонт раскрыт: следующий удар не пройдёт. */
  brolly: boolean;
  /** Свежая газета: следующий верный ответ ×2. */
  paper: boolean;
  /** Находки, которые ещё могут выпасть. */
  pool: RelicId[];
  cards: DeckState;
  /** Все слова забега — неверные варианты и проверка «это другое слово». */
  all: RunCard[];
  /** Карточки, чью оценку уже решил первый ответ. */
  graded: string[];
  boss: BossPlan;
  scenes: { open: string[]; levels: Record<string, 1 | 2 | 3>; recent: string[] };
  screen: Screen;
  stats: RunStats;
  score: number;
  outcome: Outcome | null;
}

export type Action =
  | { type: 'go'; station: string; now: number }
  | { type: 'mode'; mode: Mode; now: number }
  | { type: 'answer'; value: string | number | number[]; now: number }
  | { type: 'exercise'; correct: boolean; now: number }
  | { type: 'dontKnow'; now: number }
  | { type: 'next'; now: number }
  | { type: 'item'; index: number; now: number }
  | { type: 'hint'; now: number }
  | { type: 'reward'; index: number; mode?: Mode }
  | { type: 'buy'; index: number; mode?: Mode }
  | { type: 'rest'; choice: 'sleep' | 'train' | 'review'; mode?: Mode; now: number }
  | { type: 'pick'; relic: RelicId | null }
  | { type: 'reply'; value: string | number | number[]; voice: boolean; now: number }
  | { type: 'peek' }
  | { type: 'quit'; now: number };

export interface StartInput {
  id: string;
  seed: number;
  now: number;
  day: string;
  weather: WeatherId;
  character: CharacterId;
  fog: number;
  speech: boolean;
  deck: DeckCard[];
  states: ReadonlyMap<string, CardState>;
  newLimit: number;
  lessons: ReadonlySet<string>;
  /** Открытые находки (`meta.availableRelics`). */
  relics: readonly RelicId[];
  scenes: { open: string[]; levels: Record<string, 1 | 2 | 3>; recent: string[] };
}

const EXERCISE_BY_ID: ReadonlyMap<string, Exercise> = new Map(EXERCISES.map((e) => [e.id, e]));

/** Хранитель линии и его упражнения — по блоку текущего раздела. */
export function bossPlan(lessons: ReadonlySet<string>): BossPlan {
  const current = currentSection(COURSE, lessons);
  const block = current ? blockOf(current.id) : 8;
  const open = openUnits(COURSE, lessons);
  const units = unitsOfBlock(block);
  const of = (ids: readonly string[]) => {
    const set = new Set(ids);
    return EXERCISES.filter((e) => set.has(e.unit));
  };
  let pool = current ? of(units).filter((e) => open.has(e.unit)) : EXERCISES;
  if (pool.length < 12 && block > 1) pool = [...pool, ...of(unitsOfBlock(block - 1))];
  if (pool.length < 12) pool = [...pool, ...of(units).filter((e) => !pool.includes(e))];
  const def = BOSSES[block - 1];
  return { block, name: def.name, grammar: def.grammar, units, pool: pool.map((e) => e.id) };
}

export function startRun(i: StartInput): RunState {
  const r = rand(i.seed);
  const character = CHARACTERS[i.character];
  const map = buildMap(r, { weather: i.weather, fog: i.fog });
  const all = buildRunDeck({ deck: i.deck, states: i.states, now: i.now, newLimit: i.newLimit }, r);
  const relics: RelicId[] = [character.relic];
  const maxHp = character.hp + (relics.includes('scarf') ? 6 : 0);
  return {
    v: 1,
    id: i.id,
    rng: r.s,
    startedAt: i.now,
    finishedAt: null,
    day: i.day,
    weather: i.weather,
    fog: i.fog,
    character: i.character,
    speech: i.speech,
    map,
    at: null,
    hp: maxHp - (i.fog >= 7 ? 4 : 0),
    maxHp,
    coins: 0,
    combo: 0,
    sharpen: {},
    relics,
    items: [],
    brolly: false,
    paper: false,
    pool: i.relics.filter((id) => !relics.includes(id) && (i.speech || !RELICS[id].speech)),
    cards: startDeck(all),
    all,
    graded: [],
    boss: bossPlan(i.lessons),
    scenes: { open: [...i.scenes.open], levels: { ...i.scenes.levels }, recent: [...i.scenes.recent] },
    screen: { kind: 'map' },
    stats: emptyStats(),
    score: 0,
    outcome: null,
  };
}

interface Ctx {
  s: RunState;
  r: Rand;
  fx: Effect[];
  now: number;
}

const has = (s: RunState, relic: RelicId) => s.relics.includes(relic);
const sound = (c: Ctx, name: SoundName) => c.fx.push({ kind: 'sound', name });
const stationAt = (s: RunState) => s.map.find((x) => x.id === s.at) ?? null;

function end(c: Ctx, outcome: Outcome) {
  c.s.outcome = outcome;
  c.s.finishedAt = c.now;
  c.s.screen = { kind: 'end' };
  sound(c, outcome === 'win' ? 'win' : 'lose');
}

/** Шиллинги с Монеткой и Смогом. */
function gain(c: Ctx, n: number): number {
  const got = Math.round(n * (has(c.s, 'coin') ? 1.5 : 1) * (c.s.weather === 'smog' ? 1.5 : 1));
  c.s.coins += got;
  if (got > 0) sound(c, 'coin');
  return got;
}

function heal(c: Ctx, n: number): number {
  const before = c.s.hp;
  c.s.hp = Math.min(c.s.maxHp, c.s.hp + n);
  if (c.s.hp > before) sound(c, 'heal');
  return c.s.hp - before;
}

function addRelic(s: RunState, relic: RelicId) {
  if (s.relics.includes(relic)) return;
  s.relics.push(relic);
  s.pool = s.pool.filter((x) => x !== relic);
  if (relic === 'scarf') {
    s.maxHp += 6;
    s.hp += 6;
  }
}

function relicChoice(c: Ctx, n: number): RelicId[] {
  return shuffle(
    c.r,
    c.s.pool.filter((x) => !c.s.relics.includes(x)),
  ).slice(0, n);
}

// ── бой ────────────────────────────────────────────────────────────────

function foeFor(c: Ctx, station: Station): Foe {
  const { s, r } = c;
  let foe: Foe;
  if (station.kind === 'boss') {
    const st = bossStats(s.fog);
    foe = { id: 'boss', name: s.boss.name, hp: st.hp, maxHp: st.hp, atk: st.atk, every: st.every, timer: st.every, kind: 'boss', text: s.boss.grammar };
  } else if (station.kind === 'elite') {
    const def = pick(r, ELITES);
    const st = eliteStats(station.row, s.fog);
    const modes = def.modes.filter((m) => s.speech || m !== 'speak');
    foe = { id: def.id, name: def.name, hp: st.hp, maxHp: st.hp, atk: st.atk, every: st.every, timer: st.every, kind: 'elite', modes, text: def.rule };
  } else {
    const def = pick(
      r,
      ENEMIES.filter((e) => e.rows[0] <= station.row && station.row <= e.rows[1] && (s.speech || !e.speech)),
    );
    const st = enemyStats(station.row, s.fog);
    const fast = def.trait === 'fast';
    foe = {
      id: def.id,
      name: def.name,
      hp: st.hp,
      maxHp: st.hp,
      atk: fast ? st.atk - 1 : st.atk,
      every: fast ? 3 : st.every,
      timer: 0,
      kind: 'fight',
      ...(def.weak ? { weak: def.weak } : {}),
      ...(def.resist ? { resist: def.resist } : {}),
      ...(def.trait ? { trait: def.trait } : {}),
      ...(def.text ? { text: def.text } : {}),
    };
  }
  if (s.weather === 'rain' && foe.kind !== 'boss') {
    foe.weak = 'listen';
    if (foe.resist === 'listen') delete foe.resist;
  }
  if (s.weather === 'smog') foe.every = Math.max(2, foe.every - 1);
  foe.timer = foe.every;
  return foe;
}

const newFight = (foe: Foe): Fight => ({
  foe,
  phase: 'choose',
  card: null,
  via: null,
  mode: null,
  challenge: null,
  exercise: null,
  shownAt: 0,
  tries: 0,
  hidden: null,
  hint: false,
  dictionaryUsed: false,
  umbrella: true,
  first: true,
  mistakes: 0,
  last: null,
  bossPhase: 1,
  bossUsed: [],
  bossBack: [],
  bossReturned: [],
});

const fightOf = (s: RunState): Fight | null => (s.screen.kind === 'fight' ? s.screen.fight : null);

/** Удары, которые принимает текущий противник. */
export function modesOf(s: RunState): Mode[] {
  const f = fightOf(s);
  if (!f) return [];
  const base = f.foe.modes ?? FIGHT_MODES;
  return base.filter((m) => s.speech || m !== 'speak');
}

function drawWord(c: Ctx, f: Fight) {
  const got = serve(c.s.cards, c.r);
  f.challenge = null;
  f.mode = null;
  f.tries = 0;
  f.hidden = null;
  f.hint = false;
  f.last = null;
  if (!got) {
    f.card = null;
    f.phase = 'choose';
    return;
  }
  c.s.cards = got.ds;
  f.card = got.card;
  f.via = got.via;
  f.phase = got.card.tag === 'new' && got.via === 'deck' ? 'intro' : 'choose';
}

function bossExercise(c: Ctx, f: Fight) {
  const types: Exercise['type'][] = f.bossPhase === 1 ? ['choice'] : f.bossPhase === 2 ? ['gap', 'order'] : ['translate'];
  let id = f.bossBack.shift();
  if (!id) {
    const unused = c.s.boss.pool.filter((x) => !f.bossUsed.includes(x));
    const typed = unused.filter((x) => types.includes(EXERCISE_BY_ID.get(x)!.type));
    const options = typed.length > 0 ? typed : unused.length > 0 ? unused : c.s.boss.pool;
    id = pick(c.r, options);
    f.bossUsed.push(id);
  }
  f.exercise = id;
  f.card = null;
  f.challenge = null;
  f.last = null;
  f.phase = 'answer';
  f.shownAt = c.now;
}

function enterFight(c: Ctx, station: Station) {
  const f = newFight(foeFor(c, station));
  c.s.screen = { kind: 'fight', fight: f };
  if (station.kind === 'boss') bossExercise(c, f);
  else drawWord(c, f);
}

/** Удар по игроку с Зонтом, складным зонтом и Шарфом. */
function hurt(c: Ctx, f: Fight | null, hit: number): { taken: number; blockedBy: 'umbrella' | 'brolly' | null } {
  if (hit <= 0) return { taken: 0, blockedBy: null };
  const umbrella = !!f && f.umbrella && has(c.s, 'umbrella');
  const res = absorb({ hp: c.s.hp, shield: 0 }, hit, { umbrella, brolly: c.s.brolly, scarf: has(c.s, 'scarf') });
  if (res.blockedBy === 'umbrella' && f) f.umbrella = false;
  if (res.blockedBy === 'brolly') c.s.brolly = false;
  c.s.hp = res.hp;
  if (res.taken > 0) sound(c, 'hurt');
  return { taken: res.taken, blockedBy: res.blockedBy };
}

/** Что ответ сделал с карточкой — до свежего состояния (его применяет страница). */
function verdictOf(mode: Mode, outcome: 'right' | 'typo' | 'wrong', dontKnow: boolean): Verdict {
  if (mode === 'order' || mode === 'dictate') return 'none';
  if (outcome === 'wrong') return mode === 'speak' && !dontKnow ? 'none' : 'wrong';
  if (outcome === 'typo') return 'typo';
  return mode === 'recall' || mode === 'speak' ? 'recall' : 'recognize';
}

const GRADED_TAGS: readonly RunCard['tag'][] = ['new', 'due', 'learning'];

function answerWord(c: Ctx, value: string | number | number[] | null, dontKnow: boolean): boolean {
  const { s } = c;
  const f = fightOf(s);
  if (!f || f.phase !== 'answer' || !f.challenge || !f.card) return false;
  const ch = f.challenge;
  const words = new Set(s.all.filter((x) => x.id !== f.card!.id).map((x) => normalize(x.en)));
  const outcome = dontKnow || value === null ? 'wrong' : judge(ch, value, words);
  if (!dontKnow && ch.mode === 'speak' && outcome === 'wrong' && f.tries === 0) {
    f.tries = 1;
    return true;
  }
  const card = f.card;
  const verdict = verdictOf(ch.mode, outcome, dontKnow);
  if (verdict !== 'none' && GRADED_TAGS.includes(card.tag) && !s.graded.includes(card.id)) {
    s.graded.push(card.id);
    c.fx.push({ kind: 'card', cardId: card.id, verdict });
    if (card.tag === 'new') s.stats.newWords += 1;
    if (verdict === 'recall' || verdict === 'typo') s.stats.recalled += 1;
    if (verdict === 'recognize' && card.tag === 'due') s.stats.recognized += 1;
  } else {
    c.fx.push({ kind: 'count', counter: 'game' });
  }
  const tally = s.stats.modes[ch.mode];
  const crit =
    outcome !== 'wrong' &&
    (c.now - f.shownAt <= critWindow(ch.mode, s.relics, s.fog) || (f.first && has(s, 'newspaper')));
  f.first = false;

  if (outcome !== 'wrong') {
    tally.right += 1;
    const damage = damageOf({
      mode: ch.mode,
      combo: s.combo,
      crit,
      weak: f.foe.weak,
      resist: f.foe.resist,
      sharpen: s.sharpen[ch.mode] ?? 0,
      relics: s.relics,
      weather: s.weather,
      character: s.character,
      boss: false,
      typo: outcome === 'typo',
      revenge: f.via === 'mistake',
      paper: s.paper,
    });
    s.paper = false;
    f.foe.hp = Math.max(0, f.foe.hp - damage);
    s.combo += 1;
    s.stats.maxCombo = Math.max(s.stats.maxCombo, s.combo);
    s.stats.damage += damage;
    if (f.via === 'mistake') s.stats.revenge += 1;
    sound(c, crit ? 'crit' : 'hit');
    const healed = has(s, 'headphones') && (ch.mode === 'listen' || ch.mode === 'dictate') ? heal(c, 1) : 0;
    s.cards = settle(s.cards, card);
    let hit = { taken: 0, blockedBy: null as 'umbrella' | 'brolly' | null };
    if (f.foe.hp > 0) {
      const t = enemyTurn(f.foe, 'right');
      f.foe = t.foe;
      hit = hurt(c, f, t.hit);
    }
    f.last = { outcome, damage, taken: hit.taken, crit, blockedBy: hit.blockedBy, healed };
  } else {
    tally.wrong += 1;
    s.combo = 0;
    f.mistakes += 1;
    if (!s.stats.mistakes.includes(card.id)) s.stats.mistakes.push(card.id);
    sound(c, 'wrong');
    const t = enemyTurn(f.foe, 'wrong');
    f.foe = t.foe;
    const extra = (s.weather === 'wind' ? 2 : 0) + (s.fog >= 5 ? 2 : 0);
    const hit = hurt(c, f, t.hit + extra);
    if (f.foe.trait === 'drain') f.foe.hp = Math.min(f.foe.maxHp, f.foe.hp + 3);
    s.cards = scheduleMistake(s.cards, card, c.r);
    f.last = { outcome, damage: 0, taken: hit.taken, crit: false, blockedBy: hit.blockedBy, healed: 0 };
  }
  f.phase = 'result';
  return true;
}

function answerExercise(c: Ctx, correct: boolean): boolean {
  const { s } = c;
  const f = fightOf(s);
  if (!f || f.foe.kind !== 'boss' || f.phase !== 'answer' || !f.exercise) return false;
  const ex = EXERCISE_BY_ID.get(f.exercise)!;
  c.fx.push({ kind: 'exercise', itemId: ex.id, unit: ex.unit, correct });
  const crit = correct && (c.now - f.shownAt <= critWindow(ex.type, s.relics, s.fog) || (f.first && has(s, 'newspaper')));
  f.first = false;
  if (correct) {
    s.stats.boss.right += 1;
    const damage = damageOf({
      mode: 'recall',
      combo: s.combo,
      crit,
      sharpen: 0,
      relics: s.relics,
      weather: s.weather,
      character: s.character,
      boss: true,
      exercise: ex.type,
      typo: false,
      revenge: false,
      paper: s.paper,
    });
    s.paper = false;
    f.foe.hp = Math.max(0, f.foe.hp - damage);
    s.combo += 1;
    s.stats.maxCombo = Math.max(s.stats.maxCombo, s.combo);
    s.stats.damage += damage;
    sound(c, crit ? 'crit' : 'hit');
    let hit = { taken: 0, blockedBy: null as 'umbrella' | 'brolly' | null };
    const phase = f.foe.hp <= f.foe.maxHp / 3 ? 3 : f.foe.hp <= (2 * f.foe.maxHp) / 3 ? 2 : 1;
    if (f.foe.hp > 0 && phase > f.bossPhase) {
      // Смена фазы: хранитель сгущает туман — следующий удар через 2 хода.
      f.bossPhase = phase;
      f.foe.timer = 2;
    } else if (f.foe.hp > 0) {
      const t = enemyTurn(f.foe, 'right');
      f.foe = t.foe;
      hit = hurt(c, f, t.hit);
    }
    f.last = { outcome: 'right', damage, taken: hit.taken, crit, blockedBy: hit.blockedBy, healed: 0 };
  } else {
    s.stats.boss.wrong += 1;
    s.combo = 0;
    f.mistakes += 1;
    if (!s.stats.bossMistakes.includes(ex.id)) s.stats.bossMistakes.push(ex.id);
    if (!f.bossReturned.includes(ex.id)) {
      f.bossReturned.push(ex.id);
      f.bossBack.push(ex.id);
    }
    sound(c, 'wrong');
    const t = enemyTurn(f.foe, 'wrong');
    f.foe = t.foe;
    const extra = (s.weather === 'wind' ? 2 : 0) + (s.fog >= 5 ? 2 : 0);
    const hit = hurt(c, f, t.hit + extra);
    f.last = { outcome: 'wrong', damage: 0, taken: hit.taken, crit: false, blockedBy: hit.blockedBy, healed: 0 };
  }
  f.phase = 'result';
  return true;
}

function rewardOptions(c: Ctx): RewardOption[] {
  const options: RewardOption[] = [
    { kind: 'maxhp' },
    { kind: 'sharpen' },
    { kind: 'coins', n: 12 },
    { kind: 'heal', n: 8 },
    ...(c.s.items.length < POCKET ? [{ kind: 'item' as const, item: pick(c.r, ITEM_IDS) }] : []),
  ];
  return shuffle(c.r, options).slice(0, has(c.s, 'bus') ? 4 : 3);
}

function victory(c: Ctx, f: Fight) {
  const { s } = c;
  if (f.mistakes === 0) s.stats.cleanFights += 1;
  if (has(s, 'thermos')) heal(c, 3);
  if (f.foe.kind === 'boss') {
    s.stats.boss.beaten = true;
    end(c, 'win');
    return;
  }
  const row = stationAt(s)?.row ?? 1;
  if (f.foe.kind === 'elite') {
    s.stats.elites += 1;
    const coins = gain(c, 15);
    s.screen = { kind: 'find', relics: relicChoice(c, 2), coins };
    return;
  }
  sound(c, 'win');
  const coins = gain(c, 4 + row);
  s.screen = { kind: 'reward', coins, options: rewardOptions(c) };
}

function nextInFight(c: Ctx, f: Fight): boolean {
  if (f.phase === 'intro') {
    if (f.card) c.s.cards = scheduleIntro(c.s.cards, f.card, c.r);
    drawWord(c, f);
    return true;
  }
  if (f.phase !== 'result') return false;
  if (c.s.hp <= 0) {
    end(c, 'dead');
    return true;
  }
  if (f.foe.hp <= 0) {
    victory(c, f);
    return true;
  }
  if (f.foe.kind === 'boss') bossExercise(c, f);
  else drawWord(c, f);
  return true;
}

function chooseMode(c: Ctx, mode: Mode): boolean {
  const { s } = c;
  const f = fightOf(s);
  if (!f || f.phase !== 'choose' || !f.card || !modesOf(s).includes(mode)) return false;
  f.challenge = makeChallenge(f.card, mode, s.all, c.r, { firstLetter: has(s, 'pencil') });
  f.mode = f.challenge.mode;
  f.phase = 'answer';
  f.shownAt = c.now;
  return true;
}

/** Подсказка: убрать два неверных варианта (у ввода экран откроет половину букв). */
function giveHint(c: Ctx, f: Fight) {
  f.hint = true;
  const ch = f.challenge;
  if (ch?.options) {
    const wrong = ch.options.map((_, i) => i).filter((i) => i !== ch.answer);
    f.hidden = shuffle(c.r, wrong).slice(0, 2);
  }
}

function applyItem(c: Ctx, index: number): boolean {
  const { s } = c;
  const item = s.items[index];
  if (!item) return false;
  const f = fightOf(s);
  switch (item) {
    case 'tea':
      if (s.hp >= s.maxHp) return false;
      heal(c, 8);
      break;
    case 'hint':
      if (!f || f.phase !== 'answer' || !f.challenge || f.hint) return false;
      giveHint(c, f);
      s.combo = 0;
      break;
    case 'brolly':
      if (s.brolly) return false;
      s.brolly = true;
      break;
    case 'paper':
      if (s.paper) return false;
      s.paper = true;
      break;
    case 'transfer':
      if (!f || f.foe.kind === 'boss') return false;
      s.screen = { kind: 'map' };
      break;
  }
  s.items.splice(index, 1);
  return true;
}

// ── станции ────────────────────────────────────────────────────────────

function price(s: RunState, base: number): number {
  return Math.max(1, Math.round(base * (has(s, 'pass') ? 0.7 : 1) * (s.weather === 'holiday' ? 0.5 : 1)));
}

function shopOffers(c: Ctx): Offer[] {
  const { s, r } = c;
  const items = shuffle(r, ITEM_IDS).slice(0, 2);
  const offers: Offer[] = items.map((item) => ({
    kind: 'item',
    item,
    price: price(s, int(r, ITEMS[item].price[0], ITEMS[item].price[1])),
    sold: false,
  }));
  const relic = relicChoice(c, 1)[0];
  if (relic) offers.push({ kind: 'relic', relic, price: price(s, 30), sold: false });
  offers.push({ kind: 'heal', n: 10, price: price(s, 12), sold: false });
  offers.push({ kind: 'sharpen', price: price(s, 20), sold: false });
  return offers;
}

function sceneLevelsMap(s: RunState): Map<string, SceneLevel> {
  return new Map(Object.entries(s.scenes.levels).map(([id, level]) => [id, { level, best: [0, 0, 0], lastAt: 0 }]));
}

function enterScene(c: Ctx, station: Station) {
  const { s } = c;
  const scene = pickScene(SCENES, new Set(s.scenes.open), sceneLevelsMap(s), s.scenes.recent, c.r);
  if (!scene) {
    enterFight(c, { ...station, kind: 'fight' });
    return;
  }
  s.scenes.recent.push(scene.id);
  const level = s.scenes.levels[scene.id] ?? 1;
  const run = startScene(scene, level, c.r, { patience: s.fog >= 8 ? 2 : 3, guide: has(s, 'guide') });
  s.screen = { kind: 'scene', run, coins: null, stars: null };
}

function enter(c: Ctx, station: Station) {
  const { s } = c;
  switch (station.kind) {
    case 'fight':
    case 'elite':
      enterFight(c, station);
      break;
    case 'boss':
      s.stats.boss.reached = true;
      s.screen = { kind: 'bossIntro' };
      break;
    case 'scene':
      enterScene(c, station);
      break;
    case 'shop':
      s.screen = { kind: 'shop', offers: shopOffers(c) };
      break;
    case 'rest':
      s.screen = { kind: 'rest' };
      break;
    case 'find':
      s.screen = { kind: 'find', relics: relicChoice(c, 2), coins: 0 };
      break;
  }
}

function canSharpen(mode: Mode | undefined): mode is Mode {
  return !!mode && FIGHT_MODES.includes(mode);
}

function sceneReply(c: Ctx, value: string | number | number[], voice: boolean): boolean {
  const { s } = c;
  if (s.screen.kind !== 'scene' || s.screen.run.done) return false;
  const scene = SCENE_BY_ID.get(s.screen.run.id)!;
  const { run } = replyScene(s.screen.run, scene, value, c.r);
  if (run === s.screen.run) return false;
  c.fx.push({ kind: 'count', counter: voice && run.level === 3 ? 'phrases' : 'game' });
  s.screen.run = run;
  if (!run.done) return true;
  const stars = starsOf(run);
  s.screen.stars = stars;
  s.stats.scenes.push({ id: run.id, level: run.level, stars });
  if (stars === 0) {
    s.hp = Math.max(0, s.hp - 4);
    sound(c, 'hurt');
    s.screen.coins = 0;
  } else {
    const base = [0, 6, 10, 14][stars] * (s.character === 'reporter' ? 1.5 : 1);
    s.screen.coins = gain(c, base);
    sound(c, 'win');
  }
  return true;
}

function dispatch(c: Ctx, a: Action): boolean {
  const { s } = c;
  if (a.type === 'quit') {
    end(c, 'quit');
    return true;
  }
  switch (a.type) {
    case 'go': {
      if (s.screen.kind !== 'map' || !reachable(s.map, s.at).includes(a.station)) return false;
      s.at = a.station;
      sound(c, 'step');
      enter(c, s.map.find((x) => x.id === a.station)!);
      return true;
    }
    case 'mode':
      return chooseMode(c, a.mode);
    case 'answer': {
      if (s.screen.kind === 'review') return reviewAnswer(c, a.value);
      return answerWord(c, a.value, false);
    }
    case 'dontKnow':
      return answerWord(c, null, true);
    case 'exercise':
      return answerExercise(c, a.correct);
    case 'item':
      return applyItem(c, a.index);
    case 'hint': {
      const f = fightOf(s);
      if (!f || !has(s, 'dictionary') || f.dictionaryUsed || f.phase !== 'answer' || !f.challenge || f.hint) return false;
      f.dictionaryUsed = true;
      giveHint(c, f);
      return true;
    }
    case 'next':
      return next(c);
    case 'reward': {
      if (s.screen.kind !== 'reward') return false;
      const o = s.screen.options[a.index];
      if (!o) return false;
      if (o.kind === 'sharpen' && !canSharpen(a.mode)) return false;
      if (o.kind === 'maxhp') {
        s.maxHp += 4;
        heal(c, 4);
      } else if (o.kind === 'sharpen') s.sharpen[a.mode!] = (s.sharpen[a.mode!] ?? 0) + 1;
      else if (o.kind === 'coins') gain(c, o.n);
      else if (o.kind === 'heal') heal(c, o.n);
      else if (s.items.length < POCKET) s.items.push(o.item);
      s.screen = { kind: 'map' };
      return true;
    }
    case 'buy': {
      if (s.screen.kind !== 'shop') return false;
      const o = s.screen.offers[a.index];
      if (!o || o.sold || s.coins < o.price) return false;
      if (o.kind === 'item' && s.items.length >= POCKET) return false;
      if (o.kind === 'sharpen' && !canSharpen(a.mode)) return false;
      if (o.kind === 'heal' && s.hp >= s.maxHp) return false;
      s.coins -= o.price;
      o.sold = true;
      sound(c, 'coin');
      if (o.kind === 'item') s.items.push(o.item);
      else if (o.kind === 'relic') addRelic(s, o.relic);
      else if (o.kind === 'heal') heal(c, o.n);
      else s.sharpen[a.mode!] = (s.sharpen[a.mode!] ?? 0) + 1;
      return true;
    }
    case 'rest': {
      if (s.screen.kind !== 'rest') return false;
      if (a.choice === 'sleep') {
        const share = has(s, 'kettle') ? 1 : s.fog >= 2 ? 0.2 : 0.3;
        heal(c, Math.round(s.maxHp * share));
        s.screen = { kind: 'map' };
      } else if (a.choice === 'train') {
        if (!canSharpen(a.mode)) return false;
        s.sharpen[a.mode] = (s.sharpen[a.mode] ?? 0) + 1;
        s.screen = { kind: 'map' };
      } else {
        const cards = s.stats.mistakes
          .map((id) => s.all.find((x) => x.id === id))
          .filter((x): x is RunCard => !!x)
          .slice(0, 6);
        if (cards.length === 0) return false;
        s.screen = {
          kind: 'review',
          cards,
          i: 0,
          challenge: makeChallenge(cards[0], 'recall', s.all, c.r, { firstLetter: false }),
          last: null,
          healed: 0,
        };
      }
      return true;
    }
    case 'pick': {
      if (s.screen.kind !== 'find') return false;
      if (a.relic !== null) {
        if (!s.screen.relics.includes(a.relic)) return false;
        addRelic(s, a.relic);
      }
      s.screen = { kind: 'map' };
      return true;
    }
    case 'reply':
      return sceneReply(c, a.value, a.voice);
    case 'peek': {
      if (s.screen.kind !== 'scene' || s.screen.run.level !== 3 || s.screen.run.peeked) return false;
      s.screen.run = peek(s.screen.run);
      return true;
    }
  }
}

function reviewAnswer(c: Ctx, value: string | number | number[]): boolean {
  const { s } = c;
  if (s.screen.kind !== 'review' || s.screen.last !== null) return false;
  const outcome = judge(s.screen.challenge, value);
  s.screen.last = outcome;
  c.fx.push({ kind: 'count', counter: 'game' });
  if (outcome !== 'wrong') {
    s.stats.revenge += 1;
    s.screen.healed += heal(c, 3);
  } else {
    sound(c, 'wrong');
  }
  return true;
}

function next(c: Ctx): boolean {
  const { s } = c;
  switch (s.screen.kind) {
    case 'fight':
      return nextInFight(c, s.screen.fight);
    case 'bossIntro':
      enterFight(c, stationAt(s)!);
      return true;
    case 'scene': {
      if (!s.screen.run.done) return false;
      if (s.hp <= 0) end(c, 'dead');
      else if (s.screen.stars === 3) s.screen = { kind: 'find', relics: relicChoice(c, 2), coins: 0 };
      else s.screen = { kind: 'map' };
      return true;
    }
    case 'review': {
      const sc = s.screen;
      if (sc.last === null) {
        // Не ответил — «Дальше» значит «не помню».
        sc.last = 'wrong';
        return true;
      }
      const i = sc.i + 1;
      if (i >= sc.cards.length) s.screen = { kind: 'map' };
      else s.screen = { ...sc, i, last: null, challenge: makeChallenge(sc.cards[i], 'recall', s.all, c.r, { firstLetter: false }) };
      return true;
    }
    case 'shop':
    case 'rest':
    case 'reward':
    case 'find':
      s.screen = { kind: 'map' };
      return true;
    default:
      return false;
  }
}

/** Очки: урон, элиты, хранитель, звёзды сцен; туман и погода — множителем. */
export function scoreOf(s: RunState): number {
  const st = s.stats;
  const stars = st.scenes.reduce((n, x) => n + x.stars, 0);
  const raw = st.damage + 25 * st.elites + (st.boss.beaten ? 100 : 0) + 10 * stars;
  return Math.round(raw * (1 + 0.1 * s.fog) * (s.weather === 'rush' ? 1.3 : 1));
}

/** Ряд, на котором кончился забег; победа — вся линия. */
export function depthOf(s: RunState): number {
  if (s.outcome === 'win') return 10;
  return stationAt(s)?.row ?? 0;
}

export function step(s0: RunState, a: Action): { state: RunState; effects: Effect[] } {
  if (s0.outcome) return { state: s0, effects: [] };
  const s = structuredClone(s0);
  const c: Ctx = { s, r: rand(s0.rng), fx: [], now: 'now' in a ? a.now : (s0.finishedAt ?? s0.startedAt) };
  if (!dispatch(c, a)) return { state: s0, effects: [] };
  s.rng = c.r.s;
  s.score = scoreOf(s);
  return { state: s, effects: c.fx };
}

/** Законченный забег — строка для сервера. */
export function toRunRow(s: RunState, now: number): RunRow {
  return {
    id: s.id,
    startedAt: new Date(s.startedAt).toISOString(),
    finishedAt: new Date(s.finishedAt ?? now).toISOString(),
    character: s.character,
    fog: s.fog,
    outcome: s.outcome ?? 'quit',
    depth: depthOf(s),
    score: scoreOf(s),
    stats: s.stats,
  };
}

export function currentExercise(s: RunState): Exercise | null {
  const f = fightOf(s);
  return f?.exercise ? (EXERCISE_BY_ID.get(f.exercise) ?? null) : null;
}

export function currentScene(s: RunState): Scene | null {
  return s.screen.kind === 'scene' ? (SCENE_BY_ID.get(s.screen.run.id) ?? null) : null;
}

/** Урон удара по текущему противнику без крита — подпись на кнопке удара. */
export function previewDamage(s: RunState, mode: Mode): number {
  const f = fightOf(s);
  return damageOf({
    mode,
    combo: s.combo,
    crit: false,
    weak: f?.foe.weak,
    resist: f?.foe.resist,
    sharpen: s.sharpen[mode] ?? 0,
    relics: s.relics,
    weather: s.weather,
    character: s.character,
    boss: false,
    typo: false,
    revenge: f?.via === 'mistake',
    paper: s.paper,
  });
}
