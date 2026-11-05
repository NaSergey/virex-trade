import { chance, int, next, pick, rand, type Rand } from '../../game/model/rng';
import type { IconId } from '../icons';
import type { Battle } from './battle';
import { COND_IDS, CONDS, type CondId } from './conds';
import { ROLE_PERK, cheerLine, makeCrew, sadLine, type Role, type Trait } from './crew';
import { rollEvent, type GameEvent } from './events';
import { findItem, type Items } from './items';
import {
  ALL_PLACES,
  PLACES,
  dirOf,
  makePlaces,
  makeReport,
  placeAt,
  placesOf,
  type Dir,
  type PlaceId,
  type Places,
  type ScoutReport,
} from './scout';
import { rollVisitor, type Visitor } from './visitors';

export { ROLE_PERK, type Role };

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
/** id человека — из набора `RECRUITS` (crew.ts); у старых партий — mira, tom, ash, ezra. */
export type PersonId = string;

/** Глаголы и дополнения приказа — плитки фразы «<имя>, <глагол> <дополнение>». */
export const VERBS = ['go', 'fetch', 'chop', 'mine', 'build', 'guard', 'rest', 'scout', 'search'] as const;
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
  'the north',
  'the east',
  'the south',
  'the west',
  'the mill',
  'the ruins',
  'the farm',
  'the cave',
  'the swamp',
  'the church',
  'the mine',
  'the village',
  'the bridge',
  'the lake',
] as const;
/** Дополнения приказа — группами, чтобы 18 плиток читались на телефоне. Слово «the» на плитке не
 * пишется (оно есть во фразе сверху), состав групп ответа не подсказывает: группа — тема, а не глагол. */
export const OBJECT_GROUPS: [string, Obj[]][] = [
  ['work', ['hunting', 'water', 'wood', 'iron']],
  ['camp', ['the wall', 'the well', 'the forge', 'the tower', 'the gate', 'by the fire']],
  ['lands', ['the north', 'the east', 'the south', 'the west']],
];

/** Места этой партии плитками — по сторонам света; остальных шести на карте нет. */
export const placeObjects = (s: HoldState): Obj[] => placesOf(s.places).map((x) => `the ${x.id}` as Obj);

export type Verb = (typeof VERBS)[number];
export type Obj = (typeof OBJECTS)[number];

export type Task =
  | { kind: 'hunt' }
  | { kind: 'water' }
  | { kind: 'wood' }
  | { kind: 'iron' }
  | { kind: 'build'; building: BuildingId }
  | { kind: 'guard' }
  | { kind: 'rest' }
  | { kind: 'scout'; dir: Dir }
  | { kind: 'search'; place: PlaceId };

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
  'scout the north': { kind: 'scout', dir: 'north' },
  'scout the east': { kind: 'scout', dir: 'east' },
  'scout the south': { kind: 'scout', dir: 'south' },
  'scout the west': { kind: 'scout', dir: 'west' },
  ...Object.fromEntries(ALL_PLACES.map((id) => [`search the ${id}`, { kind: 'search', place: id } as Task])),
};

/** С чем глагол складывается в приказ — плитки, которые подсвечивает подсказка после ошибки. */
export function objectsFor(verb: Verb): Obj[] {
  return (Object.keys(PHRASES) as string[]).filter((k) => k.startsWith(`${verb} `)).map((k) => k.slice(verb.length + 1) as Obj);
}

