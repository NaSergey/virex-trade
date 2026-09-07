import type { RangeTf, Trade } from '@/entities/trade';
import type { LedgerSort } from '@/shared/ui/LedgerTable';
import { holdMinutes, rangeOf } from './tradeMetrics';

/**
 * Значение сделки для каждого сортируемого ключа — только числа, как и
 * сортируемые колонки во всех таблицах продукта (см. AllTags). closedAt
 * сравнивается меткой времени, а не строкой ISO: строки с разными часовыми
 * поясами так не отсортировать корректно.
 */
function valueOf(key: string, tr: Trade, rangeTf?: RangeTf): number | null {
  switch (key) {
    case 'closedAt':
      return new Date(tr.closedAt).getTime();
    case 'entry':
      return tr.avgEntryPrice;
    case 'exit':
      return tr.avgExitPrice;
    case 'qty':
      return tr.qty * tr.avgEntryPrice;
    case 'hold':
      return holdMinutes(tr.openedAt, tr.closedAt);
    case 'pnl':
      return tr.closedPnl;
    case 'range':
      return rangeTf ? rangeOf(tr, rangeTf) : null;
    default:
      return null;
  }
}

/**
 * Сортировка журнала сделок для таблиц, которые сами режут список на листы
 * (см. AnalyticsPage): сортировать нужно ДО пагинации, иначе клик по колонке
 * переставляет местами только тридцать строк текущего листа, а следующий лист
 * остаётся в прежнем порядке.
 *
 * Пропуски (нет времени открытия, нет диапазона этого ТФ) всегда уходят в
 * конец списка независимо от направления — иначе сортировка по «Диапазону»
 * на каждый клик переставляла бы местами только дыры в данных.
 */
export function sortTrades(trades: Trade[], sort: LedgerSort, rangeTf?: RangeTf): Trade[] {
  return [...trades].sort((a, b) => {
    const va = valueOf(sort.key, a, rangeTf);
    const vb = valueOf(sort.key, b, rangeTf);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va - vb) * sort.dir;
  });
}
