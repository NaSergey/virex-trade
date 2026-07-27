'use client';

import { useEffect, useRef, useState } from 'react';
import { daysSince } from '@/shared/lib/utils/period';

export const PERIODS = [
  { label: '7 дней', value: 7 },
  { label: '30 дней', value: 30 },
  { label: '90 дней', value: 90 },
  { label: 'Всё время', value: 0 },
] as const;

const DAYS_STORAGE_KEY = 'virex:stats:days';
const CUSTOM_DATE_STORAGE_KEY = 'virex:stats:customDateFrom';

// Пауза после последнего нажатия, прежде чем дата уйдёт в запросы. Хватает,
// чтобы допечатать год, и не ощущается задержкой при выборе из календаря.
const COMMIT_DELAY_MS = 400;
// Раньше этой даты сделок быть не может — отсекает «0002-…» из недопечатанного
// года. Календарь всё равно ограничен снизу здравым смыслом, а не этим числом.
const MIN_YEAR = 2000;

const readStoredDays = () => {
  if (typeof window === 'undefined') return 30;
  const saved = localStorage.getItem(DAYS_STORAGE_KEY);
  return saved ? Number(saved) : 30;
};

/**
 * Дата, которую уже осмысленно отправлять на сервер.
 *
 * `<input type="date">` шлёт onChange на каждую цифру года: пока печатаешь
 * «2026», поле последовательно валидно как 0002-07-27, 0020-07-27, 0202-07-27
 * — настоящие даты, просто из глубокой древности. Без этой проверки каждая
 * из них уезжала в запрос как «период в 700 тысяч дней».
 */
const isUsableDate = (iso: string | null): boolean => {
  if (!iso) return true; // очистка поля — законное состояние
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return false;
  return Number(iso.slice(0, 4)) >= MIN_YEAR && ts <= Date.now();
};

const readStoredCustomDate = () => {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem(CUSTOM_DATE_STORAGE_KEY);
  // Мусор мог осесть в хранилище до появления проверки — не тащим его дальше.
  return isUsableDate(saved) ? saved : null;
};

/**
 * Фильтр периода, общий для страниц «Обзор» и «Теги» (раньше это были
 * вкладки одной страницы с одним состоянием — теперь отдельные пункты
 * навигации, поэтому период живёт в localStorage: переход между ними и
 * перезагрузка страницы не сбрасывают выбранный период.
 *
 * Значения читаются из localStorage сразу в лениво инициализаторе useState, а
 * не в useEffect после монтирования — страницы в AppShell полностью
 * размонтируются/монтируются заново при каждом переключении вкладки, и с
 * useEffect на секунду мелькал дефолт (30 дней, без своей даты), а потом блок
 * дёргался на сохранённое значение.
 *
 * `customDate` переопределяет пресет (7/30/90/всё), если задан — храним саму
 * дату, а не посчитанное один раз число дней, иначе фильтр молча съезжает на
 * день при следующем заходе (см. daysSince).
 *
 * Состояний даты два: `customDate` — то, что в поле прямо сейчас (обновляется
 * на каждое нажатие, иначе поле не печатается), и внутреннее «подтверждённое»
 * — то, из чего считается период для запросов. Второе отстаёт от первого на
 * паузу в наборе и никогда не принимает недопечатанную дату, поэтому запросы
 * не летят на каждую цифру.
 */
export function usePeriodFilter() {
  const [days, setDaysState] = useState<number>(readStoredDays);
  const [customDate, setCustomDateState] = useState<string | null>(readStoredCustomDate);
  const [committedDate, setCommittedDate] = useState<string | null>(readStoredCustomDate);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPending = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => cancelPending, []);

  const commit = (iso: string | null) => {
    setCommittedDate(iso);
    if (iso) localStorage.setItem(CUSTOM_DATE_STORAGE_KEY, iso);
    else localStorage.removeItem(CUSTOM_DATE_STORAGE_KEY);
  };

  const setDays = (d: number) => {
    cancelPending();
    setDaysState(d);
    localStorage.setItem(DAYS_STORAGE_KEY, String(d));
    setCustomDateState(null);
    commit(null);
  };

  const setCustomDate = (iso: string | null) => {
    setCustomDateState(iso);
    cancelPending();
    // Сброс — явное действие кнопкой, а не набор: применяем сразу.
    if (iso === null) {
      commit(null);
      return;
    }
    if (!isUsableDate(iso)) return;
    timer.current = setTimeout(() => commit(iso), COMMIT_DELAY_MS);
  };

  const effectiveDays = committedDate ? daysSince(committedDate) : days;

  return { days, customDate, effectiveDays, setDays, setCustomDate };
}
