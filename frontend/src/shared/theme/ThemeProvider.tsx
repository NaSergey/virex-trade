'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setClientTheme, type Theme } from './theme-storage';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Тёмная ⇄ светлая. Тем ровно две, и третьего состояния у кнопки нет. */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Тема — состояние приложения, не адреса, и хранится ровно так же, как язык
 * (см. `shared/i18n/LocaleProvider`): кука, которую читает и сервер.
 *
 * `initialTheme` приходит из `layout.tsx`, где серверный компонент читает
 * куку `virex-theme` через `next/headers` и ставит `data-theme` прямо на
 * `<html>`. Поэтому цвета верны уже в первом присланном байте разметки —
 * ни вспышки чужой темы, ни inline-скрипта в `<head>`, ни расхождения при
 * гидрации.
 */
export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: ReactNode;
  initialTheme: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    // Атрибут ставит и сервер, и этот эффект. На первом рендере он уже стоит
    // верный, и запись ничего не меняет; работает она при переключении.
    document.documentElement.dataset.theme = theme;
    setClientTheme(theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: setThemeState,
      toggleTheme: () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')),
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Только для компонентов, которые сами меняют тему (сейчас — ThemeToggle). */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
