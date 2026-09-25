'use client';

import { useEffect, useRef, useState } from 'react';

const DURATION = 480;
const ease = (p: number) => 1 - (1 - p) ** 3;

/**
 * Число, которое не прыгает, а досчитывает: стек, в который приехал банк,
 * растёт на глазах, а не подменяется. `delay` — чтобы число начало расти, когда
 * фишки долетят, а не когда пришёл снимок.
 *
 * Первое значение показывается как есть: пришедший на стол не должен
 * смотреть, как досчитываются чужие стеки.
 */
export function AnimatedNumber({ value, delay = 0, className }: { value: number; delay?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);

  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / DURATION));
      const v = Math.round(from + (value - from) * ease(p));
      shownRef.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, delay]);

  return <span className={className}>{shown.toLocaleString()}</span>;
}
