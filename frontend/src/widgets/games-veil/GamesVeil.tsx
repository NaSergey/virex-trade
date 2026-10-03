'use client';

import { usePathname } from 'next/navigation';
import { isGamesDarkRoute } from '@/shared/lib/utils/games-dark-route';

/**
 * Чёрная заливка под тёмными маршрутами раздела игр (витрина, джетпак, стол
 * покера/блэкджека) — одна на весь `(app)`-макет, рядом с `TopNav`, а не
 * своя у каждой из трёх страниц. Узел остаётся смонтированным при переходах
 * между ними: исчезает только класс `is-on`, и заливка гаснет тем же
 * переходом (`.games-bg`, `globals.css`), которым наливается. Три копии
 * одного `<div className="games-bg" />`, смонтированные и размонтированные
 * каждой страницей заново, умели наливаться при заходе, но не гасли при
 * выходе — React убирает узел сразу, без дожидания перехода.
 */
export function GamesVeil() {
  const pathname = usePathname();
  return <div className={`games-bg${isGamesDarkRoute(pathname) ? ' is-on' : ''}`} aria-hidden />;
}
