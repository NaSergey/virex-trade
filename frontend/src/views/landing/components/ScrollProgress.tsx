'use client';

import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';

/**
 * Линейка прочитанного по верхнему краю экрана.
 *
 * В системе, где структуру держат линейки, индикатор прогресса — это ещё одна
 * линейка, а не полоска-виджет: тот же вес, та же краска, никакого нового
 * элемента в языке страницы.
 *
 * `end: 'max'` — низ документа: он пересчитывается на каждом refresh, поэтому
 * линейка доходит до конца независимо от того, какой длины оказались секции
 * на этой ширине экрана.
 */
export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    registerGsap();
    const el = bar.current;
    if (!el || prefersReducedMotion()) return;

    gsap.fromTo(
      el,
      { scaleX: 0 },
      {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: { trigger: document.documentElement, start: 'top top', end: 'max', scrub: 0.3 },
      },
    );
  });

  return (
    <div className="ls-progress" aria-hidden>
      <div className="ls-progress-bar" ref={bar} />
    </div>
  );
}
