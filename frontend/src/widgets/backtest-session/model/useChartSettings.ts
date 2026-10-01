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
