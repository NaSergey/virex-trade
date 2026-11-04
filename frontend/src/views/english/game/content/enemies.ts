import type { Mode } from '../model/types';

/**
 * Противники — туман, а не рисунок (спека, «Вид и звук»): имя, слабость,
 * стойкость и одно свойство. Числа — стартовые; держит их прогон ботов
 * (`model/balance.test.ts`).
 */
export type EnemyTrait = 'fast' | 'drain';

export interface EnemyDef {
  id: string;
  name: string;
  /** Ряды линии, где встречается. */
  rows: [number, number];
  weak?: Mode;
  resist?: Mode;
  trait?: EnemyTrait;
  /** Нужно распознавание речи: без него противник не выходит. */
  speech?: true;
  /** Свойство словами — под именем. */
  text?: string;
}

export const ENEMIES: EnemyDef[] = [
  { id: 'drizzle', name: 'Морось', rows: [1, 3], weak: 'recognize' },
  { id: 'hum', name: 'Гул', rows: [2, 9], weak: 'listen', resist: 'recognize' },
  { id: 'echo', name: 'Эхо', rows: [2, 9], weak: 'recall', resist: 'listen' },
  { id: 'mute', name: 'Немота', rows: [3, 9], weak: 'speak', resist: 'recall', speech: true },
  { id: 'smog', name: 'Смог', rows: [4, 9], trait: 'fast', text: 'бьёт каждые 2 хода, но на 2 слабее' },
  { id: 'damp', name: 'Сырость', rows: [4, 9], weak: 'recall', trait: 'drain', text: 'твоя ошибка лечит её на 3' },
];

export interface EliteDef {
  id: string;
  name: string;
  /** Удары, которые элита принимает. */
  modes: Mode[];
  rule: string;
}

export const ELITES: EliteDef[] = [
  {
    id: 'conductor',
    name: 'Кондуктор тумана',
    modes: ['recall', 'speak'],
    rule: '«Предъявите билет»: только Вспомнить и Сказать',
  },
  { id: 'double', name: 'Двойник', modes: ['order', 'recall'], rule: 'фразы из примеров: Собрать или Вспомнить' },
  { id: 'howler', name: 'Ревун', modes: ['listen', 'dictate'], rule: 'всё на слух: Услышать или Записать' },
];

export interface FoeStats {
  hp: number;
  /** Сила удара. */
  atk: number;
  /** Раз во сколько верных ответов противник бьёт сам. */
  every: number;
}

/** Туман 1 и выше — противники и элиты на 15 % крепче. */
const foeHp = (hp: number, fog: number) => (fog >= 1 ? Math.round(hp * 1.15) : hp);

export function enemyStats(row: number, fog: number): FoeStats {
  return { hp: foeHp(30 + 3 * row, fog), atk: 4 + Math.floor((row - 1) / 2), every: 3 };
}

export function eliteStats(row: number, fog: number): FoeStats {
  return { hp: foeHp(44 + 3 * row, fog), atk: enemyStats(row, fog).atk + 2, every: 3 };
}

const BOSS_HP = 80;

/** Туман 6 и выше — хранитель на 25 % крепче. */
export function bossStats(fog: number): FoeStats {
  return { hp: fog >= 6 ? Math.round(BOSS_HP * 1.25) : BOSS_HP, atk: 9, every: 3 };
}
