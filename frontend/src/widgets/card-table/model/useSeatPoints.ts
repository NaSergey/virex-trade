'use client';

import { useCallback } from 'react';
import { seatPoint, type SeatPoint } from '../lib/layout';
import { useStageAspect, useStageRound } from './useStageAspect';

/**
 * Где на сцене стоит место `i`. Длина овала считается в пикселях сцены,
 * поэтому раскладке нужна её пропорция; на телефоне стол круглый.
 */
export function useSeatPoints(maxSeats: number, mySeat: number | null): (seatIndex: number) => SeatPoint {
  const aspect = useStageAspect();
  const round = useStageRound();
  return useCallback((i: number) => seatPoint(i, maxSeats, mySeat, aspect, round), [maxSeats, mySeat, aspect, round]);
}
