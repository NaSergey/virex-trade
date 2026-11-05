import { int, pick, type Rand } from '../../game/model/rng';
import { MAX_HP, MAX_MORALE, present, type HoldState, type PersonId, type ResId, type Role } from './rules';

/**
 * Ночной бой (шаг 2, спека docs/superpowers/specs/2026-11-04-ashen-hold-design.md).
 *
 * Раунд: каждый враг объявляет удар по-английски («I will bite the healer!» — цель названа
 * ролью, а не именем: понять, кого бьют, значит прочитать); игрок отдаёт каждому бойцу приказ
 * фразой из плиток («Tom, cover Ezra»); бойцы действуют; потом удары врагов — каждый
 * незакрытый удар парируется на время: вспыхивает глагол удара, и надо выбрать защиту, которая
 * от него спасает (стрелу не отбить клинком — от неё пригибаются).
 *
 * Чистые функции поверх `HoldState`: бой лежит в `s.battle`, итог уходит в `s.nightLog`, а
 * дальше ночь считает `endDay` как обычно.
 */

export type AttackVerb = 'bite' | 'shoot' | 'smash' | 'slash';
export type Reaction = 'duck' | 'dodge' | 'parry' | 'kick';
export const REACTIONS: readonly Reaction[] = ['duck', 'dodge', 'parry', 'kick'];

/** Единственный источник «какая защита спасает от какого удара». */
export const SAVES: Record<AttackVerb, Reaction> = { shoot: 'duck', smash: 'dodge', slash: 'parry', bite: 'kick' };

export const REACTION_HINT: Record<Reaction, string> = {
  duck: 'get down low',
  dodge: 'step to the side',
  parry: 'block it with a blade',
  kick: 'kick it away',
};

/** Прошедшее время для доклада: «The archer shot Mira». */
const PAST: Record<AttackVerb, string> = { bite: 'bit', shoot: 'shot', smash: 'smashed', slash: 'slashed' };
/** Третье лицо для вспышки: «THE WOLF BITES». */
export const THIRD: Record<AttackVerb, string> = { bite: 'bites', shoot: 'shoots', smash: 'smashes', slash: 'slashes' };

export type EnemyKind = 'wolf' | 'archer' | 'brute' | 'thief';

const KINDS: Record<EnemyKind, { hp: number; atk: number; verb: AttackVerb }> = {
  wolf: { hp: 3, atk: 2, verb: 'bite' },
  archer: { hp: 3, atk: 2, verb: 'shoot' },
  brute: { hp: 5, atk: 3, verb: 'smash' },
  thief: { hp: 3, atk: 2, verb: 'slash' },
};

const WOLF_NAMES = ['the grey wolf', 'the black wolf', 'the old wolf', 'the young wolf'];
const BANDITS: [EnemyKind, string][] = [
  ['archer', 'the archer'],
  ['brute', 'the brute'],
  ['thief', 'the thief'],
  ['archer', 'the tall archer'],
];

export const ROLE_NAME: Record<Role, string> = {
  hunter: 'the hunter',
  builder: 'the builder',
  scout: 'the scout',
  healer: 'the healer',
};

export interface Enemy {
  id: string;
  kind: EnemyKind;
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  verb: AttackVerb;
  /** Кого он ударит в этом раунде. */
  target: PersonId | null;
}

export type BVerb = 'attack' | 'cover' | 'heal';
export const BVERBS: readonly BVerb[] = ['attack', 'cover', 'heal'];

export interface BOrder {
  verb: BVerb;
  /** id врага или человека. */
  target: string;
}

export interface Hit {
  enemy: string;
  verb: AttackVerb;
  /** Кого метил враг. */
  aim: PersonId;
  /** Кто принял удар — закрывший товарищ или сама цель. */
  taker: PersonId;
  damage: number;
  covered: boolean;
  done: boolean;
}

