'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { drawingsKey, parseDrawings, saveDrawings } from '../lib/drawings/store';
import type { Drawing } from '../lib/drawings/types';

/**
 * Рисунки сессии из localStorage.
 *
 * Чтение через `useSyncExternalStore` с кэшем по ключу — тот же приём, что у
 * `usePersistentValue`: рисунки есть уже на первом кадре графика, без мигания
 * после монтирования, а соседняя вкладка видит правку через событие `storage`.
 * Свой хук, а не `usePersistentValue`: тот только для примитивов, а список
 * фигур — объект, ссылка на который обязана держаться между чтениями.
 */
export function useSessionDrawings(userId: string, sessionId: string) {
  const key = drawingsKey(userId, sessionId);
  const drawings = useSyncExternalStore(subscribe(key), () => read(key), () => EMPTY);
  const [saveFailed, setSaveFailed] = useState(false);

  const commit = useCallback(
    (next: Drawing[]) => {
      cache.set(key, next);
      emit(key);
      setSaveFailed(!saveDrawings(localStorage, userId, sessionId, next));
    },
    [key, userId, sessionId],
  );

  /** Добавить новую или заменить фигуру с тем же id. */
  const upsert = useCallback(
    (d: Drawing) => {
      const cur = read(key);
      const i = cur.findIndex((x) => x.id === d.id);
      commit(i === -1 ? [...cur, d] : cur.map((x) => (x.id === d.id ? d : x)));
    },
    [key, commit],
  );

  const remove = useCallback((id: string) => commit(read(key).filter((x) => x.id !== id)), [key, commit]);
  const clear = useCallback(() => commit([]), [commit]);

  return { drawings, upsert, remove, clear, saveFailed };
}

const EMPTY: Drawing[] = [];
const cache = new Map<string, Drawing[]>();
const listeners = new Map<string, Set<() => void>>();
const subscribers = new Map<string, (onChange: () => void) => () => void>();

function read(key: string): Drawing[] {
  let v = cache.get(key);
  if (!v) {
    v = parseDrawings(localStorage.getItem(key));
    cache.set(key, v);
  }
  return v;
}

function emit(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

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
