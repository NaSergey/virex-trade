'use client';

import { useTranslations } from 'next-intl';
import { SentimentChart, fmtUsdCompact } from './SentimentChart';
import type { MarketSentimentData } from '../api/hooks';
import { useLocaleControl } from '@/shared/i18n';

/**
 * Как стоят участники рынка: соотношение лонгов к шортам, открытый интерес и
 * их движение во времени.
 *
 * Три коэффициента и кривая под ними отвечают на один вопрос с двух сторон —
 * «где рынок сейчас» и «как он туда пришёл», — поэтому стоят вместе.
 */
export function Positioning({ data }: { data?: MarketSentimentData }) {
  const t = useTranslations('analytics');
  const { locale } = useLocaleControl();
  const latest = data?.points.at(-1);
  const longShort = latest && latest.sellRatio > 0 ? latest.buyRatio / latest.sellRatio : null;

  return (
    <>
      <div className="coef" style={{ borderTop: 0 }}>
        <div>
          <div className="lbl">Long / Short</div>
          <div className="coef-v">{longShort ? longShort.toFixed(2) : '—'}</div>
        </div>
        <div>
          <div className="lbl">{t('openInterest')}</div>
          <div className="coef-v">
            {latest && latest.openInterestUsd > 0 ? fmtUsdCompact(latest.openInterestUsd, locale) : '—'}
          </div>
        </div>
        <div>
          <div className="lbl">{t('longShare')}</div>
          <div className="coef-v">{latest ? `${(latest.buyRatio * 100).toFixed(1)} %` : '—'}</div>
        </div>
      </div>
      <div style={{ marginTop: 'var(--s3)' }}>
        {data && data.points.length > 1 ? (
          <SentimentChart data={data.points} />
        ) : (
          <p className="muted">{data ? t('noData') : t('loading')}</p>
        )}
      </div>
    </>
  );
}
