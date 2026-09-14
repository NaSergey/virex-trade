'use client';

import { useTranslations } from 'next-intl';
import { Pencil, Plus, Tag as TagIcon, Target, Zap } from 'lucide-react';
import { Tags } from '@/entities/tag';
import { useLocaleControl } from '@/shared/i18n';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { Tooltip } from '@/shared/ui/Tooltip';
import { durationUnitLabels, formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import type { BacktestCloseOrder, BacktestTrade } from '../api/types';
import { liquidationPrice, toScreen, unrealizedPnl } from '../lib/money';

const ICON_SIZE = 14;

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
 * неоткуда взяться (символ сессии один, «Диапазон входа» — это live market-context с
 * отдельного эндпоинта, для бектеста источника нет).
 *
 * Теги — как в обзоре: разметить сетап можно, пока сделка ещё открыта и мысль ещё
 * свежая, не только постфактум в истории (`SessionTrades`). В отличие от обзора,
 * у открытой сделки бектеста уже есть настоящий `tradeId` (она такая же строка в БД,
 * что и закрытая) — отдельный live-запрос по символу+направлению не нужен, теги читаются
 * прямо с `trade.tags`.
 */
export function OpenPositionsPanel({
  trades,
  scale,
  price,
  cursor,
  closeOrders,
  onAdd,
  onLeverage,
  onLimit,
  onMarket,
  onCancelOrder,
  onChangeLevels,
  onTags,
}: {
  trades: BacktestTrade[];
  scale: number;
  /** Настоящая цена последней показанной минутки. */
  price: number | null;
  /** Момент симуляции — для «В позиции». */
  cursor: number;
  closeOrders: BacktestCloseOrder[];
  onAdd: (trade: BacktestTrade) => void;
  /** Плечо открытых позиций — общее на сессию, меняется у всех разом. */
  onLeverage: (trade: BacktestTrade) => void;
  onLimit: (trade: BacktestTrade) => void;
  onMarket: (trade: BacktestTrade) => void;
  onCancelOrder: (orderId: string) => void;
  onChangeLevels: (trade: BacktestTrade) => void;
  onTags: (trade: BacktestTrade) => void;
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
      render: (r) => (
        <Tooltip text={t('leverageOpenHint')}>
          <Button variant="bare" tight className="cue" aria-label={t('leverageLabel')} onClick={() => onLeverage(r.trade)}>
            {r.trade.leverage.toFixed(0)}×
          </Button>
        </Tooltip>
      ),
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
      key: 'tags',
      header: t('colTags'),
      cellClassName: 'cell-tags',
      render: (r) => (
        <Tags tags={r.trade.tags}>
          <Tooltip text={t('addTag')}>
            <Button variant="add" tight aria-label={t('addTag')} onClick={() => onTags(r.trade)}>
              <TagIcon size={ICON_SIZE} />
            </Button>
          </Tooltip>
        </Tags>
      ),
    },
    {
      key: 'actions',
      render: (r) => (
        <span className="row-actions">
          <Tooltip text={t('addToPosition')}>
            <Button tight aria-label={t('addToPosition')} onClick={() => onAdd(r.trade)}>
              <Plus size={ICON_SIZE} />
            </Button>
          </Tooltip>
          <Tooltip text={t('changeLevels')}>
            <Button tight aria-label={t('changeLevels')} onClick={() => onChangeLevels(r.trade)}>
              <Pencil size={ICON_SIZE} />
            </Button>
          </Tooltip>
          <Tooltip text={t('limitClose')}>
            <Button tight aria-label={t('limitClose')} onClick={() => onLimit(r.trade)}>
              <Target size={ICON_SIZE} />
            </Button>
          </Tooltip>
          <Tooltip text={t('marketClose')}>
            <Button tight variant="risk" aria-label={t('marketClose')} onClick={() => onMarket(r.trade)}>
              <Zap size={ICON_SIZE} />
            </Button>
          </Tooltip>
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