export interface Battle {
  kind: 'wolves' | 'bandits';
  round: number;
  enemies: Enemy[];
  orders: Partial<Record<PersonId, BOrder>>;
  phase: 'orders' | 'enemy' | 'over';
  hits: Hit[];
  /** Что случилось за бой — по-английски, уходит в доклад утра. */
  log: string[];
  /** Строки последнего хода — показываются на экране боя. */
  last: string[];
  outcome: 'won' | 'fled' | 'lost' | null;
  /** Был ли этот человек днём в страже — бьёт сильнее. */
  guards: PersonId[];
}

export const MAX_ROUNDS = 4;

const box = (s: HoldState): Rand => ({ s: s.rng });
/** Кто дерётся: в лагере, на ногах и не уходит этой ночью в разведку. */
const fighters = (s: HoldState) => present(s).filter((p) => p.hp > 0 && p.order?.verb !== 'scout');
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function rollTargets(r: Rand, s: HoldState, b: Battle) {
  const alive = fighters(s);
  for (const e of b.enemies) e.target = e.hp > 0 && alive.length ? pick(r, alive).id : null;
}

/** Начать бой с набегом этой ночи. Нет набега — бой не начинается. */
export function startBattle(s0: HoldState): HoldState {
  const raid = s0.tonight;
  if (!raid || s0.battle || s0.outcome) return s0;
  const s: HoldState = structuredClone(s0);
  const r = box(s);
  const n = clamp(Math.round(raid.strength / 2.5), 1, 4);
  const bonus = Math.floor(s.day / 12);
  const list: [EnemyKind, string][] =
    raid.kind === 'wolves' ? WOLF_NAMES.slice(0, n).map((name) => ['wolf', name]) : BANDITS.slice(0, n);
  const enemies: Enemy[] = list.map(([kind, name], i) => ({
    id: `foe${i}`,
    kind,
    name,
    hp: KINDS[kind].hp,
    maxHp: KINDS[kind].hp,
    atk: KINDS[kind].atk + bonus,
    verb: KINDS[kind].verb,
    target: null,
  }));
  const b: Battle = {
    kind: raid.kind,
    round: 1,
    enemies,
    orders: {},
    phase: 'orders',
    hits: [],
    log: [`${raid.kind === 'wolves' ? 'Wolves' : 'Bandits'} attacked the camp at night.`],
    last: [],
    outcome: null,
    guards: present(s)
      .filter((p) => p.order?.verb === 'guard' && p.order.object === 'the gate')
      .map((p) => p.id),
  };
  rollTargets(r, s, b);
  s.battle = b;
  s.rng = r.s;
  return s;
}

/** Цель приказа по подписи плитки: имя человека или название врага. */
export function targetId(s: HoldState, label: string): string | null {
  const b = s.battle;
  const p = s.people.find((x) => x.name === label);
  if (p) return p.id;
  return b?.enemies.find((e) => e.name === label)?.id ?? null;
}

export type BattleOrderResult = { ok: boolean; state: HoldState };

/** Приказ бойцу. Бессмыслица («attack Tom», «cover the wolf») не принимается и считается ошибкой. */
export function battleOrder(s: HoldState, id: PersonId, verb: BVerb, label: string): BattleOrderResult {
  const b = s.battle;
  const p = s.people.find((x) => x.id === id);
  if (!b || b.phase !== 'orders' || !p || p.status !== 'ok' || p.hp <= 0) return { ok: false, state: s };
  const t = targetId(s, label);
  const enemy = b.enemies.find((e) => e.id === t && e.hp > 0);
  const ally = s.people.find((x) => x.id === t && x.status === 'ok' && x.hp > 0);
  const valid = (verb === 'attack' && !!enemy) || (verb === 'cover' && !!ally && ally.id !== id) || (verb === 'heal' && !!ally);
  if (!valid || !t) return { ok: false, state: { ...s, stats: { ...s.stats, mistakes: s.stats.mistakes + 1 } } };
  return {
    ok: true,
    state: {
      ...s,
      battle: { ...b, orders: { ...b.orders, [id]: { verb, target: t } } },
      stats: { ...s.stats, phrases: s.stats.phrases + 1 },
    },
  };
}

