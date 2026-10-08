'use client';

import { gsap } from 'gsap';

/**
 * Играть анимацию один раз при входе и больше не трогать — вместо `once: true`.
 *
 * Триггер с `once: true` убивает сам себя на первом срабатывании, а при
 * перезагрузке страницы, уже прокрученной ниже его начала, оно случается прямо
 * во время создания соседнего триггера. Список триггеров сдвигается под ногами
 * у `ScrollTrigger.refresh`, и тот читает `undefined.end` (TypeError). Здесь
 * триггер остаётся жить, а анимация вперёд играет раз и назад не идёт.
 */
export const PLAY_ONCE = 'play none none none';

/**
 * Единственный приём появления контента на странице: элемент поднимается на
 * место, когда доезжает до нижней трети экрана, — один раз и до конца.
 *
 * Один раз, а не scrub, сознательно. Прокрутка вверх по scrub-анимации
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
    scrollTrigger: { trigger: trigger ?? items[0], start, toggleActions: PLAY_ONCE },
  });
}
