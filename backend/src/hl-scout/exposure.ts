/** Позиция в том виде, в каком её хранит снимок (`HlPositionSnapshot.positions`). */
export interface SnapshotPosition {
  coin: string;
  /** Размер со знаком: плюс — лонг, минус — шорт. */
  szi: number;
  notional: number;
  entryPx: number | null;
  upnl: number;
}

export type Style = 'flat' | 'neutral' | 'directional';

/** Меньше этой доли баланса в позициях — кошелёк фактически вне рынка, направления у него нет. */
export const FLAT_GROSS = 0.05;
/** |нетто| / брутто ниже этого — ноги гасят друг друга: хедж, пара, арбитраж. */
export const NEUTRAL_RATIO = 0.25;

/**
 * Экспозиция позиций к балансу. `net` — (лонг − шорт) / баланс, `gross` —
 * (лонг + шорт) / баланс. Баланс — общий (перп + спот): деньги многих кошельков
 * лежат в споте, и от перпового счёта плечо вышло бы десятки раз.
 */
export function exposureOf(
  positions: SnapshotPosition[],
  equity: number | null | undefined,
): { net: number; gross: number } | null {
  if (!equity || !(equity > 0)) return null;
  let long = 0;
  let short = 0;
  for (const p of positions) {
    if (p.szi > 0) long += p.notional;
    else if (p.szi < 0) short += p.notional;
  }
  return { net: (long - short) / equity, gross: (long + short) / equity };
}

/**
 * Что за кошелёк по его позициям. Одна позиция (или несколько в одну сторону)
 * всегда направленная; нейтральной бывает только пара и более ног, где лонг почти
 * равен шорту. Это про Hyperliquid: хедж на другой бирже отсюда не виден, и
 * «направленный» значит «не нейтральный здесь», а не «ставит на рост».
 */
export function styleOf(
  net: number | null | undefined,
  gross: number | null | undefined,
): Style | null {
  if (net == null || gross == null) return null;
  if (gross < FLAT_GROSS) return 'flat';
  return Math.abs(net) / gross < NEUTRAL_RATIO ? 'neutral' : 'directional';
}
