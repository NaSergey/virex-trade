'use client';

import { useTranslations } from 'next-intl';
import { useLocaleControl } from '@/shared/i18n';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { SectionHead } from '@/shared/ui/SectionHead';
import type { SessionListItem } from '../api/types';
import { formatR } from '../lib/money';

/**
 * Сессии, свежие сверху. Дата в первой колонке — когда сессия создана, а не
 * какой отрезок в ней: отрезок раскрывается только в итоге завершённой.
 */
export function SessionsList({
  sessions,
  isLoading,
  onOpen,
}: {
  sessions: SessionListItem[];
  isLoading: boolean;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations('backtest');
  const { locale } = useLocaleControl();
  const intl = locale === 'en' ? 'en-US' : 'ru-RU';

  const columns: LedgerColumn<SessionListItem>[] = [
    {
      key: 'started',
      header: t('colStarted'),
      render: (s) => new Date(s.createdAt).toLocaleDateString(intl, { day: 'numeric', month: 'short', year: 'numeric' }),
    },
    { key: 'status', header: t('colStatus'), render: (s) => t(`status.${s.status}`) },
    { key: 'trades', header: t('colTrades'), align: 'right', cellClassName: 'n', render: (s) => s.summary.trades },
    {
      key: 'win',
      header: t('colWinRate'),
      align: 'right',
      cellClassName: 'n',
      render: (s) => (s.summary.trades ? `${s.summary.winRate.toFixed(0)} %` : '—'),
    },
    {
      key: 'r',
      header: t('colTotalR'),
      align: 'right',
      cellClassName: 'n',
      render: (s) => <span className={s.summary.totalR >= 0 ? 'pos' : 'neg'}>{formatR(s.summary.totalR)}</span>,
    },
    { key: 'pnl', header: t('colPnl'), align: 'right', cellClassName: 'n', render: (s) => <Money value={s.summary.pnl} /> },
    {
      key: 'blind',
      header: t('colBlind'),
      render: (s) =>
        [s.dataSource === 'synthetic' ? t('syntheticTag') : s.hideDate && t('blindDate'), s.hidePrice && t('blindPrice')]
          .filter(Boolean)
          .join(', ') || <span className="muted">—</span>,
    },
    {
      key: 'action',
      noSkeleton: true,
      render: (s) => (
        <Button tight onClick={() => onOpen(s.id)}>
          {s.status === 'active' ? t('continue') : t('open')}
        </Button>
      ),
    },
  ];

  return (
    <section>
      <SectionHead title={t('sessionsTitle')} />
      <LedgerTable
        columns={columns}
        rows={sessions}
        rowKey={(s) => s.id}
        isLoading={isLoading}
        empty={<EmptyState title={t('noSessions')}>{t('noSessionsHint')}</EmptyState>}
      />
    </section>
  );
}
