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
