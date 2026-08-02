'use client';

import type { ReactNode } from 'react';
import { fmtPctSigned } from '@/shared/lib/utils/format';
import { fmtUsdCompact } from './SentimentChart';
import type { FearGreedData, MarketData, VolatilityData } from '../api/hooks';

function fmtMarketCap(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)} T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)} B`;
  return `$${v.toFixed(0)}`;
}

/**
 * Ячейка сводки: подпись, крупное значение и строка уточнения под ним.
 *
 * Уточнение опционально по данным, а не по вкусу: пока цифра не пришла, под
 * прочерком не должно быть строки, которая делает вид, что что-то известно.
 */
function Metric({ label, value, children }: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div>
      <div className="lbl">{label}</div>
      <div className="an-v">{value}</div>
      {children}
    </div>
  );
}

/** Общерыночный фон одной строкой: капитализация, настроение, волатильность, объём. */
export function MarketMetrics({
  marketData,
  fgData,
  volData,
}: {
  marketData?: MarketData;
  fgData?: FearGreedData;
  volData?: VolatilityData;
}) {
  return (
    <div className="an">
      <Metric label="Капитализация" value={marketData ? fmtMarketCap(marketData.marketCap) : '—'}>
        {marketData && (
          <div
            className={`n ${marketData.marketCapChange24h >= 0 ? 'pos' : 'neg'}`}
            style={{ fontSize: 'var(--t-xs)' }}
          >
            {fmtPctSigned(marketData.marketCapChange24h)} за 24 ч
          </div>
        )}
      </Metric>

      <Metric label="Страх и жадность" value={fgData ? fgData.value : '—'}>
        {/* Шкала, а не цветная цифра: 62 само по себе ничего не значит, а
            положение риски между крайностями — значит. */}
        <div className="gauge">{fgData && <i style={{ left: `${fgData.value}%` }} />}</div>
        <div className="lbl" style={{ marginTop: 'var(--s1)' }}>
          {fgData?.classification ?? '—'}
        </div>
      </Metric>

      <Metric
        label="Волатильность · 24 ч"
        value={volData ? `${volData.currentVolPct.toFixed(2)} %` : '—'}
      >
        {volData && (
          <div className="n muted" style={{ fontSize: 'var(--t-xs)' }}>
            база 7 дней {volData.avgVolPct.toFixed(2)} %{' '}
            <span className={volData.elevated ? 'dbt' : undefined}>
              {volData.elevated ? '· выше обычного' : '· в норме'}
            </span>
          </div>
        )}
      </Metric>

      <Metric label="Объём · 24 ч" value={volData ? fmtUsdCompact(volData.volume24hUsd) : '—'}>
        {volData && (
          <div
            className={`n ${volData.dominantSide === 'buy' ? 'pos' : volData.dominantSide === 'sell' ? 'neg' : ''}`}
            style={{ fontSize: 'var(--t-xs)' }}
          >
            {volData.dominantSide === 'buy'
              ? 'перевес покупок'
              : volData.dominantSide === 'sell'
                ? 'перевес продаж'
                : 'без перевеса'}{' '}
            · {fmtPctSigned(volData.volumeChangePct)} к среднему
          </div>
        )}
      </Metric>
    </div>
  );
}
