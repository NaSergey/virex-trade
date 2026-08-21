'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { setErrorMessages } from '@/shared/api/http';
import { getStoredLocale, setStoredLocale, type Locale } from './locale-storage';
import ru from './messages/ru.json';
import en from './messages/en.json';

const MESSAGES = { ru, en } as const satisfies Record<Locale, unknown>;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

/**
 * Локаль — состояние приложения, не адреса: реальных Next-роутов у продукта
 * почти нет (вкладки переключает React-стейт, см. AppShell), поэтому здесь
 * нет ни middleware next-intl, ни сегмента [locale] — только контекст поверх
 * NextIntlClientProvider.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  // Ленивый инициализатор useState выполняется и на гидратации — то есть при первом
  // клиентском рендере, который React сверяет с серверным HTML. Сервер всегда рендерит
  // дефолт 'ru' (localStorage ему недоступен), поэтому у пользователя с сохранённым 'en'
  // здесь возникает рассинхрон: на один кадр видна серверная русская вёрстка, в консоли —
  // предупреждение React о hydration mismatch, после чего клиент перерисовывает эту часть
  // дерева в 'en'. Итоговый результат корректный, баг только в переходе.
  // Принято как ограничение Phase 0 — под ударом только неавторизованный `/login`. Когда
  // фазы 1–5 залокализуют остальные экраны, та же вспышка будет на каждой загрузке всего
  // приложения для любого EN-пользователя — до начала Phase 1 нужно решить, переносить ли
  // источник локали на cookie, читаемую на сервере в layout.tsx (см. спеку Phase 0,
  // раздел «Известное ограничение Phase 0»).
  const [locale, setLocaleState] = useState<Locale>(() => getStoredLocale());

  useEffect(() => {
    document.documentElement.lang = locale;
    setStoredLocale(locale);
    setErrorMessages(MESSAGES[locale].errors);
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => ({ locale, setLocale: setLocaleState }), [locale]);

  return (
    <LocaleContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

/** Только для компонентов, которые сами меняют язык (сейчас — LocaleSwitch). */
export function useLocaleControl(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocaleControl must be used within LocaleProvider');
  return ctx;
}
