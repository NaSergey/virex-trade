'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Значение из `localStorage`, которое можно читать прямо в разметке.
 *
 * Зачем не `useState(() => localStorage.getItem(...))`, как было раньше:
 * страница рендерится и на сервере, а там `localStorage` нет. Ленивый
 * инициализатор возвращал на сервере умолчание, на клиенте — сохранённое, и
 * первый же клиентский рендер расходился с присланной разметкой. React такое
 * не чинит: он оставляет серверный вариант и пишет в консоль ошибку гидрации —
 * то есть человек с выбранным периодом «своя дата» видел на кнопке «30 дней»,
 * и это не лечилось до следующего перерисовывания.
 *
 * `useSyncExternalStore` для того и заведён: он знает, какой рендер —
 * гидрация, берёт для него серверный снимок, а сразу после неё перечитывает
 * настоящий. Расхождения не возникает, а `useEffect` после монтирования не
 * годился бы: страницы размонтируются при переходе между разделами, и на кадр
 * мелькало бы умолчание вместо сохранённого выбора.
 *
 * Заодно значение становится общим: два места, читающие один ключ, видят
 * правку друг друга — и в этой вкладке (свои подписчики), и в соседней
 * (событие `storage`). Раньше каждое держало свою копию в `useState`.
 *
 * Только для примитивов — строк, чисел, `null`. `useSyncExternalStore`
 * сравнивает снимки по ссылке, и объект, пересобранный при каждом чтении,
 * загнал бы рендер в бесконечный цикл.
 */
export function usePersistentValue<T extends string | number | boolean | null>(
  key: string,
  /** Как прочесть сырую строку хранилища. Вызывается только на клиенте. */
  decode: (raw: string | null) => T,
  /** Что показывать на сервере и до первого чтения хранилища. */
  fallback: T,
  /** Как записать. `null` — стереть ключ. */
  encode: (value: T) => string | null,
): [T, (value: T) => void] {
  const getSnapshot = useCallback((): T => {
    if (!cache.has(key)) cache.set(key, decode(localStorage.getItem(key)));
    return cache.get(key) as T;
  }, [key, decode]);

  const value = useSyncExternalStore(subscribe(key), getSnapshot, () => fallback);

  const set = useCallback(
    (next: T) => {
      cache.set(key, next);
      const raw = encode(next);
      if (raw === null) localStorage.removeItem(key);
      else localStorage.setItem(key, raw);
      emit(key);
    },
    [key, encode],
  );

  return [value, set];
}

/**
 * Прочитанные значения — по ключу. Кеш нужен не ради скорости, а ради ссылки:
 * `getSnapshot` обязан возвращать то же самое, пока значение не менялось.
 */
const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();

function emit(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

/**
 * Подписка на ключ. Функция подписки должна быть постоянной при неизменном
 * ключе — иначе React отписывался бы и подписывался на каждый рендер.
 */
const subscribers = new Map<string, (onChange: () => void) => () => void>();

function subscribe(key: string) {
  let fn = subscribers.get(key);
  if (!fn) {
    fn = (onChange: () => void) => {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(onChange);

      // Соседняя вкладка правит то же хранилище: наш кеш о её записи не знает,
      // поэтому сбрасываем его и перечитываем.
      const onStorage = (e: StorageEvent) => {
        if (e.key !== key) return;
        cache.delete(key);
        onChange();
      };
      window.addEventListener('storage', onStorage);

      return () => {
        set!.delete(onChange);
        window.removeEventListener('storage', onStorage);
      };
    };
    subscribers.set(key, fn);
  }
  return fn;
}
