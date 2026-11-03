import { useSyncExternalStore } from 'react';

/**
 * Идёт ли забег — читает раскладка учебника: на телефоне на время забега нижняя
 * панель вкладок прячется, выход — через паузу. Отдельным файлом, чтобы
 * раскладка не тянула за собой движок игры.
 */
let active = false;
const listeners = new Set<() => void>();

export function setRunActive(value: boolean): void {
  if (active === value) return;
  active = value;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useRunActive = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => active,
    () => false,
  );
