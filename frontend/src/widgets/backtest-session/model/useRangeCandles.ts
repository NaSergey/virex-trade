'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Candle } from '../lib/candles';
import { H4 } from '../lib/ranges';

export type Load4h = (range: { from?: number; to?: number; limit: number }) => Promise<Candle[]>;

/** ≈166 дней: рамке, прожившей 75 дней, нужен и её импульс, и разгон ATR перед ним. */
const DEPTH = 1000;
/** Дальше этого — не догружать хвост, а взять заново всю глубину. */
const MAX_GAP = 50;

/**
 * Закрытые свечи 4ч монеты графика до «сейчас» терминала — для индикатора
 * боковиков. Своей загрузкой, а не из ленты: живая лента держит только
 * выбранный таймфрейм, а прокрутка — 300 свечей (50 дней).
 *
 * Догружается хвостом от последней свечи, а не всей глубиной: на ×32 прокрутки
 * новая свеча 4ч закрывается каждые 7,5 секунды. Формирующаяся свеча в ряд не
 * входит — рамка мигала бы внутри неё.
 */
export function useRangeCandles(enabled: boolean, load: Load4h, key: string, now: number | null): Candle[] {
  const [state, setState] = useState<{ key: string; rows: Candle[] } | null>(null);
  // Открытие последней закрытой свечи; меняется раз в 4 часа «сейчас» терминала.
  const lastOpen = now == null ? null : Math.floor(now / H4) * H4 - H4;

  useEffect(() => {
    if (!enabled || lastOpen == null) return;
    const have = state?.key === key ? state.rows : null;
    const tail = have?.at(-1)?.t ?? null;
    if (tail != null && tail >= lastOpen) return;
    let alive = true;
    const to = lastOpen + H4 - 1;
    const range =
      tail != null && (lastOpen - tail) / H4 <= MAX_GAP ? { from: tail + H4, to, limit: MAX_GAP + 1 } : { to, limit: DEPTH };
    load(range)
      .then((rows) => {
        if (!alive) return;
        setState((prev) => {
          const base = prev?.key === key && range.from != null ? prev.rows : [];
          const last = base.at(-1)?.t ?? -Infinity;
          return { key, rows: [...base, ...rows.filter((c) => c.t > last)] };
        });
      })
      // Не загрузилось — рамок просто нет; следующая свеча попробует снова.
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // `state` здесь — «что уже загружено», а не повод перезапуска: его смена
    // означает, что загрузка уже прошла.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, lastOpen, key, load]);

  return useMemo(
    () => (state?.key === key && lastOpen != null ? state.rows.filter((c) => c.t <= lastOpen) : NO_CANDLES),
    [state, key, lastOpen],
  );
}

const NO_CANDLES: Candle[] = [];
