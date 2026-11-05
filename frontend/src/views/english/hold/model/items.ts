import { chance, pick, weighted, type Rand } from '../../game/model/rng';
import type { IconId } from '../icons';
import { MAX_HP, MAX_MORALE, type HoldState, type Person } from './rules';

/**
 * Вещи лагеря — инвентарь (спека docs/superpowers/specs/2026-11-04-ashen-hold-design.md).
 *
 * Шестьдесят вещей четырёх видов. Снаряжение человек носит в трёх слотах: оружие (удар в бою,
 * у некоторых — сильнее против зверей или людей), одежда (защита от удара, тепло) и инструмент
 * (больше добычи, быстрее стройка, безопаснее обыск). Припасы тратятся: лекарства лечат, вещи
 * для души поднимают настроение одному или всем, еда уходит в общий запас. Вещи находят при
 * обыске мест, на охоте и в событиях дня; редкие — реже. Всё про вещи — по-английски.
 */

export type Slot = 'weapon' | 'armor' | 'tool';
export type Kind = Slot | 'supply';
/** Против кого оружие сильнее: звери (волки) или люди (разбойники). */
export type Foe = 'beast' | 'man';
/** Где инструмент помогает. */
export type Work = 'hunt' | 'wood' | 'iron' | 'water' | 'build' | 'search' | 'safe' | 'guard' | 'rest' | 'scout';

export interface ItemDef {
  name: string;
  kind: Kind;
  /** Что даёт — по-английски, на карточке вещи. */
  text: string;
  icon: IconId;
  rare?: boolean;
  /** Оружие: прибавка к удару и против кого ещё сильнее. */
  atk?: number;
  vs?: Foe;
  /** Одежда: сколько урона снимает с удара; warm — не страдает от холода и голода. */
  def?: number;
  warm?: boolean;
  /** Инструмент: где и насколько помогает. */
  work?: Partial<Record<Work, number>>;
  /** Припасы: здоровье, настроение одному, настроение всем, еда в запас. */
  heal?: number;
  mood?: number;
  all?: number;
  food?: number;
}

const W = (name: string, icon: IconId, atk: number, text: string, more: Partial<ItemDef> = {}): ItemDef => ({
  name,
  kind: 'weapon',
  icon,
  atk,
  text,
  ...more,
});
const A = (name: string, icon: IconId, text: string, more: Partial<ItemDef>): ItemDef => ({
  name,
  kind: 'armor',
  icon,
  text,
  ...more,
});
const T = (
  name: string,
  icon: IconId,
  text: string,
  work: Partial<Record<Work, number>>,
  more: Partial<ItemDef> = {},
): ItemDef => ({
  name,
  kind: 'tool',
  icon,
  text,
  work,
  ...more,
});
const S = (name: string, icon: IconId, text: string, more: Partial<ItemDef>): ItemDef => ({
  name,
  kind: 'supply',
  icon,
  text,
  ...more,
});

