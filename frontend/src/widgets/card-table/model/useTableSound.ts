'use client';

import { useCallback, useEffect, useRef } from 'react';
import { preload, play, stopAll } from '@/shared/lib/sound/player';
import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';
import { SOUND_FILES, SOUNDS, thin, tickDelays, type Cue, type TableSound } from '../lib/sounds';

const SOUND_KEY = 'virex.sound';
const decode = (raw: string | null) => raw !== '0';
const encode = (on: boolean) => (on ? null : '0');

/** Звук за столом: включён, пока его не выключили в меню «⋯»; выбор — на устройстве. */
export function useSoundOn() {
  return usePersistentValue(SOUND_KEY, decode, true, encode);
}

const pick = (files: string[]) => files[Math.floor(Math.random() * files.length)];

function sound(name: TableSound, delay: number) {
  const def = SOUNDS[name];
  if (!def.signal && document.visibilityState !== 'visible') return;
  play(pick(def.files), { delay, gain: def.gain });
}

/**
 * Звук стола: проигрывает звуки снимка (`Track.cues`) и тикает в последние
 * секунды моего хода. `turnDeadline` — дедлайн, только пока ход мой.
 *
 * Звуки снимка играют по смене ссылки на список: перерисовки с тем же
 * снимком (снятие долетевших фишек, реплик крупье) их не повторяют, а
 * включение звука не проигрывает заново то, что прошло при выключенном.
 *
 * Возвращает звук события страницы, а не снимка (фишка из панели ставок легла).
 */
export function useTableSound(cues: readonly Cue[], turnDeadline: number | null) {
  const [on] = useSoundOn();
  const played = useRef(cues);

  useEffect(() => {
    if (!on) return;
    preload(SOUND_FILES);
    // Выключили звук или ушли со стола — запланированное обрывается.
    return stopAll;
  }, [on]);

  useEffect(() => {
    if (played.current === cues) return;
    played.current = cues;
    if (on) thin(cues).forEach((c) => sound(c.sound, c.delay));
  }, [cues, on]);

  // Тиканье — по часам клиента, как дуга таймера на месте (`SeatPlate`).
  useEffect(() => {
    if (!on || turnDeadline === null) return;
    const def = SOUNDS.tick;
    const stops = tickDelays(turnDeadline, Date.now()).map((delay) => play(def.files[0], { delay, gain: def.gain }));
    return () => stops.forEach((s) => s());
  }, [on, turnDeadline]);

  return useCallback(
    (name: TableSound) => {
      if (on) sound(name, 0);
    },
    [on],
  );
}
