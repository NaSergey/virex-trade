import type { Locale } from '@/shared/i18n/locale-storage';

/**
 * Публичные адреса продукта — для canonical, hreflang, sitemap и картинок ссылок.
 * Константы, а не Host запроса: копия сайта на другом адресе должна указывать
 * поисковику сюда как на оригинал, а не называть оригиналом себя.
 */
export const SITE_URL = 'https://trade-play.com';
export const JOURNAL_URL = 'https://journal.trade-play.com';

export const SITE_NAME = 'Trade Play';

/**
 * Главная у каждого языка — свой адрес: поисковик приходит без куки и видел бы
 * только язык по умолчанию. Адреса читает и `proxy.ts`, поэтому без импортов
 * значений из слоёв выше.
 */
export const LANDING_PATH: Record<Locale, string> = { en: '/', ru: '/ru' };