export const damageOf = (s: HoldState, b: Battle, id: PersonId, e: Enemy): number => {
  const p = s.people.find((x) => x.id === id)!;
  return (
    2 +
    (b.guards.includes(id) ? 1 : 0) +
    (s.buildings.forge.done ? 1 : 0) +
    (p.role === 'hunter' && e.kind === 'wolf' ? 1 : 0) +
    (p.gear === 'knife' || p.gear === 'axe' ? 1 : 0)
  );
};

/** Бойцы действуют по приказам, потом враги наносят удары — закрытые сразу, остальные ждут парирования. */
export function fight(s0: HoldState): HoldState {
  const b0 = s0.battle;
  if (!b0 || b0.phase !== 'orders') return s0;
  const s: HoldState = structuredClone(s0);
  const b = s.battle!;
  const last: string[] = [];
  const cover = new Map<PersonId, PersonId>();
  for (const p of fighters(s)) {
    const o = b.orders[p.id];
    if (!o) {
      last.push(`${p.name} did nothing.`);
      continue;
    }
    if (o.verb === 'attack') {
      const e = b.enemies.find((x) => x.id === o.target);
      if (!e || e.hp <= 0) {
        last.push(`${p.name} struck at the air.`);
        continue;
      }
      const d = damageOf(s, b, p.id, e);
      e.hp = Math.max(0, e.hp - d);
      last.push(e.hp === 0 ? `${p.name} killed ${e.name}!` : `${p.name} hit ${e.name}.`);
    } else if (o.verb === 'cover') {
      cover.set(o.target as PersonId, p.id);
      last.push(`${p.name} raised a shield for ${s.people.find((x) => x.id === o.target)!.name}.`);
    } else {
      const t = s.people.find((x) => x.id === o.target)!;
      const n = p.role === 'healer' ? 2 : 1;
      const before = t.hp;
      t.hp = Math.min(MAX_HP, t.hp + n);
      last.push(
        t.hp > before
          ? t.id === p.id
            ? `${p.name} feels better.`
            : `${p.name} helped ${t.name}. ${t.name} feels better.`
          : `${t.name} did not need healing.`,
      );
    }
  }
  const wall = s.buildings.wall.done ? 1 : 0;
  b.hits = [];
  for (const e of b.enemies) {
    if (e.hp <= 0 || !e.target) continue;
    const aim = s.people.find((x) => x.id === e.target)!;
    if (aim.hp <= 0 || aim.status !== 'ok') continue;
    const guard = cover.get(aim.id);
    const coverer = guard ? s.people.find((x) => x.id === guard && x.hp > 0) : undefined;
    if (coverer) {
      const dmg = Math.max(0, e.atk - 2 - wall);
      coverer.hp -= dmg;
      last.push(dmg > 0 ? `${coverer.name} took the blow for ${aim.name}.` : `${coverer.name} blocked ${e.name} completely.`);
      b.hits.push({ enemy: e.id, verb: e.verb, aim: aim.id, taker: coverer.id, damage: dmg, covered: true, done: true });
    } else {
      b.hits.push({
        enemy: e.id,
        verb: e.verb,
        aim: aim.id,
        taker: aim.id,
        damage: Math.max(1, e.atk - wall),
        covered: false,
        done: false,
      });
    }
  }
  b.last = last;
  b.log.push(...last.filter((l) => l.includes('killed')));
  b.phase = 'enemy';
  return closeIfDone(s);
}

