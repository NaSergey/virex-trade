'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Колбэк на каждый кадр, пока `active`. Колбэк держится в рефе — эффект не
 * перезапускается на каждом рендере, а рисует всегда по свежим пропсам.
 * Реф пишется в useLayoutEffect, а не в рендере (правило React Compiler).
 */
export function useFrames(active: boolean, cb: () => void) {
  const ref = useRef(cb);
  useLayoutEffect(() => {
    ref.current = cb;
  });
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const tick = () => {
      ref.current();
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active]);
}
