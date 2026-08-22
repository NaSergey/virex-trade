'use client';

import { useTranslations } from 'next-intl';
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
  const t = useTranslations('analytics');
  const maxVol = Math.max(0, ...hours.map((b) => b.avgVolatilityPct));
  const hottest =
    hours.length > 0 ? [...hours].sort((a, b) => b.avgVolatilityPct - a.avgVolatilityPct)[0] : null;

  if (!hottest) {
    return <p className="muted">{t('noHourlyData')}</p>;
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
                ? t('hourTooltip', {
                    hour: hh(b.hour),
                    vol: b.avgVolatilityPct.toFixed(2),
                    winRate: b.winRateLongPct.toFixed(0),
                    samples: b.samples,
                  })
                : t('hourTooltipEmpty', { hour: hh(b.hour) })
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
        {t('hottestHourNote', { hour: hh(hottest.hour), vol: hottest.avgVolatilityPct.toFixed(2) })}
      </p>
    </>
  );
}
