import { chance, pick, type Rand } from '../../game/model/rng';
import type { IconId } from '../icons';
import { MAX_HP, MAX_MORALE, type HoldState, type Person } from './rules';

/**
 * Вещи лагеря — инвентарь. Их находят: при обыске мест, в событиях дня, иногда на охоте. Вещи
 * двух видов: расходные (бинт, лекарство, чай, книга) тратятся на человека, а снаряжение (нож,
 * топор, лук, кирка, плащ) человек носит — одну вещь, и она меняет его работу и бой. Всё, что
 * игра говорит о вещах, — по-английски и нажимается для перевода.
 */

export type ItemId = 'bandage' | 'medicine' | 'tea' | 'book' | 'knife' | 'axe' | 'bow' | 'pickaxe' | 'coat';

export interface ItemDef {
  name: string;
  /** use — тратится на человека, gear — человек носит. */
  kind: 'use' | 'gear';
  /** Что даёт — по-английски, на карточке вещи. */
  text: string;
  icon: IconId;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  bandage: { name: 'bandage', kind: 'use', text: 'gives back 2 health', icon: 'bandage' },
  medicine: { name: 'medicine', kind: 'use', text: 'gives back 3 health and hope', icon: 'medicine' },
  tea: { name: 'hot tea', kind: 'use', text: 'makes a sad person feel better', icon: 'tea' },
  book: { name: 'old book', kind: 'use', text: 'a good story: much better mood', icon: 'book' },
  knife: { name: 'knife', kind: 'gear', text: 'hits harder in a fight', icon: 'knife' },
  axe: { name: 'axe', kind: 'gear', text: 'more wood, and hits harder in a fight', icon: 'axe' },
  bow: { name: 'bow', kind: 'gear', text: 'more food from the hunt', icon: 'bow' },
  pickaxe: { name: 'pickaxe', kind: 'gear', text: 'more iron from the rocks', icon: 'pickaxe' },
  coat: { name: 'warm coat', kind: 'gear', text: 'does not get sick from cold or hunger', icon: 'coat' },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export type Items = Partial<Record<ItemId, number>>;

const clamp = (n: number, hi: number) => Math.max(0, Math.min(hi, n));

export const countOf = (s: HoldState, id: ItemId) => s.items?.[id] ?? 0;
export const gearOf = (p: Person): ItemId | null => (p.gear as ItemId | undefined) ?? null;
export const has = (p: Person, id: ItemId) => p.gear === id;

/** Положить вещь в запасы лагеря. */
export function addItem(s: HoldState, id: ItemId, n = 1): void {
  s.items = { ...(s.items ?? {}), [id]: countOf(s, id) + n };
}

/** Случайная находка: при обыске — почти всегда, на охоте — редко. Возвращает строку доклада. */
export function findItem(r: Rand, s: HoldState, who: Person, odds: number): string | null {
  if (!chance(r, odds)) return null;
  const id = pick(r, ['bandage', 'bandage', 'medicine', 'tea', 'book', 'knife', 'axe', 'bow', 'pickaxe', 'coat'] as const);
  addItem(s, id);
  return `${who.name} also found ${a(ITEMS[id].name)}.`;
}

const a = (name: string) => (/^[aeiou]/.test(name) ? `an ${name}` : `a ${name}`);
export const withArticle = a;

/** Потратить вещь на человека: бинт и лекарство лечат, чай и книга поднимают настроение. */
export function spendItem(s0: HoldState, id: ItemId, personId: string): { state: HoldState; line: string } | null {
  const def = ITEMS[id];
  const p0 = s0.people.find((x) => x.id === personId);
  if (def.kind !== 'use' || !p0 || p0.status !== 'ok' || countOf(s0, id) < 1) return null;
  const s: HoldState = structuredClone(s0);
  const p = s.people.find((x) => x.id === personId)!;
  s.items = { ...s.items, [id]: countOf(s, id) - 1 };
  let line: string;
  if (id === 'bandage') {
    p.hp = clamp(p.hp + 2, MAX_HP);
    line = `${p.name} puts on the bandage. ${p.name} feels better.`;
  } else if (id === 'medicine') {
    p.hp = clamp(p.hp + 3, MAX_HP);
    p.morale = clamp(p.morale + 1, MAX_MORALE);
    line = `${p.name} takes the medicine. The pain is gone.`;
  } else if (id === 'tea') {
    p.morale = clamp(p.morale + 2, MAX_MORALE);
    line = `${p.name} drinks the hot tea by the fire and smiles.`;
  } else {
    p.morale = clamp(p.morale + 3, MAX_MORALE);
    line = `${p.name} reads the old book all evening. It is a good story.`;
  }
  return { state: s, line };
}

/** Отдать снаряжение человеку: прежняя его вещь возвращается в запасы. */
export function giveGear(s0: HoldState, id: ItemId, personId: string): { state: HoldState; line: string } | null {
  const p0 = s0.people.find((x) => x.id === personId);
  if (ITEMS[id].kind !== 'gear' || !p0 || p0.status !== 'ok' || countOf(s0, id) < 1) return null;
  const s: HoldState = structuredClone(s0);
  const p = s.people.find((x) => x.id === personId)!;
  const old = gearOf(p);
  s.items = { ...s.items, [id]: countOf(s, id) - 1 };
  if (old) addItem(s, old);
  p.gear = id;
  return {
    state: s,
    line: old
      ? `${p.name} takes the ${ITEMS[id].name} and gives back the ${ITEMS[old].name}.`
      : `${p.name} takes the ${ITEMS[id].name}.`,
  };
}

/** Забрать снаряжение у человека обратно в запасы. */
export function takeGear(s0: HoldState, personId: string): { state: HoldState; line: string } | null {
  const p0 = s0.people.find((x) => x.id === personId);
  const old = p0 ? gearOf(p0) : null;
  if (!p0 || !old) return null;
  const s: HoldState = structuredClone(s0);
  const p = s.people.find((x) => x.id === personId)!;
  p.gear = null;
  addItem(s, old);
  return { state: s, line: `${p.name} gives back the ${ITEMS[old].name}.` };
}
