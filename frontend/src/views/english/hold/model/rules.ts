import { chance, int, next, pick, rand, type Rand } from '../../game/model/rng';
import type { Battle } from './battle';

/**
 * Ashen Hold, шаг 1 — лагерь (спека docs/superpowers/specs/2026-11-04-ashen-hold-design.md).
 * Правила — чистые функции: день — это приказы людям, ночь — `endDay`, она считает добычу,
 * постройки, еду и воду, настроение и ночной набег и пишет доклад утра по-английски.
 * Случайность — mulberry32 с состоянием в самой игре: восстановленная из localStorage игра
 * продолжается той же последовательностью.
 */

export const DAYS = 30;
export const MAX_HP = 5;
export const MAX_MORALE = 10;

export type ResId = 'food' | 'water' | 'wood' | 'iron';
export type Resources = Record<ResId, number>;
export type BuildingId = 'wall' | 'well' | 'forge' | 'tower';
export type PersonId = 'mira' | 'tom' | 'ash' | 'ezra';
export type Role = 'hunter' | 'builder' | 'scout' | 'healer';

/** Глаголы и дополнения приказа — плитки фразы «<имя>, <глагол> <дополнение>». */
export const VERBS = ['go', 'fetch', 'chop', 'mine', 'build', 'guard', 'rest'] as const;
export const OBJECTS = [
  'hunting',
  'water',
  'wood',
  'iron',
  'the wall',
  'the well',
  'the forge',
  'the tower',
  'the gate',
  'by the fire',
] as const;
export type Verb = (typeof VERBS)[number];
export type Obj = (typeof OBJECTS)[number];

export type Task =
  | { kind: 'hunt' }
  | { kind: 'water' }
  | { kind: 'wood' }
  | { kind: 'iron' }
  | { kind: 'build'; building: BuildingId }
  | { kind: 'guard' }
  | { kind: 'rest' };

/** Единственный источник верных фраз: глагол + дополнение → дело. Остальные сочетания — бессмыслица. */
const PHRASES: Record<string, Task> = {
  'go hunting': { kind: 'hunt' },
  'fetch water': { kind: 'water' },
  'chop wood': { kind: 'wood' },
  'mine iron': { kind: 'iron' },
  'build the wall': { kind: 'build', building: 'wall' },
  'build the well': { kind: 'build', building: 'well' },
  'build the forge': { kind: 'build', building: 'forge' },
  'build the tower': { kind: 'build', building: 'tower' },
  'guard the gate': { kind: 'guard' },
  'rest by the fire': { kind: 'rest' },
};

export function taskOf(verb: Verb, object: Obj): Task | null {
  return PHRASES[`${verb} ${object}`] ?? null;
}

export interface Order {
  verb: Verb;
  object: Obj;
}

export interface Person {
  id: PersonId;
  name: string;
  role: Role;
  hp: number;
  morale: number;
  status: 'ok' | 'dead' | 'gone';
  order: Order | null;
}

export interface BuildingDef {
  name: string;
  wood: number;
  iron: number;
  /** Дней работы одного человека; строитель работает за двоих. */
  work: number;
  /** Что даёт — строкой для экрана, по-английски. */
  gives: string;
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  wall: { name: 'Wall', wood: 15, iron: 0, work: 4, gives: 'stops raiders at night' },
  well: { name: 'Well', wood: 8, iron: 2, work: 2, gives: '+4 water every day' },
  forge: { name: 'Forge', wood: 6, iron: 4, work: 2, gives: 'guards fight harder, +1 iron when mining' },
  tower: { name: 'Watchtower', wood: 12, iron: 0, work: 2, gives: 'you see raiders before night' },
};

export interface Building {
  /** Материалы внесены — стройка начата. */
  started: boolean;
  progress: number;
  done: boolean;
}

export interface Raid {
  kind: 'wolves' | 'bandits';
  strength: number;
}

export interface HoldState {
  v: 1;
  rng: number;
  day: number;
  res: Resources;
  people: Person[];
  buildings: Record<BuildingId, Building>;
  /** Набег этой ночи разыгран утром: вышка показывает его днём. */
  tonight: Raid | null;
  /** Доклад прошлой ночи — показывается утром. */
  report: string[];
  stats: { phrases: number; mistakes: number; raids: number; repelled: number };
  outcome: 'win' | 'lose' | null;
  /** Идущий ночной бой (шаг 2): пока он есть, лагерь показывает бой. */
  battle?: Battle | null;
  /** Строки доклада, которые оставил бой этой ночи; набег уже разыгран — ночь его не считает. */
  nightLog?: string[] | null;
}

const START_PEOPLE: Omit<Person, 'hp' | 'morale' | 'status' | 'order'>[] = [
  { id: 'mira', name: 'Mira', role: 'hunter' },
  { id: 'tom', name: 'Tom', role: 'builder' },
  { id: 'ash', name: 'Ash', role: 'scout' },
  { id: 'ezra', name: 'Ezra', role: 'healer' },
];

