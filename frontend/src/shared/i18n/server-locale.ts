// Только для серверных компонентов (layout.tsx) — использует next/headers,
// которого нет в клиентском бандле. Не импортировать из LocaleProvider или
// любого 'use client' файла: это тут же потащит next/headers в клиент.
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, parseLocaleCookie, type Locale } from './locale-storage';

/** Локаль на сервере — та же кука и тот же дефолт, что читает LocaleProvider на клиенте. */
export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return parseLocaleCookie(cookieStore.get(LOCALE_COOKIE)?.value);
}
