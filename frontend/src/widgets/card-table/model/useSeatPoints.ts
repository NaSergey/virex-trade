'use client';

import { useCallback } from 'react';
import { seatPoint, type SeatPoint } from '../lib/layout';
import { useStageAspect } from './useStageAspect';

/**
 * Где на сцене стоит место `i`. Длина овала считается в пикселях сцены,
 * поэтому раскладке нужна её пропорция — широкая или вытянутая на телефоне.
 */
export function useSeatPoints(maxSeats: number, mySeat: number | null): (seatIndex: number) => SeatPoint {
  const aspect = useStageAspect();
  return useCallback((i: number) => seatPoint(i, maxSeats, mySeat, aspect), [maxSeats, mySeat, aspect]);
}
