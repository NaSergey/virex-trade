'use client';

import { useState } from 'react';

/** Какой горизонт показывает шкала «вход в диапазоне»: один или все три сразу. */
export type RangeTfPref = '1h' | '4h' | '1d' | 'all';

export const RANGE_TF_OPTIONS = [
  { value: '1h' as const, label: '1H', title: 'Только часовой диапазон' },
  { value: '4h' as const, label: '4H', title: 'Только четырёхчасовой диапазон' },
  { value: '1d' as const, label: 'D', title: 'Только дневной диапазон' },
  { value: 'all' as const, label: 'Все', title: 'Все три горизонта' },
];

const STORAGE_KEY = 'virex:positions:rangeTf';

const isPref = (v: string | null): v is RangeTfPref =>
  v === '1h' || v === '4h' || v === '1d' || v === 'all';

const readStored = (): RangeTfPref => {
  if (typeof window === 'undefined') return 'all';
  const saved = localStorage.getItem(STORAGE_KEY);
  return isPref(saved) ? saved : 'all';
};

/**
 * Выбор горизонта для шкалы в таблице открытых позиций.
 *
 * Три строки на позицию нужны, когда сравниваешь горизонты между собой; когда
 * работаешь по одному (скажем, только по 4H), две лишние строки утраивают
 * высоту каждой строки таблицы и ничего не добавляют. Поэтому горизонт
 * выбирается, а не задан навсегда, и «Все» остаётся значением по умолчанию —
 * прежнее поведение для тех, кто ничего не выбирал.
 *
 * Выбор живёт в localStorage: это настройка рабочего места, а не состояние
 * сессии, и переживать перезагрузку она должна так же, как период на «Обзоре»
 * (см. usePeriodFilter). Читается сразу в ленивом инициализаторе useState — с
 * useEffect после монтирования на кадр мелькали бы все три строки.
 */
export function useRangeTf() {
  const [rangeTf, setRangeTfState] = useState<RangeTfPref>(readStored);

  const setRangeTf = (v: RangeTfPref) => {
    setRangeTfState(v);
    localStorage.setItem(STORAGE_KEY, v);
  };

  return { rangeTf, setRangeTf };
}
