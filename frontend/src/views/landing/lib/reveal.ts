'use client';

import { gsap } from 'gsap';

/**
 * Единственный приём появления контента на странице: элемент поднимается на
 * место, когда доезжает до нижней трети экрана, — один раз и до конца.
 *
 * `once: true`, а не scrub, сознательно. Прокрутка вверх по scrub-анимации
 * разбирает уже прочитанный текст обратно, и страница на обратном пути
 * выглядит сломанной; кроме того, scrub на каждом абзаце заставляет браузер
 * пересчитывать стили на каждом кадре скролла ради эффекта, который зритель
 * видит ровно однажды.
 */
export function revealOnEnter(
  items: Element[],
  {
    trigger,
    start = 'top 84%',
    y = 26,
    stagger = 0.1,
    duration = 0.9,
  }: { trigger?: Element | null; start?: string; y?: number; stagger?: number; duration?: number } = {},
): void {
  if (items.length === 0) return;
  gsap.set(items, { opacity: 0, y });
  gsap.to(items, {
    opacity: 1,
    y: 0,
    duration,
    stagger,
    ease: 'power3.out',
    scrollTrigger: { trigger: trigger ?? items[0], start, once: true },
  });
}
