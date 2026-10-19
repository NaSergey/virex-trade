import type { CarId } from '@/entities/race';

/** Шкалы гаража — подача, а не физика: числа машин живут в симуляции (`CARS`). */
export const CAR_PIPS: Record<CarId, { speed: number; grip: number }> = {
  arrow: { speed: 5, grip: 3 },
  buggy: { speed: 4, grip: 5 },
  tank: { speed: 3, grip: 2 },
};

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

/** Сохранённая машина: незнакомое значение — Багги. */
export const decodeCar = (raw: string | null): CarId => (raw === 'arrow' || raw === 'tank' ? raw : 'buggy');
export const decodeStake = (raw: string | null): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 100;
};
export const encodeAny = (v: string | number) => String(v);