/** Почему приказ не понят — простым английским; `fix` — плитки, которые исправят приказ. */
export function wrongOrder(s: HoldState, name: string, o: Order, reason: OrderFail | undefined) {
  const place = o.object.replace(/^the /, '');
  const dir = s.places?.[place as PlaceId] ? dirOf(s.places, place as PlaceId) : null;
  if (reason === 'absent') return { text: `There is no ${place} near our camp.`, fix: [] };
  if (reason === 'unknown' && dir)
    return { text: `We do not know the ${place} yet. First scout the ${dir}.`, fix: ['scout', `the ${dir}`] };
  if (reason === 'empty') return { text: `The ${place} is empty now. We took everything from it.`, fix: [] };
  return {
    text: `“${o.verb} ${o.object}”? ${name} does not understand. Try one of the light words.`,
    fix: objectsFor(o.verb) as string[],
  };
}

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
  /** Лицо — иконка; у старых партий его нет, и лицо — сам id. */
  face?: IconId;
  /** «he» или «she» в строках о человеке; у старых партий все — he, кроме Миры. */
  he?: boolean;
  trait?: Trait;
  /** Снаряжение, которое человек носит (нож, топор, лук, кирка, плащ). */
  gear?: string | null;
  /** В разведке: утро возвращения и куда ушёл. Пока человек в пути, приказов ему нет. */
  away?: { back: number; place: PlaceId } | null;
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
  stats: { phrases: number; mistakes: number; raids: number; repelled: number; translated?: number };
  outcome: 'win' | 'lose' | null;
  /** Идущий ночной бой (шаг 2): пока он есть, лагерь показывает бой. */
  battle?: Battle | null;
  /** Строки доклада, которые оставил бой этой ночи; набег уже разыгран — ночь его не считает. */
  nightLog?: string[] | null;
  /** Места вокруг лагеря (шаг 3); у игр шага 1 их нет — подставляет `withPlaces`. */
  places?: Places;
  /** Доклады вернувшихся разведчиков, ещё без ответа на вопрос. */
  reports?: ScoutReport[];
  /** Гость у ворот этим утром (шаг 4) — ждёт ответа. */
  visitor?: Visitor | null;
  /** Событие этого утра — трудное решение; ждёт ответа. */
  event?: GameEvent | null;
  /** Последние события — чтобы не повторялись подряд. */
  seen?: string[];
  /** Какая это зима. У старых партий — тихая. */
  cond?: CondId;
  /** Дети, которых приняли в лагерь: едят и пьют, но не работают. */
  kids?: number;
  /** Вещи лагеря — запасы, ещё не надетые и не потраченные. */
  items?: Items;
}

export const faceOf = (p: Person): IconId => p.face ?? (p.id as IconId);
export const condOf = (s: HoldState): CondId => s.cond ?? 'calm';

const CLASSIC_PEOPLE: Omit<Person, 'hp' | 'morale' | 'status' | 'order'>[] = [
  { id: 'mira', name: 'Mira', role: 'hunter', he: false },
  { id: 'tom', name: 'Tom', role: 'builder', he: true },
  { id: 'ash', name: 'Ash', role: 'scout', he: true },
  { id: 'ezra', name: 'Ezra', role: 'healer', he: true },
];

/** Набег ночи: волки с начала, разбойники с 10-го дня (рядом с войной — с 4-го и сильнее). */
const rollRaid = (r: Rand, day: number, cond: CondId = 'calm'): Raid | null => {
  const often = cond === 'wolves' ? 0.08 : 0;
  if (day < 2 || !chance(r, Math.min(0.65, 0.15 + often + day * 0.016))) return null;
  const banditsFrom = cond === 'war' ? 4 : 10;
  const kind = day < banditsFrom ? 'wolves' : pick(r, ['wolves', 'bandits'] as const);
  const extra = cond === 'war' && kind === 'bandits' ? 1 : 0;
  return { kind, strength: int(r, 2, 4) + Math.floor(day / 5) + extra };
};

/**
 * Новая партия. Отряд, карта и зима случайны; `classic` — прежняя игра (Мира, Том, Эш, Эзра на
 * мельнице, руинах, ферме и пещере, тихая зима, без характеров) — её держат тесты правил.
 */
export function newGame(seed: number, opts: { classic?: boolean } = {}): HoldState {
  const r = rand(seed);
  const classic = !!opts.classic;
  const cond: CondId = classic ? 'calm' : pick(r, COND_IDS);
  const crew = classic
    ? CLASSIC_PEOPLE.map((p) => ({ ...p }))
    : makeCrew(r).map(({ id, name, face, he, role, trait }) => ({ id, name, face, he, role, trait }));
  const s: HoldState = {
    v: 1,
    rng: 0,
    day: 1,
    cond,
    kids: 0,
    items: { bandage: 1 },
    res: { food: cond === 'hunger' ? 11 : 14, water: 10, wood: 10, iron: 2 },
    people: crew.map((p) => ({ ...p, hp: p.trait === 'weak' ? MAX_HP - 1 : MAX_HP, morale: 7, status: 'ok', order: null })),
    buildings: {
      wall: { started: false, progress: 0, done: false },
      well: { started: false, progress: 0, done: false },
      forge: { started: false, progress: 0, done: false },
      tower: { started: false, progress: 0, done: false },
    },
    tonight: rollRaid(r, 1, cond),
    report: classic
      ? ['The winter is coming. Keep your people alive for thirty days.']
      : ['The winter is coming. Keep your people alive for thirty days.', CONDS[cond].text],
    stats: { phrases: 0, mistakes: 0, raids: 0, repelled: 0 },
    outcome: null,
    places: makePlaces(r, classic),
    reports: [],
  };
  s.rng = r.s;
  return s;
}

