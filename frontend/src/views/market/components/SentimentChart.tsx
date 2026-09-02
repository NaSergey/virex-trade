import type { Locale } from '@/shared/i18n';

/**
 * $2.3T / $6.1B / $840M — компактные доллары для подписи.
 *
 * Живёт в этом файле по истории (здесь стояла кривая настроений, для которой
 * форматтер и написан), а не по смыслу — использует его теперь весь «Рынок»:
 * макро-строка, коэффициенты позиционирования, стакан заявок.
 */
export function fmtUsdCompact(v: number, locale: Locale = 'ru'): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)} T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)} B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)} M`;
  return `$${Math.round(v).toLocaleString(locale === 'en' ? 'en-US' : 'ru-RU')}`;
}