export const ROLE_PERK: Record<Role, string> = {
  hunter: 'brings more food',
  builder: 'builds twice as fast',
  scout: 'finds more water',
  healer: 'heals one wounded every night',
};

const rollRaid = (r: Rand, day: number): Raid | null =>
  day >= 2 && chance(r, Math.min(0.75, 0.2 + day * 0.018))
    ? { kind: day < 10 ? 'wolves' : pick(r, ['wolves', 'bandits'] as const), strength: int(r, 2, 4) + Math.floor(day / 5) }
    : null;

export function newGame(seed: number): HoldState {
  const r = rand(seed);
  const s: HoldState = {
    v: 1,
    rng: 0,
    day: 1,
    res: { food: 12, water: 10, wood: 10, iron: 2 },
    people: START_PEOPLE.map((p) => ({ ...p, hp: MAX_HP, morale: 7, status: 'ok', order: null })),
    buildings: {
      wall: { started: false, progress: 0, done: false },
      well: { started: false, progress: 0, done: false },
      forge: { started: false, progress: 0, done: false },
      tower: { started: false, progress: 0, done: false },
    },
    tonight: rollRaid(r, 1),
    report: ['The winter is coming. Keep your people alive for thirty days.'],
    stats: { phrases: 0, mistakes: 0, raids: 0, repelled: 0 },
    outcome: null,
  };
  s.rng = r.s;
  return s;
}

export const present = (s: HoldState) => s.people.filter((p) => p.status === 'ok');

/** Сколько ночь съест и выпьет. */
export function upkeep(s: HoldState): { food: number; water: number } {
  const n = present(s).length;
  return { food: 2 * n, water: 2 * n - (s.buildings.well.done ? 4 : 0) };
}

/** Защита на эту ночь — по приказам дня. */
export function defenseOf(s: HoldState): number {
  const guards = present(s).filter((p) => p.order && taskOf(p.order.verb, p.order.object)?.kind === 'guard').length;
  const wall = s.buildings.wall.done ? 4 : Math.floor((s.buildings.wall.progress / BUILDINGS.wall.work) * 3);
  return guards * (s.buildings.forge.done ? 3 : 2) + wall;
}

export type OrderResult = { ok: true; state: HoldState } | { ok: false; state: HoldState };

/** Приказ человеку. Бессмысленная фраза не принимается и считается ошибкой. */
export function giveOrder(s: HoldState, id: PersonId, order: Order): OrderResult {
  const p = s.people.find((x) => x.id === id);
  if (!p || p.status !== 'ok' || s.outcome) return { ok: false, state: s };
  if (!taskOf(order.verb, order.object)) {
    return { ok: false, state: { ...s, stats: { ...s.stats, mistakes: s.stats.mistakes + 1 } } };
  }
  return {
    ok: true,
    state: {
      ...s,
      people: s.people.map((x) => (x.id === id ? { ...x, order } : x)),
      stats: { ...s.stats, phrases: s.stats.phrases + 1 },
    },
  };
}