/**
 * Старое сохранение — в нынешний вид: игра до разведки получает места (от её же случайности),
 * места без стороны света — прежнюю карту.
 */
export function withPlaces(s: HoldState): HoldState {
  if (!s.places) {
    const r = { s: s.rng };
    const places = makePlaces(r, true);
    return { ...s, places, reports: s.reports ?? [], rng: r.s };
  }
  if ((Object.keys(s.places) as PlaceId[]).every((id) => s.places![id]?.dir)) return s;
  const places: Places = {};
  for (const id of Object.keys(s.places) as PlaceId[]) places[id] = { ...s.places[id]!, dir: dirOf(s.places, id) };
  return { ...s, places };
}

/** Кто в лагере сейчас: жив, не ушёл и не в разведке. */
export const present = (s: HoldState) => s.people.filter((p) => p.status === 'ok' && !p.away);
/** Кто ещё в отряде — в том числе в разведке. */
export const alive = (s: HoldState) => s.people.filter((p) => p.status === 'ok');

/** Сколько ночь съест и выпьет: по два на взрослого (жадный ест три), по одному на ребёнка. */
export function upkeep(s: HoldState): { food: number; water: number } {
  const ps = present(s);
  const kids = s.kids ?? 0;
  const greedy = ps.filter((p) => p.trait === 'greedy').length;
  return { food: 2 * ps.length + greedy + kids, water: 2 * ps.length + kids - (s.buildings.well.done ? 4 : 0) };
}

/** Защита на эту ночь — по приказам дня. */
export function defenseOf(s: HoldState): number {
  const guards = present(s).filter((p) => p.order && taskOf(p.order.verb, p.order.object)?.kind === 'guard');
  const wall = s.buildings.wall.done ? 4 : Math.floor((s.buildings.wall.progress / BUILDINGS.wall.work) * 3);
  const each = s.buildings.forge.done ? 3 : 2;
  return guards.reduce((n, p) => n + (p.trait === 'brave' ? each + 1 : p.trait === 'coward' ? each - 1 : each), 0) + wall;
}

export type OrderFail = 'nonsense' | 'unknown' | 'empty' | 'absent';

export type OrderResult = { ok: true; state: HoldState } | { ok: false; state: HoldState; reason?: OrderFail };

