import type { SlotSymbol } from '@/entities/slots';

/**
 * План остановки барабанов: когда каждый встаёт и где «предвкушение».
 * Два скаттера на уже вставших барабанах — следующий крутится дольше и
 * горит: третий скаттер даёт бонус, и автомат даёт его подождать. То же у
 * сундука и колеса: они на барабанах 1 и 3 — пятый горит. Так ведут себя
 * настоящие автоматы, и это половина напряжения спина.
 */
export interface StopPlan {
  /** Задержка остановки барабана от первой, мс. */
  at: number[];
  /** Барабан с предвкушением. */
  hot: boolean[];
}

export function stopPlan(grid: SlotSymbol[][], turbo: boolean): StopPlan {
  const gap = turbo ? 90 : 230;
  const tease = turbo ? 650 : 1250;
  const at: number[] = [];
  const hot: boolean[] = [];
  let t = 0;
  let scatters = 0;
  const on = (sym: SlotSymbol, r: number) => grid[r].includes(sym);
  grid.forEach((col, i) => {
    const isHot =
      (i > 0 && scatters >= 2) ||
      (i === 4 && ((on('chest', 0) && on('chest', 2)) || (on('wheel', 0) && on('wheel', 2))));
    if (i > 0) t += isHot ? tease : gap;
    at.push(t);
    hot.push(isHot);
    scatters += col.filter((s) => s === 'scatter').length;
  });
  return { at, hot };
}

export type WinTier = 'none' | 'small' | 'nice' | 'big' | 'mega' | 'epic';

/** Сила выигрыша — от неё весь набор эффектов: от искр до салюта на весь экран. */
export function tierOf(win: number, bet: number): WinTier {
  if (win <= 0) return 'none';
  const x = win / bet;
  if (x >= 80) return 'epic';
  if (x >= 30) return 'mega';
  if (x >= 10) return 'big';
  if (x >= 2) return 'nice';
  return 'small';
}

/** Длина счёта выигрыша, мс: мелочь — мигом, крупное — дольше, чтобы его прожить. */
export function countMs(tier: WinTier): number {
  return { none: 0, small: 700, nice: 1300, big: 3200, mega: 4600, epic: 6200 }[tier];
}

/**
 * Символы ленты между результатами — только для вида. Чаще мелкие, иногда
 * дорогие: семёрки и бриллианты, мелькающие на ленте, — часть зрелища.
 */
const FILLER: [SlotSymbol, number][] = [
  ['cherry', 14],
  ['lemon', 14],
  ['plum', 12],
  ['grapes', 11],
  ['bell', 10],
  ['bar', 9],
  ['seven', 8],
  ['diamond', 6],
  ['wild', 5],
  ['scatter', 4],
  ['chest', 3],
  ['wheel', 3],
];
const FILLER_TOTAL = FILLER.reduce((s, [, w]) => s + w, 0);

export function fillerSymbol(rand = Math.random): SlotSymbol {
  let x = rand() * FILLER_TOTAL;
  for (const [s, w] of FILLER) {
    if (x < w) return s;
    x -= w;
  }
  return 'cherry';
}

/** Случайное поле для первого показа, пока спинов не было. */
export const randomGrid = (rand = Math.random): SlotSymbol[][] =>
  Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => fillerSymbol(rand)));
