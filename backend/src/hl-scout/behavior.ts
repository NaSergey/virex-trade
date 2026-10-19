import {
  BOT_MAX_FILLS_PER_DAY,
  BOT_MAX_MEDIAN_HOLD_MS,
  BOT_MIN_TRADES,
} from './criteria';
import type { RawFill } from './hl-types';
import { tradesOf } from './trades';

const DAY = 86_400_000;

export interface Behavior {
  /** Медиана времени в закрытых сделках; `null` — закрытых мало для суждения. */
  medianHoldMs: number | null;
  fillsPerDay: number | null;
  fillsCount: number;
}

/**
 * Как кошелёк торгует, по его последним исполнениям (до 2000). Сделки собирает
 * тот же сборщик, что у страницы сохранённых; сделка, начатая до окна, в медиану
 * не идёт — её длительность неизвестна.
 */
export function behaviorOf(raw: RawFill[]): Behavior {
  const { trades, fillsCount, since } = tradesOf(raw);
  const closed = trades.filter((t) => t.closedAt != null && !t.partial);
  // `tradesOf` отдаёт не больше MAX_TRADES сделок — для медианы достаточно.
  const holds = closed
    .map((t) => t.lastAt - t.openedAt)
    .sort((a, b) => a - b);
  const medianHoldMs =
    holds.length >= BOT_MIN_TRADES ? holds[Math.floor(holds.length / 2)] : null;
  const last = (raw ?? []).reduce((m, f) => Math.max(m, f.time), 0);
  // Окно меньше суток считаем сутками: иначе три исполнения за минуту дали бы 4000 в день.
  const span = since == null ? null : Math.max(DAY, last - since);
  return {
    medianHoldMs,
    fillsPerDay: span == null ? null : (fillsCount / span) * DAY,
    fillsCount,
  };
}

/** Бот — сделки на минуты или сплошной поток исполнений. Нет данных — не бот. */
export function isBot(
  b: Pick<Behavior, 'medianHoldMs' | 'fillsPerDay'>,
): boolean {
  if (b.medianHoldMs != null && b.medianHoldMs < BOT_MAX_MEDIAN_HOLD_MS)
    return true;
  return b.fillsPerDay != null && b.fillsPerDay > BOT_MAX_FILLS_PER_DAY;
}
