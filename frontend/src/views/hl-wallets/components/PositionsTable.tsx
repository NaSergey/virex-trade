'use client';

import { useTranslations } from 'next-intl';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { formatPrice } from '@/shared/lib/utils/format';
import type { HlPosition } from '../api/hooks';
import { usd } from '../model/format';
import { WalletCell } from './WalletCell';

/** Открытые позиции сохранённых кошельков — одной таблицей: что они держат сейчас. */
export function PositionsTable({ rows, isLoading }: { rows: HlPosition[]; isLoading: boolean }) {
  const t = useTranslations('hlWallets');
  const price = (v: number | null) => (v == null ? '—' : formatPrice(v));
  const columns: LedgerColumn<HlPosition>[] = [
    { key: 'address', header: t('colWallet'), render: (p) => <WalletCell address={p.address} /> },
    { key: 'coin', header: t('colCoin'), render: (p) => p.coin },
    {
      key: 'side',
      header: t('colSide'),
      render: (p) => <span className={p.side === 'long' ? 'pos' : 'neg'}>{t(p.side)}</span>,
    },
    { key: 'notional', header: t('colSize'), align: 'right', cellClassName: 'n', render: (p) => usd(p.notional) },
    { key: 'entry', header: t('colEntry'), align: 'right', cellClassName: 'n', render: (p) => price(p.entryPx) },
    { key: 'mark', header: t('colMark'), align: 'right', cellClassName: 'n', render: (p) => price(p.markPx) },
    {
      key: 'pnl',
      header: t('colUpnl'),
      align: 'right',
      cellClassName: 'n',
      render: (p) => <Money value={p.unrealizedPnl} digits={0} />,
    },
    { key: 'lev', header: t('colLeverage'), align: 'right', cellClassName: 'n', render: (p) => `${p.leverage}×` },
    { key: 'liq', header: t('colLiq'), align: 'right', cellClassName: 'n', render: (p) => price(p.liquidationPx) },
  ];
  return (
    <LedgerTable
      columns={columns}
      rows={rows}
      rowKey={(p) => `${p.address}:${p.coin}`}
      minWidth={980}
      isLoading={isLoading}
      empty={t('noPositions')}
    />
  );
}
