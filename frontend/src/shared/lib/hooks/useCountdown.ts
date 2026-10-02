'use client';

import { useEffect, useState } from 'react';

/**
 * Сколько миллисекунд осталось до `target`, с тиком раз в секунду; `null` —
 * цели нет. Часы у каждого отсчёта свои: на странице их единицы, и общий
 * таймер ради них был бы лишней связью между строками списков.
 */
export function useCountdown(target: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [target]);

  return target ? new Date(target).getTime() - now : null;
}
