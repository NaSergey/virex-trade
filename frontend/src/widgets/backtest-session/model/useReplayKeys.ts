'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { isTypingTarget } from '../lib/drawings/hotkeys';
import { SPEEDS, allowedSpeed, replayKeyOf } from '../lib/playback';

/** Поверх них пробел нажимает кнопку окна или пункт списка, а не паузу под ним. */
const OVERLAY = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/**
 * Клавиши прокрутки бектеста: 1…5 — скорость, пробел — пауза и обратно, с той
 * скорости, на которой встали. В полях ввода и поверх окон не работают. Скорость,
 * которой ТФ не тянет (её кнопка выключена), клавишей тоже не ставится.
 *
 * Пробел гасится (`preventDefault`): кнопка в фокусе — чаще всего та же скорость,
 * по которой только что щёлкнули, — иначе нажалась бы второй раз на отпускании.
 */
export function useReplayKeys(p: {
  enabled: boolean;
  speed: number | null;
  tf: number;
  setSpeed: (speed: number | null) => void;
}) {
  const ref = useRef(p);
  const last = useRef<number>(SPEEDS[0]);
  useLayoutEffect(() => {
    ref.current = p;
    if (p.speed) last.current = p.speed;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = ref.current;
      if (!k.enabled || e.defaultPrevented || isTypingTarget(e.target)) return;
      if (e.target instanceof Element && e.target.closest(OVERLAY)) return;
      const action = replayKeyOf(e);
      if (!action) return;
      if (action.type === 'toggle') k.setSpeed(k.speed ? null : last.current);
      else if (allowedSpeed(action.speed, k.tf)) k.setSpeed(action.speed);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
