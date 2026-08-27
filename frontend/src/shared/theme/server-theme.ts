// Только для серверных компонентов (layout.tsx) — использует next/headers,
// которого нет в клиентском бандле. Не импортировать из ThemeProvider или
// любого 'use client' файла: это тут же потащит next/headers в клиент.
import { cookies } from 'next/headers';
import { THEME_COOKIE, parseThemeCookie, type Theme } from './theme-storage';

/** Тема на сервере — та же кука и тот же дефолт, что читает ThemeProvider на клиенте. */
export async function getServerTheme(): Promise<Theme> {
  const cookieStore = await cookies();
  return parseThemeCookie(cookieStore.get(THEME_COOKIE)?.value);
}
