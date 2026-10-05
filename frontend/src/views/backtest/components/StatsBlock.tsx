'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/shared/ui/Skeleton';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { SectionHead } from '@/shared/ui/SectionHead';
import type { BacktestStats, TagSummary } from '@/widgets/backtest-session/api/types';
import { formatR } from '@/widgets/backtest-session/lib/money';

/**
 * Итог по всем сессиям и по тегам. Подпись под таблицей тегов обязательна: как
 * и в журнале, сделка идёт целиком каждому своему тегу, и колонка не суммируется.
 * Тренажёр и реальные сессии — раздельно: результат тега на сгенерированном
 * рынке говорит о генераторе, а не о рынке. Переключатель источника стоит не
 * здесь, а выше, в шапке списка сессий (`SessionsList`).
 */
export function StatsBlock({ stats, isLoading }: { stats?: BacktestStats; isLoading: boolean }) {
  const t = useTranslations('backtest');
  const o = stats?.overall;
  const items: [string, ReactNode][] = [
    [t('statSessions'), o?.sessions ?? 0],
    [t('statTrades'), o?.trades ?? 0],
    [t('statWinRate'), `${(o?.winRate ?? 0).toFixed(0)} %`],
    [t('statTotalR'), <span key="r" className={(o?.totalR ?? 0) >= 0 ? 'pos' : 'neg'}>{formatR(o?.totalR ?? 0)}</span>],
    [t('statAvgR'), <span key="a" className={(o?.avgR ?? 0) >= 0 ? 'pos' : 'neg'}>{formatR(o?.avgR ?? 0)}</span>],
  ];

  return (
    <section data-tour="bt-stats">
      <SectionHead title={t('statsTitle')} />
      <div className="bt-sum">
        <div className="bt-sum-hero">
          <span className="lbl">{t('statPnl')}</span>
          <span className="mval">
            {isLoading ? <Skeleton as="span" flush height={34} width={140} /> : <Money value={o?.pnl ?? 0} unit="USDT" />}
          </span>
        </div>
        <dl className="bt-sum-list">
          {items.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{isLoading ? <Skeleton as="span" flush height={16} width={40} /> : value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** Таблица по тегам — отдельным блоком, страница ставит её в самый низ. */
export function TagStatsBlock({ stats, isLoading }: { stats?: BacktestStats; isLoading: boolean }) {
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
    <section>
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
