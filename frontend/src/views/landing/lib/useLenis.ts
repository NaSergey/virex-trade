'use client';

import { useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { registerGsap } from './gsapConfig';
import { prefersReducedMotion } from './reducedMotion';

/**
 * Плавный скролл Lenis, синхронизированный с ScrollTrigger через тикер GSAP —
 * рекомендованная самим GSAP интеграция для React. `autoRaf: false` — Lenis не
 * заводит свой RAF-цикл, кадры ему отдаёт `gsap.ticker`, поэтому не возникает
 * двух параллельных циклов кадров, гоняющихся за одним и тем же скроллом.
 *
 * При `prefers-reduced-motion: reduce` Lenis не создаётся вовсе — скролл
 * нативный. ScrollTrigger при этом всё равно зарегистрирован (см.
 * `registerGsap`): каждая сцена сама решает не строить pin/scrub в этом
 * случае (см. `reducedMotion.ts`), а не полагается на отсутствие Lenis.
 */
export function useLenis(): void {
  useEffect(() => {
    registerGsap();
    if (prefersReducedMotion()) return;

    const lenis = new Lenis({ autoRaf: false });
    lenis.on('scroll', ScrollTrigger.update);

    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);
}
