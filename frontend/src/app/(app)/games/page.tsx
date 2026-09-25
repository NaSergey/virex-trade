/**
 * Игры — /games
 *
 * Файл роута — только объявление адреса. Сама страница живёт в слое `views`
 * (`src/views`, не `src/pages`: `src/pages` — служебный каталог Pages Router,
 * и Next пытался бы собрать каждый файл оттуда как отдельный роут).
 */
export { GamesPage as default } from '@/views/games/Page';
