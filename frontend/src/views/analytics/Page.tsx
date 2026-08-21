'use client';

import { useState } from 'react';
import { useMarketSentiment } from './api/hooks';
import { useHourlyStats, useMarketCorrelation } from './api/market-events-hooks';
import { Wrap } from '@/shared/ui/Wrap';
import { Seg } from '@/shared/ui/Seg';
import { SectionHead } from '@/shared/ui/SectionHead';
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
 * Рынок: общий фон, к вашим сделкам не привязанный — раздел уже назван так в
 * навигации, отдельный заголовок страницы поверх него был бы повтором.
 *
 * Каждый переключатель стоит на линейке того раздела, которым управляет
 * (инструмент — у «Позиционирования», глубина истории — у «Волатильности по
 * часам»), а не общей парой над всей страницей: до того, к чему они относятся,
 * было два экрана вниз.
 */
export const AnalyticsPage = () => {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [historyDays, setHistoryDays] = useState(365);

  const { data: sentimentData } = useMarketSentiment(symbol);
  const { data: hourly } = useHourlyStats(historyDays);
  const { data: corr } = useMarketCorrelation(historyDays);

  return (
    <Wrap page style={{ paddingTop: 'var(--s4)' }}>
      <div className="asym">
        <div>
          <SectionHead title="Позиционирование участников">
            <Seg options={SYMBOLS} value={symbol} onChange={setSymbol} ariaLabel="Инструмент" />
          </SectionHead>
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
