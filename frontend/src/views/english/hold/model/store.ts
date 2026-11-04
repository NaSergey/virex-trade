import { useSyncExternalStore } from 'react';
import type { HoldState } from './rules';

/**
 * Игра лежит в localStorage после каждого действия: вкладку можно закрыть посреди дня.
 * Сервер о ней пока не знает — итоги и связь с карточками придут следующими шагами.
 */
const KEY = 'virex.english.hold.game';

let cache: HoldState | null | undefined;
const listeners = new Set<() => void>();

function read(): HoldState | null {
  if (cache !== undefined) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as HoldState) : null;
    cache = parsed && parsed.v === 1 ? parsed : null;
  } catch {
    cache = null;
  }
  return cache;
}

export function saveGame(next: HoldState | null): void {
  cache = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    // Хранилище закрыто — игра живёт до перезагрузки.
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** `undefined` — ещё не прочитано (сервер), `null` — игры нет. */
export const useGame = (): HoldState | null | undefined => useSyncExternalStore(subscribe, read, () => undefined);
