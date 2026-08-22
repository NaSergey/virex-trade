'use client';

import { useEffect, useRef, useState } from 'react';
import { daysSince } from '@/shared/lib/utils/period';

// Подписи — в PeriodRail: там доступен t() из next-intl, а значения периода
// (в днях) — часть модели фильтра и от локали не зависят.
export const PERIOD_VALUES = [7, 30, 90, 0] as const;

const DAYS_STORAGE_KEY = 'virex:stats:days';
const CUSTOM_DATE_STORAGE_KEY = 'virex:stats:customDateFrom';
const MODE_STORAGE_KEY = 'virex:stats:periodMode';

type Mode = 'preset' | 'custom';

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
 * Какой из двух селекторов сейчас управляет фильтром — пресет или своя дата.
 * До появления этого флага активность своей даты определялась одним лишь её
 * наличием в хранилище; при первом заходе после обновления сохраняем то же
 * поведение, а не сбрасываем всех на пресет.
 */
const readStoredMode = (hasStoredDate: boolean): Mode => {
  if (typeof window === 'undefined') return 'preset';
  const saved = localStorage.getItem(MODE_STORAGE_KEY);
  if (saved === 'custom' || saved === 'preset') return saved;
  return hasStoredDate ? 'custom' : 'preset';
};

/**
 * Фильтр периода, общий для страниц «Обзор», «Теги» и «Выборка» (раньше
 * это были вкладки одной страницы с одним состоянием — теперь отдельные пункты
 * навигации, поэтому период живёт в localStorage: переход между ними и
 * перезагрузка страницы не сбрасывают выбранный период.
 *
 * Значения читаются из localStorage сразу в лениво инициализаторе useState, а
 * не в useEffect после монтирования — страницы в AppShell полностью
 * размонтируются/монтируются заново при каждом переключении вкладки, и с
 * useEffect на секунду мелькал дефолт (30 дней, без своей даты), а потом блок
 * дёргался на сохранённое значение.
 *
 * Пресет и своя дата не вытесняют друг друга из памяти — только по очереди
 * управляют фильтром. Клик по «30 дней» после того, как была введена своя
 * дата, снимает её с управления (`mode` → 'preset'), но не стирает саму дату:
 * она остаётся в поле и в хранилище, и повторный клик по полю сразу
 * возвращает к ней, не заставляя вводить заново. Стирает дату насовсем только
 * явная очистка поля — это осознанное действие, а не побочный эффект выбора
 * пресета.
 *
 * Состояний даты два: `customDate` — то, что в поле прямо сейчас (обновляется
 * на каждое нажатие, иначе поле не печатается), и внутреннее «подтверждённое»
 * — то, из чего считается период для запросов, когда своя дата активна. Второе
 * отстаёт от первого на паузу в наборе и никогда не принимает недопечатанную
 * дату, поэтому запросы не летят на каждую цифру.
 */
export function usePeriodFilter() {
  const [days, setDaysState] = useState<number>(readStoredDays);
  const [customDate, setCustomDateState] = useState<string | null>(readStoredCustomDate);
  const [committedDate, setCommittedDate] = useState<string | null>(readStoredCustomDate);
  const [mode, setModeState] = useState<Mode>(() => readStoredMode(readStoredCustomDate() != null));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPending = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => cancelPending, []);

  const setMode = (m: Mode) => {
    setModeState(m);
    localStorage.setItem(MODE_STORAGE_KEY, m);
  };

  const commit = (iso: string | null) => {
    setCommittedDate(iso);
    if (iso) localStorage.setItem(CUSTOM_DATE_STORAGE_KEY, iso);
    else localStorage.removeItem(CUSTOM_DATE_STORAGE_KEY);
  };

  const setDays = (d: number) => {
    cancelPending();
    setDaysState(d);
    localStorage.setItem(DAYS_STORAGE_KEY, String(d));
    setMode('preset');
  };

  const setCustomDate = (iso: string | null) => {
    setCustomDateState(iso);
    cancelPending();
    // Сброс — явное действие (очистка поля), а не набор: применяем сразу и
    // стираем дату насовсем, в отличие от переключения на пресет.
    if (iso === null) {
      setMode('preset');
      commit(null);
      return;
    }
    setMode('custom');
    if (!isUsableDate(iso)) return;
    timer.current = setTimeout(() => commit(iso), COMMIT_DELAY_MS);
  };

  const customActive = mode === 'custom';
  const effectiveDays = customActive && committedDate ? daysSince(committedDate) : days;

  return { days, customDate, customActive, effectiveDays, setDays, setCustomDate };
}
