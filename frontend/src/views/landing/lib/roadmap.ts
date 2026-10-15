/**
 * Дорожная карта секции «О проекте»: этапы слева направо и вехи в них.
 * Тексты — `landing.about.phases.<этап>` и `landing.about.items.<веха>`.
 *
 * «В планах» разложено по сложности разработки (решение владельца 2026-10-13):
 * ближе к «сейчас» — то, что проще. У запущенного подписей нет — оно не
 * новость, новость — планы, и колонка запущенного не должна перевешивать.
 */
export type PhaseId = 'live' | 'soon' | 'next' | 'later';

export const ROADMAP: readonly { id: PhaseId; items: readonly string[] }[] = [
  { id: 'live', items: ['journal', 'tags', 'terminal', 'backtest', 'tournaments', 'games', 'season'] },
  // Код почти готов: статистику считает сервер, бот и адаптеры написаны.
  { id: 'soon', items: ['profile', 'gridBots', 'exchanges'] },
  // С нуля, но на готовой основе.
  { id: 'next', items: ['learning', 'newGames', 'characters'] },
  // Новые большие системы: площадка стоит на скинах, деньги — на кошельках и праве.
  { id: 'later', items: ['market', 'usdtGames'] },
];
