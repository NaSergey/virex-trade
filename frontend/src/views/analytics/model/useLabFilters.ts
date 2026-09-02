'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { emptyLabFilters, type LabFilters, type RangeTf } from '../api/hooks';

/** Множественные измерения: набор выбранных строковых значений. */
type MultiKey = 'tagIds' | 'symbols' | 'sessions' | 'trend4h';
/** Одиночные измерения: выбрано одно значение либо ничего. */
type SingleKey = 'direction' | 'ema200' | 'atr' | 'vol' | 'range';

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
  // rangeTf не считаем: он лишь выбирает, какой ТФ читают чипы диапазона,
  // и сам по себе выборку не сужает.
  (f.range ? 1 : 0) +
  (f.hourFrom != null || f.hourTo != null ? 1 : 0);

/**
 * Начальные фильтры из query-строки — дрилдаун из «Цены привычек» на Обзоре
 * (см. `overview/lib/habit-labels.ts`, `habitSearchParams`) кладёт туда те же
 * имена, которых ждёт `useLab` (см. `../api/hooks.ts`). Единственное
 * расхождение имён — `tags` в query против `tagIds` в `LabFilters`.
 */
function filtersFromSearchParams(sp: URLSearchParams): LabFilters {
  const base = emptyLabFilters(0);
  const str = (key: string) => sp.get(key) ?? undefined;
  const csv = (key: string) => {
    const v = sp.get(key);
    return v ? v.split(',') : [];
  };
  const num = (key: string) => {
    const v = sp.get(key);
    return v != null && v !== '' ? Number(v) : undefined;
  };
  return {
    ...base,
    tagIds: csv('tags'),
    symbols: csv('symbols'),
    weekdays: csv('weekdays').map(Number),
    sessions: csv('sessions'),
    trend4h: csv('trend4h'),
    direction: str('direction') as LabFilters['direction'],
    hourFrom: num('hourFrom'),
    hourTo: num('hourTo'),
    ema200: str('ema200') as LabFilters['ema200'],
    atr: str('atr') as LabFilters['atr'],
    vol: str('vol') as LabFilters['vol'],
    rangeTf: (str('rangeTf') as RangeTf | undefined) ?? base.rangeTf,
    range: str('range') as LabFilters['range'],
  };
}

/**
 * Состояние фильтров Аналитики и все способы его менять. Отделено от
 * разметки: у страницы одна причина меняться (как это выглядит), у этого хука
 * другая (что значит «переключить измерение»).
 *
 * `days` здесь всегда 0 — период живёт в usePeriodFilter и подставляется
 * перед запросом, чтобы не заводить второй источник истины.
 *
 * Начальное состояние читается из query-строки один раз при маунте (лениво,
 * через `useState(() => ...)`) — переход по ссылке из привычки Обзора этим и
 * работает. Дальнейшие правки URL руками фильтры не меняют: это не
 * двусторонняя синхронизация, а разовая точка входа.
 */
export function useLabFilters() {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<LabFilters>(() => filtersFromSearchParams(searchParams));
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
    // rangeTf переживает сброс: это не фильтр, а выбор шкалы, на которую
    // смотришь — сбрасывать его вместе с фильтрами было бы неожиданно.
    reset: () => setFilters((f) => ({ ...emptyLabFilters(0), rangeTf: f.rangeTf })),
    activeCount: countActive(filters),
  };
}

export type LabFiltersState = ReturnType<typeof useLabFilters>;
