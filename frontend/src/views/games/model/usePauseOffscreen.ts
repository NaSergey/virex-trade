'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Сцена вне экрана стоит на паузе: атрибут `data-paused` на корне сцены, и CSS
 * ставит все её анимации на паузу (`.gscene[data-paused]`). Прокрученная за
 * край витрина иначе продолжала бы гонять десятки слоёв, которых никто не
 * видит. Пауза, а не остановка: вернувшись в кадр, сцена продолжает с того
 * же места, без рывка к началу циклов.
 */
export function usePauseOffscreen(ref: RefObject<Element | null>) {
  useEffect(() => {
    const scene = ref.current;
    if (!scene || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) scene.removeAttribute('data-paused');
      else scene.setAttribute('data-paused', '');
    });
    io.observe(scene);
    return () => io.disconnect();
  }, [ref]);
}