/** Ответ на удар врага: верная защита — удар мимо; неверная или опоздание (`null`) — полный урон. */
export function react(s0: HoldState, index: number, reaction: Reaction | null): HoldState {
  const b0 = s0.battle;
  const h0 = b0?.hits[index];
  if (!b0 || b0.phase !== 'enemy' || !h0 || h0.done) return s0;
  const s: HoldState = structuredClone(s0);
  const b = s.battle!;
  const h = b.hits[index];
  const e = b.enemies.find((x) => x.id === h.enemy)!;
  const p = s.people.find((x) => x.id === h.taker)!;
  h.done = true;
  if (reaction === SAVES[h.verb]) {
    b.last.push(
      `${p.name} ${reaction === 'duck' ? 'ducked' : reaction === 'dodge' ? 'dodged' : reaction === 'parry' ? 'parried' : 'kicked back'} — ${e.name} missed.`,
    );
    h.damage = 0;
  } else {
    p.hp -= h.damage;
    b.last.push(`${e.name[0].toUpperCase()}${e.name.slice(1)} ${PAST[h.verb]} ${p.name}.`);
  }
  return closeIfDone(s);
}

/** Все удары раунда разобраны — итог боя или следующий раунд. */
function closeIfDone(s: HoldState): HoldState {
  const b = s.battle!;
  if (b.phase !== 'enemy' || b.hits.some((h) => !h.done)) return s;
  const r = box(s);
  const foes = b.enemies.filter((e) => e.hp > 0);
  const alive = fighters(s);
  const who = b.kind === 'wolves' ? 'wolves' : 'bandits';
  if (foes.length === 0) {
    b.outcome = 'won';
    b.log.push(`All the ${who} are dead. The camp is safe.`);
  } else if (alive.length === 0) {
    b.outcome = 'lost';
    b.log.push(`No one could fight any more. The ${who} took what they wanted.`);
  } else if (b.round >= MAX_ROUNDS) {
    b.outcome = 'fled';
    b.log.push(`The ${who} ran back into the dark.`);
  } else {
    b.round += 1;
    b.orders = {};
    b.hits = [];
    b.phase = 'orders';
    rollTargets(r, s, b);
    s.rng = r.s;
    return s;
  }
  b.phase = 'over';
  s.rng = r.s;
  return s;
}

/** Бой окончен — последствия и доклад; дальше ночь идёт обычным `endDay`. */
export function finishBattle(s0: HoldState): HoldState {
  const b0 = s0.battle;
  if (!b0 || b0.phase !== 'over') return s0;
  const s: HoldState = structuredClone(s0);
  const b = s.battle!;
  const r = box(s);
  s.stats.raids += 1;
  const people = present(s);
  const foes = b.enemies.filter((e) => e.hp > 0).length;
  if (b.outcome === 'won') {
    s.stats.repelled += 1;
    for (const p of people) p.morale = clamp(p.morale + 1, 0, MAX_MORALE);
  } else {
    const kinds: ResId[] = b.kind === 'wolves' ? ['food'] : ['food', 'wood', 'iron'];
    const take = (b.outcome === 'lost' ? 4 : 2) * Math.max(1, foes);
    const what = pick(r, kinds);
    const lost = Math.min(s.res[what], take + int(r, 0, 2));
    s.res[what] -= lost;
    if (lost > 0) b.log.push(`They ${b.kind === 'wolves' ? 'ate' : 'took'} ${lost} ${what}.`);
    for (const p of people) p.morale = clamp(p.morale - (b.outcome === 'lost' ? 2 : 1), 0, MAX_MORALE);
  }
  s.nightLog = b.log;
  s.tonight = null;
  s.battle = null;
  s.rng = r.s;
  return s;
}

/** Три кнопки защиты: верная и две другие, порядок от номера удара — один и тот же при перерисовке. */
export function reactionChoices(h: Hit, index: number): Reaction[] {
  const right = SAVES[h.verb];
  const others = REACTIONS.filter((x) => x !== right);
  const picked = [others[index % 3], others[(index + 1) % 3]];
  const all = [right, ...picked];
  const shift = (index * 7 + h.enemy.length) % 3;
  return [...all.slice(shift), ...all.slice(0, shift)];
}

/** Фраза врага над ним: «I will bite the healer!» */
export function intentOf(s: HoldState, e: Enemy): string | null {
  if (e.hp <= 0 || !e.target) return null;
  const t = s.people.find((x) => x.id === e.target)!;
  return `I will ${e.verb} ${ROLE_NAME[t.role]}!`;
}
