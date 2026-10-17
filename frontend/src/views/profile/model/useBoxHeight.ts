'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Высота блока, живая: окно меняет размер — меняется и число строк листа
 * вкладки профиля. До первого замера — 0 («не мерили»).
 */
export function useBoxHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setHeight(Math.round(entry.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, height] as const;
}
