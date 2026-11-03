import type { Exercise } from '../../content/types';
import type { CharacterId } from '../content/characters';
import type { EnemyTrait } from '../content/enemies';
import type { RelicId } from '../content/relics';
import type { Mode, WeatherId } from './types';

/**
 * Урон и ход противника (спека, «Урон и ход»). Ошибся — получил; быстро убил
 * трудными ударами — не получил вовсе. Числа — стартовые, держит их прогон
 * ботов (`balance.test.ts`).
 */
export const BASE: Record<Mode, number> = { recognize: 2, listen: 3, recall: 5, speak: 6, order: 7, dictate: 6 };
export const EXERCISE_DAMAGE: Record<Exercise['type'], number> = { choice: 5, gap: 7, order: 7, translate: 9 };

const CRIT_MS: Record<Mode, number> = {
  recognize: 2500,
  listen: 3500,
  recall: 6000,
  speak: 5000,
  order: 10000,
  dictate: 8000,
};
const EXERCISE_CRIT_MS: Record<Exercise['type'], number> = { choice: 4000, gap: 7000, order: 10000, translate: 10000 };

/** Окно крита, мс: секундомер +2 с, туман 3 и выше −1 с. */
export function critWindow(mode: Mode | Exercise['type'], relics: readonly RelicId[], fog: number): number {
  const base = mode in CRIT_MS ? CRIT_MS[mode as Mode] : EXERCISE_CRIT_MS[mode as Exercise['type']];
  return base + (relics.includes('stopwatch') ? 2000 : 0) - (fog >= 3 ? 1000 : 0);
}

/** Множитель серии: +0,1 за верный ответ (Метроном и Ветер — вдвое быстрее), потолок ×2. */
export function comboMult(combo: number, relics: readonly RelicId[], weather: WeatherId): number {
  const step = 0.1 * (relics.includes('metronome') ? 2 : 1) * (weather === 'wind' ? 2 : 1);
  return Math.min(2, 1 + step * combo);
}

export interface DamageInput {
  mode: Mode;
  /** Верных подряд до этого ответа. */
  combo: number;
  crit: boolean;
  weak?: Mode;
  resist?: Mode;
  /** Заточка удара. */
  sharpen: number;
  relics: readonly RelicId[];
  weather: WeatherId;
  character: CharacterId;
  boss: boolean;
  /** У хранителя урон — по виду упражнения. */
  exercise?: Exercise['type'];
  typo: boolean;
  /** Слово вернулось после ошибки (Блокнот бьёт им ×2). */
  revenge: boolean;
  /** Свежая газета: следующий верный ответ ×2. */
  paper: boolean;
}

export function damageOf(i: DamageInput): number {
  let base = i.exercise ? EXERCISE_DAMAGE[i.exercise] : BASE[i.mode] + i.sharpen;
  if (!i.exercise && i.mode === 'recognize' && i.character === 'announcer') base -= 1;
  if (!i.exercise && i.mode === 'speak' && i.relics.includes('megaphone')) base += 3;
  let mult = comboMult(i.combo, i.relics, i.weather);
  if (i.crit) mult *= i.weather === 'fog' && (i.mode === 'recall' || i.mode === 'speak') && !i.exercise ? 2 : 1.5;
  if (!i.exercise && i.weak === i.mode) mult *= 1.5;
  if (!i.exercise && i.resist === i.mode) mult *= 0.5;
  if (i.typo) mult *= 0.5;
  if (i.revenge && i.relics.includes('notebook')) mult *= 2;
  if (i.paper) mult *= 2;
  if (i.boss && i.character === 'student') mult *= 1.5;
  return Math.max(1, Math.round(base * mult));
}

/** Противник боя: обычный, элита или хранитель. */
export interface Foe {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  /** Раз во сколько верных ответов бьёт сам. */
  every: number;
  /** Сколько верных ответов до удара. */
  timer: number;
  kind: 'fight' | 'elite' | 'boss';
  weak?: Mode;
  resist?: Mode;
  trait?: EnemyTrait;
  /** Удары, которые принимает элита. */
  modes?: Mode[];
  /** Правило или свойство словами. */
  text?: string;
}

/**
 * Ход противника после ответа. Верный — счётчик ближе к удару, на нуле удар и
 * сброс; неверный — удар сразу и сброс. Убитый ответом противник уже не ходит —
 * это решает движок.
 */
export function enemyTurn(foe: Foe, event: 'right' | 'wrong'): { foe: Foe; hit: number } {
  if (event === 'wrong') return { foe: { ...foe, timer: foe.every }, hit: foe.atk };
  const timer = foe.timer - 1;
  if (timer > 0) return { foe: { ...foe, timer }, hit: 0 };
  return { foe: { ...foe, timer: foe.every }, hit: foe.atk };
}

/**
 * Удар по игроку: Зонт гасит первый удар боя, складной зонт — следующий, Шарф
 * ослабляет на 1, щит принимает раньше здоровья.
 */
export function absorb(
  p: { hp: number; shield: number },
  hit: number,
  guard: { umbrella: boolean; brolly: boolean; scarf: boolean },
): { hp: number; shield: number; taken: number; blockedBy: 'umbrella' | 'brolly' | null } {
  if (hit <= 0) return { ...p, taken: 0, blockedBy: null };
  if (guard.umbrella) return { ...p, taken: 0, blockedBy: 'umbrella' };
  if (guard.brolly) return { ...p, taken: 0, blockedBy: 'brolly' };
  let left = Math.max(0, hit - (guard.scarf ? 1 : 0));
  const fromShield = Math.min(p.shield, left);
  left -= fromShield;
  return { hp: Math.max(0, p.hp - left), shield: p.shield - fromShield, taken: left, blockedBy: null };
}
