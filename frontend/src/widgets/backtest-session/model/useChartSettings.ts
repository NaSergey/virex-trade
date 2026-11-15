'use client';

import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';

const decodeOn = (raw: string | null) => raw !== '0';
const encodeOn = (on: boolean) => (on ? null : '0');

/**
 * Панель RSI под графиком — включена, пока её не выключили в настройках графика
 * (шестерёнка над ним). Выбор на устройстве и общий для всех трёх терминалов:
 * экран у них один, и индикатор, выключенный в бектесте, не должен
 * возвращаться на бирже.
 */
export const useRsiOn = () => usePersistentValue('virex.terminal.rsi', decodeOn, true, encodeOn);

/**
 * Рамки боковиков на графике (`lib/ranges.ts`). Включены, пока их не выключили в
 * настройках графика; выбор на устройстве и общий для всех терминалов — как у RSI.
 */
export const RANGES_ENABLED = false;

/**
 * Выключено, пока не решим, как показывать боковики: переключатель скрыт
 * (`RANGES_ENABLED` в `ChartSettingsPanel`), а сохранённый выбор не даёт включить.
 */
export const useRangesOn = (): [boolean, (on: boolean) => void] => {
  const [on, setOn] = usePersistentValue('virex.terminal.ranges', decodeOn, true, encodeOn);
  return [RANGES_ENABLED && on, setOn];
};

/**
 * Экспериментальное в терминале (спека 2026-10-25) — выключено, пока не включили в
 * настройках графика; выбор на устройстве и общий для всех терминалов, как у RSI.
 * `take` — шанс тейка на подписях уровней; `tagPrompt` — окно тегов после открытия
 * позиции по рынку; `fvg` и `ob` — зоны имбалансов и ордерблоков (`lib/zones.ts`).
 */
export const EXP_IDS = ['take', 'tagPrompt', 'fvg', 'ob'] as const;
export type ExpId = (typeof EXP_IDS)[number];

const decodeOff = (raw: string | null) => raw === '1';
const encodeOff = (on: boolean) => (on ? '1' : null);

export const useExpOn = (id: ExpId) => usePersistentValue(`virex.terminal.exp.${id}`, decodeOff, false, encodeOff);

export function useExpSettings() {
  const [take, setTake] = useExpOn('take');
  const [tagPrompt, setTagPrompt] = useExpOn('tagPrompt');
  const [fvg, setFvg] = useExpOn('fvg');
  const [ob, setOb] = useExpOn('ob');
  const setters: Record<ExpId, (on: boolean) => void> = { take: setTake, tagPrompt: setTagPrompt, fvg: setFvg, ob: setOb };
  return { on: { take, tagPrompt, fvg, ob }, set: (id: ExpId, on: boolean) => setters[id](on) };
}
