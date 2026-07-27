'use client';

import { useState } from 'react';
import { emptyLabFilters, type LabFilters } from '@/shared/api/lab/hooks';

/** Множественные измерения: набор выбранных строковых значений. */
type MultiKey = 'tagIds' | 'symbols' | 'sessions' | 'trend4h';
/** Одиночные измерения: выбрано одно значение либо ничего. */
type SingleKey = 'direction' | 'ema200' | 'atr' | 'vol';

const toggled = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** Сколько фильтров реально сужают выборку — цифра на кнопке «Сбросить». */
const countActive = (f: LabFilters) =>
  f.tagIds.length +
  f.symbols.length +
  f.weekdays.length +
  f.sessions.length +
  f.trend4h.length +
  (f.direction ? 1 : 0) +
  (f.ema200 ? 1 : 0) +
  (f.atr ? 1 : 0) +
  (f.vol ? 1 : 0) +
  (f.hourFrom != null || f.hourTo != null ? 1 : 0);

/**
 * Состояние фильтров Лаборатории и все способы его менять. Отделено от
 * разметки: у страницы одна причина меняться (как это выглядит), у этого хука
 * другая (что значит «переключить измерение»).
 *
 * `days` здесь всегда 0 — период живёт в usePeriodFilter и подставляется
 * перед запросом, чтобы не заводить второй источник истины.
 */
export function useLabFilters() {
  const [filters, setFilters] = useState<LabFilters>(() => emptyLabFilters(0));
  const set = (patch: Partial<LabFilters>) => setFilters((f) => ({ ...f, ...patch }));

  return {
    filters,
    set,
    /** Множественный выбор: клик добавляет значение либо убирает его. */
    toggleMulti: (key: MultiKey, value: string) =>
      set({ [key]: toggled(filters[key], value) } as Partial<LabFilters>),
    toggleWeekday: (day: number) => set({ weekdays: toggled(filters.weekdays, day) }),
    /** Одиночный выбор: клик по уже выбранному значению снимает фильтр. */
    toggleSingle: <K extends SingleKey>(key: K, value: LabFilters[K]) =>
      set({ [key]: filters[key] === value ? undefined : value } as Partial<LabFilters>),
    reset: () => setFilters(emptyLabFilters(0)),
    activeCount: countActive(filters),
  };
}

export type LabFiltersState = ReturnType<typeof useLabFilters>;