export const ITEMS = {
  // ── оружие ──
  knife: W('knife', 'knife', 1, 'a small blade: +1 in a fight'),
  stiletto: W('long knife', 'stiletto', 1, '+1 in a fight, +1 more against people', { vs: 'man' }),
  cleaver: W('meat cleaver', 'cleaver', 1, 'heavy and short: +1 in a fight'),
  hammer: W('hammer', 'hammer', 1, '+1 in a fight', { work: { build: 1 } }),
  pitchfork: W('pitchfork', 'pitchfork', 2, 'long and sharp: +2 in a fight'),
  scythe: W('scythe', 'scythe', 2, '+2 in a fight'),
  spear: W('spear', 'spear', 2, '+2 in a fight, +1 more against animals', { vs: 'beast' }),
  harpoon: W('hunting spear', 'harpoon', 1, '+1 in a fight, more food from the hunt', { vs: 'beast', work: { hunt: 1 } }),
  bow: W('bow', 'bow', 1, '+1 in a fight, +2 food from the hunt', { vs: 'beast', work: { hunt: 2 } }),
  longbow: W('long bow', 'longbow', 2, '+2 in a fight, +2 food from the hunt', { vs: 'beast', work: { hunt: 2 }, rare: true }),
  bolas: W('bolas', 'bolas', 1, '+1 in a fight, +1 more against animals', { vs: 'beast' }),
  mace: W('mace', 'mace', 2, '+2 in a fight, +1 more against people', { vs: 'man' }),
  sword: W('old sword', 'sword', 3, 'a real weapon: +3 in a fight', { rare: true }),
  spikedclub: W('spiked club', 'spikedclub', 3, '+3 in a fight', { rare: true }),
  battleaxe: W('battle axe', 'battleaxe', 3, '+3 in a fight, +1 more against people', { vs: 'man', rare: true }),
  firebomb: W('fire bomb', 'firebomb', 2, '+2 in a fight, +2 more against animals', { vs: 'beast', rare: true }),
  // ── одежда ──
  vest: A('leather vest', 'vest', 'takes 1 damage less in a fight', { def: 1 }),
  helmet: A('helmet', 'helmet', 'takes 1 damage less in a fight', { def: 1 }),
  ironhelmet: A('iron helmet', 'ironhelmet', 'takes 1 damage less and keeps the head warm', { def: 1, warm: true }),
  shield: A('wooden shield', 'shield', 'takes 1 damage less in a fight', { def: 1 }),
  breastplate: A('breastplate', 'breastplate', 'takes 2 damage less in a fight', { def: 2, rare: true }),
  coat: A('warm coat', 'coat', 'does not get sick from cold or hunger', { warm: true }),
  furboots: A('fur boots', 'furboots', 'warm feet: no harm from cold or hunger', { warm: true }),
  hat: A('winter hat', 'hat', 'warm: no harm from cold or hunger', { warm: true }),
  gloves: A('thick gloves', 'gloves', 'warm hands: no harm from cold', { warm: true }),
  sleepbag: A('sleeping bag', 'sleepbag', 'sleeps warm: rest gives more health', { warm: true, work: { rest: 1 } }),
  // ── инструменты ──
  axe: T('axe', 'axe', '+2 wood, and +1 in a fight', { wood: 2 }, { atk: 1 }),
  pickaxe: T('pickaxe', 'pickaxe', '+1 iron from the rocks', { iron: 1 }),
  saw: T('saw', 'saw', 'builds faster', { build: 1 }),
  rod: T('fishing rod', 'rod', '+2 food from the hunt', { hunt: 2 }),
  trap: T('wolf trap', 'trap', '+1 food from the hunt', { hunt: 1 }),
  flask: T('water flask', 'flask', '+2 water', { water: 2 }),
  lantern: T('lantern', 'lantern', 'safer in dark places: less hurt', { safe: 1 }),
  rope: T('rope', 'rope', 'finds more when searching', { search: 3 }),
  compass: T('compass', 'compass', 'scouts never get lost or hurt', { scout: 1 }),
  spyglass: T('spyglass', 'spyglass', 'a guard sees more: +1 defense', { guard: 1 }),
  whistle: T('whistle', 'whistle', 'a guard calls for help: +1 defense', { guard: 1 }),
  needle: T('sewing needle', 'needle', 'fixes clothes when resting: +1 mood', { rest: 1 }),
  matches: T('matches', 'matches', 'a fire anywhere: no harm from cold', {}, { warm: true }),
  // ── припасы: лечение ──
  bandage: S('bandage', 'bandage', 'gives back 2 health', { heal: 2 }),
  herbs: S('herbs', 'herbs', 'gives back 1 health', { heal: 1 }),
  drink: S('healing drink', 'drink', 'gives back 3 health', { heal: 3 }),
  medicine: S('medicine', 'medicine', 'gives back 3 health and hope', { heal: 3, mood: 1 }),
  painkiller: S('painkiller', 'painkiller', 'gives back 2 health, but makes you sad', { heal: 2, mood: -1 }),
  potion: S('strong potion', 'potion', 'gives back all health', { heal: 5, rare: true }),
  // ── припасы: настроение ──
  tea: S('hot tea', 'tea', 'makes a sad person feel better', { mood: 2 }),
  coffee: S('coffee', 'coffee', 'wakes you up: +1 mood', { mood: 1 }),
  book: S('old book', 'book', 'a good story: much better mood', { mood: 3 }),
  candles: S('candles', 'candles', 'warm light: +2 mood', { mood: 2 }),
  dice: S('dice', 'dice', 'a game by the fire: +2 mood', { mood: 2 }),
  cigarettes: S('cigarettes', 'cigarettes', '+2 mood, but -1 health', { mood: 2, heal: -1 }),
  soap: S('soap', 'soap', 'feel clean again: +1 mood and +1 health', { mood: 1, heal: 1 }),
  wine: S('bottle of wine', 'wine', '+3 mood', { mood: 3 }),
  beer: S('beer', 'beer', '+2 mood', { mood: 2 }),
  blanket: S('blanket', 'blanket', 'a warm night: +1 health and +1 mood', { heal: 1, mood: 1 }),
  necklace: S('necklace', 'necklace', 'something beautiful: +4 mood', { mood: 4, rare: true }),
  flute: S('flute', 'flute', 'music for everyone: +1 mood for all', { all: 1 }),
  lyre: S('old lyre', 'lyre', 'songs for everyone: +2 mood for all', { all: 2, rare: true }),
  // ── припасы: еда ──
  bread: S('bread', 'bread', '+3 food for the camp', { food: 3 }),
  honey: S('jar of honey', 'honey', '+2 food and +1 mood for all', { food: 2, all: 1 }),
  cheese: S('cheese', 'cheese', '+3 food for the camp', { food: 3 }),
  fish: S('can of fish', 'fish', '+4 food for the camp', { food: 4 }),
  carrots: S('carrots', 'carrots', '+2 food for the camp', { food: 2 }),
  potatoes: S('potatoes', 'potatoes', '+3 food for the camp', { food: 3 }),
} satisfies Record<string, ItemDef>;

