'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Число, которое не перескакивает к новому значению, а добегает до него за
 * `ms` — сумма в кнопке «Забрать» после выдачи отсчитывается до нуля, а не
 * пропадает. Первое значение показывается сразу: бежать при открытии окна не
 * от чего. Под reduced-motion — сразу новое.
 */
export function useRollingNumber(target: number, ms = 900): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = still ? 1 : Math.min(1, (now - t0) / ms);
      // Замедление к концу: последние единицы читаются, а не мелькают.
      const v = Math.round(start + (target - start) * (1 - (1 - k) ** 3));
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);

  return shown;
}
