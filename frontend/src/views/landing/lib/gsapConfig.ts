'use client';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

let registered = false;

/**
 * Регистрация плагинов GSAP. Вызывается на модульном уровне (см. низ файла) —
 * до того, как React вообще начнёт рендерить дерево, — и повторно, идемпотентно,
 * первой строкой `useGSAP` каждой сцены: эффекты дочерних компонентов в React
 * могут отработать раньше эффекта родителя, и полагаться на порядок монтирования
 * для регистрации плагинов было бы гонкой.
 */
export function registerGsap(): void {
  if (registered) return;
  gsap.registerPlugin(ScrollTrigger, useGSAP);
  registered = true;
}

registerGsap();
