'use client';

/**
 * true, если пользователь просит меньше движения. Проверяется в начале
 * каждого `useGSAP`: сцена в этом случае не строит pin/scrub, а сразу
 * выставляет конечное состояние — тот же контент, без движения.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
