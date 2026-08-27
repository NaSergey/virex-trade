'use client';

import { useTranslations } from 'next-intl';
import { SentimentChart, SentimentChartSkeleton, fmtUsdCompact } from './SentimentChart';
import { Skeleton } from '@/shared/ui/Skeleton';
import type { MarketSentimentData } from '../api/hooks';
import { useLocaleControl } from '@/shared/i18n';

/**
 * Как стоят участники рынка: соотношение лонгов к шортам, открытый интерес и
 * их движение во времени.
 *
 * Три коэффициента и кривая под ними отвечают на один вопрос с двух сторон —
 * «где рынок сейчас» и «как он туда пришёл», — поэтому стоят вместе.
 */
export function Positioning({ data, isLoading }: { data?: MarketSentimentData; isLoading?: boolean }) {
  const t = useTranslations('analytics');
  const { locale } = useLocaleControl();
  const latest = data?.points.at(-1);
  const longShort = latest && latest.sellRatio > 0 ? latest.buyRatio / latest.sellRatio : null;

  /*
   * Прочерк в коэффициенте значит «биржа этого не отдала», и во время загрузки
   * он врёт: значение едет, а не отсутствует. Подписи при этом остаются на
   * месте — они известны заранее, и прятать их не за чем.
   */
  const coef = (node: React.ReactNode) =>
    isLoading ? <Skeleton as="span" flush height={16} width="58%" /> : node;

  return (
    <>
      <div className="coef" style={{ borderTop: 0 }}>
        <div>
          <div className="lbl">Long / Short</div>
          <div className="coef-v">{coef(longShort ? longShort.toFixed(2) : '—')}</div>
        </div>
        <div>
          <div className="lbl">{t('openInterest')}</div>
          <div className="coef-v">
            {coef(latest && latest.openInterestUsd > 0 ? fmtUsdCompact(latest.openInterestUsd, locale) : '—')}
          </div>
        </div>
        <div>
          <div className="lbl">{t('longShare')}</div>
          <div className="coef-v">{coef(latest ? `${(latest.buyRatio * 100).toFixed(1)} %` : '—')}</div>
        </div>
      </div>
      <div style={{ marginTop: 'var(--s3)' }}>
        {/* Слово «Загружаю» строкой в одну высоту стояло на месте холста в 180
            единиц: ответ приходил — и вся правая половина страницы прыгала
            вниз. Теперь ожидание держит холст, а строкой осталось только
            настоящее «данных нет». */}
        {isLoading ? (
          <SentimentChartSkeleton />
        ) : data && data.points.length > 1 ? (
          <SentimentChart data={data.points} />
        ) : (
          <p className="muted">{t('noData')}</p>
        )}
      </div>
    </>
  );
}
