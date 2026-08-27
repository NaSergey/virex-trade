/**
 * Настройки — /settings
 *
 * Файл роута — только объявление адреса. Сама страница живёт в слое `views`
 * (`src/views`, не `src/pages`: `src/pages` — служебный каталог Pages Router,
 * и Next пытался бы собрать каждый файл оттуда как отдельный роут).
 */
export { SettingsPage as default } from '@/views/settings/Page';
