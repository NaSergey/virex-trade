'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { createRenderer, type FrameSource } from '../lib/scene';

/**
 * Холст сцены гонки. Цикл кадров — свой, мимо React: кадр рисуется из
 * `source.next(dt)`. Вне экрана и у фоновой вкладки цикл стоит. `fps` —
 * потолок частоты: карточке витрины хватает 30.
 */
export function RaceCanvas({
  source,
  fps = 60,
  className,
  label,
}: {
  source: FrameSource;
  fps?: number;
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const src = useRef(source);
  useLayoutEffect(() => {
    src.current = source;
  });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const r = createRenderer(canvas, { reduced: matchMedia('(prefers-reduced-motion: reduce)').matches });
    const fit = () => {
      const b = canvas.getBoundingClientRect();
      if (b.width && b.height) r.resize(b.width, b.height, Math.min(window.devicePixelRatio || 1, 1.75));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    fit();
    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
    });
    io.observe(canvas);
    const minDt = 1 / fps;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) {
        last = now;
        return;
      }
      const dt = (now - last) / 1000;
      if (dt < minDt * 0.85) return;
      last = now;
      const f = src.current.next(Math.min(dt, 0.1));
      if (f) r.draw(f, Math.min(dt, 0.1));
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [fps]);

  return (
    <canvas
      ref={ref}
      className={className}
      aria-label={label}
      role={label ? 'img' : undefined}
      aria-hidden={label ? undefined : true}
    />
  );
}
