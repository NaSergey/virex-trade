'use client';

import { useCallback, useRef, useSyncExternalStore } from 'react';
import { fitAspect, STAGE_TALL, STAGE_WIDE } from '../lib/layout';

/** До первого замера коробки — прежняя развилка по ширине окна. */
const TALL_QUERY = '(max-width: 720px)';

/**
 * Пропорция сцены — по месту, которое ей осталось (`.ct-stage-box`), а не по
 * ширине окна: на телефоне сцена 3:4 в почти квадратной коробке стояла узкой
 * колонкой с пустыми полями по бокам, места садились на бортик. Стол на
 * странице один, поэтому пропорция — общая на модуль: коробку меряет
 * `TableShell`, места читают раскладкой (`useSeatPoints`).
 */
let measured: number | null = null;
const listeners = new Set<() => void>();

function setMeasured(next: number | null) {
  if (next === measured) return;
  measured = next;
  listeners.forEach((l) => l());
}

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  const mq = window.matchMedia(TALL_QUERY);
  mq.addEventListener('change', onChange);
  return () => {
    listeners.delete(onChange);
    mq.removeEventListener('change', onChange);
  };
};

const snapshot = () => measured ?? (window.matchMedia(TALL_QUERY).matches ? STAGE_TALL : STAGE_WIDE);

/**
 * Пропорция сцены стола. Места стоят на равном расстоянии по длине овала, а
 * длина считается в пикселях — поэтому раскладке нужно знать пропорцию сцены.
 */
export function useStageAspect(): number {
  return useSyncExternalStore(subscribe, snapshot, () => STAGE_WIDE);
}

/** Ref коробки сцены: меряет её и отдаёт пропорцию сцене и раскладке мест. */
export function useStageBox(): (el: HTMLElement | null) => void {
  const observer = useRef<ResizeObserver | null>(null);
  return useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) {
      setMeasured(null);
      return;
    }
    const apply = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width > 0 && height > 0) setMeasured(fitAspect(width, height));
    };
    apply();
    observer.current = new ResizeObserver(apply);
    observer.current.observe(el);
  }, []);
}
