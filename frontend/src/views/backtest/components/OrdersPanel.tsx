'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { SectionHead } from '@/shared/ui/SectionHead';
import { cn } from '@/shared/lib/utils/css';
import { formatPriceGrouped, formatQty, formatTradeDate } from '@/shared/lib/utils/format';
import type { BacktestCloseOrder, BacktestEntryOrder, BacktestTrade, Direction } from '../api/types';
import { toScreen } from '../lib/money';

/**
 * Ещё не сработавшие ордера сессии — своя вкладка, а не часть «Открытых
 * позиций»: до срабатывания это не позиция (сетка на вход) и не окончательный
 * выход (лимит закрытия), а обещание сделки. На настоящей бирже это тоже
 * разные вкладки терминала.
 *
 * Та же `LedgerTable`, что у «Открытых позиций» и «Истории сделок» — раньше
 * список был голыми `<ul>/<li>` без единого класса разметки, и подпись с
 * кнопкой «Отменить» съезжались в одну строку без зазора.
 */
export function OrdersPanel({
  trades,
  scale,
  closeOrders,
  entryOrders,
  onCancelOrder,
  onCancelEntryOrder,
}: {
  trades: BacktestTrade[];
  scale: number;
  closeOrders: BacktestCloseOrder[];
  /** Сетка на вход (Scaled order) — до первого срабатывания сделки ещё нет,
   * поэтому эти строки показываются здесь и тогда, когда trades пуст. */
  entryOrders: BacktestEntryOrder[];
  onCancelOrder: (orderId: string) => void;
  onCancelEntryOrder: (orderId: string) => void;
}) {
  const t = useTranslations('backtest');
  const tradeById = new Map(trades.map((x) => [x.id, x]));

  const entryGrids = (['long', 'short'] as const)
    .map((direction) => ({ direction, orders: entryOrders.filter((o) => o.direction === direction) }))
    .filter((g) => g.orders.length > 0);

  if (closeOrders.length === 0 && entryGrids.length === 0) {
    return <EmptyState title={t('noOrders')}>{t('noOrdersHint')}</EmptyState>;
  }

  const dir = (d: Direction) => <span className={cn('dir', d === 'short' && 'short')}>{t(`direction.${d}`)}</span>;

  // У BacktestCloseOrder своего направления нет в модели — он закрывает уже
  // открытую сделку, поэтому направление колонки берётся у неё же (tradeById).
  const closeColumns: LedgerColumn<BacktestCloseOrder>[] = [
    {
      key: 'direction',
      header: t('colOrderDirection'),
      render: (o) => {
        const trade = tradeById.get(o.tradeId);
        return trade ? dir(trade.direction) : '—';
      },
    },
    {
      key: 'price',
      header: t('colOrderPrice'),
      align: 'right',
      cellClassName: 'n',
      render: (o) => formatPriceGrouped(toScreen(o.price, scale)),
    },
    { key: 'qty', header: t('colOrderQty'), align: 'right', cellClassName: 'n', render: (o) => formatQty(o.qty) },
    {
      key: 'time',
      header: t('colOrderTime'),
      align: 'right',
      cellClassName: 'n',
      render: (o) => formatTradeDate(o.createdAt),
    },
    {
      key: 'actions',
      render: (o) => (
        <Button tight onClick={() => onCancelOrder(o.id)}>
          {t('cancelOrder')}
        </Button>
      ),
    },
  ];

  const entryColumns: LedgerColumn<BacktestEntryOrder>[] = [
    {
      key: 'price',
      header: t('colOrderPrice'),
      align: 'right',
      cellClassName: 'n',
      render: (o) => formatPriceGrouped(toScreen(o.price, scale)),
    },
    {
      key: 'risk',
      header: t('colOrderRisk'),
      align: 'right',
      cellClassName: 'n',
      render: (o) => `${o.riskPct.toFixed(2)}%`,
    },
    {
      key: 'time',
      header: t('colOrderTime'),
      align: 'right',
      cellClassName: 'n',
      render: (o) => formatTradeDate(o.createdAt),
    },
    {
      key: 'actions',
      render: (o) => (
        <Button tight onClick={() => onCancelEntryOrder(o.id)}>
          {t('cancelOrder')}
        </Button>
      ),
    },
  ];

  return (
    <div>
      {closeOrders.length > 0 && (
        <>
          <SectionHead title={t('limitCloseOrdersTitle')} />
          <LedgerTable columns={closeColumns} rows={closeOrders} rowKey={(o) => o.id} />
        </>
      )}
      {entryGrids.map(({ direction, orders }) => (
        <div key={direction}>
          <SectionHead title={t('pendingEntryOrdersTitle', { direction: t(`direction.${direction}`) })}>
            {orders.length > 1 && (
              <Button tight onClick={() => orders.forEach((o) => onCancelEntryOrder(o.id))}>
                {t('cancelGrid')}
              </Button>
            )}
          </SectionHead>
          <LedgerTable columns={entryColumns} rows={orders} rowKey={(o) => o.id} />
        </div>
      ))}
    </div>
  );
}
