'use client';

import { useTranslations } from 'next-intl';
import { weekdayLabels, WEEKDAY_ORDER } from '@/shared/lib/utils/period';
import { useLocaleControl } from '@/shared/i18n';
import type { MarketCorrelation, WeekdayBucket } from '../api/market-events-hooks';
import { Skeleton } from '@/shared/ui/Skeleton';

/**
 * Доля дней недели, закрывшихся выше открытия, и средний ход — тем же
 * рядом, что и дни недели на «Обзоре» (`WeekdayRows`/`.wk-list`): строка на
 * день, полоса растёт от центральной риски. Там риска — ноль P&L, здесь —
 * 50 % (монета нейтральна); левее риски — доля дней ниже половины, правее —
 * выше. Значение и знак видны без наведения, тем же языком, что и везде в
 * продукте.
 *
 * Подпись под строками обязательна по смыслу: на выборке в пару сотен дней
 * отклонение от 50 % — намёк, а не закономерность, и без этой оговорки
 * «вторник 57 % рост» читается как торговый сигнал.
 */
export function WeekdayOdds({ corr, isLoading }: { corr?: MarketCorrelation; isLoading?: boolean }) {
  const t = useTranslations('market');
  const { locale } = useLocaleControl();
  const WEEKDAY_LABELS = weekdayLabels(locale);

  /*
   * Пока цифры едут — те же семь строк с настоящими днями и центральной
   * риской, без полосы: сторона и длина — это и есть ответ, которого ещё
   * нет, и придумывать его нельзя (тот же приём, что у WeekdayRowsSkeleton).
   */
  if (isLoading) {
    return (
      <>
        <div className="wk-list" aria-hidden>
          {WEEKDAY_ORDER.map((d) => (
            <div className="wk" key={d}>
              <span className="lbl">{WEEKDAY_LABELS[d]}</span>
              <span className="wk-t">
                <i className="wk-z" />
              </span>
              <Skeleton as="span" flush height={9} width={54} className="skel-r" />
              <Skeleton as="span" flush height={8} width={44} className="skel-r" />
            </div>
          ))}
        </div>
        <p className="foot" aria-hidden>
          <Skeleton as="span" flush height={8} width="72%" />
        </p>
        <p className="foot" aria-hidden>
          <Skeleton as="span" flush height={8} width="54%" />
        </p>
      </>
    );
  }

  if (!corr || corr.totalDays === 0) {
    return <p className="muted">{t('noData')}</p>;
  }

  /*
   * Края недели — словами под таблицей, а не отдельным блоком сбоку: строк
   * всего семь, но «какой день чаще всех рос» из семи полос глазом не берётся,
   * пока их не сравнишь попарно. Оговорка о размере выборки стоит абзацем выше
   * и относится к этой строке ровно так же — потому они и рядом.
   */
  const measured = WEEKDAY_ORDER.map((d) => ({ d, b: corr.weekday[d] })).filter(
    (x): x is { d: number; b: WeekdayBucket } => Boolean(x.b?.days),
  );
  const best = measured.length
    ? measured.reduce((a, b) => (b.b.winRateLongPct > a.b.winRateLongPct ? b : a))
    : null;
  const worst = measured.length
    ? measured.reduce((a, b) => (b.b.winRateLongPct < a.b.winRateLongPct ? b : a))
    : null;

  return (
    <>
      <div className="wk-list" data-tour="market-weekday">
        {WEEKDAY_ORDER.map((d) => {
          const b = corr.weekday[d];
          const rate = b?.days ? b.winRateLongPct : null;
          const up = rate != null && rate >= 50;
          // Длина полосы — отклонение от нейтральных 50%, не сам процент:
          // 50% значило бы «полная полоса», хотя это и есть «ничего не
          // произошло». Та же логика, что у wk-f на Обзоре (там — доля от
          // максимума |PnL| дня, здесь — доля от максимума отклонения).
          const width = rate != null ? Math.min(50, Math.abs(rate - 50)) : 0;
          return (
            <div className="wk" key={d}>
              <span className="lbl">{WEEKDAY_LABELS[d]}</span>
              <span className="wk-t">
                <i className="wk-z" />
                {rate != null && (
                  <i
                    className="wk-f"
                    style={{
                      left: up ? '50%' : undefined,
                      right: up ? undefined : '50%',
                      width: `${width.toFixed(1)}%`,
                      background: up ? 'var(--color-up)' : 'var(--color-down)',
                    }}
                  />
                )}
              </span>
              <span className={`wk-v${rate != null ? ` ${up ? 'pos' : 'neg'}` : ''}`}>
                {rate != null ? `${rate.toFixed(0)} %` : '—'}
              </span>
              <span className="wk-s">
                {b?.days ? `${b.avgChangePct >= 0 ? '+' : '−'}${Math.abs(b.avgChangePct).toFixed(2)} %` : t('noData')}
              </span>
            </div>
          );
        })}
      </div>
      <p className="foot">{t('weekdayFooterNote', { days: corr.totalDays })}</p>
      {best && worst && best.d !== worst.d && (
        <p className="foot">
          {t('weekdayExtremes', {
            best: WEEKDAY_LABELS[best.d],
            bestPct: best.b.winRateLongPct.toFixed(0),
            worst: WEEKDAY_LABELS[worst.d],
            worstPct: worst.b.winRateLongPct.toFixed(0),
          })}
        </p>
      )}
    </>
  );
}