/** Приказ человеку. Бессмысленная фраза не принимается и считается ошибкой. */
export function giveOrder(s: HoldState, id: PersonId, order: Order): OrderResult {
  const p = s.people.find((x) => x.id === id);
  if (!p || p.status !== 'ok' || p.away || s.outcome) return { ok: false, state: s };
  const task = taskOf(order.verb, order.object);
  if (!task) {
    return { ok: false, reason: 'nonsense', state: { ...s, stats: { ...s.stats, mistakes: s.stats.mistakes + 1 } } };
  }
  // Обыскать можно только место, о котором понят доклад, и только один раз.
  if (task.kind === 'search') {
    const place = s.places?.[task.place];
    if (!place) return { ok: false, reason: 'absent', state: s };
    if (!place.known) return { ok: false, reason: 'unknown', state: s };
    if (place.looted) return { ok: false, reason: 'empty', state: s };
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
  const cond = condOf(s);
  const tired = (p: Person) => (p.morale <= 3 ? 0.5 : 1);
  const strong = (p: Person) => (p.trait === 'strong' ? 2 : 0);
  const his = (p: Person) => (p.he === false ? 'her' : 'his');
  const hurt = (p: Person, n: number) => {
    p.hp -= n + (p.trait === 'weak' ? 1 : 0);
  };

  // ── работа дня ──
  for (const p of people) {
    const task = p.order ? taskOf(p.order.verb, p.order.object) : null;
    switch (task?.kind ?? 'rest') {
      case 'hunt': {
        const n = Math.max(
          1,
          Math.round(
            (int(r, 3, 5) + (p.role === 'hunter' ? 3 : 0) + (p.gear === 'bow' ? 2 : 0) - (cond === 'hunger' ? 1 : 0)) * tired(p),
          ),
        );
        res.food += n;
        log.push(
          pick(r, [
            `${p.name} brought ${n} food from the hunt.`,
            `${p.name} came back from the hunt with ${n} food.`,
            `${p.name} caught rabbits in the snow: ${n} food.`,
            `${p.name} followed a deer all day. ${n} food.`,
          ]),
        );
        const found = findItem(r, s, p, 0.08);
        if (found) log.push(found);
        if (chance(r, cond === 'wolves' ? 0.25 : 0.15)) {
          hurt(p, 1);
          log.push(pick(r, [`A wolf bit ${p.name} in the woods.`, `${p.name} fell on the ice and is hurt.`]));
        }
        break;
      }
      case 'water': {
        const n = Math.max(1, Math.round((int(r, 4, 6) + (p.role === 'scout' ? 3 : 0) - (cond === 'cold' ? 1 : 0)) * tired(p)));
        res.water += n;
        log.push(
          pick(r, [
            `${p.name} brought ${n} water.`,
            `${p.name} carried ${n} water from the river.`,
            `${p.name} made water from snow: ${n}.`,
          ]),
        );
        break;
      }
      case 'wood': {
        const n = Math.round((int(r, 3, 5) + strong(p) + (p.gear === 'axe' ? 2 : 0)) * tired(p));
        res.wood += n;
        log.push(
          pick(r, [
            `${p.name} chopped ${n} wood.`,
            `${p.name} cut down a dead tree: ${n} wood.`,
            `${p.name} came back with ${n} wood on ${his(p)} back.`,
          ]),
        );
        break;
      }
      case 'iron': {
        const n = Math.round(
          (int(r, 1, 2) + (s.buildings.forge.done ? 1 : 0) + (p.trait === 'strong' ? 1 : 0) + (p.gear === 'pickaxe' ? 1 : 0)) *
            tired(p),
        );
        res.iron += n;
        log.push(pick(r, [`${p.name} found ${n} iron in the rocks.`, `${p.name} dug in the hills and found ${n} iron.`]));
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
      case 'scout': {
        const dir = (task as { dir: Dir }).dir;
        const at = placeAt(s.places, dir);
        if (!at) break;
        p.away = { back: s.day + 2, place: at };
        log.push(`${p.name} went to scout the ${dir}.`);
        break;
      }
      case 'search': {
        const id = (task as { place: PlaceId }).place;
        const place = s.places?.[id];
        if (!place || place.looted) break;
        place.looted = true;
        const name = PLACES[id].name;
        if (place.loot === 'nothing' || place.amount === 0) log.push(`${p.name} searched ${name} and found nothing.`);
        else {
          const n = Math.round(place.amount * tired(p));
          res[place.loot] += n;
          log.push(`${p.name} searched ${name} and brought back ${n} ${place.loot}.`);
        }
        const found = findItem(r, s, p, 0.75);
        if (found) log.push(found);
        if (place.danger !== 'none') {
          hurt(p, 2);
          p.morale = clamp(p.morale - 1, 0, MAX_MORALE);
          log.push(`${place.danger === 'wolves' ? 'Wolves' : 'Bandits'} attacked ${p.name} at ${name}.`);
        }
        break;
      }
      case 'guard':
        break;
      case 'rest':
        p.hp = clamp(p.hp + 1, 0, MAX_HP);
        p.morale = clamp(p.morale + 2, 0, MAX_MORALE);
        if (chance(r, 0.3)) log.push(pick(r, [`${p.name} rested by the fire.`, `${p.name} slept all day.`]));
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
      hurt(victim, Math.ceil(dmg / 2));
      log.push(
        `${who} broke into the camp! ${raid.kind === 'wolves' ? 'They ate' : 'They took'} ${lost} ${stolen}. ${victim.name} is hurt.`,
      );
      for (const q of people) q.morale = clamp(q.morale - (q.trait === 'coward' ? 2 : 1), 0, MAX_MORALE);
    }
  }

  // ── холод: костёр через ночь ест дерево ──
  if (cond === 'cold' && people.length && s.day % 2 === 0) {
    if (res.wood >= 1) res.wood -= 1;
    else {
      log.push('There was no wood for the fire. Everyone was cold all night.');
      for (const q of people) if (q.gear !== 'coat') q.morale = clamp(q.morale - 1, 0, MAX_MORALE);
    }
  }

  // ── еда и вода ──
  const kids = s.kids ?? 0;
  const greedy = people.filter((p) => p.trait === 'greedy').length;
  const need = { food: 2 * people.length + greedy + kids, water: 2 * people.length + kids };
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
        if (lack >= people.length && q.gear !== 'coat') q.hp -= 1;
      }
    }
  }

  // ── лекарь ──
  const healer = people.find((p) => p.role === 'healer' && p.hp > 1);
  const wounded = people.filter((p) => p.hp > 0 && p.hp < MAX_HP && p !== healer).sort((a, b) => a.hp - b.hp)[0];
  if (healer && wounded) {
    wounded.hp += 1;
    log.push(`${healer.name} helped ${wounded.name}. ${wounded.name} feels better.`);
  }

  // ── характеры ──
  for (const p of people) {
    if (p.trait === 'gloomy' && chance(r, 0.3)) p.morale = clamp(p.morale - 1, 0, MAX_MORALE);
  }
  const cheerful = people.find((p) => p.trait === 'cheerful' && p.hp > 0);
  if (cheerful) {
    const low = people.filter((p) => p !== cheerful && p.morale <= 5).sort((a, b) => a.morale - b.morale)[0];
    if (low) {
      low.morale = clamp(low.morale + 1, 0, MAX_MORALE);
      if (chance(r, 0.35)) log.push(cheerLine(r, cheerful.name));
    }
  }
  const sad = people.filter((p) => p.hp > 0 && p.morale > 0 && p.morale <= 3);
  if (sad.length) {
    const p = pick(r, sad);
    log.push(sadLine(r, p.name, p.he !== false));
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
  s.visitor = null;
  s.event = null;
  s.day += 1;
  // Разведчики, чьё утро наступило, возвращаются с докладом.
  for (const p of s.people) {
    if (p.status !== 'ok' || !p.away || p.away.back !== s.day || !s.places) continue;
    const id = p.away.place;
    p.away = null;
    s.reports = [...(s.reports ?? []), makeReport(r, p.id, id, s.places[id]!, s.day)];
    log.push(`${p.name} came back from the ${dirOf(s.places, id)} with a report.`);
    if (chance(r, 0.1)) {
      p.hp = Math.max(1, p.hp - 1);
      log.push(`${p.name} is tired and a little hurt.`);
    }
  }
  if (alive(s).length === 0) {
    s.outcome = 'lose';
    log.push('No one is left in the camp.');
  } else if (s.day > DAYS) {
    s.outcome = 'win';
    log.push('Spring is here. The caravan has come. You survived!');
  } else {
    s.tonight = rollRaid(r, s.day, cond);
    next(r);
    s.visitor = rollVisitor(r, s);
    s.event = s.visitor ? null : rollEvent(r, s);
  }
  s.report = log;
  s.rng = r.s;
  return s;
}

export const morale = (s: HoldState) => {
  const ps = present(s);
  return ps.length ? ps.reduce((n, p) => n + p.morale, 0) / ps.length : 0;
};

/** Цена перевода фразы целиком: −1 настроения у всех в лагере. */
export function spendMorale(s: HoldState): HoldState {
  return {
    ...s,
    people: s.people.map((p) => (p.status === 'ok' && !p.away ? { ...p, morale: Math.max(0, p.morale - 1) } : p)),
    stats: { ...s.stats, translated: (s.stats.translated ?? 0) + 1 },
  };
}

export const phraseOf = (name: string, o: Order) => `${name}, ${o.verb} ${o.object}.`;
