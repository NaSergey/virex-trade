'use client';

import { useTranslations } from 'next-intl';
import type { LabAgg } from '../api/hooks';
import { formatMoney, moneyClass } from '@/shared/lib/utils/format';
import { Skeleton } from '@/shared/ui/Skeleton';

/**
 * Выборка против базовой линии периода. У каждой величины под ней стоит то же
 * число по всем сделкам и отклонение в процентах — иначе «винрейт 63 %» не
 * значит ничего: он может быть и лучше обычного, и хуже.
 */
export function LabCompare({
  filtered,
  baseline,
  isLoading,
}: {
  filtered?: LabAgg;
  baseline?: LabAgg;
  /** Считаем первую выборку: на месте чисел заглушки, а не прочерки. */
  isLoading?: boolean;
}) {
  const t = useTranslations('analytics');
  const cells = [
    {
      label: t('trades'),
      value: filtered ? String(filtered.trades) : '—',
      base: baseline ? String(baseline.trades) : '—',
      delta: pct(filtered?.trades, baseline?.trades),
      tone: undefined as string | undefined,
    },
    {
      label: t('winrate'),
      value: filtered ? `${filtered.winRate.toFixed(1)} %` : '—',
      base: baseline ? `${baseline.winRate.toFixed(1)} %` : '—',
      delta: pct(filtered?.winRate, baseline?.winRate),
      tone: undefined,
    },
    {
      label: t('netPnl'),
      value: filtered ? formatMoney(filtered.totalPnl) : '—',
      base: baseline ? formatMoney(baseline.totalPnl) : '—',
      delta: pct(filtered?.totalPnl, baseline?.totalPnl),
      tone: filtered ? moneyClass(filtered.totalPnl) : undefined,
    },
    {
      label: t('average'),
      value: filtered ? formatMoney(filtered.avgPnl) : '—',
      base: baseline ? formatMoney(baseline.avgPnl) : '—',
      delta: pct(filtered?.avgPnl, baseline?.avgPnl),
      tone: filtered ? moneyClass(filtered.avgPnl) : undefined,
    },
  ];

  return (
    <div className="cmp" data-tour="lab-compare">
      {cells.map((c) => (
        <div key={c.label}>
          {/* Подписи стоят и во время счёта: они известны заранее и не зависят
              от ответа. Прятать их под заглушку значило бы отнимать у человека
              то, что уже можно прочесть, — какие четыре величины он сравнивает. */}
          <span className="lbl">{c.label}</span>
          <div className={`cmp-v${c.tone ? ` ${c.tone}` : ''}`}>
            {/* Прочерк здесь означает «сделок нет», и во время счёта он врёт:
                выборка ещё не посчитана, а не пуста. */}
            {/* Мерка в пикселях, а не в процентах ячейки: ячейка широкая, а
                значение в ней короткое («14», «63.2 %»), и доля от ячейки
                обещала бы число вчетверо длиннее того, что придёт. */}
            {isLoading ? <Skeleton as="span" flush height={17} width={96} /> : c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Отклонение от базы в процентах; меньше половины процента — не отклонение. */
function pct(value?: number, base?: number): string {
  if (value == null || base == null || base === 0) return '';
  const d = ((value - base) / Math.abs(base)) * 100;
  if (Math.abs(d) < 0.5) return '';
  return ` · ${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(0)} %`;
}
