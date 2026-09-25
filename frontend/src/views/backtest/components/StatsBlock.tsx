'use client';

import { useTranslations } from 'next-intl';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { SectionHead } from '@/shared/ui/SectionHead';
import type { BacktestStats, TagSummary } from '@/widgets/backtest-session/api/types';
import { formatR } from '@/widgets/backtest-session/lib/money';
import { SummaryCells } from '@/widgets/backtest-session';

/**
 * Итог по всем сессиям и по тегам. Подпись под таблицей тегов обязательна: как
 * и в журнале, сделка идёт целиком каждому своему тегу, и колонка не суммируется.
 * Тренажёр и реальные сессии — раздельно: результат тега на сгенерированном
 * рынке говорит о генераторе, а не о рынке. Переключатель источника стоит не
 * здесь, а выше, в шапке списка сессий (`SessionsList`).
 */
export function StatsBlock({ stats, isLoading }: { stats?: BacktestStats; isLoading: boolean }) {
  const t = useTranslations('backtest');

  const columns: LedgerColumn<TagSummary>[] = [
    { key: 'tag', header: t('colTag'), render: (x) => x.tag.name },
    { key: 'trades', header: t('colTrades'), align: 'right', cellClassName: 'n', render: (x) => x.trades },
    { key: 'win', header: t('colWinRate'), align: 'right', cellClassName: 'n', render: (x) => `${x.winRate.toFixed(0)} %` },
    {
      key: 'r',
      header: t('colTotalR'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => <span className={x.totalR >= 0 ? 'pos' : 'neg'}>{formatR(x.totalR)}</span>,
    },
    { key: 'avg', header: t('colAvgR'), align: 'right', cellClassName: 'n', render: (x) => formatR(x.avgR) },
    { key: 'pnl', header: t('colPnl'), align: 'right', cellClassName: 'n', render: (x) => <Money value={x.pnl} /> },
  ];

  return (
    <section data-tour="bt-stats">
      <SectionHead title={t('statsTitle')} />
      <SummaryCells summary={stats?.overall} sessions={stats?.overall.sessions ?? 0} loading={isLoading} />
      <SectionHead title={t('byTagTitle')} />
      <LedgerTable
        columns={columns}
        rows={stats?.byTag ?? []}
        rowKey={(x) => x.tag.id}
        isLoading={isLoading}
        empty={t('noTagStats')}
      />
      <p className="muted">{t('tagsOverlap')}</p>
    </section>
  );
}