export type ItemId = keyof typeof ITEMS;
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
const DEF = ITEMS as Record<ItemId, ItemDef>;
export const itemOf = (id: ItemId): ItemDef => DEF[id];

export type Items = Partial<Record<ItemId, number>>;
export const SLOTS: readonly Slot[] = ['weapon', 'armor', 'tool'];
export const SLOT_NAME: Record<Kind, string> = {
  weapon: 'Weapons',
  armor: 'Clothes and armor',
  tool: 'Tools',
  supply: 'Supplies',
};

const clamp = (n: number, hi: number) => Math.max(0, Math.min(hi, n));
const a = (name: string) => (/^[aeiou]/.test(name) ? `an ${name}` : `a ${name}`);
export const withArticle = a;

export const countOf = (s: HoldState, id: ItemId) => s.items?.[id] ?? 0;

/** Что человек носит в слоте; старое поле `gear` (одна вещь на человека) читается в свой слот. */
export function slotOf(p: Person, slot: Slot): ItemId | null {
  const v = p[slot] as ItemId | null | undefined;
  if (v) return v;
  const g = p.gear as ItemId | null | undefined;
  return g && DEF[g]?.kind === slot ? g : null;
}
export const gearList = (p: Person): ItemId[] => SLOTS.map((sl) => slotOf(p, sl)).filter((x): x is ItemId => !!x);

/** Сумма помощи снаряжения человека в деле. */
export const bonus = (p: Person, w: Work): number => gearList(p).reduce((n, id) => n + (DEF[id].work?.[w] ?? 0), 0);
export const isWarm = (p: Person): boolean => gearList(p).some((id) => DEF[id].warm);
/** Удар: оружие (и топор) плюс прибавка против своего врага. */
export const atkOf = (p: Person, foe: Foe): number =>
  gearList(p).reduce((n, id) => n + (DEF[id].atk ?? 0) + (DEF[id].vs === foe ? 1 : 0) * (id === 'firebomb' ? 2 : 1), 0);
export const defOf = (p: Person): number => gearList(p).reduce((n, id) => n + (DEF[id].def ?? 0), 0);

export function addItem(s: HoldState, id: ItemId, n = 1): void {
  s.items = { ...(s.items ?? {}), [id]: countOf(s, id) + n };
}

/** Что можно найти: редкие вещи в три раза реже. */
const POOL: readonly (readonly [ItemId, number])[] = ITEM_IDS.map((id) => [id, DEF[id].rare ? 1 : 3] as const);
export const rollItem = (r: Rand): ItemId => weighted(r, POOL);

