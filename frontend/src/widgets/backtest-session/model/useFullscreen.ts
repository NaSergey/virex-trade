'use client';

import { useCallback, useEffect, useState, type RefObject } from 'react';

/**
 * Терминал во весь экран — Fullscreen API на его корне. Выходят той же кнопкой
 * или клавишей Esc (её обрабатывает браузер). `supported` известен только после
 * монтирования: на сервере документа нет.
 */
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [on, setOn] = useState(false);
  // По умолчанию — есть: заглушка терминала рисует кнопку, и её исчезновение
  // после монтирования (iPhone без Fullscreen API) — реже, чем появление.
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    // Синхронизация с внешней системой (API браузера), а не каскад рендеров.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(document.fullscreenEnabled === true);
    const sync = () => setOn(document.fullscreenElement != null && document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [ref]);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void ref.current?.requestFullscreen().catch(() => undefined);
  }, [ref]);

  return { on, supported, toggle };
}
