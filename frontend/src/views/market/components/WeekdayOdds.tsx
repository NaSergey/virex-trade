'use client';

import { useTranslations } from 'next-intl';
import { weekdayLabels, WEEKDAY_ORDER } from '@/shared/lib/utils/period';
import { useLocaleControl } from '@/shared/i18n';
import type { MarketCorrelation } from '../api/market-events-hooks';
import { Skeleton } from '@/shared/ui/Skeleton';

/**
 * Доля дней недели, закрывшихся выше открытия, и средний ход.
 *
 * Подпись под таблицей обязательна по смыслу: на выборке в пару сотен дней
 * отклонение от 50 % — намёк, а не закономерность, и без этой оговорки
 * «вторник 57 % рост» читается как торговый сигнал.
 */
export function WeekdayOdds({ corr, isLoading }: { corr?: MarketCorrelation; isLoading?: boolean }) {
  const t = useTranslations('market');
  const { locale } = useLocaleControl();
  const WEEKDAY_LABELS = weekdayLabels(locale);

  /*
   * Пока цифры едут — те же семь строк, и названия дней в них настоящие: какие
   * будут дни, известно до всякого ответа сервера, и заклеивать их полосой
   * значило бы прятать то, что уже можно прочесть. Заглушки стоят только там,
   * где будут числа.
   */
  if (isLoading) {
    return (
      <>
        {WEEKDAY_ORDER.map((d) => (
          <div className="evt" key={d}>
            <span className="evt-d">{WEEKDAY_LABELS[d]}</span>
            <span className="evt-n n">
              <Skeleton as="span" flush height={9} width={54} className="skel-r" />
            </span>
            <span className="evt-i">
              <Skeleton as="span" flush height={9} width={44} className="skel-r" />
            </span>
          </div>
        ))}
        <p className="foot" aria-hidden>
          <Skeleton as="span" flush height={8} width="72%" />
        </p>
      </>
    );
  }

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
