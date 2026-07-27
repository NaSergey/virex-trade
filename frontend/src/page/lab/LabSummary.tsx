'use client';

import { StatCard } from '@/shared/ui/StatCard';
import { formatPnl, formatProfitFactor, pnlColor } from '@/shared/lib/utils/format';
import type { LabAgg } from '@/shared/api/lab/hooks';
import { MIN_N } from './constants';

const valueClass = (color: string) => `font-mono text-lg font-semibold ${color}`;
const pf = (a?: LabAgg) => (a ? formatProfitFactor(a.profitFactor, a.wins, a.losses) : '—');

/** Сводка выборки против базовой линии периода — пять карточек над графиком. */
export function LabSummary({ filtered, baseline }: { filtered?: LabAgg; baseline?: LabAgg }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard
        label={`Сделок (всего ${baseline?.trades ?? '—'})`}
        value={filtered ? String(filtered.trades) : '—'}
        extra={
          // Всегда занимает своё место — меняется только видимость, чтобы карточка
          // не «прыгала» по высоте при каждом клике по фильтру (мало данных — не вывод).
          <div
            className={`mt-0.5 text-[10px] leading-tight text-warn ${
              filtered && filtered.trades > 0 && filtered.trades < MIN_N ? '' : 'invisible'
            }`}
            title={`В выборке меньше ${MIN_N} сделок — это кандидат на закономерность, а не закономерность. Собери больше сделок, прежде чем делать выводы.`}
          >
            мало данных (&lt; {MIN_N})
          </div>
        }
      />
      <StatCard
        label="P&L выборки"
        value={filtered ? `${formatPnl(filtered.totalPnl)} USDT` : '—'}
        valueClassName={valueClass(filtered ? pnlColor(filtered.totalPnl) : 'text-muted')}
      />
      <StatCard
        label="Винрейт"
        value={filtered ? `${filtered.winRate}%` : '—'}
        valueClassName={valueClass(filtered && filtered.winRate >= 50 ? 'text-up' : 'text-fg')}
        extra={
          <div
            className="mt-0.5 font-mono text-[11px] text-muted"
            title="Нижняя граница винрейта (95% доверие, поправка Уилсона на размер выборки) — консервативная оценка: чем меньше сделок, тем сильнее она просядет от сырого винрейта."
          >
            {filtered ? `≥${filtered.wilsonLow}% консервативно` : '—'}
          </div>
        }
      />
      <StatCard
        label={`Профит-фактор (все: ${pf(baseline)})`}
        value={pf(filtered)}
        valueClassName={valueClass(
          filtered && filtered.trades > 0 && (filtered.losses === 0 || filtered.profitFactor >= 1)
            ? 'text-up'
            : 'text-down',
        )}
      />
      <StatCard
        label="Средняя сделка"
        value={filtered ? `${formatPnl(filtered.avgPnl)} USDT` : '—'}
        valueClassName={valueClass(filtered ? pnlColor(filtered.avgPnl) : 'text-muted')}
      />
    </div>
  );
}
