'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Вешает 'wheel' нативным (не React) листенером и зовёт preventDefault перед
 * колбэком — React с версии 17 держит onWheel пассивным, и preventDefault
 * внутри него не работает, а без него зум графика колесом ещё и скроллит
 * страницу/модалку под ним. Общий приём двух SVG-графиков продукта
 * (RangeCheckChart, ReplayChart), раньше продублированный в обоих.
 */
export function useNonPassiveWheel<T extends HTMLElement | SVGElement>(
  ref: RefObject<T | null>,
  onWheel: (e: WheelEvent) => void,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      onWheel(e);
    };
    // Приведение типа — TS не резолвит перегрузку addEventListener для
    // обобщённого T (HTMLElement | SVGElement); в рантайме событие всегда WheelEvent.
    el.addEventListener('wheel', handler as EventListener, { passive: false });
    return () => el.removeEventListener('wheel', handler as EventListener);
  }, [ref, onWheel]);
}
