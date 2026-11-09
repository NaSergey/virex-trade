import type { SlotSymbol } from '@/shared/ui/SlotSymbols';

export type { SlotSymbol };

/** Правила с сервера: своей копии таблицы выплат у фронта нет. */
export interface SlotsConfig {
  bets: number[];
  /** Строка клетки на каждом из пяти барабанов. */
  paylines: number[][];
  /** Выплата за 3, 4, 5 подряд — в ставках на линию. */
  linePays: Partial<Record<SlotSymbol, [number, number, number]>>;
  /** Скаттер за 3, 4, 5 штук — в ставках на спин. */
  scatterPays: [number, number, number];
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

export interface SlotsSpin {
  id: string;
  bet: number;
  /** `grid[reel][row]`, строка 0 — верх. */
  grid: SlotSymbol[][];
  lines: SlotsLineWin[];
  scatters: number;
  scatterWin: number;
  win: number;
  balance: number;
}