export function clearOrder(s: HoldState, id: PersonId): HoldState {
  return { ...s, people: s.people.map((x) => (x.id === id ? { ...x, order: null } : x)) };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const names = (ps: Person[]) =>
  ps.length <= 1
    ? (ps[0]?.name ?? '')
    : `${ps
        .slice(0, -1)
        .map((p) => p.name)
        .join(', ')} and ${ps.at(-1)!.name}`;

/** Ночь: всё, что сделали за день, еда и вода, набег, настроение — и утро следующего дня. */
export function endDay(s0: HoldState): HoldState {
  if (s0.outcome) return s0;
  const r = { s: s0.rng };
  const s: HoldState = structuredClone(s0);
  const log: string[] = [];
  const res = s.res;
  const people = present(s);
  const tired = (p: Person) => (p.morale <= 3 ? 0.5 : 1);

  // ── работа дня ──
  for (const p of people) {
    const task = p.order ? taskOf(p.order.verb, p.order.object) : null;
    switch (task?.kind ?? 'rest') {
      case 'hunt': {
        const n = Math.round((int(r, 3, 5) + (p.role === 'hunter' ? 3 : 0)) * tired(p));
        res.food += n;
        log.push(`${p.name} brought ${n} food from the hunt.`);
        if (chance(r, 0.15)) {
          p.hp -= 1;
          log.push(`A wolf bit ${p.name} in the woods.`);
        }
        break;
      }
      case 'water': {
        const n = Math.round((int(r, 4, 6) + (p.role === 'scout' ? 3 : 0)) * tired(p));
        res.water += n;
        log.push(`${p.name} fetched ${n} water from the stream.`);
        break;
      }
      case 'wood': {
        const n = Math.round(int(r, 3, 5) * tired(p));
        res.wood += n;
        log.push(`${p.name} chopped ${n} wood.`);
        break;
      }
      case 'iron': {
        const n = Math.round((int(r, 1, 2) + (s.buildings.forge.done ? 1 : 0)) * tired(p));
        res.iron += n;
        log.push(`${p.name} found ${n} iron in the old mine.`);
        break;
      }
      case 'build': {
        const id = (task as { building: BuildingId }).building;
        const b = s.buildings[id];
        const def = BUILDINGS[id];
        if (b.done) {
          log.push(`The ${def.name.toLowerCase()} is already built. ${p.name} sat by the fire.`);
          break;
        }
        if (!b.started) {
          if (res.wood < def.wood || res.iron < def.iron) {
            log.push(`${p.name} had no materials for the ${def.name.toLowerCase()}.`);
            break;
          }
          res.wood -= def.wood;
          res.iron -= def.iron;
          b.started = true;
        }
        b.progress = Math.min(def.work, b.progress + (p.role === 'builder' ? 2 : 1) * tired(p));
        if (b.progress >= def.work) {
          b.done = true;
          log.push(`${p.name} finished the ${def.name.toLowerCase()}!`);
          for (const q of people) q.morale = clamp(q.morale + 1, 0, MAX_MORALE);
        } else log.push(`${p.name} worked on the ${def.name.toLowerCase()}.`);
        break;
      }
      case 'guard':
        break;
      case 'rest':
        p.hp = clamp(p.hp + 1, 0, MAX_HP);
        p.morale = clamp(p.morale + 2, 0, MAX_MORALE);
        break;
    }
  }

  // ── набег ──
  const raid = s.tonight;
  if (s.nightLog) log.push(...s.nightLog);
  else if (raid) {
    s.stats.raids += 1;
    const def = defenseOf(s0);
    const who = raid.kind === 'wolves' ? 'Wolves' : 'Bandits';
    const guards = people.filter((p) => p.order && taskOf(p.order.verb, p.order.object)?.kind === 'guard');
    if (def >= raid.strength) {
      s.stats.repelled += 1;
      log.push(
        guards.length
          ? `${who} came at night. ${names(guards)} drove them away.`
          : `${who} came at night, but the wall stopped them.`,
      );
      for (const g of guards) g.morale = clamp(g.morale + 1, 0, MAX_MORALE);
    } else {
      const dmg = raid.strength - def;
      const stolen: ResId = raid.kind === 'wolves' ? 'food' : pick(r, ['food', 'wood', 'iron'] as const);
      const lost = Math.min(res[stolen], dmg * 2);
      res[stolen] -= lost;
      const victim = pick(r, people);
      victim.hp -= Math.ceil(dmg / 2);
      log.push(
        `${who} broke into the camp! ${raid.kind === 'wolves' ? 'They ate' : 'They took'} ${lost} ${stolen}. ${victim.name} is hurt.`,
      );
      for (const q of people) q.morale = clamp(q.morale - 1, 0, MAX_MORALE);
    }
  }

  // ── еда и вода ──
  const need = { food: 2 * people.length, water: 2 * people.length };
  if (s.buildings.well.done) res.water += 4;
  for (const k of ['food', 'water'] as const) {
    const lack = need[k] - res[k];
    res[k] = Math.max(0, res[k] - need[k]);
    if (lack > 0) {
      log.push(
        k === 'food'
          ? 'There was not enough food. People went to bed hungry.'
          : 'There was not enough water. Everyone is thirsty.',
      );
      for (const q of people) {
        q.morale = clamp(q.morale - 2, 0, MAX_MORALE);
        if (lack >= people.length) q.hp -= 1;
      }
    }
  }

  // ── лекарь ──
  const healer = people.find((p) => p.role === 'healer' && p.hp > 1);
  const wounded = people.filter((p) => p.hp > 0 && p.hp < MAX_HP && p !== healer).sort((a, b) => a.hp - b.hp)[0];
  if (healer && wounded) {
    wounded.hp += 1;
    log.push(`${healer.name} took care of ${wounded.name}'s wounds.`);
  }

  // ── потери ──
  for (const p of people) {
    if (p.hp <= 0) {
      p.status = 'dead';
      p.hp = 0;
      log.push(`${p.name} died in the night.`);
      for (const q of present(s)) q.morale = clamp(q.morale - 3, 0, MAX_MORALE);
    }
  }
  for (const p of present(s)) {
    if (p.morale <= 0) {
      p.status = 'gone';
      log.push(`${p.name} lost hope and left the camp.`);
    }
  }

  for (const p of s.people) p.order = null;
  s.nightLog = null;
  s.battle = null;
  s.day += 1;
  if (present(s).length === 0) {
    s.outcome = 'lose';
    log.push('No one is left in the camp.');
  } else if (s.day > DAYS) {
    s.outcome = 'win';
    log.push('Spring is here. The caravan has come. You survived!');
  } else {
    s.tonight = rollRaid(r, s.day);
    next(r);
  }
  s.report = log;
  s.rng = r.s;
  return s;
}

export const morale = (s: HoldState) => {
  const ps = present(s);
  return ps.length ? ps.reduce((n, p) => n + p.morale, 0) / ps.length : 0;
};

export const phraseOf = (name: string, o: Order) => `${name}, ${o.verb} ${o.object}.`;
