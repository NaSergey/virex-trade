/**
 * T11 (docs/superpowers/sdd/2026-09-16-backend-optimization): один и тот же
 * образ поднимается в двух ролях, переменной окружения `ROLE`.
 *
 * - `api` — HTTP, без телеграм-поллинга и без фоновых БИЗНЕС-циклов (синк,
 *   уведомления, снапшоты, ...). Не то же самое, что «без единого
 *   `setInterval`»: после T22 в `api` крутится и собственная гигиена памяти
 *   (`BybitMarketService.sweepTimer` — чистка просроченных записей
 *   process-local кэша рыночных данных). Это намеренно НЕ гейтится ролью, в
 *   отличие от `worker`-сервисов ниже: это память конкретного процесса, а не
 *   общий ресурс (БД/биржа), который дублирующиеся процессы делили бы и
 *   гонялись за ним.
 * - `worker` — ровно один процесс: десять фоновых сервисов (trade-sync,
 *   balance-snapshot, price-sync, liquidity-snapshot, market-alerts,
 *   weekly-report, usage-tracker, usage-cleanup, refresh-token-cleanup,
 *   tron-watcher) + telegram-поллинг, без HTTP-порта.
 * - `all` (дефолт, локальный запуск) — ведёт себя как единый процесс всегда
 *   вёл: и HTTP, и весь фон.
 *
 * Разделение реализовано guard'ом в начале `onApplicationBootstrap()` каждого
 * из десяти сервисов и `TelegramService`, а не условной регистрацией
 * провайдеров в `AppModule`: эти сервисы инжектятся в контроллеры и другие
 * сервисы (например, `TelegramService.sendText` вызывают чекеры уведомлений,
 * `TradeSyncService.syncUser` — контроллер ручного ресинка), поэтому убрать
 * их из графа DI для роли `api` нельзя, не сломав эти вызовы. Guard —
 * единственное место в каждом файле, которое меняется, и он ничего не
 * дублирует между сервисами, кроме самой проверки роли.
 */
export type Role = 'api' | 'worker' | 'all';

function readRole(): Role {
  const raw = process.env.ROLE;
  if (raw === 'api' || raw === 'worker') return raw;
  // Незнакомое значение (опечатка, пустая строка) — тоже 'all': это дефолт
  // локального запуска, и молча отключать половину процесса из-за опечатки
  // в .env хуже, чем один раз не заметить, что переменная не подхватилась.
  return 'all';
}

export const ROLE: Role = readRole();

/**
 * Десять фоновых сервисов и telegram-поллинг стартуют в этой роли.
 * Вызывается первой строкой в их `onApplicationBootstrap()`.
 */
export function runsBackgroundJobs(): boolean {
  return ROLE === 'worker' || ROLE === 'all';
}

/**
 * UsageTrackerService — исключение: интерсептор, который копит `record()`,
 * живёт в `api` (там HTTP-трафик), поэтому и сброс копится там же, а не в
 * `worker`. См. task-11-brief.md, «уже решённые вопросы».
 */
export function runsApiJobs(): boolean {
  return ROLE === 'api' || ROLE === 'all';
}

/** HTTP слушает в этой роли. */
export function servesHttp(): boolean {
  return ROLE === 'api' || ROLE === 'all';
}
