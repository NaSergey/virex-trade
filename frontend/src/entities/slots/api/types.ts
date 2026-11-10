import type { SlotSymbol } from '@/shared/ui/SlotSymbols';

export type { SlotSymbol };

/** Правила с сервера: своей копии таблицы выплат у фронта нет. */
export interface SlotsConfig {
  bets: number[];
  /** Строка клетки на каждом из пяти барабанов. */
  paylines: number[][];
  /** Выплата за 3, 4, 5 подряд — в ставках на линию. */
  linePays: Partial<Record<SlotSymbol, [number, number, number]>>;
  /** Бесплатных спинов за 3, 4, 5 корон. */
  freeSpins: [number, number, number];
  freeMult: number;
  pickBoxes: number;
  /** Призы сундуков в ставках спина. */
  pickPrizes: number[];
  /** Секторы колеса в ставках спина. */
  wheel: number[];
  /** Отдача, проценты. */
  rtp: number;
}

export interface SlotsLineWin {
  line: number;
  symbol: SlotSymbol;
  count: number;
  pay: number;
  win: number;
}

export interface SlotsFreeSpin {
  grid: SlotSymbol[][];
  lines: SlotsLineWin[];
  win: number;
  /** Спинов добавили короны этого спина. */
  added: number;
}

/** Бонусы разыграны сервером целиком; суммы — в монетах. */
export type SlotsBonus =
  | { kind: 'free'; awarded: number; mult: number; spins: SlotsFreeSpin[]; win: number }
  | { kind: 'pick'; picks: number[]; rest: number[]; win: number }
  | { kind: 'wheel'; segments: number[]; index: number; win: number };

export interface SlotsSpin {
  id: string;
  bet: number;
  /** `grid[reel][row]`, строка 0 — верх. */
  grid: SlotSymbol[][];
  lines: SlotsLineWin[];
  scatters: number;
  /** Выигрыш линий самого спина. */
  baseWin: number;
  bonuses: SlotsBonus[];
  /** Всё вместе, с бонусами. */
  win: number;
  balance: number;
}
