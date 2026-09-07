import type { RangeTf, Trade } from '@/entities/trade';

/** Колонка снимка, в которой лежит диапазон входа этого ТФ. */
const RANGE_FIELD: Record<RangeTf, keyof NonNullable<Trade['context']>> = {
  '15m': 'rangePos15m',
  '30m': 'rangePos30m',
  '1h': 'rangePos1h',
  '4h': 'rangePos4h',
  '1d': 'rangePos1d',
};

/** Диапазон входа того ТФ, по которому сейчас смотрят. */
export function rangeOf(trade: Trade, tf: RangeTf): number | null {
  const v = trade.context?.[RANGE_FIELD[tf]];
  return typeof v === 'number' ? v : null;
}

/**
 * Сколько сделка держалась, в минутах. Основа и для подписи в таблице
 * (`fmtHold`), и для сортировки колонки «В позиции» (`sortTrades`) — одна
 * формула вместо двух копий, которые могли бы разойтись.
 */
export function holdMinutes(openedAt: string | null, closedAt: string): number | null {
  if (!openedAt) return null;
  const min = Math.round((new Date(closedAt).getTime() - new Date(openedAt).getTime()) / 60_000);
  return Number.isFinite(min) && min >= 0 ? min : null;
}
