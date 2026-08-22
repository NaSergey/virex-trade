'use client';

import { useTranslations } from 'next-intl';
import { weekdayLabels, WEEKDAY_ORDER } from '@/shared/lib/utils/period';
import { useLocaleControl } from '@/shared/i18n';
import type { MarketCorrelation } from '../api/market-events-hooks';

/**
 * Доля дней недели, закрывшихся выше открытия, и средний ход.
 *
 * Подпись под таблицей обязательна по смыслу: на выборке в пару сотен дней
 * отклонение от 50 % — намёк, а не закономерность, и без этой оговорки
 * «вторник 57 % рост» читается как торговый сигнал.
 */
export function WeekdayOdds({ corr }: { corr?: MarketCorrelation }) {
  const t = useTranslations('analytics');
  const { locale } = useLocaleControl();
  const WEEKDAY_LABELS = weekdayLabels(locale);

  if (!corr || corr.totalDays === 0) {
    return <p className="muted">{t('noData')}</p>;
  }

  return (
    <>
      {WEEKDAY_ORDER.map((d) => {
        const b = corr.weekday[d];
        const up = (b?.winRateLongPct ?? 0) >= 50;
        return (
          <div className="evt" key={d}>
            <span className="evt-d">{WEEKDAY_LABELS[d]}</span>
            <span className="evt-n n">
              {b?.days ? `${b.winRateLongPct.toFixed(0)} %` : '—'}
              <span className="lbl" style={{ letterSpacing: '.06em' }}>
                {' '}
                {t('growthWord')}
              </span>
            </span>
            <span className={`evt-i ${b?.days ? (up ? 'pos' : 'neg') : ''}`}>
              {b?.days ? `${b.avgChangePct >= 0 ? '+' : '−'}${Math.abs(b.avgChangePct).toFixed(2)} %` : ''}
            </span>
          </div>
        );
      })}
      <p className="foot">{t('weekdayFooterNote', { days: corr.totalDays })}</p>
    </>
  );
}
