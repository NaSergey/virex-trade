/**
 * Format number with appropriate decimal places
 * - If number < 1 (e.g., 0.234235): show 4 decimal places
 * - If number >= 1 (e.g., 98097.70): show 2 decimal places
 * @param value - Number or string to format
 * @returns Formatted string
 */
export function formatPrice(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(num)) {
    return '-';
  }

  // If number has no integer part (less than 1), show 4 decimal places, otherwise show 2
  if (Math.abs(num) < 1) {
    return num.toFixed(4);
  }

  return num.toFixed(2);
}

/**
 * Format a PnL value with an explicit sign and 2 decimal places.
 * Does not append a currency suffix — callers that need one (e.g. " USDT")
 * append it themselves, since suffix presence varies per call site.
 * @param v - PnL value
 * @returns Formatted string, e.g. "+5.00" or "-3.46"
 */
export function formatPnl(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
}

/**
 * Format an ISO date string as a short ru-RU day/month, hour:minute string.
 * @param iso - ISO date string
 * @returns Formatted date string
 */
export function formatTradeDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Sum a numeric field across a list of items, defensively parsing string/undefined values.
 * @param items - Array of items
 * @param field - Key of the numeric field to sum
 * @returns Sum of parsed values (0 for unparseable/missing values)
 */
export function sumPnl<T>(items: T[], field: keyof T): number {
  return items.reduce((sum, item) => sum + (parseFloat(String(item[field] ?? '')) || 0), 0);
}

/**
 * Semantic text color class for a PnL/profit-factor-driven value: up-colored
 * above zero, down-colored below, muted at exactly zero.
 * @param v - value to classify (PnL, avg PnL, etc.)
 */
export function pnlColor(v: number): string {
  return v > 0 ? 'text-up' : v < 0 ? 'text-down' : 'text-muted';
}

/**
 * Профит-фактор в читаемом виде — одна формулировка на все места, где он
 * показывается (обзор, таблица тегов, лаборатория): «1.80», «∞» (убыточных
 * сделок нет, но прибыльные есть) и «—» (считать не из чего: сделок нет либо
 * все в ноль).
 * @param profitFactor - grossProfit / grossLoss
 * @param wins - прибыльных сделок
 * @param losses - убыточных сделок
 */
export function formatProfitFactor(profitFactor: number, wins: number, losses: number): string {
  if (losses === 0) return wins > 0 ? '∞' : '—';
  return profitFactor.toFixed(2);
}

/**
 * Format a percentage with an explicit sign, e.g. "+2.35%" / "-1.10%".
 * @param v - value in percent
 * @param digits - decimal places (default 2)
 */
export function fmtPctSigned(v: number, digits = 2): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`;
}
