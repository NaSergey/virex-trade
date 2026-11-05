import { pick, shuffle, type Rand } from '../../game/model/rng';
import type { IconId } from '../icons';

/**
 * Отряд партии: четыре человека из двенадцати, у каждого своя роль и свой характер. Роли —
 * по одной на человека (охотник, строитель, разведчик, лекарь), характер — случайный. Характер
 * меняет правила (храбрый охраняет лучше, жадный ест больше) и то, как человек переносит
 * трудные решения: добрый страдает, когда беженцев прогнали, трус — когда в лагерь ворвались.
 */

export type Role = 'hunter' | 'builder' | 'scout' | 'healer';
export type Trait = 'brave' | 'coward' | 'strong' | 'kind' | 'greedy' | 'weak' | 'cheerful' | 'gloomy';

export interface Recruit {
  id: string;
  name: string;
  face: IconId;
  /** Местоимение строк о нём: he / she. */
  he: boolean;
}

export const RECRUITS: readonly Recruit[] = [
  { id: 'mira', name: 'Mira', face: 'mira', he: false },
  { id: 'tom', name: 'Tom', face: 'tom', he: true },
  { id: 'ash', name: 'Ash', face: 'ash', he: true },
  { id: 'ezra', name: 'Ezra', face: 'ezra', he: true },
  { id: 'lena', name: 'Lena', face: 'woman', he: false },
  { id: 'bram', name: 'Bram', face: 'farmer', he: true },
  { id: 'ivo', name: 'Ivo', face: 'viking', he: true },
  { id: 'nell', name: 'Nell', face: 'nurse', he: false },
  { id: 'pell', name: 'Pell', face: 'sage', he: true },
  { id: 'rook', name: 'Rook', face: 'patch', he: true },
  { id: 'sana', name: 'Sana', face: 'turban', he: false },
  { id: 'kit', name: 'Kit', face: 'band', he: false },
];

export const ROLES: readonly Role[] = ['hunter', 'builder', 'scout', 'healer'];

export const ROLE_PERK: Record<Role, string> = {
  hunter: 'brings more food',
  builder: 'builds twice as fast',
  scout: 'finds more water',
  healer: 'helps one hurt person every night',
};

/** Характер — коротко, по-английски: видно в строке человека и в листе приказа. */
export const TRAIT_TEXT: Record<Trait, string> = {
  brave: 'brave: guards the gate well',
  coward: 'afraid: a bad guard',
  strong: 'strong: brings more wood and iron',
  kind: 'kind: sad when we do not help people',
  greedy: 'greedy: eats a lot',
  weak: 'weak: gets hurt easily',
  cheerful: 'cheerful: makes others happy',
  gloomy: 'gloomy: often sad',
};
export const TRAIT_WORD: Record<Trait, string> = {
  brave: 'brave',
  coward: 'afraid',
  strong: 'strong',
  kind: 'kind',
  greedy: 'greedy',
  weak: 'weak',
  cheerful: 'cheerful',
  gloomy: 'gloomy',
};
export const TRAITS: readonly Trait[] = Object.keys(TRAIT_TEXT) as Trait[];

/** Четыре человека партии: имена и лица — из двенадцати, роли — по одной, характеры — разные. */
export function makeCrew(r: Rand): (Recruit & { role: Role; trait: Trait })[] {
  const who = shuffle(r, [...RECRUITS]).slice(0, 4);
  const roles = shuffle(r, [...ROLES]);
  const traits = shuffle(r, [...TRAITS]).slice(0, 4);
  return who.map((p, i) => ({ ...p, role: roles[i], trait: traits[i] }));
}

/**
 * Что человек говорит или делает, когда ему плохо, — строка утреннего доклада. Это и есть «лицо»
 * отряда: цифры настроения читаются хуже, чем «Tom sits alone and does not talk».
 */
export function sadLine(r: Rand, name: string, he: boolean): string {
  const h = he ? 'He' : 'She';
  const his = he ? 'his' : 'her';
  return pick(r, [
    `${name} sits alone and does not talk.`,
    `${name} cannot sleep. ${h} looks at the fire all night.`,
    `${name} cried in the night. Nobody knows why.`,
    `${name} says: “Why are we still here? We will all die.”`,
    `${name} does not eat ${his} food today.`,
    `${name} talks about home. ${h} misses ${his} family.`,
  ]);
}

/** Строка о том, кто поднял настроение, — у весёлых. */
export function cheerLine(r: Rand, name: string): string {
  return pick(r, [
    `${name} told a funny story by the fire. Everyone laughed.`,
    `${name} sang an old song in the evening.`,
    `${name} made a small game from stones. People played and smiled.`,
  ]);
}
