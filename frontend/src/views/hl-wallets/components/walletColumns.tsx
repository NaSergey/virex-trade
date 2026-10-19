import type { ReactNode } from 'react';
import type { useTranslations } from 'next-intl';
import { Money } from '@/shared/ui/Money';
import type { LedgerColumn } from '@/shared/ui/LedgerTable';
import { fmtPctSigned } from '@/shared/lib/utils/format';
import type { HlWalletRow } from '../api/hooks';
import { pct, usd } from '../model/format';
import { WalletCell } from './WalletCell';

type T = ReturnType<typeof useTranslations>;

const money = (v: number | null) =>
  v == null ? <span className="muted">—</span> : <Money value={v} digits={0} />;

/**
 * Колонки кошелька — одни на «Кошельки» и «Сохранённые»: одно и то же число
 * не должно читаться на двух страницах по-разному. `lead` — действие в начале
 * строки, `extra` — колонки в конце (отбор, «Убрать»).
 */
export function walletColumns(
  t: T,
  lead: LedgerColumn<HlWalletRow>[],
  extra: LedgerColumn<HlWalletRow>[] = [],
): LedgerColumn<HlWalletRow>[] {
  const num = (key: keyof HlWalletRow, header: string, render: (r: HlWalletRow) => ReactNode) => ({
    key,
    header,
    align: 'right' as const,
    cellClassName: 'n',
    sortKey: key,
    render,
  });
  return [
    ...lead,
    { key: 'address', header: t('colWallet'), render: (r) => <WalletCell address={r.address} /> },
    num('accountValue', t('colBalance'), (r) => usd(r.accountValue)),
    num('pnlWeek', t('colPnlWeek'), (r) => money(r.pnlWeek)),
    num('pnlMonth', t('colPnlMonth'), (r) => money(r.pnlMonth)),
    num('pnl90', t('colPnl90'), (r) => money(r.pnl90)),
    num('pnlAllTime', t('colPnlAll'), (r) => money(r.pnlAllTime)),
    num('roiMonth', t('colRoi'), (r) =>
      r.roiMonth == null ? (
        '—'
      ) : (
        <span className={r.roiMonth >= 0 ? 'pos' : 'neg'}>{fmtPctSigned(r.roiMonth * 100, 1)}</span>
      ),
    ),
    num('weeksUp', t('colWeeksUp'), (r) => (r.weeksUp == null ? '—' : `${r.weeksUp} / ${r.weeksMoving}`)),
    num('bestWeekShare', t('colBestWeek'), (r) => pct(r.bestWeekShare)),
    num('maxDrawdown', t('colDrawdown'), (r) => pct(r.maxDrawdown)),
    ...extra,
  ];
}
