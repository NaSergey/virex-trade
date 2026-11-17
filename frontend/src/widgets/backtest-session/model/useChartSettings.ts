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
 * Экспериментальные индикаторы терминала (спека 2026-10-25) — выключены, пока
 * их не включили в настройках графика; выбор на устройстве и общий для всех
 * терминалов, как у RSI.
 */
export const EXP_IDS = ['take'] as const;
export type ExpId = (typeof EXP_IDS)[number];

const decodeOff = (raw: string | null) => raw === '1';
const encodeOff = (on: boolean) => (on ? '1' : null);

export const useExpOn = (id: ExpId) => usePersistentValue(`virex.terminal.exp.${id}`, decodeOff, false, encodeOff);

export function useExpSettings() {
  const [take, setTake] = useExpOn('take');
  const setters: Record<ExpId, (on: boolean) => void> = { take: setTake };
  return { on: { take }, set: (id: ExpId, on: boolean) => setters[id](on) };
}

/**
 * Экспериментально: после открытия позиции по рынку предлагать теги. Включается
 * в окне настроек, вкладка «Терминал»; выбор на устройстве.
 */
export const useTagPromptOn = () => usePersistentValue('virex.terminal.exp.tagPrompt', decodeOff, false, encodeOff);

/** Что открыто в правой колонке терминала: панель ордера или список монет. */
export type RailPanel = 'order' | 'watch';

const decodeRail = (raw: string | null): RailPanel => (raw === 'watch' ? 'watch' : 'order');
const encodeRail = (v: RailPanel) => (v === 'order' ? null : v);

/** Вкладка правой колонки; на устройстве и общая для всех терминалов, как настройки графика. */
export const useRailPanel = () => usePersistentValue('virex.terminal.rail', decodeRail, 'order', encodeRail);

/**
 * Гистограмма объёма у нижнего края поля цены (спека 2026-11-17). Выключена,
 * пока её не включили в настройках графика: вид терминала без спроса не меняется.
 */
export const useVolumeOn = () => usePersistentValue('virex.terminal.volume', decodeOff, false, encodeOff);
