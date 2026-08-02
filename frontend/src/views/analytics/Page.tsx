'use client';

import { useState } from 'react';
import { useMarketData, useFearAndGreed, useMarketSentiment, useVolatility } from './api/hooks';
import { useHourlyStats, useMarketCorrelation } from './api/market-events-hooks';
import { Wrap } from '@/shared/ui/Wrap';
import { Seg } from '@/shared/ui/Seg';
import { PageHead } from '@/shared/ui/PageHead';
import { SectionHead } from '@/shared/ui/SectionHead';
import { MarketMetrics } from './components/MarketMetrics';
import { Positioning } from './components/Positioning';
import { HourlyVolatility } from './components/HourlyVolatility';
import { WeekdayOdds } from './components/WeekdayOdds';

const SYMBOLS = [
  { value: 'BTCUSDT', label: 'BTC' },
  { value: 'ETHUSDT', label: 'ETH' },
  { value: 'SOLUSDT', label: 'SOL' },
];

const HISTORY = [
  { value: 365, label: '1 год' },
  { value: 730, label: '2 года' },
];

/**
 * Рынок: общий фон, к вашим сделкам не привязанный. Сказано это прямо в
 * подзаголовке — иначе страница со статистикой рядом со страницами со
 * статистикой читается как «моя статистика», и «винрейт роста 62 %» можно
 * принять за свой.
 *
 * Два переключателя наверху страницы, а не внутри блоков: инструмент и глубина
 * истории задают, о чём вообще идёт речь ниже.
 */
export const AnalyticsPage = () => {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [historyDays, setHistoryDays] = useState(365);

  const { data: marketData } = useMarketData();
  const { data: fgData } = useFearAndGreed();
  const { data: sentimentData } = useMarketSentiment(symbol);
  const { data: volData } = useVolatility(symbol);
  const { data: hourly } = useHourlyStats(historyDays);
  const { data: corr } = useMarketCorrelation(historyDays);

  return (
    <Wrap page>
      <PageHead title="Рынок" lede="Общерыночный фон. К вашим сделкам не привязан.">
        <Seg options={SYMBOLS} value={symbol} onChange={setSymbol} ariaLabel="Инструмент" />
      </PageHead>

      <MarketMetrics marketData={marketData} fgData={fgData} volData={volData} />

      <div className="asym" style={{ marginTop: 'var(--s5)' }}>
        <div>
          <Positioning data={sentimentData} />

          <SectionHead title="Волатильность по часам · UTC" style={{ marginTop: 'var(--s5)' }}>
            <Seg options={HISTORY} value={historyDays} onChange={setHistoryDays} ariaLabel="Глубина истории" />
          </SectionHead>
          <HourlyVolatility hours={hourly?.hourly ?? []} />
        </div>

        <aside className="marg">
          <h2>Вероятности по дням недели</h2>
          <WeekdayOdds corr={corr} />
        </aside>
      </div>
    </Wrap>
  );
};
