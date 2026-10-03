/**
 * Ряды профиля — чистые функции над тем, что отдают запросы. Здесь нет ни
 * базы, ни часов: «сегодня» приходит аргументом, поэтому каждое правило
 * проверяется юнитом без подделки времени.
 *
 * Все дни — UTC и строкой `YYYY-MM-DD`, как ключ ежедневной награды: один
 * календарь на продукт, иначе день активности и день награды расходились бы
 * у человека не в нулевом поясе.
 */

import { dayKey } from '../battlepass/daily';

export const DAY_MS = 86_400_000;

/** Окно графика баланса и счёта «дней за 90». */
export const RECENT_DAYS = 90;

const dayStart = (key: string): number => Date.parse(`${key}T00:00:00Z`);
const shift = (key: string, days: number): string => dayKey(new Date(dayStart(key) + days * DAY_MS));

/** Ключи дней от `from` до `to` включительно. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = shift(k, 1)) out.push(k);
  return out;
}

/** Действие: строка запроса «день × вид × сколько». */
export interface ActionRow {
  day: string;
  kind: string;
  n: number;
}

export type GameId = 'tournament' | 'backtest' | 'jetpack' | 'poker' | 'blackjack';
export const GAME_IDS: GameId[] = ['tournament', 'backtest', 'jetpack', 'poker', 'blackjack'];

export interface GameRow {
  id: GameId;
  /** Действий за всё время: участий, сессий, ставок, раздач. */
  played: number;
  /** В сколько из последних `RECENT_DAYS` дней человек играл в эту игру. */
  days90: number;
  lastDay: string | null;
}

/**
 * Строка на игру. «Дни», а не «действия», — для сравнения игр между собой:
 * раунд джетпака длится секунды, турнир — часы, и счёт действий рисовал бы
 * один джетпак.
 */
export function gamesOf(rows: ActionRow[], today: Date): GameRow[] {
  const since = shift(dayKey(today), -(RECENT_DAYS - 1));
  return GAME_IDS.map((id) => {
    const own = rows.filter((r) => r.kind === id);
    return {
      id,
      played: own.reduce((s, r) => s + r.n, 0),
      days90: new Set(own.filter((r) => r.day >= since).map((r) => r.day)).size,
      lastDay: own.reduce<string | null>((last, r) => (last == null || r.day > last ? r.day : last), null),
    };
  });
}

/** Сумма действий одного вида за всё время — счётчики достижений. */
export const countOf = (rows: ActionRow[], kind: string): number =>
  rows.reduce((s, r) => (r.kind === kind ? s + r.n : s), 0);

/**
 * Опыт по дням за последние `RECENT_DAYS`: сколько XP пришло в каждый день,
 * пустой день — ноль. По дням, а не накопленным итогом сезона: накопленный
 * ряд обнуляется на смене квартала, и первые дни сезона график стоял бы
 * пустым, хотя человек играл вчера.
 */
export function xpByDay(rows: { day: string; xp: number }[], today: Date): { day: string; xp: number }[] {
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.xp);
  const todayKey = dayKey(today);
  return daysBetween(shift(todayKey, -(RECENT_DAYS - 1)), todayKey).map((day) => ({ day, xp: byDay.get(day) ?? 0 }));
}

/** Строка журнала монет для графика баланса. */
export interface BalanceRow {
  at: Date;
  delta: number;
  balanceAfter: number;
}

/**
 * Баланс на конец каждого из последних `RECENT_DAYS` дней.
 *
 * Отправная точка — баланс до окна: `balanceAfter` последней строки до него,
 * а если её нет — баланс перед первой строкой окна (`balanceAfter − delta`).
 * Без единой строки баланс никогда не менялся, и линия стоит на `current`.
 */
export function balanceSeries(
  rows: BalanceRow[],
  before: BalanceRow | null,
  current: number,
  today: Date,
): { day: string; balance: number }[] {
  const sorted = [...rows].sort((a, b) => a.at.getTime() - b.at.getTime());
  let balance = before
    ? before.balanceAfter
    : sorted.length > 0
      ? sorted[0].balanceAfter - sorted[0].delta
      : current;
  const lastOfDay = new Map<string, number>();
  for (const r of sorted) lastOfDay.set(dayKey(r.at), r.balanceAfter);
  const todayKey = dayKey(today);
  return daysBetween(shift(todayKey, -(RECENT_DAYS - 1)), todayKey).map((day) => {
    balance = lastOfDay.get(day) ?? balance;
    return { day, balance };
  });
}

/** Самая длинная серия подряд идущих дней среди ключей. */
export function bestRun(dayKeys: string[]): number {
  const days = [...new Set(dayKeys)].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of days) {
    run = prev != null && shift(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}
