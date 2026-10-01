import { START_MAX_LEAD_MS, START_MIN_LEAD_MS } from './tournament.config';

const MINUTE_MS = 60_000;

/**
 * Время старта из формы — по минуте: старт, как и конец, должен быть границей
 * минутки, одинаковой для всех участников. `null` — время не годится (прошлое,
 * слишком близко, слишком далеко или вовсе не дата).
 */
export function startTimeFrom(iso: string, now: number): Date | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const at = Math.floor(t / MINUTE_MS) * MINUTE_MS;
  if (at < now + START_MIN_LEAD_MS || at > now + START_MAX_LEAD_MS) return null;
  return new Date(at);
}
