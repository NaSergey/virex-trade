'use client';

import { useLocale, useTranslations } from 'next-intl';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { dateFormat } from '@/shared/lib/utils/intl';
import { formatPrice } from '@/shared/lib/utils/format';
import type { HlFill, HlOrder } from '../api/hooks';
import { usd } from '../model/format';

/** Дата и время одной строкой: ордера и сделки читают по времени. */
function useWhen() {
  const locale = useLocale();
  return (ms: number) => dateFormat(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}

const sideClass = (side: 'buy' | 'sell') => (side === 'buy' ? 'pos' : 'neg');

/** Открытые ордера кошелька (новые первыми). */
export function OrdersTable({ rows, isLoading }: { rows: HlOrder[]; isLoading: boolean }) {
  const t = useTranslations('hlWallets');
  const when = useWhen();
  const columns: LedgerColumn<HlOrder>[] = [
    { key: 'time', header: t('colTime'), render: (o) => when(o.time) },
    { key: 'coin', header: t('colCoin'), render: (o) => o.coin },
    { key: 'side', header: t('colSide'), render: (o) => <span className={sideClass(o.side)}>{t(o.side)}</span> },
    {
      key: 'type',
      header: t('colType'),
      render: (o) => (
        <>
          {o.type}
          {o.reduceOnly ? <span className="muted"> · {t('reduceOnly')}</span> : null}
        </>
      ),
    },
    { key: 'price', header: t('colPrice'), align: 'right', cellClassName: 'n', render: (o) => formatPrice(o.price) },
    {
      key: 'trigger',
      header: t('colTrigger'),
      align: 'right',
      cellClassName: 'n',
      render: (o) => (o.triggerPx == null ? '—' : formatPrice(o.triggerPx)),
    },
    {
      key: 'size',
      header: t('colSize'),
      align: 'right',
      cellClassName: 'n',
      render: (o) => usd(o.size * o.price),
    },
    {
      key: 'filled',
      header: t('colFilled'),
      align: 'right',
      cellClassName: 'n',
      render: (o) => (o.origSize > 0 ? `${Math.round((1 - o.size / o.origSize) * 100)} %` : '—'),
    },
  ];
  return (
    <LedgerTable
      columns={columns}
      rows={rows}
      rowKey={(o) => `${o.coin}:${o.time}:${o.price}:${o.size}:${o.side}`}
      minWidth={820}
      isLoading={isLoading}
      empty={t('noOrders')}
    />
  );
}

/** Последние сделки кошелька (новые первыми). */
export function FillsTable({ rows, isLoading }: { rows: HlFill[]; isLoading: boolean }) {
  const t = useTranslations('hlWallets');
  const when = useWhen();
  const columns: LedgerColumn<HlFill>[] = [
    { key: 'time', header: t('colTime'), render: (f) => when(f.time) },
    { key: 'coin', header: t('colCoin'), render: (f) => f.coin },
    { key: 'dir', header: t('colAction'), render: (f) => <span className={sideClass(f.side)}>{f.dir}</span> },
    { key: 'price', header: t('colPrice'), align: 'right', cellClassName: 'n', render: (f) => formatPrice(f.price) },
    { key: 'size', header: t('colSize'), align: 'right', cellClassName: 'n', render: (f) => usd(f.size * f.price) },
    {
      key: 'pnl',
      header: t('colClosedPnl'),
      align: 'right',
      cellClassName: 'n',
      // Открывающая сделка ничего не закрывает: ноль там — «не применимо», не «в ноль».
      render: (f) => (f.closedPnl === 0 ? <span className="muted">—</span> : <Money value={f.closedPnl} />),
    },
    { key: 'fee', header: t('colFee'), align: 'right', cellClassName: 'n', render: (f) => f.fee.toFixed(2) },
    { key: 'role', header: t('colRole'), render: (f) => (f.taker ? t('taker') : t('maker')) },
  ];
  return (
    <LedgerTable
      columns={columns}
      rows={rows}
      rowKey={(f) => `${f.coin}:${f.time}:${f.price}:${f.size}:${f.dir}:${f.fee}`}
      minWidth={820}
      isLoading={isLoading}
      empty={t('noFills')}
    />
  );
}
