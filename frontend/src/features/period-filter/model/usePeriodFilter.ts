'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { daysSince } from '@/shared/lib/utils/period';
import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';

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

const DEFAULT_DAYS = 30;

const decodeDays = (raw: string | null): number => (raw ? Number(raw) : DEFAULT_DAYS);

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

// Мусор мог осесть в хранилище до появления проверки — не тащим его дальше.
const decodeDate = (raw: string | null): string | null => (isUsableDate(raw) ? raw : null);

/**
 * Какой из двух селекторов сейчас управляет фильтром — пресет или своя дата.
 * До появления этого флага активность своей даты определялась одним лишь её
 * наличием в хранилище; при первом заходе после обновления сохраняем то же
 * поведение, а не сбрасываем всех на пресет.
 */
const decodeMode = (raw: string | null): Mode => {
  if (raw === 'custom' || raw === 'preset') return raw;
  // Ключа режима ещё нет — значит, человек последний раз был здесь до его
  // появления. Тогда активность своей даты определялась одним её наличием;
  // сохраняем то же поведение, а не сбрасываем всех на пресет.
  return localStorage.getItem(CUSTOM_DATE_STORAGE_KEY) ? 'custom' : 'preset';
};

/**
 * Фильтр периода, общий для страниц «Обзор», «Теги» и «Выборка» (раньше
 * это были вкладки одной страницы с одним состоянием — теперь отдельные пункты
 * навигации, поэтому период живёт в localStorage: переход между ними и
 * перезагрузка страницы не сбрасывают выбранный период.
 *
 * Значения живут в `usePersistentValue`, а не в `useState` с чтением
 * хранилища в инициализаторе: страница рендерится и на сервере, где хранилища
 * нет, и такой инициализатор разводил серверную разметку с клиентской —
 * человек с выбранной своей датой видел на кнопке «30 дней». Подробности
 * там же.
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
  const [days, setStoredDays] = usePersistentValue(DAYS_STORAGE_KEY, decodeDays, DEFAULT_DAYS, String);
  const [committedDate, setCommittedDate] = usePersistentValue(
    CUSTOM_DATE_STORAGE_KEY,
    decodeDate,
    null,
    (v) => v,
  );
  const [mode, setMode] = usePersistentValue(MODE_STORAGE_KEY, decodeMode, 'preset' as Mode, (v) => v);

  /*
   * Что стоит в поле прямо сейчас. Не состояние с собственным начальным
   * значением, а поправка поверх подтверждённой даты: пока человек не тронул
   * поле, показывается подтверждённая. Своим `useState`, снятым с хранилища,
   * это быть не может — начальное значение схватывалось бы во время гидрации,
   * когда хранилище ещё не прочитано, и поле навсегда осталось бы пустым.
   *
   * `undefined` — «не трогали», в отличие от `null` — «очистили».
   */
  const [draft, setDraft] = useState<string | null | undefined>(undefined);
  const customDate = draft === undefined ? committedDate : draft;

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPending = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => cancelPending, [cancelPending]);

  const setDays = (d: number) => {
    cancelPending();
    setStoredDays(d);
    setMode('preset');
  };

  const setCustomDate = (iso: string | null) => {
    setDraft(iso);
    cancelPending();
    // Сброс — явное действие (очистка поля), а не набор: применяем сразу и
    // стираем дату насовсем, в отличие от переключения на пресет.
    if (iso === null) {
      setMode('preset');
      setCommittedDate(null);
      return;
    }
    setMode('custom');
    if (!isUsableDate(iso)) return;
    timer.current = setTimeout(() => setCommittedDate(iso), COMMIT_DELAY_MS);
  };

  const customActive = mode === 'custom';
  const effectiveDays = customActive && committedDate ? daysSince(committedDate) : days;

  return { days, customDate, customActive, effectiveDays, setDays, setCustomDate };
}