/** Случайная находка: при обыске — почти всегда (иногда две), на охоте — редко. Возвращает строку доклада. */
export function findItem(r: Rand, s: HoldState, who: Person, odds: number): string | null {
  if (!chance(r, odds)) return null;
  const first = rollItem(r);
  addItem(s, first);
  if (odds >= 0.5 && chance(r, 0.25)) {
    const second = rollItem(r);
    addItem(s, second);
    return `${who.name} also found ${a(DEF[first].name)} and ${a(DEF[second].name)}.`;
  }
  return `${who.name} also found ${a(DEF[first].name)}.`;
}

/** Припас, который тратится на одного человека (лекарство, чай). Еда и музыка — на весь лагерь. */
export const needsPerson = (id: ItemId) => DEF[id].kind === 'supply' && !DEF[id].food && !DEF[id].all;

/** Потратить припас: на человека — здоровье и настроение; еда — в запас; музыка — настроение всем. */
export function spendItem(s0: HoldState, id: ItemId, personId?: string): { state: HoldState; line: string } | null {
  const d = DEF[id];
  if (d.kind !== 'supply' || countOf(s0, id) < 1) return null;
  const p0 = personId ? s0.people.find((x) => x.id === personId) : undefined;
  if (needsPerson(id) && (!p0 || p0.status !== 'ok')) return null;
  const s: HoldState = structuredClone(s0);
  s.items = { ...s.items, [id]: countOf(s, id) - 1 };
  const lines: string[] = [];
  if (d.food) {
    s.res.food += d.food;
    lines.push(`You put the ${d.name} in the food store: +${d.food} food.`);
  }
  if (d.all) {
    for (const q of s.people) if (q.status === 'ok' && !q.away) q.morale = clamp(q.morale + d.all, MAX_MORALE);
    lines.push(
      d.food
        ? 'Everyone gets a little. People smile.'
        : `Everyone sits by the fire and listens to the ${d.name}. People feel better.`,
    );
  }
  if (needsPerson(id)) {
    const p = s.people.find((x) => x.id === personId)!;
    if (d.heal) p.hp = Math.max(1, clamp(p.hp + d.heal, MAX_HP));
    if (d.mood) p.morale = clamp(p.morale + d.mood, MAX_MORALE);
    lines.push(
      d.heal && d.heal > 0
        ? `${p.name} uses the ${d.name}. ${p.name} feels better.`
        : `${p.name} enjoys the ${d.name} by the fire.`,
    );
  }
  return { state: s, line: lines.join(' ') };
}

/** Отдать снаряжение человеку: вещь встаёт в свой слот, прежняя из слота возвращается в запасы. */
export function giveGear(s0: HoldState, id: ItemId, personId: string): { state: HoldState; line: string } | null {
  const d = DEF[id];
  const p0 = s0.people.find((x) => x.id === personId);
  if (d.kind === 'supply' || !p0 || p0.status !== 'ok' || countOf(s0, id) < 1) return null;
  const slot = d.kind as Slot;
  const s: HoldState = structuredClone(s0);
  const p = s.people.find((x) => x.id === personId)!;
  const old = slotOf(p, slot);
  if (p.gear && DEF[p.gear as ItemId]?.kind === slot) p.gear = null;
  s.items = { ...s.items, [id]: countOf(s, id) - 1 };
  if (old) addItem(s, old);
  p[slot] = id;
  return {
    state: s,
    line: old ? `${p.name} takes the ${d.name} and gives back the ${DEF[old].name}.` : `${p.name} takes the ${d.name}.`,
  };
}

/** Забрать вещь из слота человека обратно в запасы. */
export function takeGear(s0: HoldState, personId: string, slot: Slot): { state: HoldState; line: string } | null {
  const p0 = s0.people.find((x) => x.id === personId);
  const old = p0 ? slotOf(p0, slot) : null;
  if (!p0 || !old) return null;
  const s: HoldState = structuredClone(s0);
  const p = s.people.find((x) => x.id === personId)!;
  p[slot] = null;
  if (p.gear === old) p.gear = null;
  addItem(s, old);
  return { state: s, line: `${p.name} gives back the ${DEF[old].name}.` };
}

/** Что в начале игры: бинт и одна обычная вещь. */
export function startItems(r: Rand): Items {
  const extra = pick(r, ['knife', 'vest', 'rope', 'bread', 'tea'] as const);
  return { bandage: 1, [extra]: 1 };
}
