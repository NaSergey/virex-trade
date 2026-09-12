'use client';

import { useEffect, type RefObject } from 'react';
import { gsap } from 'gsap';
import { prefersReducedMotion } from './reducedMotion';

/** Насколько кнопка сдвигается к курсору, максимум. Больше — и она «убегает». */
const PULL = 6;

/**
 * Главное действие страницы слегка тянется к курсору. Смысл не в украшении:
 * в системе без акцентного цвета выделить единственную важную кнопку нечем,
 * кроме выворотной плашки, которая у неё уже есть, — притяжение добавляет ей
 * вес, не вводя в палитру ни одного нового цвета.
 *
 * Только для мыши: на тач-устройстве события `pointermove` приходят уже после
 * нажатия, и кнопка дёргалась бы под пальцем в момент тапа.
 */
export function useMagnetic(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const quickX = gsap.quickTo(el, 'x', { duration: 0.4, ease: 'power3.out' });
    const quickY = gsap.quickTo(el, 'y', { duration: 0.4, ease: 'power3.out' });

    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      quickX(gsap.utils.clamp(-PULL, PULL, ((e.clientX - (r.left + r.width / 2)) / r.width) * PULL * 2));
      quickY(gsap.utils.clamp(-PULL, PULL, ((e.clientY - (r.top + r.height / 2)) / r.height) * PULL * 2));
    };
    const leave = () => {
      quickX(0);
      quickY(0);
    };

    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, [ref]);
}
