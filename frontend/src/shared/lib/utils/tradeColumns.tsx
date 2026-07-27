import type { ColumnDef } from '@tanstack/react-table';
import { ChevronRight, Pencil } from 'lucide-react';
import type { Trade } from '@/shared/api/bybit/hooks';
import { TagChip } from '@/shared/ui/TagChip';
import { formatPnl, formatTradeDate, pnlColor } from './format';

/**
 * Подсветка строки таблицы сделок по знаку P&L. Живёт рядом с колонками:
 * таблица сделок везде одна и та же, значит и её строки красятся одинаково.
 */
export const tradeRowClass = (trade: Trade): string =>
  trade.closedPnl > 0
    ? 'bg-up/5 hover:bg-up/10'
    : trade.closedPnl < 0
      ? 'bg-down/5 hover:bg-down/10'
      : '';

/**
 * Builds the 5 trade-table columns shared identically between the stats
 * overview page and the tag stats trade-history table (symbol, direction,
 * closedPnl, tags, closedAt). Callers that need extra columns (e.g. entry/exit
 * price, qty) splice their own ColumnDef entries around this factory's output
 * rather than passing an `extraColumns` param — keeps this factory's API
 * simple.
 *
 * `withExpander` добавляет слева колонку-шеврон для раскрытия строки —
 * работает только если таблице передан `renderExpanded` (иначе
 * `row.getCanExpand()` всегда false и колонка остаётся пустой).
 */
export function buildTradeColumns({
  withTagsEditable,
  onEditTags,
  withExpander,
}: {
  withTagsEditable: boolean;
  onEditTags?: (trade: Trade) => void;
  withExpander?: boolean;
}): ColumnDef<Trade>[] {
  const expander: ColumnDef<Trade>[] = withExpander
    ? [
        {
          id: 'expander',
          header: () => null,
          cell: ({ row }) =>
            row.getCanExpand() ? (
              <span className="flex items-center gap-1 text-muted">
                <ChevronRight
                  className={`h-3.5 w-3.5 transition-transform ${row.getIsExpanded() ? 'rotate-90' : ''}`}
                />
                {row.original.parts > 1 && (
                  <span className="font-mono text-[10px] text-subtle">×{row.original.parts}</span>
                )}
              </span>
            ) : null,
        },
      ]
    : [];

  return [
    ...expander,
    {
      accessorKey: 'symbol',
      header: 'Символ',
      cell: ({ row }) => <span className="font-medium text-fg">{row.original.symbol}</span>,
    },
    {
      accessorKey: 'direction',
      header: 'Направление',
      cell: ({ row }) => {
        const isLong = row.original.direction === 'long';
        return (
          <span className={`font-medium ${isLong ? 'text-up' : 'text-down'}`}>
            {isLong ? 'LONG' : 'SHORT'}
          </span>
        );
      },
    },
    {
      accessorKey: 'closedPnl',
      header: 'P&L',
      cell: ({ row }) => {
        const v = row.original.closedPnl;
        return <span className={`font-semibold ${pnlColor(v)}`}>{formatPnl(v)} USDT</span>;
      },
    },
    {
      accessorKey: 'tags',
      header: 'Теги',
      cell: ({ row }) => {
        const tags = row.original.tags ?? [];
        if (!withTagsEditable) {
          if (tags.length === 0) return <span className="text-xs text-subtle">—</span>;
          return (
            <span className="flex flex-wrap gap-1">
              {tags.map((t) => (
                <TagChip key={t.id} name={t.name} color={t.color} />
              ))}
            </span>
          );
        }
        return (
          <button
            onClick={(e) => {
              // Иначе клик уйдёт в строку и заодно раскроет/свернёт её.
              e.stopPropagation();
              onEditTags?.(row.original);
            }}
            className="inline-flex cursor-pointer flex-wrap items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-elevated"
            title="Изменить теги сделки"
          >
            {tags.length === 0 ? (
              <span className="text-xs text-subtle">Добавить теги</span>
            ) : (
              tags.map((t) => <TagChip key={t.id} name={t.name} color={t.color} />)
            )}
            <Pencil className="h-3 w-3 shrink-0 text-muted" />
          </button>
        );
      },
    },
    {
      accessorKey: 'closedAt',
      header: 'Закрыто',
      cell: ({ row }) => (
        <span className="text-sm text-muted">{formatTradeDate(row.original.closedAt)}</span>
      ),
    },
  ];
}
