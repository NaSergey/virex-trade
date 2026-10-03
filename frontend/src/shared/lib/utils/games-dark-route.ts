/**
 * Маршруты раздела игр, тёмные в обеих темах: витрина, джетпак, профиль
 * игрока (свой и чужой — он про игры и сезон) и сам стол покера/блэкджека (`.games-bg`/`.games-page`/`.ct-page`/`.jpg-page`). Лобби
 * столов (`/games/poker`, `/games/blackjack`) и турниры (`/games/trading*`) —
 * обычные страницы продукта, тему листают как все остальные, и сюда не
 * входят. Общее место для TopNav (шапка) и `GamesVeil` (заливка под
 * страницей) — у обоих один и тот же список тёмных маршрутов, и расходиться
 * им нельзя.
 */
export function isGamesDarkRoute(pathname: string): boolean {
  return (
    pathname === '/games' ||
    pathname === '/games/jetpack' ||
    pathname === '/profile' ||
    pathname.startsWith('/profile/') ||
    /^\/games\/(poker|blackjack)\/[^/]+$/.test(pathname)
  );
}
