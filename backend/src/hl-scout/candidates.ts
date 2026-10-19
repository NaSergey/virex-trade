import { MIN_ACCOUNT_VALUE } from './criteria';
import type { LeaderboardRow } from './hl-types';

export interface Candidate {
  address: string;
  volumeWeek: number;
}

const ADDRESS = /^0x[0-9a-f]{40}$/;

function windowOf(row: LeaderboardRow, name: string) {
  const w = row.windowPerformances?.find(([k]) => k === name)?.[1];
  return { pnl: Number(w?.pnl ?? 0), vlm: Number(w?.vlm ?? 0) };
}

/**
 * Первый, дешёвый отбор — по числам самого лидерборда: в плюсе за всё время и
 * за месяц, торговал в этом месяце, баланс от $10k. Глубже смотрит
 * `analyzePortfolio` — на кошелёк он тратит запрос, а лидерборд уже скачан.
 *
 * Адрес — один раз: повтор в одной вставке `ON CONFLICT DO UPDATE` Postgres
 * отвергает целиком, и отбор не проходил бы никогда.
 */
export function pickCandidates(rows: LeaderboardRow[]): Candidate[] {
  const out = new Map<string, Candidate>();
  for (const row of rows) {
    const address = String(row.ethAddress).toLowerCase();
    if (!ADDRESS.test(address)) continue;
    if (!(Number(row.accountValue) >= MIN_ACCOUNT_VALUE)) continue;
    const month = windowOf(row, 'month');
    if (
      !(windowOf(row, 'allTime').pnl > 0) ||
      !(month.pnl > 0) ||
      !(month.vlm > 0)
    )
      continue;
    out.set(address, { address, volumeWeek: windowOf(row, 'week').vlm });
  }
  return [...out.values()];
}

/** Оборот за 7 дней по адресу: сохранённым, выпавшим из кандидатов, «живой» нужен тоже. */
export function volumesOf(rows: LeaderboardRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of rows)
    m.set(String(row.ethAddress).toLowerCase(), windowOf(row, 'week').vlm);
  return m;
}
