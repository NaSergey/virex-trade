/**
 * Рынок — /market (была на /analytics, адрес занят «Аналитикой»)
 *
 * Файл роута — только объявление адреса. Сама страница живёт в слое `views`
 * (`src/views`, не `src/pages`: `src/pages` — служебный каталог Pages Router,
 * и Next пытался бы собрать каждый файл оттуда как отдельный роут).
 */
export { MarketPage as default } from '@/views/market/Page';
