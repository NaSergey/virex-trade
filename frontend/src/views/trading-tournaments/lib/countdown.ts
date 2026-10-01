/** Отсчёт до старта: сутки и больше — дни отдельно, слово «д» переводит компонент. */
export type Countdown = string | { days: number; clock: string };

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Остаток до старта строкой отсчёта: `14:33`, `03:14:33` или дни с часами.
 * Секунды округляются вверх — пока старт не наступил, на табло не бывает
 * «00:00». `null` — время вышло, и показывать нужно уже «Старт…».
 */
export function countdown(ms: number): Countdown | null {
  if (!(ms > 0)) return null;
  const total = Math.ceil(ms / 1000);
  const days = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (days > 0) return { days, clock: `${pad(h)}:${pad(m)}:${pad(s)}` };
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}
