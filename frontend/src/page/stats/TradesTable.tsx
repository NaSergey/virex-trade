'use client';

import type { Trade } from '@/shared/api/bybit/hooks';
import { Tags } from '@/shared/ui/Tag';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { TradeOrders } from '@/page/stats/TradeOrders';
import { formatMoney, formatPriceGrouped, moneyClass } from '@/shared/lib/utils/format';

/** «28 июл 11:42» — день с месяцем словом, как в записи журнала. */
function fmtClosed(iso: string): string {
  return new Date(iso)
    .toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .replace('.', '');
}

/** Сколько сделка держалась — от входа до закрытия. */
function fmtHold(openedAt: string | null, closedAt: string): string {
  if (!openedAt) return '—';
  const min = Math.round((new Date(closedAt).getTime() - new Date(openedAt).getTime()) / 60_000);
  if (!Number.isFinite(min) || min < 0) return '—';
  const h = Math.floor(min / 60);
  return h > 0 ? `${h} ч ${String(min % 60).padStart(2, '0')} м` : `${min} м`;
}

/**
 * Журнал закрытых сделок. Строка раскрывается кликом — это не «детали по
 * кнопке», а разворот той же записи: сама строка отвечает «что и на сколько»,
 * раскрытая часть — «из чего собралось и при каком рынке».
 */
export function TradesTable({
  trades,
  isLoading,
  onEditTags,
}: {
  trades: Trade[];
  isLoading?: boolean;
  onEditTags: (trade: Trade) => void;
}) {
  const columns: LedgerColumn<Trade>[] = [
    {
      key: 'closedAt',
      header: 'Закрыта',
      cellClassName: 'n',
      render: (t) => <span style={{ color: 'var(--color-muted)' }}>{fmtClosed(t.closedAt)}</span>,
    },
    { key: 'symbol', header: 'Символ', render: (t) => <span className="sym">{t.symbol}</span> },
    {
      key: 'direction',
      header: 'Напр.',
      label: 'Напр.',
      render: (t) => <span className={`dir${t.direction === 'short' ? ' short' : ''}`}>{t.direction}</span>,
    },
    {
      key: 'entry',
      header: 'Вход',
      align: 'right',
      cellClassName: 'n',
      render: (t) => formatPriceGrouped(t.avgEntryPrice),
    },
    {
      key: 'exit',
      header: 'Выход',
      align: 'right',
      cellClassName: 'n',
      render: (t) => formatPriceGrouped(t.avgExitPrice),
    },
    {
      key: 'qty',
      header: 'Размер',
      align: 'right',
      cellClassName: 'n',
      render: (t) => (
        <>
          {t.qty}
          {/* ×3 — позиция закрывалась тремя ордерами: размер сложен из частей. */}
          {t.parts > 1 && <span className="lbl"> ×{t.parts}</span>}
        </>
      ),
    },
    {
      key: 'hold',
      header: 'В позиции',
      align: 'right',
      cellClassName: 'n',
      render: (t) => <span style={{ color: 'var(--color-muted)' }}>{fmtHold(t.openedAt, t.closedAt)}</span>,
    },
    {
      key: 'pnl',
      header: 'P&L',
      align: 'right',
      cellClassName: 'n',
      render: (t) => (
        <span className={moneyClass(t.closedPnl)} style={{ fontSize: 'var(--t-m)' }}>
          {formatMoney(t.closedPnl)}
        </span>
      ),
    },
    {
      key: 'tags',
      header: 'Теги',
      cellClassName: 'cell-tags',
      render: (t) => (
        <Tags tags={t.tags ?? []}>
          <button
            className="tag-add"
            onClick={(e) => {
              // Иначе клик уйдёт в строку и заодно раскроет её.
              e.stopPropagation();
              onEditTags(t);
            }}
          >
            {(t.tags ?? []).length === 0 ? '+ тег' : '+'}
          </button>
        </Tags>
      ),
    },
  ];

  return (
    <LedgerTable
      columns={columns}
      rows={trades}
      rowKey={(t) => t.id}
      isLoading={isLoading}
      renderExpanded={(t) => <TradeOrders trade={t} />}
      empty={
        <div className="state">
          <h3>За этот период сделок нет</h3>
          <p>Смените период в рейке выше — или синхронизируйте историю с биржей в настройках.</p>
        </div>
      }
    />
  );
}
