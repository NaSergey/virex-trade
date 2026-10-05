'use client';

import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';

/** Риск на сделку по умолчанию, в процентах депозита: выше него — предупреждение. */
export const DEFAULT_MAX_RISK = 10;
const MIN_RISK = 0;
const MAX_RISK = 100;

const decodeMaxRisk = (raw: string | null) => {
  const n = raw == null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= MIN_RISK && n <= MAX_RISK ? n : DEFAULT_MAX_RISK;
};
const encodeMaxRisk = (value: number) => (value === DEFAULT_MAX_RISK ? null : String(value));

/**
 * Верхняя граница риска на сделку — то, до чего ползунок риска в ордере
 * доходит. Выбор на устройстве и общий для всех трёх терминалов, как и панель
 * RSI: экран у них один, и настройка риска обязана быть одной.
 */
export const useMaxRisk = () => usePersistentValue('virex.terminal.maxRisk', decodeMaxRisk, DEFAULT_MAX_RISK, encodeMaxRisk);
