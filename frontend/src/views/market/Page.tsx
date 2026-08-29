'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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

/**
 * Рынок (была на `/analytics` — адрес освободила «Выборка», переехав туда под
 * именем «Аналитика»): общий фон, к вашим сделкам не привязанный — раздел уже
 * назван так в навигации, отдельный заголовок страницы поверх него был бы
 * повтором.
 *
 * В коде и на бэкенде раздел остался `analytics` (`/api/analytics/*`) — тот же
 * приём, что и у «Аналитики» с её `lab` по проводу: видимое имя и адрес
 * поменялись, внутренние не обязаны следовать.
 *
 * Каждый переключатель стоит на линейке того раздела, которым управляет
 * (инструмент — у «Позиционирования», глубина истории — у «Волатильности по
 * часам»), а не общей парой над всей страницей: до того, к чему они относятся,
 * было два экрана вниз.
 */
export const MarketPage = () => {
  const t = useTranslations('market');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [historyDays, setHistoryDays] = useState(365);

  const HISTORY = [
    { value: 365, label: t('history1y') },
    { value: 730, label: t('history2y') },
  ];

  // isLoading, а не isFetching: смена инструмента или глубины истории
  // перечитывает срез, и подменять уже показанные числа заглушками значило бы
  // мигать страницей на каждом щелчке тумблера.
  const { data: sentimentData, isLoading: sentimentLoading } = useMarketSentiment(symbol);
  const { data: hourly, isLoading: hourlyLoading } = useHourlyStats(historyDays);
  const { data: corr, isLoading: corrLoading } = useMarketCorrelation(historyDays);

  return (
    <Wrap page style={{ paddingTop: 'var(--s4)' }}>
      <div className="asym">
        <div>
          <SectionHead title={t('positioningTitle')}>
            <Seg options={SYMBOLS} value={symbol} onChange={setSymbol} ariaLabel={t('instrumentAriaLabel')} />
          </SectionHead>
          <Positioning data={sentimentData} isLoading={sentimentLoading} />

          <SectionHead title={t('hourlyVolatilityTitle')} style={{ marginTop: 'var(--s5)' }}>
            <Seg options={HISTORY} value={historyDays} onChange={setHistoryDays} ariaLabel={t('historyDepthAriaLabel')} />
          </SectionHead>
          <HourlyVolatility hours={hourly?.hourly ?? []} isLoading={hourlyLoading} />
        </div>

        <aside className="marg">
          <h2>{t('weekdayOddsTitle')}</h2>
          <WeekdayOdds corr={corr} isLoading={corrLoading} />
        </aside>
      </div>
    </Wrap>
  );
};
