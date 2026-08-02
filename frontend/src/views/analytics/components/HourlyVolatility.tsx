'use client';

import type { HourlyBucket } from '../api/market-events-hooks';

const hh = (hour: number) => String(hour).padStart(2, '0');

/**
 * Средний ход свечи по часам UTC — столбиками, высотой в долю от самого
 * горячего часа.
 *
 * Высота означает величину хода, а не направление: час может быть одинаково
 * бурным на росте и на падении, и красить столбик в цвет прибыли/убытка здесь
 * значило бы утверждать то, чего в данных нет. Об этом сказано и подписью.
 */
export function HourlyVolatility({ hours }: { hours: HourlyBucket[] }) {
  const maxVol = Math.max(0, ...hours.map((b) => b.avgVolatilityPct));
  const hottest =
    hours.length > 0 ? [...hours].sort((a, b) => b.avgVolatilityPct - a.avgVolatilityPct)[0] : null;

  if (!hottest) {
    return <p className="muted">Нет данных — почасовой синк ещё не набрал историю.</p>;
  }

  return (
    <>
      <div className="hrs">
        {hours.map((b) => (
          <span
            className="hr"
            key={b.hour}
            style={{ height: `${maxVol > 0 ? ((b.avgVolatilityPct / maxVol) * 100).toFixed(0) : 0}%` }}
            title={
              b.samples > 0
                ? `${hh(b.hour)}:00 — ход свечи ${b.avgVolatilityPct.toFixed(2)} %, рост в ${b.winRateLongPct.toFixed(0)} % случаев (n=${b.samples})`
                : `${hh(b.hour)}:00 — нет данных`
            }
          >
            <b style={{ height: '100%', opacity: (0.3 + (b.avgVolatilityPct / (maxVol || 1)) * 0.7).toFixed(2) }} />
          </span>
        ))}
      </div>
      <div className="hrs-x">
        {hours.map((b) => (
          <span key={b.hour}>{b.hour % 3 === 0 ? hh(b.hour) : ''}</span>
        ))}
      </div>
      <p className="foot">
        Горячий час: {hh(hottest.hour)}:00 UTC — средний ход свечи {hottest.avgVolatilityPct.toFixed(2)} %.
        Высота столбика — ход свечи, а не направление.
      </p>
    </>
  );
}
