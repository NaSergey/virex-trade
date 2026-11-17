'use client';

import { useCallback, useMemo } from 'react';
import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';
import { DEFAULT_TIMEFRAME, TIMEFRAMES } from '../lib/candles';
import { decodeLayout, decodePanes, encodePanes, fillPanes, paneCount, type LayoutId, type Pane } from '../lib/panes';

const raw = (v: string | null) => v;
const decodeIndex = (v: string | null) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : 0;
};
const encodeIndex = (n: number) => (n === 0 ? null : String(n));
const encodeLayout = (v: string | null) => (v === '1' ? null : v);

/**
 * Сетка графиков терминала (спека 2026-11-17): раскладка, монета и ТФ каждого
 * графика, номер активного. Всё — на устройстве (`virex.terminal.layout`,
 * `…panes`, `…activePane`).
 *
 * `coins` — монеты рынка по порядку списка: из них берутся монеты новых графиков.
 * Пока список не пришёл, сохранённые монеты не трогаются, а недостающие графики
 * получают `fallbackSymbol` — монету графика терминала.
 */
export function usePanes(coins: readonly string[], fallbackSymbol: string) {
  const [layoutRaw, setLayoutRaw] = usePersistentValue<string | null>('virex.terminal.layout', raw, null, encodeLayout);
  const [panesRaw, setPanesRaw] = usePersistentValue<string | null>('virex.terminal.panes', raw, null, raw);
  const [activeRaw, setActiveRaw] = usePersistentValue<number>('virex.terminal.activePane', decodeIndex, 0, encodeIndex);

  const layout = decodeLayout(layoutRaw);
  const count = paneCount(layout);
  const active = activeRaw < count ? activeRaw : 0;

  // Весь сохранённый состав, вместе с графиками сверх раскладки: вернувшийся с
  // 4 графиков на 2 и обратно видит прежние монеты. Ссылки держатся между
  // рендерами — ячейки сетки сверяют `pane` по ссылке (memo).
  const all = useMemo(() => {
    const stored = decodePanes(panesRaw, TIMEFRAMES);
    const base = stored.length > 0 ? stored : [{ symbol: fallbackSymbol, tf: DEFAULT_TIMEFRAME }];
    const tf = base[Math.min(active, base.length - 1)].tf;
    if (coins.length > 0) return fillPanes(base, count, coins, tf);
    const out = [...base];
    while (out.length < count) out.push({ symbol: fallbackSymbol, tf });
    return out;
  }, [panesRaw, fallbackSymbol, active, count, coins]);
  const panes = useMemo(() => all.slice(0, count), [all, count]);

  const setPane = useCallback(
    (i: number, patch: Partial<Pane>) => setPanesRaw(encodePanes(all.map((p, j) => (j === i ? { ...p, ...patch } : p)))),
    [all, setPanesRaw],
  );

  const setLayout = useCallback(
    (next: LayoutId) => {
      setLayoutRaw(next);
      // Монеты новых графиков записываются сразу: иначе они зависели бы от того,
      // какой график активен в момент следующего чтения.
      if (coins.length > 0) setPanesRaw(encodePanes(fillPanes(all, paneCount(next), coins, all[active].tf)));
      if (active >= paneCount(next)) setActiveRaw(0);
    },
    [all, active, coins, setLayoutRaw, setPanesRaw, setActiveRaw],
  );

  return { layout, setLayout, panes, active, activate: setActiveRaw, setPane };
}

export type PanesState = ReturnType<typeof usePanes>;
