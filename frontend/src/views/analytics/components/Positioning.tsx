'use client';

import { SentimentChart, fmtUsdCompact } from './SentimentChart';
import type { MarketSentimentData } from '../api/hooks';

/**
 * Как стоят участники рынка: соотношение лонгов к шортам, открытый интерес и
 * их движение во времени.
 *
 * Три коэффициента и кривая под ними отвечают на один вопрос с двух сторон —
 * «где рынок сейчас» и «как он туда пришёл», — поэтому стоят вместе.
 */
export function Positioning({ data }: { data?: MarketSentimentData }) {
  const latest = data?.points.at(-1);
  const longShort = latest && latest.sellRatio > 0 ? latest.buyRatio / latest.sellRatio : null;

  return (
    <>
      <h2>Позиционирование участников</h2>
      <div className="coef" style={{ borderTop: 0 }}>
        <div>
          <div className="lbl">Long / Short</div>
          <div className="coef-v">{longShort ? longShort.toFixed(2) : '—'}</div>
        </div>
        <div>
          <div className="lbl">Открытый интерес</div>
          <div className="coef-v">
            {latest && latest.openInterestUsd > 0 ? fmtUsdCompact(latest.openInterestUsd) : '—'}
          </div>
        </div>
        <div>
          <div className="lbl">Доля лонгов</div>
          <div className="coef-v">{latest ? `${(latest.buyRatio * 100).toFixed(1)} %` : '—'}</div>
        </div>
      </div>
      <div style={{ marginTop: 'var(--s3)' }}>
        {data && data.points.length > 1 ? (
          <SentimentChart data={data.points} />
        ) : (
          <p className="muted">{data ? 'Нет данных' : 'Загрузка…'}</p>
        )}
      </div>
    </>
  );
}
