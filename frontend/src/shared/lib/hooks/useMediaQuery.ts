'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Совпадает ли медиазапрос — с подпиской на смену (поворот, ширина окна). На
 * сервере и до гидрации — `serverValue`: так первый кадр совпадает с разметкой
 * сервера, а настоящее значение приходит сразу после.
 */
export function useMediaQuery(query: string, serverValue = true): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
