/**
 * Несколько графиков терминала (спека 2026-11-17): раскладка и состав ячеек.
 * Ячейка — монета и ТФ; активная — график терминала, остальные показывают свою
 * монету. Хранится на устройстве строками: хранилище берёт только примитивы.
 */

export type LayoutId = '1' | '2h' | '2v' | '3' | '4';

/** Порядок в меню раскладок. */
export const LAYOUTS: readonly LayoutId[] = ['1', '2h', '2v', '3', '4'];

export interface Pane {
  symbol: string;
  tf: number;
}

const COUNT: Record<LayoutId, number> = { '1': 1, '2h': 2, '2v': 2, '3': 3, '4': 4 };

export const paneCount = (layout: LayoutId): number => COUNT[layout];

export const decodeLayout = (raw: string | null): LayoutId =>
  raw != null && (LAYOUTS as readonly string[]).includes(raw) ? (raw as LayoutId) : '1';

/** `BTCUSDT:15,ETHUSDT:60` — в тикерах нет ни запятых, ни двоеточий. */
export const encodePanes = (panes: readonly Pane[]): string => panes.map((p) => `${p.symbol}:${p.tf}`).join(',');

/** Разбор строки хранилища; ячейка с битым видом или ТФ не из списка отбрасывается. */
export function decodePanes(raw: string | null, tfs: readonly number[]): Pane[] {
  if (!raw) return [];
  const out: Pane[] = [];
  for (const part of raw.split(',')) {
    const m = /^([A-Z0-9]+):(\d+)$/.exec(part);
    if (!m) continue;
    const tf = Number(m[2]);
    if (tfs.includes(tf)) out.push({ symbol: m[1], tf });
  }
  return out;
}

/**
 * Состав на `count` ячеек: монета, которой нет у рынка, заменяется свободной;
 * недостающие ячейки — следующими свободными монетами списка с ТФ `tf` (активного
 * графика). Ячейки сверх `count` сохраняются: вернувшийся с 4 графиков на 2 и
 * обратно видит прежние монеты. Свободных монет нет — повтор первой.
 */
export function fillPanes(panes: readonly Pane[], count: number, coins: readonly string[], tf: number): Pane[] {
  if (coins.length === 0) return [...panes];
  const known = new Set(coins);
  const taken = new Set(panes.filter((p) => known.has(p.symbol)).map((p) => p.symbol));
  const free = () => {
    const next = coins.find((c) => !taken.has(c)) ?? coins[0];
    taken.add(next);
    return next;
  };
  const out = panes.map((p) => (known.has(p.symbol) ? p : { ...p, symbol: free() }));
  while (out.length < count) out.push({ symbol: free(), tf });
  return out;
}
