/**
 * T11 (docs/superpowers/sdd/2026-09-16-backend-optimization) и
 * `docs/superpowers/specs/2026-10-02-games-role-design.md`: один и тот же
 * образ поднимается в нескольких ролях, переменной окружения `ROLE`.
 *
 * - `api` — HTTP без игр, без телеграм-поллинга и без фоновых БИЗНЕС-циклов
 *   (синк, уведомления, снапшоты, ...). Не то же самое, что «без единого
 *   `setInterval`»: в `api` крутится собственная гигиена памяти
 *   (`BybitMarketService.sweepTimer` — чистка process-local кэша рыночных
 *   данных) и сброс учёта посещений. Это память конкретного процесса, а не
 *   общий ресурс (БД/биржа), за который дублирующиеся процессы гонялись бы.
 * - `worker` — ровно один процесс: фоновые сервисы (trade-sync,
 *   price-sync, liquidity-snapshot, market-alerts,
 *   weekly-report, usage-cleanup, refresh-token-cleanup, tron-watcher,
 *   tournament-runner, live-session-runner, terminal-stream) + telegram-поллинг, без
 *   HTTP-порта.
 * - `games` — ровно один процесс: покер, блэкджек, джетпак и их сокет. Раздачи
 *   и раунд живут в его памяти, и второй такой процесс на старте вернул бы
 *   ставки в живых раздачах первого. Корень — `GamesAppModule`, не `AppModule`.
 * - `all` (дефолт, локальный запуск) — всё в одном процессе.
 *
 * Фон разделён guard'ом в начале `onApplicationBootstrap()` каждого сервиса, а
 * не условной регистрацией провайдеров: фоновые сервисы инжектятся в
 * контроллеры и другие сервисы (`TelegramService.sendText` вызывают чекеры
 * уведомлений), и
 * убрать их из графа DI нельзя, не сломав эти вызовы. Игры — наоборот: их
 * модули не инжектирует никто снаружи, поэтому они регистрируются только там,
 * где идут игры (`runsGames`), и в `api` у них нет ни контроллеров, ни сокета
 * — заблудившийся запрос получает 404, а не заводит второй рантайм стола.
 */
export type Role = 'api' | 'worker' | 'games' | 'all';

function readRole(): Role {
  const raw = process.env.ROLE;
  if (raw === 'api' || raw === 'worker' || raw === 'games') return raw;
  // Незнакомое значение (опечатка, пустая строка) — тоже 'all': это дефолт
  // локального запуска, и молча отключать половину процесса из-за опечатки
  // в .env хуже, чем один раз не заметить, что переменная не подхватилась.
  return 'all';
}

export const ROLE: Role = readRole();

/**
 * Фоновые сервисы и telegram-поллинг стартуют в этой роли.
 * Вызывается первой строкой в их `onApplicationBootstrap()`.
 */
export function runsBackgroundJobs(): boolean {
  return ROLE === 'worker' || ROLE === 'all';
}

/** Игровые модули входят в граф этой роли (`GamesAppModule`, `AppModule` при `all`). */
export function runsGames(): boolean {
  return ROLE === 'games' || ROLE === 'all';
}

/**
 * HTTP слушает в этой роли. Сюда же привязан сброс учёта посещений
 * (`UsageTrackerService`): интерсептор копит его там, где идут запросы, — и в
 * `api`, и в `games`.
 */
export function servesHttp(): boolean {
  return ROLE === 'api' || ROLE === 'games' || ROLE === 'all';
}
