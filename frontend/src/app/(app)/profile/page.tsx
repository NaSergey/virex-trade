/**
 * Профиль — /profile. Сам по себе ничего не показывает: уводит на
 * `/profile/<свой id>`, адрес, которым можно поделиться (см.
 * `MyProfileRedirect`). Остаётся за входом — без сессии неизвестно, чей id.
 *
 * Файл роута — только объявление адреса. Сама страница живёт в слое `views`
 * (`src/views`, не `src/pages`: `src/pages` — служебный каталог Pages Router,
 * и Next пытался бы собрать каждый файл оттуда как отдельный роут).
 */
export { MyProfileRedirect as default } from '@/views/profile/MyProfileRedirect';
