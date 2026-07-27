'use client';

import { useState } from 'react';
import {
  useMarketData,
  useFearAndGreed,
  useMarketSentiment,
  useVolatility,
} from '@/shared/api/analytics/hooks';
import { StatCard } from '@/shared/ui/StatCard';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { fmtPctSigned } from '@/shared/lib/utils/format';
import { SentimentChart, fmtUsdCompact } from './SentimentChart';
import { EconomicCalendarWeekPanel } from './EconomicCalendarWeekPanel';
import { HourlyVolatilityPanel } from './HourlyVolatilityPanel';

const SYMBOLS = [
  { label: 'BTC', value: 'BTCUSDT' },
  { label: 'ETH', value: 'ETHUSDT' },
  { label: 'SOL', value: 'SOLUSDT' },
];

function fmtMarketCap(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  return `$${v.toFixed(0)}`;
}

function fearGreedColor(v: number): string {
  if (v <= 25) return 'text-down';
  if (v <= 45) return 'text-warn';
  if (v <= 55) return 'text-warn';
  if (v <= 75) return 'text-up';
  return 'text-up';
}

export const AnalyticsPage = () => {
  const [symbol, setSymbol] = useState('BTCUSDT');

  const { data: marketData } = useMarketData();
  const { data: fgData } = useFearAndGreed();
  const { data: sentimentData } = useMarketSentiment(symbol);
  const { data: volData } = useVolatility('BTCUSDT');

  const latestPoint = sentimentData?.points.at(-1);

  return (
    <div className="h-full overflow-y-auto bg-app p-3">
      <div className="mx-auto flex flex-col gap-3">
        {/* Header + symbol selector */}
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-fg">Аналитика</h1>
          <SegmentedControl options={SYMBOLS} value={symbol} onChange={setSymbol} />
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-5 gap-2">
          <StatCard
            label="Рыночная капитализация"
            value={marketData ? fmtMarketCap(marketData.marketCap) : '—'}
            extra={
              marketData && (
                <div
                  className={`mt-0.5 font-mono text-xs ${marketData.marketCapChange24h >= 0 ? 'text-up' : 'text-down'}`}
                >
                  {fmtPctSigned(marketData.marketCapChange24h)} 24h
                </div>
              )
            }
          />

          <StatCard
            label="Fear &amp; Greed"
            value={fgData ? String(fgData.value) : '—'}
            valueClassName={`font-mono text-lg font-semibold ${fgData ? fearGreedColor(fgData.value) : 'text-fg'}`}
            extra={
              fgData && (
                <div className="mt-0.5 text-xs text-muted">{fgData.classification}</div>
              )
            }
          />

          <StatCard
            label="Волатильность BTC (24ч)"
            value={volData ? `${volData.currentVolPct.toFixed(2)}%` : '—'}
            extra={
              volData && (
                <div className={`mt-0.5 font-mono text-xs ${volData.elevated ? 'text-down' : 'text-muted'}`}>
                  {volData.elevated ? '↑ выше среднего' : 'в норме'} · база 7д {volData.avgVolPct.toFixed(2)}%
                </div>
              )
            }
          />

          <StatCard
            label="Объём BTC (24ч)"
            value={volData ? fmtUsdCompact(volData.volume24hUsd) : '—'}
            extra={
              volData && (
                <>
                  <div className={`mt-0.5 font-mono text-xs ${volData.volumeChangePct >= 0 ? 'text-up' : 'text-down'}`}>
                    {fmtPctSigned(volData.volumeChangePct)} к среднему 7д
                  </div>
                  <div
                    className={`mt-0.5 text-[11px] ${
                      volData.dominantSide === 'buy'
                        ? 'text-up'
                        : volData.dominantSide === 'sell'
                          ? 'text-down'
                          : 'text-muted'
                    }`}
                  >
                    {volData.dominantSide === 'buy' && '🟢 перевес в покупку'}
                    {volData.dominantSide === 'sell' && '🔴 перевес в продажу'}
                    {volData.dominantSide === 'neutral' && '⚪ без перевеса'}
                    {' · '}
                    {fmtUsdCompact(volData.buyVolumeUsd)} / {fmtUsdCompact(volData.sellVolumeUsd)}
                  </div>
                </>
              )
            }
          />

          <EconomicCalendarWeekPanel />
        </div>

        <HourlyVolatilityPanel />

        {/* Sentiment chart */}
        <section className="panel flex h-90 flex-col">
          <div className="flex items-center gap-4 border-b border-line px-3 py-2">
            <span className="text-sm font-semibold text-fg">Позиционирование {symbol}</span>
            <div className="flex items-center gap-3 text-[10px] text-muted">
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-up" />
                Лонг {latestPoint ? `${(latestPoint.buyRatio * 100).toFixed(1)}%` : '—'}
              </span>
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-down" />
                Шорт {latestPoint ? `${(latestPoint.sellRatio * 100).toFixed(1)}%` : '—'}
              </span>
              <span title="Открытый интерес — сумма всех открытых позиций по инструменту, в долларах">
                <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: '#818cf8' }} />
                OI {latestPoint && latestPoint.openInterestUsd > 0 ? fmtUsdCompact(latestPoint.openInterestUsd) : ''}
              </span>
            </div>
          </div>
          <div className="min-h-0 flex-1 p-2">
            {sentimentData && sentimentData.points.length > 0 ? (
              <SentimentChart data={sentimentData.points} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                {sentimentData ? 'Нет данных' : 'Загрузка…'}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
