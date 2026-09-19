'use client';

import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';

const STORAGE_KEY = 'virex:backtest:leverage';
export const DEFAULT_LEVERAGE = 10;

const decode = (raw: string | null): number => {
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_LEVERAGE;
};

/**
 * Последнее выбранное плечо — рабочая настройка тикета, не состояние сделки:
 * держится в localStorage (`usePersistentValue`, как горизонт на «Обзоре» —
 * см. `useRangeTf`), переживает перезагрузку и новую сессию. Без сохранённого
 * значения — 10×, а не 1×: это и есть более реалистичное умолчание для
 * тренажёра, чем нулевое плечо биржи.
 */
export function useDefaultLeverage() {
  return usePersistentValue(STORAGE_KEY, decode, DEFAULT_LEVERAGE, String);
}
