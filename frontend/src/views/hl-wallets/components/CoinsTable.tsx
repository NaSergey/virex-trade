'use client';

import { useTranslations } from 'next-intl';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import type { CoinGroup } from '../model/coins';
import { qty, usd } from '../model/format';
import { formatPrice } from '@/shared/lib/utils/format';
import { PositionsTable } from './PositionsTable';
import { RatioBar } from './RatioBar';

/** Объём стороны: монеты — главное, USDT — приглушённо рядом. */
function Volume({ size, notional }: { size: number; notional: number }) {
  return (
    <>
      {qty(size)} <span className="muted">· ${usd(notional)}</span>
    </>
  );
}

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
    // Объём — в монетах, а рядом тем же цветом приглушённо — в долларах.
    {
      key: 'long',
      header: t('colLongSize'),
      align: 'right',
      cellClassName: 'n',
      render: (g) => <Volume size={g.longSize} notional={g.longNotional} />,
    },
    {
      key: 'short',
      header: t('colShortSize'),
      align: 'right',
      cellClassName: 'n',
      render: (g) => <Volume size={g.shortSize} notional={g.shortNotional} />,
    },
    {
      key: 'net',
      header: t('colNet'),
      align: 'right',
      cellClassName: 'n',
      render: (g) => (
        <span className={g.netSize >= 0 ? 'pos' : 'neg'}>
          {g.netSize > 0 ? '+' : ''}
          {qty(g.netSize)} <span className="muted">· ${usd(g.netNotional)}</span>
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
