'use client';

import { useState } from 'react';
import {
  useMarketData,
  useFearAndGreed,
  useMarketSentiment,
  useVolatility,
} from '@/shared/api/analytics/hooks';
import { useHourlyStats, useMarketCorrelation } from '@/shared/api/market-events/hooks';
import { Wrap } from '@/shared/ui/Wrap';
import { Seg } from '@/shared/ui/Seg';
import { WEEKDAY_LABELS, WEEKDAY_ORDER } from '@/shared/lib/utils/period';
import { fmtPctSigned } from '@/shared/lib/utils/format';
import { SentimentChart, fmtUsdCompact } from './SentimentChart';

const SYMBOLS = [
  { value: 'BTCUSDT', label: 'BTC' },
  { value: 'ETHUSDT', label: 'ETH' },
  { value: 'SOLUSDT', label: 'SOL' },
];

const HISTORY = [
  { value: 365, label: '1 год' },
  { value: 730, label: '2 года' },
];

function fmtMarketCap(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)} T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)} B`;
  return `$${v.toFixed(0)}`;
}

/**
 * Рынок: общий фон, к вашим сделкам не привязанный. Сказано это прямо в
 * подзаголовке — иначе страница со статистикой рядом со страницами со
 * статистикой читается как «моя статистика», и «винрейт роста 62 %» можно
 * принять за свой.
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

  const latest = sentimentData?.points.at(-1);
  const longShort = latest && latest.sellRatio > 0 ? latest.buyRatio / latest.sellRatio : null;
  const hours = hourly?.hourly ?? [];
  const maxVol = Math.max(0, ...hours.map((b) => b.avgVolatilityPct));
  const hottest = hours.length > 0 ? [...hours].sort((a, b) => b.avgVolatilityPct - a.avgVolatilityPct)[0] : null;

  return (
    <Wrap style={{ paddingBottom: 'var(--s6)' }}>
      <div className="pagehead">
        <div>
          <h1>Рынок</h1>
          <p className="lede">Общерыночный фон. К вашим сделкам не привязан.</p>
        </div>
        <Seg options={SYMBOLS} value={symbol} onChange={setSymbol} ariaLabel="Инструмент" />
      </div>

      <div className="an">
        <div>
          <div className="lbl">Капитализация</div>
          <div className="an-v">{marketData ? fmtMarketCap(marketData.marketCap) : '—'}</div>
          {marketData && (
            <div className={`n ${marketData.marketCapChange24h >= 0 ? 'pos' : 'neg'}`} style={{ fontSize: 'var(--t-xs)' }}>
              {fmtPctSigned(marketData.marketCapChange24h)} за 24 ч
            </div>
          )}
        </div>
        <div>
          <div className="lbl">Страх и жадность</div>
          <div className="an-v">{fgData ? fgData.value : '—'}</div>
          {/* Шкала, а не цветная цифра: 62 само по себе ничего не значит, а
              положение риски между крайностями — значит. */}
          <div className="gauge">{fgData && <i style={{ left: `${fgData.value}%` }} />}</div>
          <div className="lbl" style={{ marginTop: 'var(--s1)' }}>
            {fgData?.classification ?? '—'}
          </div>
        </div>
        <div>
          <div className="lbl">Волатильность · 24 ч</div>
          <div className="an-v">{volData ? `${volData.currentVolPct.toFixed(2)} %` : '—'}</div>
          {volData && (
            <div className="n" style={{ fontSize: 'var(--t-xs)', color: 'var(--color-muted)' }}>
              база 7 дней {volData.avgVolPct.toFixed(2)} %{' '}
              <span className={volData.elevated ? 'dbt' : undefined}>
                {volData.elevated ? '· выше обычного' : '· в норме'}
              </span>
            </div>
          )}
        </div>
        <div>
          <div className="lbl">Объём · 24 ч</div>
          <div className="an-v">{volData ? fmtUsdCompact(volData.volume24hUsd) : '—'}</div>
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
        </div>
      </div>

      <div className="asym" style={{ marginTop: 'var(--s5)' }}>
        <div>
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
            {sentimentData && sentimentData.points.length > 1 ? (
              <SentimentChart data={sentimentData.points} />
            ) : (
              <p style={{ color: 'var(--color-muted)' }}>{sentimentData ? 'Нет данных' : 'Загрузка…'}</p>
            )}
          </div>

          <div className="h2row" style={{ marginTop: 'var(--s5)' }}>
            <h2>Волатильность по часам · UTC</h2>
            <Seg options={HISTORY} value={historyDays} onChange={setHistoryDays} ariaLabel="Глубина истории" />
          </div>
          {hottest ? (
            <>
              <div className="hrs">
                {hours.map((b) => (
                  <span
                    className="hr"
                    key={b.hour}
                    style={{ height: `${maxVol > 0 ? ((b.avgVolatilityPct / maxVol) * 100).toFixed(0) : 0}%` }}
                    title={
                      b.samples > 0
                        ? `${String(b.hour).padStart(2, '0')}:00 — ход свечи ${b.avgVolatilityPct.toFixed(2)} %, рост в ${b.winRateLongPct.toFixed(0)} % случаев (n=${b.samples})`
                        : `${String(b.hour).padStart(2, '0')}:00 — нет данных`
                    }
                  >
                    <b style={{ height: '100%', opacity: (0.3 + (b.avgVolatilityPct / (maxVol || 1)) * 0.7).toFixed(2) }} />
                  </span>
                ))}
              </div>
              <div className="hrs-x">
                {hours.map((b) => (
                  <span key={b.hour}>{b.hour % 3 === 0 ? String(b.hour).padStart(2, '0') : ''}</span>
                ))}
              </div>
              <p style={{ marginTop: 'var(--s3)', color: 'var(--color-muted)', fontSize: 'var(--t-xs)' }}>
                Горячий час: {String(hottest.hour).padStart(2, '0')}:00 UTC — средний ход свечи{' '}
                {hottest.avgVolatilityPct.toFixed(2)} %. Высота столбика — ход свечи, а не направление.
              </p>
            </>
          ) : (
            <p style={{ color: 'var(--color-muted)' }}>
              Нет данных — почасовой синк ещё не набрал историю.
            </p>
          )}
        </div>

        <aside className="marg">
          <h2>Вероятности по дням недели</h2>
          {corr && corr.totalDays > 0 ? (
            <>
              {WEEKDAY_ORDER.map((d) => {
                const b = corr.weekday[d];
                const up = (b?.winRateLongPct ?? 0) >= 50;
                return (
                  <div className="evt" key={d}>
                    <span className="evt-d">{WEEKDAY_LABELS[d]}</span>
                    <span className="evt-n n">
                      {b?.days ? `${b.winRateLongPct.toFixed(0)} %` : '—'}
                      <span className="lbl" style={{ letterSpacing: '.06em' }}>
                        {' '}
                        рост
                      </span>
                    </span>
                    <span className={`evt-i ${b?.days ? (up ? 'pos' : 'neg') : ''}`}>
                      {b?.days ? `${b.avgChangePct >= 0 ? '+' : '−'}${Math.abs(b.avgChangePct).toFixed(2)} %` : ''}
                    </span>
                  </div>
                );
              })}
              <p style={{ marginTop: 'var(--s3)', color: 'var(--color-muted)', fontSize: 'var(--t-xs)' }}>
                Доля дней, закрывшихся выше открытия, и средний ход за {corr.totalDays} дней. Отклонение от
                50 % на такой выборке — намёк, а не закономерность.
              </p>
            </>
          ) : (
            <p style={{ color: 'var(--color-muted)' }}>Нет данных</p>
          )}
        </aside>
      </div>
    </Wrap>
  );
};
