'use client';

import { useEffect, type RefObject } from 'react';
import { multiplierAt, stepToward } from '../lib/multiplier-roll';

/** Под курсором плашки трогаются по очереди, от младшего множителя к старшему. */
const STAGGER_MS = 160;
/** Весь рост от своего значения до значения под курсором. */
const UP_MS = 900;
/** Возврат быстрее роста: курсор ушёл — сцена не должна долго досказывать. */
const DOWN_MS = 450;

type Roll = { nodes: SVGTextElement[]; from: number; to: number; i: number; s: number };

/**
 * Множители на плашках джетпака под курсором: наведение (или фокус с
 * клавиатуры) — и каждое число перебором растёт выше своего значения; курсор
 * ушёл — числа перебором возвращаются к своим (`lib/multiplier-roll.ts`).
 *
 * Узлы — группа цифр плашки с `data-roll` (своё значение), `data-roll-to`
 * (значение под курсором) и `data-roll-i` (очередь); текст меняется у всех
 * `<text>` внутри. Меняется прямо в DOM, а не через состояние React: иначе
 * каждый кадр перебора перерисовывал бы всю сцену ради трёх строк. Без
 * курсора в узлах стоит ровно то, что отрисовал React, поэтому React
 * расхождения не видит.
 *
 * Под reduced-motion перебора нет: числа меняются сразу, без бега.
 */
export function useMultiplierRoll(ref: RefObject<Element | null>) {
  useEffect(() => {
    const scene = ref.current;
    const card = scene?.closest('.gcard');
    if (!scene || !card) return;
    const rolls: Roll[] = Array.from(scene.querySelectorAll<SVGGElement>('[data-roll]')).map((node) => ({
      nodes: Array.from(node.querySelectorAll('text')),
      from: Number(node.dataset.roll),
      to: Number(node.dataset.rollTo),
      i: Number(node.dataset.rollI),
      s: 0,
    }));
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    let hovered = false;
    let since = 0;
    let last = 0;
    let frame = 0;

    const write = (r: Roll) => {
      const text = multiplierAt(r.from, r.to, r.s);
      for (const node of r.nodes) if (node.textContent !== text) node.textContent = text;
    };
    const tick = (now: number) => {
      const dt = Math.min(now - last, 64);
      last = now;
      let busy = false;
      for (const r of rolls) {
        const delay = still.matches ? 0 : r.i * STAGGER_MS;
        const target = hovered && now - since >= delay ? 1 : 0;
        const next = still.matches ? target : stepToward(r.s, target, dt, target ? UP_MS : DOWN_MS);
        if (next !== r.s) {
          r.s = next;
          write(r);
        }
        if (r.s !== (hovered ? 1 : 0)) busy = true;
      }
      frame = busy ? requestAnimationFrame(tick) : 0;
    };
    const run = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const enter = () => {
      if (hovered) return;
      hovered = true;
      since = performance.now();
      run();
    };
    const leave = () => {
      hovered = false;
      run();
    };
    const onFocus = () => {
      if (card.matches(':focus-visible')) enter();
    };
    // Фокус ушёл, а курсор остался на карточке — числа остаются наверху.
    const onBlur = () => {
      if (!card.matches(':hover')) leave();
    };

    card.addEventListener('pointerenter', enter);
    card.addEventListener('pointerleave', leave);
    card.addEventListener('focus', onFocus);
    card.addEventListener('blur', onBlur);
    return () => {
      cancelAnimationFrame(frame);
      card.removeEventListener('pointerenter', enter);
      card.removeEventListener('pointerleave', leave);
      card.removeEventListener('focus', onFocus);
      card.removeEventListener('blur', onBlur);
    };
  }, [ref]);
}
