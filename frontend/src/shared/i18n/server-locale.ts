// Только для серверных компонентов (layout.tsx) — использует next/headers,
// которого нет в клиентском бандле. Не импортировать из LocaleProvider или
// любого 'use client' файла: это тут же потащит next/headers в клиент.
import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE, LOCALE_HEADER, parseLocaleCookie, type Locale } from './locale-storage';

/**
 * Локаль на сервере — та же кука и тот же дефолт, что читает LocaleProvider на
 * клиенте. Язык из адреса (`/ru`, заголовок ставит `proxy.ts`) сильнее куки:
 * поисковик приходит без неё, а страница у адреса должна быть одна и та же.
 */
export async function getServerLocale(): Promise<Locale> {
  const byUrl = (await headers()).get(LOCALE_HEADER);
  const cookieStore = await cookies();
  return parseLocaleCookie(byUrl ?? cookieStore.get(LOCALE_COOKIE)?.value);
}
