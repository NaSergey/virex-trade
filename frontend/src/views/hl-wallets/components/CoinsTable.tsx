'use client';

import { useTranslations } from 'next-intl';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import type { CoinGroup } from '../model/coins';
import { usd } from '../model/format';
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
    { key: 'wallets', header: t('colWallets'), align: 'right', cellClassName: 'n', render: (g) => g.wallets },
    {
      key: 'direction',
      header: t('colDirection'),
      render: (g) => <RatioBar longs={g.longs} shorts={g.shorts} />,
    },
    { key: 'long', header: t('colLongSize'), align: 'right', cellClassName: 'n', render: (g) => usd(g.longNotional) },
    { key: 'short', header: t('colShortSize'), align: 'right', cellClassName: 'n', render: (g) => usd(g.shortNotional) },
    {
      key: 'net',
      header: t('colNet'),
      align: 'right',
      cellClassName: 'n',
      render: (g) => <Money value={g.netNotional} digits={0} />,
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
