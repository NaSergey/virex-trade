import { COLLECT, type SeatPoint } from '@/widgets/card-table';

/**
 * Движение, которое есть только у покера: борд. Общая шкала (сдача,
 * переворот, сбор ставок в банк — центр сукна) — `widgets/card-table/lib/motion.ts`.
 */
/** Первая карта улицы ждёт, пока ставки съедут в банк. */
export const BOARD_BASE = COLLECT + 40;
/** Шаг между картами флопа (и доклада борда при олл-ине). */
export const BOARD_STEP = 170;

/** Где на сцене лежит карта борда номер `i` (приблизительно — для полёта). */
export function boardPoint(i: number): SeatPoint {
  return { x: 50 + (i - 2) * 5.6, y: 50 };
}
