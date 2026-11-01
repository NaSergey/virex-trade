import { bybitInterval } from '../terminal/terminal-math';

/** Запрос к публичному API Bybit: `BybitTerminalClient.publicGet`, он идёт через общий шлюз. */
export type PublicGet = (
  path: string,
  params: Record<string, string>,
) => Promise<{ list?: string[][] }>;

export interface BybitCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Больше Bybit за один запрос свечей не отдаёт. */
const PAGE = 1000;
const ATTEMPTS = 3;
const RETRY_MS = 2000;

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(
  run: () => Promise<T>,
  delayMs: number,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (e) {
      if (attempt >= ATTEMPTS) throw e;
      await wait(delayMs * attempt);
    }
  }
}

/**
 * Закрытые свечи линейного контракта за [fromMs, toMs), по возрастанию. Окно идёт
 * вперёд страницами; Bybit отдаёт каждую новейшими вперёд. Пустая страница —
 * это ещё не начавшиеся торги, а не конец истории: у PEPE история позже 2022 года.
 */
export async function loadCandles(
  get: PublicGet,
  symbol: string,
  tf: number,
  fromMs: number,
  toMs: number,
  delayMs = RETRY_MS,
): Promise<BybitCandle[]> {
  const interval = bybitInterval(tf);
  if (!interval) throw new Error(`нет интервала Bybit для ${tf}`);
  const step = tf * 60_000;
  const rows: BybitCandle[] = [];
  for (let from = fromMs; from < toMs; from += PAGE * step) {
    const end = Math.min(toMs - 1, from + (PAGE - 1) * step);
    const result = await withRetry(
      () =>
        get('/market/kline', {
          category: 'linear',
          symbol,
          interval,
          start: String(from),
          end: String(end),
          limit: String(PAGE),
        }),
      delayMs,
    );
    const page = result.list ?? [];
    for (let i = page.length - 1; i >= 0; i--) {
      const k = page[i];
      const time = Number(k[0]);
      if (time + step > toMs) continue;
      rows.push({
        time,
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
      });
    }
  }
  return rows;
}
