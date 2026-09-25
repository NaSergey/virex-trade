'use client';

import { useSyncExternalStore } from 'react';
import { STAGE_TALL, STAGE_WIDE } from '../lib/layout';

/** Та же граница, что у `.ct-stage` в globals.css: уже — сцена вытягивается вверх. */
const TALL_QUERY = '(max-width: 720px)';

const subscribe = (onChange: () => void) => {
  const mq = window.matchMedia(TALL_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};

/**
 * Пропорция сцены стола. Места стоят на равном расстоянии по длине овала, а
 * длина считается в пикселях — поэтому раскладке нужно знать, широкая сцена
 * или вытянутая: на телефоне тот же овал стоит вертикально.
 */
export function useStageAspect(): number {
  return useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(TALL_QUERY).matches ? STAGE_TALL : STAGE_WIDE),
    () => STAGE_WIDE,
  );
}
