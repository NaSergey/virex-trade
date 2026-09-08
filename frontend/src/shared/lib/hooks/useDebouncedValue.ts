'use client';

import { useEffect, useState } from 'react';

/**
 * Отдаёт значение с задержкой: меняется не на каждое нажатие клавиши, а
 * только когда ввод затих на `delayMs`. Общий приём для полей с проверкой на
 * сервере при вводе — первый потребитель: слаг реферальной ссылки
 * (`features/referrals/ui/ReferralDialog.tsx`).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
