'use client';

import { memo, useState } from 'react';
import { useMarketCorrelation, type WeekdayBucket } from '@/shared/api/market-events/hooks';
import { cn } from '@/shared/lib/utils/css';

const PERIODS = [
  { label: '1г', days: 365 },
  { label: '2г', days: 730 },
];

// JS getUTCDay() order is Sun-first; render Mon-first like every RU calendar
// (same convention as TimeStatsSection on the Статистика page).
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']; // indexed by actual weekday number

// Same up/down hex as globals.css (--color-up / --color-down), used at
// varying opacity as a heat scale instead of a bar chart.
const UP_RGB = '46, 189, 133';
const DOWN_RGB = '246, 70, 93';

/** One weekday chip: fill intensity ∝ how far the win-rate sits from a 50/50 coin flip. */
const DayChip = memo(({ b, label }: { b: WeekdayBucket; label: string }) => {
  const hasData = b.days > 0;
  const favoursLong = b.winRateLongPct >= 50;
  const strength = hasData ? Math.min(1, Math.abs(b.winRateLongPct - 50) / 15) : 0;
  const bg = hasData ? `rgba(${favoursLong ? UP_RGB : DOWN_RGB}, ${0.1 + strength * 0.4})` : 'transparent';

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-md border border-line/60 py-1.5"
      style={{ background: bg }}
      title={
        hasData
          ? `${label} · ${b.days} дн. · рост в ${b.winRateLongPct.toFixed(0)}% случаев · сред. ${b.avgChangePct >= 0 ? '+' : ''}${b.avgChangePct.toFixed(2)}%`
          : `${label} · нет данных`
      }
    >
      <span className="text-[9px] font-medium text-muted">{label}</span>
      <span
        className={cn(
          'font-mono text-[11px] font-semibold',
          hasData ? (favoursLong ? 'text-up' : 'text-down') : 'text-subtle',
        )}
      >
        {hasData ? `${b.winRateLongPct.toFixed(0)}%` : '—'}
      </span>
    </div>
  );
});
DayChip.displayName = 'DayChip';

/**
 * Панель вероятностей на все 7 дней недели — чипы с тепловой заливкой
 * (день + винрейт) вместо бар-чарта, читается с одного взгляда. Тот же
 * футпринт, что и у остальных карточек. Период винрейта переключаемый
 * (1г / 2г), так как больше истории не всегда полезнее — по умолчанию 1 год.
 */
export const EconomicCalendarWeekPanel = () => {
  const [days, setDays] = useState(365);
  const { data: corr, isLoading } = useMarketCorrelation(days);
  const hasData = !!corr && corr.totalDays > 0;

  return (
    <div className="rounded-lg border border-line bg-elevated p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] text-muted">Вероятности</span>
        <div className="inline-flex items-center gap-0.5 rounded-md border border-line bg-app p-0.5 text-[10px]">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={cn(
                'cursor-pointer rounded px-1.5 py-0.5 font-medium transition-colors',
                days === p.days ? 'bg-elevated-2 text-fg' : 'text-muted hover:text-fg',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {hasData ? (
        <div className="flex gap-1 items-end">
          {WEEKDAY_ORDER.map((d) => (
            <DayChip key={d} b={corr.weekday[d]} label={WEEKDAY_LABELS[d]} />
          ))}
        </div>
      ) : (
        <div className="flex h-11 items-center justify-center text-xs text-muted">
          {isLoading ? 'Загрузка…' : 'нет данных'}
        </div>
      )}
    </div>
  );
};
