'use client';

import { useLocale, useTranslations } from 'next-intl';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { dateFormat } from '@/shared/lib/utils/intl';
import { durationUnitLabels, formatPrice } from '@/shared/lib/utils/format';
import type { HlPosition } from '../api/hooks';
import { duration, qty, usd } from '../model/format';
import { WalletCell } from './WalletCell';

/** Открытые позиции сохранённых кошельков — одной таблицей: что они держат сейчас. */
export function PositionsTable({ rows, isLoading }: { rows: HlPosition[]; isLoading: boolean }) {
  const t = useTranslations('hlWallets');
  const locale = useLocale();
  const units = durationUnitLabels(locale === 'en' ? 'en' : 'ru');
  const price = (v: number | null) => (v == null ? '—' : formatPrice(v));
  const columns: LedgerColumn<HlPosition>[] = [
    { key: 'address', header: t('colWallet'), render: (p) => <WalletCell address={p.address} /> },
    { key: 'coin', header: t('colCoin'), render: (p) => p.coin },
    {
      key: 'side',
      header: t('colSide'),
      render: (p) => <span className={p.side === 'long' ? 'pos' : 'neg'}>{t(p.side)}</span>,
    },
    // Объём — и в монетах, и в USDT: размер читают в BTC, вес позиции — в долларах.
    {
      key: 'size',
      header: t('colQty'),
      align: 'right',
      cellClassName: 'n',
      render: (p) => (
        <>
          {qty(p.size)} <span className="muted">{p.coin}</span>
        </>
      ),
    },
    { key: 'notional', header: t('colNotional'), align: 'right', cellClassName: 'n', render: (p) => usd(p.notional) },
    { key: 'entry', header: t('colEntry'), align: 'right', cellClassName: 'n', render: (p) => price(p.entryPx) },
    { key: 'mark', header: t('colMark'), align: 'right', cellClassName: 'n', render: (p) => price(p.markPx) },
    {
      key: 'pnl',
      header: t('colUpnl'),
      align: 'right',
      cellClassName: 'n',
      render: (p) => <Money value={p.unrealizedPnl} digits={0} />,
    },
    {
      key: 'opened',
      header: t('colOpened'),
      align: 'right',
      cellClassName: 'n',
      // Возраст позиции; точная дата — в подсказке. «≥» — вход раньше окна истории.
      render: (p) =>
        p.openedAt == null ? (
          <span className="muted" title={t('openedUnknown')}>
            —
          </span>
        ) : (
          <span
            title={dateFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(p.openedAt))}
          >
            {p.openedPartial ? '≥ ' : ''}
            {duration(Date.now() - p.openedAt, units)}
          </span>
        ),
    },
  ];
  return (
    <LedgerTable
      columns={columns}
      rows={rows}
      rowKey={(p) => `${p.address}:${p.coin}`}
      minWidth={900}
      isLoading={isLoading}
      empty={t('noPositions')}
    />
  );
}
