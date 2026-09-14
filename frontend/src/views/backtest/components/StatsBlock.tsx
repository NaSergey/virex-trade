'use client';

import { useTranslations } from 'next-intl';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { SectionHead } from '@/shared/ui/SectionHead';
import { Seg, type SegOption } from '@/shared/ui/Seg';
import type { BacktestStats, DataSource, TagSummary } from '../api/types';
import { formatR } from '../lib/money';
import { SummaryCells } from './SummaryCells';

/**
 * Итог по всем сессиям и по тегам. Подпись под таблицей тегов обязательна: как
 * и в журнале, сделка идёт целиком каждому своему тегу, и колонка не суммируется.
 * Тренажёр и реальные сессии — раздельно: результат тега на сгенерированном
 * рынке говорит о генераторе, а не о рынке.
 */
export function StatsBlock({
  stats,
  isLoading,
  source,
  onSource,
}: {
  stats?: BacktestStats;
  isLoading: boolean;
  source: DataSource;
  onSource: (source: DataSource) => void;
}) {
  const t = useTranslations('backtest');
  const sources: SegOption<DataSource>[] = [
    { value: 'real', label: t('statsReal') },
    { value: 'synthetic', label: t('statsSynthetic') },
  ];

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
    <section>
      <SectionHead title={t('statsTitle')}>
        <Seg options={sources} value={source} onChange={onSource} ariaLabel={t('statsSource')} />
      </SectionHead>
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
