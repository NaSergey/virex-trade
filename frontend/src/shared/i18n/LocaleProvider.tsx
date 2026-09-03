'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { setErrorMessages } from '@/shared/api/http';
import { LOCALE_COOKIE, setClientLocale, type Locale } from './locale-storage';
import { loadMessages, type Messages } from './load-messages';

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
 * `initialLocale` и `initialMessages` приходят из `layout.tsx`, где серверный
 * компонент читает ту же куку `virex-locale` через `next/headers`. Источник
 * один и тот же на сервере и на клиенте, поэтому первый клиентский рендер
 * (гидратация) всегда совпадает с серверным HTML — в отличие от прежней
 * версии, читавшей `localStorage` в ленивом `useState`, который на сервере
 * всегда давал дефолт `'ru'`.
 *
 * Словарь второго языка сюда не импортируется: он подгружается в момент
 * переключения (см. `load-messages.ts` — там же причина, почему статические
 * импорты отсюда убраны).
 */
export function LocaleProvider({
  children,
  initialLocale,
  initialMessages,
}: {
  children: ReactNode;
  initialLocale: Locale;
  initialMessages: Messages;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [messages, setMessages] = useState<Messages>(initialMessages);

  /**
   * Язык и словарь переключаются вместе, после загрузки: переключи сначала
   * язык, и до прихода словаря интерфейс стоял бы новым `lang` со старыми
   * строками. Чанк второго языка качается один раз, дальше отдаётся из кеша
   * модулей.
   */
  const setLocale = useCallback((next: Locale) => {
    void loadMessages(next).then((loaded) => {
      setMessages(loaded);
      setLocaleState(next);
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    setClientLocale(locale);
    setErrorMessages(messages.errors);
  }, [locale, messages]);

  useEffect(() => {
    // Одноразовая миграция: раньше локаль хранилась в localStorage под тем же
    // именем ключа. Если куки ещё нет (пользователь заходит после перехода на
    // куки впервые), но старое значение есть — подхватываем его, а не молча
    // откатываем на дефолтный ru.
    if (document.cookie.includes(`${LOCALE_COOKIE}=`)) return;
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy === 'en' || legacy === 'ru') {
      setLocale(legacy);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<LocaleContextValue>(() => ({ locale, setLocale }), [locale, setLocale]);

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
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
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
