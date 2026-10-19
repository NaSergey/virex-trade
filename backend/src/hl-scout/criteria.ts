/**
 * Пороги отбора — одно место. Подобраны на 60 случайных кандидатах лидерборда
 * 2026-10-19: проходит ~7 %, то есть ~200–250 кошельков из ~3,7 тыс.
 * Спека — docs/superpowers/specs/2026-10-19-hyperliquid-wallet-scout-design.md.
 */
export const MIN_ACCOUNT_VALUE = 10_000;
/** Горизонт разбора кривой — полгода; старше — уже другой рынок. */
export const HORIZON_WEEKS = 26;
export const MIN_WEEKS = 8;
/** Недель, где кривая сдвинулась: без торговли «стабильность» ничего не значит. */
export const MIN_MOVING_WEEKS = 8;
export const MIN_UP_SHARE = 0.6;
/** Лучшая неделя — не больше этой доли прибыли за горизонт: иначе это один рывок. */
export const MAX_BEST_WEEK_SHARE = 0.35;
/** Падение кривой от пика к балансу на пике. */
export const MAX_DRAWDOWN = 0.4;
/** Отбор кандидатов из лидерборда. */
export const DISCOVER_EVERY_MS = 6 * 3600_000;
/** Повторный разбор кошелька: полный проход кандидатов занимает ~2 часа. */
export const REANALYZE_MS = 90 * 60_000;
