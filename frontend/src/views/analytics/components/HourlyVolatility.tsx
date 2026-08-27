'use client';

import { useTranslations } from 'next-intl';
import type { HourlyBucket } from '../api/market-events-hooks';
import { Skeleton } from '@/shared/ui/Skeleton';

const hh = (hour: number) => String(hour).padStart(2, '0');

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/**
 * Высоты столбиков-заглушек: постоянный ряд, а не ровная полоса и не случайные
 * числа. Ровный ряд одной высоты читается как готовый ответ «во все часы
 * одинаково» — то есть как утверждение о рынке, которого мы ещё не знаем;
 * случайные пересобирались бы на каждом рендере и полоса дрожала бы.
 */
const HOUR_SKELETON = [
  22, 18, 15, 13, 15, 19, 26, 33, 41, 47, 52, 49, 44, 40, 45, 50, 54, 49, 42, 36, 32, 28, 25, 23,
];

/**
 * Средний ход свечи по часам UTC — столбиками, высотой в долю от самого
 * горячего часа.
 *
 * Высота означает величину хода, а не направление: час может быть одинаково
 * бурным на росте и на падении, и красить столбик в цвет прибыли/убытка здесь
 * значило бы утверждать то, чего в данных нет. Об этом сказано и подписью.
 */
export function HourlyVolatility({ hours, isLoading }: { hours: HourlyBucket[]; isLoading?: boolean }) {
  const t = useTranslations('analytics');
  const maxVol = Math.max(0, ...hours.map((b) => b.avgVolatilityPct));
  const hottest =
    hours.length > 0 ? [...hours].sort((a, b) => b.avgVolatilityPct - a.avgVolatilityPct)[0] : null;

  // Ожидание — не то же самое, что «за два года не набралось ни часа»: пустой
  // массив приходит и в том, и в другом случае, а строчка «данных нет» на месте
  // полосы в 88 px сжимала блок и уводила подпись под ним вверх.
  if (isLoading) return <HourlyVolatilitySkeleton />;

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

/**
 * Полоса часов, пока замеры едут.
 *
 * Высоты берутся из постоянного ряда (HOUR_SKELETON): полоса читается как
 * полоса, а не как сплошная плашка, и при этом не выдаёт себя за ответ —
 * настоящий профиль волатильности пересчитывается по данным и с этим рядом не
 * совпадёт.
 *
 * Шкала часов под полосой остаётся настоящей: 00, 03, 06 известны заранее и от
 * ответа сервера не зависят.
 */
function HourlyVolatilitySkeleton() {
  return (
    <>
      <div className="hrs" aria-hidden>
        {HOUR_SKELETON.map((h, i) => (
          <span className="hr" key={i} style={{ height: `${h}%` }}>
            <Skeleton as="span" flush height="100%" />
          </span>
        ))}
      </div>
      <div className="hrs-x" aria-hidden>
        {HOURS.map((h) => (
          <span key={h}>{h % 3 === 0 ? hh(h) : ''}</span>
        ))}
      </div>
      {/* Место подписи о самом горячем часе: строка под полосой есть и в
          готовом блоке, и без неё «Позиционирование» слева и «Волатильность»
          справа расходятся по высоте ровно на её высоту. */}
      <p className="foot" aria-hidden>
        <Skeleton as="span" flush height={8} width="46%" />
      </p>
    </>
  );
}
