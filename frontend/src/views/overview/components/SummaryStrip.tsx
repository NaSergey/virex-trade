'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { TradeStats } from '@/entities/trade';
import { Skeleton } from '@/shared/ui/Skeleton';
import { formatMoney, formatProfitFactor, moneyClass } from '@/shared/lib/utils/format';

interface Gauge {
  /** Заполнение шкалы, 0..100. */
  fill: number;
  /** Риска порога, 0..100: 50% для винрейта, 1.0 (=33.3) для профит-фактора. */
  threshold: number;
}

interface Metric {
  label: string;
  value: ReactNode;
  tone?: 'pos' | 'neg';
  gauge?: Gauge;
}

/**
 * Шкала с риской порога вместо кольца. Кольцо показывало только «сколько
 * набралось», но не отвечало на главный вопрос — по ту или по эту сторону
 * порога. Здесь порог нарисован холодной риской, а заливка краснеет, если не
 * дотянула до неё: винрейт ниже 50% и профит-фактор ниже 1.0 читаются мгновенно.
 */
function GaugeBar({ fill, threshold }: Gauge) {
  return (
    <span className={`mg${fill < threshold ? ' under' : ''}`}>
      <i style={{ width: `${Math.min(100, Math.max(0, fill)).toFixed(1)}%` }} />
      <b style={{ left: `${threshold.toFixed(1)}%` }} />
    </span>
  );
}

/**
 * Свод периода — девять величин одной строкой, без карточек.
 *
 * Единицы вынесены в подпись («NET P&L · USDT»), поэтому строка значений
 * осталась чисто числовой: в моноширинной сетке цифры выстраиваются по
 * разрядам, и свод читается как столбик в гроссбухе, а не как девять
 * независимых плашек.
 */
export function SummaryStrip({ stats }: { stats: TradeStats }) {
  const t = useTranslations('overview');
  const profitFactor = formatProfitFactor(stats.profitFactor, stats.wins, stats.losses);
  const metrics: Metric[] = [
    { label: 'Net P&L · USDT', value: formatMoney(stats.totalPnl), tone: moneyClass(stats.totalPnl) },
    { label: t('trades'), value: String(stats.totalTrades) },
    {
      label: 'Winrate',
      value: `${stats.winRate.toFixed(1)} %`,
      gauge: { fill: stats.winRate, threshold: 50 },
    },
    {
      label: 'Profit factor',
      value: profitFactor,
      // Шкала до 3.0: выше этого профит-фактор в реальных сериях не держится,
      // а порог 1.0 должен стоять в первой трети, чтобы риска была заметна.
      gauge: { fill: (stats.profitFactor / 3) * 100, threshold: 100 / 3 },
    },
    {
      label: 'W / L',
      value: (
        <>
          {stats.wins}
          <span className="sep"> / </span>
          {stats.losses}
        </>
      ),
    },
    { label: 'Avg trade · USDT', value: formatMoney(stats.avgPnl), tone: moneyClass(stats.avgPnl) },
    { label: 'Fees · USDT', value: formatMoney(-Math.abs(stats.totalFees)) },
    { label: t('best'), value: formatMoney(stats.bestPnl), tone: moneyClass(stats.bestPnl) },
    { label: t('worst'), value: formatMoney(stats.worstPnl), tone: moneyClass(stats.worstPnl) },
  ];

  return (
    <div className="metrics">
      {metrics.map((m) => (
        <div className="mcell" key={m.label}>
          <span className="lbl">{m.label}</span>
          <span className={`mval${m.tone ? ` ${m.tone}` : ''}`}>{m.value}</span>
          {m.gauge ? <GaugeBar {...m.gauge} /> : <span />}
        </div>
      ))}
    </div>
  );
}

/** Скелет свода: те же девять слотов, чтобы шапка не прыгала при загрузке. */
export function SummaryStripSkeleton() {
  return (
    <div className="metrics" aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <div className="mcell" key={i}>
          {/* Высоты — под подпись и под значение: три жёсткие строки .mcell
              должны стоять на своих местах ещё до того, как придут числа. */}
          <Skeleton as="span" flush height={8} width="70%" />
          <Skeleton as="span" flush height={18} width="85%" />
          <span />
        </div>
      ))}
    </div>
  );
}
