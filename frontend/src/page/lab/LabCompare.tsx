'use client';

import type { LabAgg } from '@/shared/api/lab/hooks';
import { MIN_N } from '@/shared/lib/utils/confidence';
import { formatMoney, formatProfitFactor, moneyClass } from '@/shared/lib/utils/format';

/**
 * Выборка против базовой линии периода. У каждой величины под ней стоит то же
 * число по всем сделкам и отклонение в процентах — иначе «винрейт 63 %» не
 * значит ничего: он может быть и лучше обычного, и хуже.
 */
export function LabCompare({ filtered, baseline }: { filtered?: LabAgg; baseline?: LabAgg }) {
  const cells = [
    {
      label: 'Сделок',
      value: filtered ? String(filtered.trades) : '—',
      base: baseline ? String(baseline.trades) : '—',
      delta: pct(filtered?.trades, baseline?.trades),
      tone: undefined as string | undefined,
    },
    {
      label: 'Винрейт',
      value: filtered ? `${filtered.winRate.toFixed(1)} %` : '—',
      base: baseline ? `${baseline.winRate.toFixed(1)} %` : '—',
      delta: pct(filtered?.winRate, baseline?.winRate),
      tone: undefined,
    },
    {
      label: 'Чистый P&L',
      value: filtered ? formatMoney(filtered.totalPnl) : '—',
      base: baseline ? formatMoney(baseline.totalPnl) : '—',
      delta: pct(filtered?.totalPnl, baseline?.totalPnl),
      tone: filtered ? moneyClass(filtered.totalPnl) : undefined,
    },
    {
      label: 'Средняя',
      value: filtered ? formatMoney(filtered.avgPnl) : '—',
      base: baseline ? formatMoney(baseline.avgPnl) : '—',
      delta: pct(filtered?.avgPnl, baseline?.avgPnl),
      tone: filtered ? moneyClass(filtered.avgPnl) : undefined,
    },
  ];

  return (
    <>
      <div className="cmp">
        {cells.map((c) => (
          <div key={c.label}>
            <span className="lbl">{c.label}</span>
            <div className={`cmp-v${c.tone ? ` ${c.tone}` : ''}`}>{c.value}</div>
            <div className="cmp-b">
              база {c.base}
              {c.delta}
            </div>
          </div>
        ))}
      </div>

      <p className="foot">
        {filtered && filtered.trades > 0 && filtered.trades < MIN_N ? (
          <>
            <b>†</b> В выборке меньше {MIN_N} сделок — это кандидат на закономерность, а не закономерность.
            Нижняя граница винрейта при 95 %: <span className="n">≥ {filtered.wilsonLow.toFixed(1)} %</span>.
          </>
        ) : filtered ? (
          <>
            Профит-фактор выборки{' '}
            <span className="n">{formatProfitFactor(filtered.profitFactor, filtered.wins, filtered.losses)}</span>{' '}
            против <span className="n">{baseline ? formatProfitFactor(baseline.profitFactor, baseline.wins, baseline.losses) : '—'}</span> по
            всем сделкам · винрейт не ниже <span className="n">{filtered.wilsonLow.toFixed(1)} %</span> при 95 %
            доверии · <span className="n">{filtered.wins}</span> прибыльных против{' '}
            <span className="n">{filtered.losses}</span> убыточных.
          </>
        ) : null}
      </p>
    </>
  );
}

/** Отклонение от базы в процентах; меньше половины процента — не отклонение. */
function pct(value?: number, base?: number): string {
  if (value == null || base == null || base === 0) return '';
  const d = ((value - base) / Math.abs(base)) * 100;
  if (Math.abs(d) < 0.5) return '';
  return ` · ${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(0)} %`;
}
