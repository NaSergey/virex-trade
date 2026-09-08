'use client';

import { forwardRef } from 'react';

/**
 * Фиксированная на весь вьюпорт подложка позади всех сцен: тёмный слой снизу,
 * светлый — сверху. Прогресс фон-путешествия — это opacity светлого слоя:
 * 0 в начале истории, 1 после вспышки (эта задача), обратно к 0 в финале
 * (задача 11). Сам компонент анимацией не занимается — только держит два
 * div'а с правильным z-index; `ref` указывает прямо на светлый слой, сцены
 * тянут его GSAP-ом напрямую.
 */
export const SceneBackground = forwardRef<HTMLDivElement>(function SceneBackground(_, ref) {
  return (
    <div className="ls-bg" aria-hidden>
      <div className="ls-bg-dark" />
      <div className="ls-bg-light" ref={ref} />
    </div>
  );
});
