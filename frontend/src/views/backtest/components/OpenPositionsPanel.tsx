'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import type { BacktestCloseOrder, BacktestTrade } from '../api/types';
import { toScreen, unrealizedPnl } from '../lib/money';

interface Row {
  trade: BacktestTrade;
  remaining: number;
}

/**
 * Открытая позиция сессии — их не больше одной. Кнопки закрытия живут здесь,
 * а не в `OrderPanel`: панель ордера никогда не смотрит на то, открыта ли
 * сделка, а закрытие — как раз про то, что уже открыто.
 */
export function OpenPositionsPanel({
  trade,
  scale,
  price,
  closeOrders,
  onLimit,
  onMarket,
  onCancelOrder,
  onChangeLevels,
}: {
  trade: BacktestTrade | null;
  scale: number;
  /** Настоящая цена последней показанной минутки. */
  price: number | null;
  closeOrders: BacktestCloseOrder[];
  onLimit: () => void;
  onMarket: () => void;
  onCancelOrder: (orderId: string) => void;
  onChangeLevels: () => void;
}) {
  const t = useTranslations('backtest');

  if (!trade) {
    return <EmptyState title={t('noOpenPosition')}>{t('noOpenPositionHint')}</EmptyState>;
  }

  const remaining = trade.qty - trade.closedQty;
  const rows: Row[] = [{ trade, remaining }];

  const columns: LedgerColumn<Row>[] = [
    {
      key: 'dir',
      header: t('colDir'),
      render: (r) => <span className={`dir${r.trade.direction === 'short' ? ' short' : ''}`}>{t(`direction.${r.trade.direction}`)}</span>,
    },
    {
      key: 'entry',
      header: t('colEntry'),
      align: 'right',
      cellClassName: 'n',
      render: (r) => formatPriceGrouped(toScreen(r.trade.entryPrice, scale)),
    },
    {
      key: 'size',
      header: t('colSize'),
      align: 'right',
      cellClassName: 'n',
      render: (r) => (
        <span title={t('qtyTitle', { qty: formatQty(r.remaining) })}>
          {formatPriceGrouped(r.remaining * toScreen(r.trade.entryPrice, scale))}
        </span>
      ),
    },
    {
      key: 'leverage',
      header: t('leverageLabel'),
      align: 'right',
      cellClassName: 'n',
      render: (r) => `${r.trade.leverage.toFixed(0)}×`,
    },
    {
      key: 'pnl',
      header: t('colPnl'),
      align: 'right',
      cellClassName: 'n',
      render: (r) => (price != null ? <Money value={unrealizedPnl(r.trade.direction, r.trade.entryPrice, price, r.remaining)} large /> : '—'),
    },
    {
      key: 'actions',
      render: () => (
        <span className="row-actions">
          <Button tight onClick={onChangeLevels}>
            {t('changeLevels')}
          </Button>
          <Button tight onClick={onLimit}>
            {t('limitClose')}
          </Button>
          <Button tight variant="risk" onClick={onMarket}>
            {t('marketClose')}
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <LedgerTable columns={columns} rows={rows} rowKey={(r) => r.trade.id} />
      {closeOrders.length > 0 && (
        <ul className="close-orders">
          {closeOrders.map((o) => (
            <li key={o.id}>
              <span>{t('pendingLimitOrder', { qty: formatQty(o.qty), price: formatPriceGrouped(toScreen(o.price, scale)) })}</span>
              <Button tight onClick={() => onCancelOrder(o.id)}>
                {t('cancelOrder')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
