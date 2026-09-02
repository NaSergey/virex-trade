'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  useMarketSentiment,
  useMarketData,
  useFearAndGreed,
  useCMC20,
  useDeFiTVL,
  useVolatility,
  useLiquidityHistory,
} from './api/hooks';
import { useHourlyStats, useMarketCorrelation } from './api/market-events-hooks';
import { Wrap } from '@/shared/ui/Wrap';
import { Seg } from '@/shared/ui/Seg';
import { SectionHead } from '@/shared/ui/SectionHead';
import { MacroSnapshot } from './components/MacroSnapshot';
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
 * Лист в две дорожки, и делит их время, а не источник данных:
 *
 * - **слева — «что сейчас»**: фон рынка и позиционирование по выбранному
 *   инструменту — коэффициенты и график центра ликвидности;
 *   `useLiquidityHistory` перечитывает раз в 5 минут не потому, что копия
 *   на бэкенде живёт дольше остального на странице, а потому что новая точка
 *   там физически не появляется чаще: `LiquiditySnapshotService` пишет её
 *   раз в 15 минут — снимать книгу заявок глубиной 200 уровней чаще незачем;
 * - **справа — «как обычно»**: дни недели и часы. Оба считаются по одной и той
 *   же истории в год или два и меняются раз в полчаса.
 *
 * Отсюда и место тумблеров: инструмент управляет только «Позиционированием» и
 * стоит на его линейке, глубина истории — обеими разбивками справа и стоит на
 * линейке первой из них. Каждый по-прежнему в пределах видимости того, что
 * меняет, — но теперь это видимость всей страницы, а не одного экрана из трёх:
 * четыре раздела в столбик занимали два с половиной экрана, две дорожки
 * укладываются в один.
 *
 * Пропорция 7 к 5 (`.asym.pair`), а не обычные 8 к 3: справа не маргиналия при
 * тексте, а вторая полноценная дорожка — семь строк недели требуют ширины под
 * полосу, иначе она схлопывается в огрызок.
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
  const { data: volatility, isLoading: volatilityLoading } = useVolatility(symbol);
  const { data: liquidityHistory, isLoading: liquidityLoading } = useLiquidityHistory(symbol);
  const { data: hourly, isLoading: hourlyLoading } = useHourlyStats(historyDays);
  const { data: corr, isLoading: corrLoading } = useMarketCorrelation(historyDays);
  const { data: marketData, isLoading: marketLoading } = useMarketData();
  const { data: fearGreed, isLoading: fearGreedLoading } = useFearAndGreed();
  const { data: cmc20, isLoading: cmc20Loading } = useCMC20();
  const { data: defiTvl, isLoading: defiTvlLoading } = useDeFiTVL();

  return (
    <Wrap page style={{ paddingTop: 'var(--s4)' }}>
      <div className="asym pair">
        <div>
          <SectionHead title={t('macroTitle')} />
          <MacroSnapshot
            market={marketData}
            marketLoading={marketLoading}
            fearGreed={fearGreed}
            fearGreedLoading={fearGreedLoading}
            cmc20={cmc20}
            cmc20Loading={cmc20Loading}
            defiTvl={defiTvl}
            defiTvlLoading={defiTvlLoading}
          />

          <SectionHead title={t('positioningTitle')} style={{ marginTop: 'var(--s5)' }}>
            <Seg options={SYMBOLS} value={symbol} onChange={setSymbol} ariaLabel={t('instrumentAriaLabel')} />
          </SectionHead>
          <Positioning
            data={sentimentData}
            isLoading={sentimentLoading}
            volatility={volatility}
            volatilityLoading={volatilityLoading}
            liquidity={liquidityHistory?.points}
            liquidityLoading={liquidityLoading}
          />
        </div>

        <aside className="marg">
          <SectionHead title={t('weekdayOddsTitle')}>
            <Seg options={HISTORY} value={historyDays} onChange={setHistoryDays} ariaLabel={t('historyDepthAriaLabel')} />
          </SectionHead>
          <WeekdayOdds corr={corr} isLoading={corrLoading} />

          <SectionHead title={t('hourlyVolatilityTitle')} style={{ marginTop: 'var(--s5)' }} />
          <HourlyVolatility hours={hourly?.hourly ?? []} isLoading={hourlyLoading} />
        </aside>
      </div>
    </Wrap>
  );
};
