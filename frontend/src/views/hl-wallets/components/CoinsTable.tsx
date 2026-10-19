'use client';

import { useTranslations } from 'next-intl';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import type { CoinGroup } from '../model/coins';
import { qty, usd } from '../model/format';
import { formatPrice } from '@/shared/lib/utils/format';
import { PositionsTable } from './PositionsTable';
import { RatioBar } from './RatioBar';

/**
 * Общие монеты сохранённых кошельков: по каждой — сколько кошельков её держат и
 * в какую сторону они смотрят вместе. Строка раскрывается позициями каждого
 * кошелька: размер, вход, P&L, плечо, ликвидация.
 */
export function CoinsTable({ rows, isLoading }: { rows: CoinGroup[]; isLoading: boolean }) {
  const t = useTranslations('hlWallets');

  const columns: LedgerColumn<CoinGroup>[] = [
    { key: 'coin', header: t('colCoin'), render: (g) => g.coin },
    {
      key: 'price',
      header: t('colPrice'),
      align: 'right',
      cellClassName: 'n',
      render: (g) => (g.price == null ? '—' : formatPrice(g.price)),
    },
    { key: 'wallets', header: t('colWallets'), align: 'right', cellClassName: 'n', render: (g) => g.wallets },
    {
      key: 'direction',
      header: t('colDirection'),
      render: (g) => <RatioBar longs={g.longs} shorts={g.shorts} />,
    },
    // Объём — в монетах; сумма в долларах — в подсказке.
    {
      key: 'long',
      header: t('colLongSize'),
      align: 'right',
      cellClassName: 'n',
      render: (g) => <span title={`$${usd(g.longNotional)}`}>{qty(g.longSize)}</span>,
    },
    {
      key: 'short',
      header: t('colShortSize'),
      align: 'right',
      cellClassName: 'n',
      render: (g) => <span title={`$${usd(g.shortNotional)}`}>{qty(g.shortSize)}</span>,
    },
    {
      key: 'net',
      header: t('colNet'),
      align: 'right',
      cellClassName: 'n',
      render: (g) => (
        <span title={`$${usd(g.netNotional)}`} className={g.netSize >= 0 ? 'pos' : 'neg'}>
          {g.netSize > 0 ? '+' : ''}
          {qty(g.netSize)}
        </span>
      ),
    },
    {
      key: 'pnl',
      header: t('colUpnl'),
      align: 'right',
      cellClassName: 'n',
      render: (g) => <Money value={g.unrealizedPnl} digits={0} />,
    },
  ];

  return (
    <LedgerTable
      columns={columns}
      rows={rows}
      rowKey={(g) => g.coin}
      minWidth={820}
      isLoading={isLoading}
      empty={t('noCommonCoins')}
      renderExpanded={(g) => <PositionsTable rows={g.positions} isLoading={false} />}
    />
  );
}
