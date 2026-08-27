'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { setErrorMessages } from '@/shared/api/http';
import { LOCALE_COOKIE, setClientLocale, type Locale } from './locale-storage';
import ru from './messages/ru.json';
import en from './messages/en.json';

const MESSAGES = { ru, en } as const satisfies Record<Locale, unknown>;
const LEGACY_STORAGE_KEY = 'virex-locale'; // старый ключ localStorage, до переноса на куку

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
 *
 * `initialLocale` приходит из `layout.tsx`, где серверный компонент читает ту
 * же куку `virex-locale` через `next/headers`. Источник один и тот же на
 * сервере и на клиенте, поэтому первый клиентский рендер (гидратация) всегда
 * совпадает с серверным HTML — в отличие от прежней версии, читавшей
 * `localStorage` в ленивом `useState`, который на сервере всегда давал
 * дефолт `'ru'`.
 */
export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    setClientLocale(locale);
    setErrorMessages(MESSAGES[locale].errors);
  }, [locale]);

  useEffect(() => {
    // Одноразовая миграция: раньше локаль хранилась в localStorage под тем же
    // именем ключа. Если куки ещё нет (пользователь заходит после перехода на
    // куки впервые), но старое значение есть — подхватываем его, а не молча
    // откатываем на дефолтный ru.
    if (document.cookie.includes(`${LOCALE_COOKIE}=`)) return;
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy === 'en' || legacy === 'ru') {
      setLocaleState(legacy);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<LocaleContextValue>(() => ({ locale, setLocale: setLocaleState }), [locale]);

  return (
    <LocaleContext.Provider value={value}>
      {/*
        timeZone обязателен: без него next-intl на сервере берёт зону из
        окружения Node, на клиенте — из браузера, и предупреждает про
        расхождение разметки (ENVIRONMENT_FALLBACK). Значение здесь ни на что
        не влияет по факту — ни один компонент не форматирует даты через
        next-intl, всё идёт через toLocaleString в зоне браузера
        (shared/lib/utils/format.ts и графики). Фиксируем UTC как нейтральный
        детерминированный дефолт; если однажды даты пойдут через
        `useFormatter`, зону надо будет выбирать осознанно.
      */}
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="UTC">
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
