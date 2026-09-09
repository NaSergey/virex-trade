'use client';

import type { RefObject } from 'react';

/**
 * Фиксированная на весь вьюпорт подложка позади всех сцен: тёмная база, над
 * ней светлый слой, над ним — второй тёмный. Прогресс фон-путешествия — это
 * их opacity: 0/0 в пустоте, 1/0 после вспышки, 1/1 в финале.
 *
 * Тёмных слоя два не для красоты: у каждого слоя ровно один хозяин — светлый
 * тянет интро, верхний тёмный тянет финал. Один общий слой на обе сцены
 * означал бы, что вне своих диапазонов их ScrollTrigger'ы пишут в одно
 * свойство разные значения (у интро «до начала» — 0, у финала «до начала» —
 * 1), и после разрывного прыжка по скроллу фон доставался тому, чей scrub
 * дописал последним.
 *
 * Сам компонент анимацией не занимается — только держит три div'а с
 * правильным порядком; сцены тянут свой слой GSAP-ом напрямую по ref.
 */
export function SceneBackground({
  lightRef,
  darkTopRef,
}: {
  lightRef: RefObject<HTMLDivElement | null>;
  darkTopRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="ls-bg" aria-hidden>
      <div className="ls-bg-dark" />
      <div className="ls-bg-light" ref={lightRef} />
      <div className="ls-bg-dark-top" ref={darkTopRef} />
    </div>
  );
}
