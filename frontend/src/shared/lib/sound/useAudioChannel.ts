'use client';

import { useCallback, useMemo } from 'react';
import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';

/** Канал звука игры — эффекты, музыка: выключатель и громкость, выбор на устройстве. */
export interface AudioChannel {
  /** Не выключен кнопкой. */
  on: boolean;
  /** Положение ползунка, 0…1; помнится и у выключенного канала. */
  volume: number;
  /** Слышно ли вообще: включён и громкость не ноль. Молчащий канал игре не нужно и запускать. */
  audible: boolean;
  /**
   * Усиление шины — квадрат ползунка: слух логарифмичен, и при линейной
   * связи вся заметная разница громкости сжималась бы в нижнюю четверть хода.
   */
  gain: number;
  setOn: (on: boolean) => void;
  /** Ползунок у выключенного канала включает его: двинуть громкость и не услышать — ошибка. */
  setVolume: (volume: number) => void;
}

const decodeOn = (raw: string | null) => raw !== '0';
const encodeOn = (on: boolean) => (on ? null : '0');
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Канал звука по ключу хранилища: `key` — выключатель, `key.volume` —
 * громкость (умолчание не пишется, чтобы его правка доезжала до всех).
 * Два места, читающие один канал (кнопка и проводка звука), видят правки
 * друг друга — это даёт `usePersistentValue`.
 */
export function useAudioChannel(key: string, defaultVolume: number): AudioChannel {
  const decodeVolume = useCallback(
    (raw: string | null) => {
      const n = raw === null ? NaN : Number(raw);
      return Number.isFinite(n) ? clamp01(n) : defaultVolume;
    },
    [defaultVolume],
  );
  const encodeVolume = useCallback((v: number) => (v === defaultVolume ? null : String(v)), [defaultVolume]);
  const [on, setOnRaw] = usePersistentValue(key, decodeOn, true, encodeOn);
  const [volume, setVolumeRaw] = usePersistentValue(`${key}.volume`, decodeVolume, defaultVolume, encodeVolume);

  return useMemo(() => {
    const audible = on && volume > 0;
    return {
      on,
      volume,
      audible,
      gain: audible ? volume * volume : 0,
      setOn: (next: boolean) => {
        // Включённый на нуле канал молчал бы дальше — возвращается умолчание.
        if (next && volume === 0) setVolumeRaw(defaultVolume);
        setOnRaw(next);
      },
      setVolume: (next: number) => {
        const v = clamp01(next);
        setVolumeRaw(v);
        if (v > 0 && !on) setOnRaw(true);
      },
    };
  }, [on, volume, defaultVolume, setOnRaw, setVolumeRaw]);
}
