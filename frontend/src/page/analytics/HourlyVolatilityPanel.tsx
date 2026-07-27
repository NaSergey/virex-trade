'use client';

import { memo, useState } from 'react';
import { useHourlyStats, type HourlyBucket } from '@/shared/api/market-events/hooks';
import { cn } from '@/shared/lib/utils/css';

const PERIODS = [
  { label: '1г', days: 365 },
  { label: '2г', days: 730 },
];

/**
 * Столбик высотой = волатильность (тот же язык, что у Column в
 * TimeStatsSection на странице Статистики — «когда лучше торгуется»).
 * Раньше волатильность кодировалась цветом фона чипа — на узком диапазоне
 * (0.48–1.02%) все чипы сливались в одинаковый бурый цвет, а амбер-текст
 * поверх амбер-фона было не прочитать. Высота столбика читается однозначно
 * даже при небольшой разнице значений.
 *
 * Винрейт-направление НЕ красит сам столбик — у BTC он в этой выборке везде
 * около 44–56%, то есть статистически почти монетка; красить бы им большой
 * заметный элемент значило бы преувеличивать слабый сигнал. Он идёт мелкой
 * подписью под часом, зелёным/красным, как второстепенный намёк, а не факт.
 */
const HourBar = memo(({ b, maxVol }: { b: HourlyBucket; maxVol: number }) => {
  const hasData = b.samples > 0;
  const heightPct = hasData && maxVol > 0 ? Math.max(6, (b.avgVolatilityPct / maxVol) * 100) : 0;
  const favoursLong = b.winRateLongPct >= 50;

  return (
    <div className="group relative flex min-w-0 flex-1 flex-col items-center gap-1">
      {/* Свой тултип вместо нативного title — тот всплывает только после
          браузерной задержки (~1с), а этот появляется сразу по group-hover. */}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden w-max max-w-40 -translate-x-1/2 rounded-md border border-line bg-surface px-2 py-1 text-[10px] leading-4 whitespace-nowrap text-fg shadow-(--shadow-high) group-hover:block">
        {hasData
          ? `${String(b.hour).padStart(2, '0')}:00 UTC · волатильность ${b.avgVolatilityPct.toFixed(2)}% · рост в ${b.winRateLongPct.toFixed(0)}% случаев (n=${b.samples})`
          : `${String(b.hour).padStart(2, '0')}:00 UTC · нет данных`}
      </div>
      <div className="flex h-16 w-full items-end justify-center border-b border-line-strong/60">
        <div
          className={cn(
            'w-full max-w-3.5 rounded-t-sm transition-opacity group-hover:opacity-80',
            hasData ? 'bg-warn/75' : 'h-0.5 bg-line',
          )}
          style={hasData ? { height: `${heightPct}%` } : undefined}
        />
      </div>
      <span className="text-[9px] text-subtle">{String(b.hour).padStart(2, '0')}</span>
      <span className={cn('text-[8.5px]', hasData ? (favoursLong ? 'text-up' : 'text-down') : 'text-subtle')}>
        {hasData ? `${b.winRateLongPct.toFixed(0)}%` : '—'}
      </span>
    </div>
  );
});
HourBar.displayName = 'HourBar';

/**
 * По какому часу (UTC) BTC обычно трясёт сильнее всего — 24 столбика
 * волатильности (диапазон свечи), с винрейтом роста мелкой подписью снизу.
 * Тот же принцип, что у EconomicCalendarWeekPanel («Вероятности»), только
 * по часам суток, а не по дням недели, и с сигналом волатильности, которого
 * у дневной панели нет.
 */
export const HourlyVolatilityPanel = () => {
  const [days, setDays] = useState(365);
  const { data, isLoading } = useHourlyStats(days);
  const hourly = data?.hourly ?? [];
  const hasData = hourly.some((b) => b.samples > 0);
  const maxVol = Math.max(0, ...hourly.map((b) => b.avgVolatilityPct));
  const hottest = hasData ? [...hourly].sort((a, b) => b.avgVolatilityPct - a.avgVolatilityPct)[0] : null;

  return (
    <section className="panel flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-fg">Волатильность по часам (UTC)</span>
          {hottest && (
            <span className="text-[11px] text-muted">
              горячий час: {String(hottest.hour).padStart(2, '0')}:00 · {hottest.avgVolatilityPct.toFixed(2)}%
              диапазон
            </span>
          )}
        </div>
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
        <div className="flex items-end gap-1">
          {hourly.map((b) => (
            <HourBar key={b.hour} b={b} maxVol={maxVol} />
          ))}
        </div>
      ) : (
        <div className="flex h-16 items-center justify-center text-xs text-muted">
          {isLoading ? 'Загрузка…' : 'Нет данных — почасовой синк ещё не набрал историю.'}
        </div>
      )}
    </section>
  );
};
