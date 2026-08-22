'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/** Какой горизонт показывает шкала «вход в диапазоне»: один или все три сразу. */
export type RangeTfPref = '1h' | '4h' | '1d' | 'all';

/** Опции тумблера горизонта — с переводом; подписи '1H'/'4H'/'D' не переводятся. */
export function useRangeTfOptions() {
  const t = useTranslations('overview');
  return [
    { value: '1h' as const, label: '1H', title: t('rangeTfHour') },
    { value: '4h' as const, label: '4H', title: t('rangeTfFourHour') },
    { value: '1d' as const, label: 'D', title: t('rangeTfDay') },
    { value: 'all' as const, label: t('rangeTfAll'), title: t('rangeTfAllTitle') },
  ];
}

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
