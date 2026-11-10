'use client';

import { useEffect, useRef } from 'react';
import { audioContext } from '@/shared/lib/sound/player';
import type { AudioChannel } from '@/shared/lib/sound/useAudioChannel';
import { SlotsMusic } from '../lib/music';
import type { MusicMode } from '../lib/score';
import { musicBus } from '../lib/sound';

/**
 * Фоновая музыка автомата: своя у игры и у каждого бонуса (`mode`), под
 * экраном крупного выигрыша приглушена (`ducked`). Молчащий канал музыку не
 * заводит; фоновая вкладка глушит шину и усыпляет планировщик.
 */
export function useSlotsMusic(channel: AudioChannel, mode: MusicMode, ducked: boolean) {
  const tune = useRef<SlotsMusic | null>(null);
  const on = channel.audible;

  useEffect(() => {
    if (!on || !audioContext()) return;
    const m = SlotsMusic.create();
    if (!m) return;
    tune.current = m;
    return () => {
      m.stop();
      tune.current = null;
    };
  }, [on]);

  useEffect(() => {
    const b = musicBus();
    if (!b) return;
    const apply = () => {
      const visible = document.visibilityState === 'visible';
      b.out.gain.setTargetAtTime(visible ? channel.gain : 0, b.c.currentTime, 0.08);
      tune.current?.setAwake(visible);
    };
    apply();
    document.addEventListener('visibilitychange', apply);
    return () => document.removeEventListener('visibilitychange', apply);
  }, [channel.gain, on]);

  useEffect(() => {
    tune.current?.setMode(mode);
  }, [mode, on]);

  useEffect(() => {
    tune.current?.setDucked(ducked);
  }, [ducked, on]);
}
