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
