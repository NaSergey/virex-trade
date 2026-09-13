'use client';

import { useTranslations } from 'next-intl';
import { useLocaleControl } from '@/shared/i18n';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { durationUnitLabels, formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import type { BacktestCloseOrder, BacktestTrade } from '../api/types';
import { liquidationPrice, toScreen, unrealizedPnl } from '../lib/money';

interface Row {
  trade: BacktestTrade;
  remaining: number;
}

/** Время в позиции — по симулированному моменту сессии (`cursor`), не по настоящим часам.
 * Тот же приём отказа, что у `fmtAge` в `views/overview/components/OpenPositions.tsx`:
 * «—» на некорректном значении, а не молчаливое зажатие в 0 — вход позже курсора
 * сигнализирует баг в другом месте, и прятать его не нужно. */
function fmtSimAge(entryTime: string, cursor: number, units: { d: string; h: string; m: string }): string {
  const min = Math.floor((cursor - Date.parse(entryTime)) / 60_000);
  if (!Number.isFinite(min) || min < 0) return '—';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  if (d > 0) return `${d} ${units.d} ${h} ${units.h}`;
  return h > 0 ? `${h} ${units.h} ${String(min % 60).padStart(2, '0')} ${units.m}` : `${min} ${units.m}`;
}

/**
 * Открытые позиции сессии — до двух, лонг и шорт разом (хедж). Кнопки закрытия/добора
 * живут здесь, а не в `OrderPanel`: панель ордера никогда не смотрит на то, что уже
 * открыто, а эта таблица — как раз про то, что уже открыто. Колонки — по образцу
 * `views/overview/components/OpenPositions.tsx`, кроме того, чему в бектесте физически
 * неоткуда взяться (символ сессии один, «Диапазон входа» и теги на открытой сделке —
 * см. спеку).
 */
export function OpenPositionsPanel({
  trades,
  scale,
  price,
  cursor,
  closeOrders,
  onLimit,
  onMarket,
  onCancelOrder,
  onChangeLevels,
}: {
  trades: BacktestTrade[];
  scale: number;
  /** Настоящая цена последней показанной минутки. */
  price: number | null;
  /** Момент симуляции — для «В позиции». */
  cursor: number;
  closeOrders: BacktestCloseOrder[];
  onLimit: (trade: BacktestTrade) => void;
  onMarket: (trade: BacktestTrade) => void;
  onCancelOrder: (orderId: string) => void;
  onChangeLevels: (trade: BacktestTrade) => void;
}) {
  const t = useTranslations('backtest');
  const { locale } = useLocaleControl();
  const units = durationUnitLabels(locale);

  if (trades.length === 0) {
    return <EmptyState title={t('noOpenPosition')}>{t('noOpenPositionHint')}</EmptyState>;
  }

  const rows: Row[] = trades.map((trade) => ({ trade, remaining: trade.qty - trade.closedQty }));

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
      key: 'mark',
      header: t('colMark'),
      align: 'right',
      cellClassName: 'n',
      render: () => (price != null ? formatPriceGrouped(toScreen(price, scale)) : '—'),
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
      key: 'liq',
      header: t('liqLabel'),
      align: 'right',
      cellClassName: 'n neg',
      render: (r) => formatPriceGrouped(toScreen(liquidationPrice(r.trade.direction, r.trade.entryPrice, r.trade.leverage), scale)),
    },
    {
      key: 'age',
      header: t('colInPosition'),
      align: 'right',
      cellClassName: 'n',
      render: (r) => <span className="muted">{fmtSimAge(r.trade.entryTime, cursor, units)}</span>,
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
      render: (r) => (
        <span className="row-actions">
          <Button tight onClick={() => onChangeLevels(r.trade)}>
            {t('changeLevels')}
          </Button>
          <Button tight onClick={() => onLimit(r.trade)}>
            {t('limitClose')}
          </Button>
          <Button tight variant="risk" onClick={() => onMarket(r.trade)}>
            {t('marketClose')}
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <LedgerTable columns={columns} rows={rows} rowKey={(r) => r.trade.id} />
      {trades.map((trade) => {
        const orders = closeOrders.filter((o) => o.tradeId === trade.id);
        if (orders.length === 0) return null;
        return (
          <ul className="close-orders" key={trade.id}>
            {orders.map((o) => (
              <li key={o.id}>
                <span>{t('pendingLimitOrder', { qty: formatQty(o.qty), price: formatPriceGrouped(toScreen(o.price, scale)) })}</span>
                <Button tight onClick={() => onCancelOrder(o.id)}>
                  {t('cancelOrder')}
                </Button>
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}
