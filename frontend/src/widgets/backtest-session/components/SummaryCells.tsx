'use client';

import { useTranslations } from 'next-intl';
import { MetricCell } from '@/shared/ui/MetricCell';
import { Money } from '@/shared/ui/Money';
import type { Summary } from '../api/types';
import { formatR } from '../lib/money';

/** Итог набора сделок — один и тот же для сессии и для всех сессий сразу. */
export function SummaryCells({
  summary,
  maxDrawdownPct,
  sessions,
  loading,
}: {
  summary?: Summary;
  /** Только у одной сессии: у разных сессий разные депозиты, общей кривой нет. */
  maxDrawdownPct?: number;
  sessions?: number;
  loading?: boolean;
}) {
  const t = useTranslations('backtest');
  const totalR = summary?.totalR ?? 0;
  const avgR = summary?.avgR ?? 0;
  return (
    <div className="metrics metrics-3">
      {sessions != null && <MetricCell label={t('statSessions')} value={sessions} loading={loading} />}
      <MetricCell label={t('statTrades')} value={summary?.trades ?? 0} loading={loading} />
      <MetricCell label={t('statWinRate')} value={`${(summary?.winRate ?? 0).toFixed(0)} %`} loading={loading} />
      <MetricCell
        label={t('statTotalR')}
        hint={t('rHint')}
        value={formatR(totalR)}
        tone={totalR >= 0 ? 'pos' : 'neg'}
        loading={loading}
      />
      <MetricCell label={t('statAvgR')} value={formatR(avgR)} tone={avgR >= 0 ? 'pos' : 'neg'} loading={loading} />
      <MetricCell label={t('statPnl')} value={<Money value={summary?.pnl ?? 0} unit="USDT" />} loading={loading} />
      {maxDrawdownPct != null && (
        <MetricCell label={t('statMaxDd')} value={`${maxDrawdownPct.toFixed(1)} %`} loading={loading} />
      )}
    </div>
  );
}
