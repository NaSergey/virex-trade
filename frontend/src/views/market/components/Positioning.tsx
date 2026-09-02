'use client';

import { useTranslations } from 'next-intl';
import { fmtUsdCompact } from './SentimentChart';
import { LiquidityCenterChart } from './LiquidityCenterChart';
import { MetricCell } from '@/shared/ui/MetricCell';
import type { MarketSentimentData, VolatilityData, LiquidityPoint } from '../api/hooks';
import { useLocaleControl } from '@/shared/i18n';

/**
 * Как стоят участники рынка по выбранному инструменту: соотношение лонгов к
 * шортам, открытый интерес, объём и волатильность — и график центра
 * ликвидности книги заявок под ними: цена и средневзвешенная цена бид/аск
 * стороны во времени.
 *
 * Шесть величин и график отвечают на один вопрос с двух сторон — «в чью
 * пользу перевес сейчас» и «как он менялся», — поэтому стоят вместе. Величины
 * набраны той же `.metrics`/`.mcell`, что и свод периода на «Обзоре», двумя
 * рядами по три (`.metrics-3`): колонка листа под них — семь двенадцатых, и
 * шесть в ряд обрезали бы подписи.
 *
 * Три правых величины приходят из `/volatility` вместе с базой для сравнения
 * (средняя волатильность, средний дневной объём), и сравнение показано второй
 * строкой ячейки: «1.85 %» само по себе не говорит ничего, «1.85 % при средней
 * 1.42 %» говорит всё. Раньше из этого ответа читались два поля из десяти.
 *
 * До графика центра ликвидности здесь успели постоять два неудачных
 * захода — кривая доли лонг/шорт-аккаунтов и стакан-лесенка «прямо сейчас».
 * Оба были техническими суррогатами того же вопроса, не самим ответом:
 * `LiquiditySnapshotService` копит историю с сегодняшнего дня (у книги
 * заявок нет архива, бэкфилл невозможен) — см. `LiquidityCenterChart` про
 * состояние «данных пока одна точка».
 */
export function Positioning({
  data,
  isLoading,
  volatility,
  volatilityLoading,
  liquidity,
  liquidityLoading,
}: {
  data?: MarketSentimentData;
  isLoading?: boolean;
  volatility?: VolatilityData;
  volatilityLoading?: boolean;
  liquidity?: LiquidityPoint[];
  liquidityLoading?: boolean;
}) {
  const t = useTranslations('market');
  const { locale } = useLocaleControl();
  const latest = data?.points.at(-1);
  const longShort = latest && latest.sellRatio > 0 ? latest.buyRatio / latest.sellRatio : null;

  /*
   * Доли, а не сами объёмы: доллары уже показаны соседней ячейкой, а вопрос к
   * этой паре — перевес, и он читается только долями. Знаменатель считаем
   * суммой сторон, а не берём `volume24hUsd`: сегодня это одно и то же число
   * (бэкенд делит те же 24 свечи), но доля, посчитанная не от своего же
   * знаменателя, разошлась бы молча, стоит выборкам разъехаться.
   */
  const flow = volatility ? volatility.buyVolumeUsd + volatility.sellVolumeUsd : 0;
  const buyShare = flow > 0 && volatility ? (volatility.buyVolumeUsd / flow) * 100 : null;

  const dominant = {
    buy: t('dominantBuy'),
    sell: t('dominantSell'),
    neutral: t('dominantNeutral'),
  };

  return (
    <>
      {/* Верхний ряд — кто как стоит (/market-sentiment), нижний — что с ценой
          и объёмом (/volatility). Ряды разъезжаются и по загрузке: ответы
          приходят порознь, и заглушки в них гаснут порознь — ряд из шести
          мигал бы вразнобой посередине. */}
      <div className="metrics metrics-3" data-tour="market-positioning">
        <MetricCell
          label="Long / Short"
          loading={isLoading}
          value={longShort ? longShort.toFixed(2) : '—'}
        />
        <MetricCell
          label={t('openInterest')}
          loading={isLoading}
          value={latest && latest.openInterestUsd > 0 ? fmtUsdCompact(latest.openInterestUsd, locale) : '—'}
        />
        <MetricCell
          label={t('longShare')}
          loading={isLoading}
          value={latest ? `${(latest.buyRatio * 100).toFixed(1)} %` : '—'}
        />
      </div>
      <div className="metrics metrics-3">
        <MetricCell
          label={t('currentVolatility')}
          loading={volatilityLoading}
          value={volatility ? `${volatility.currentVolPct.toFixed(2)} %` : '—'}
          tone={volatility?.elevated ? 'neg' : undefined}
          /* Слово «выше нормы» осталось при цвете, а не вместо него: красным
             набраны и число, и подпись, но красный здесь — не единственный
             носитель смысла, и рядом с ним стоит та самая норма, с которой
             сравнили. */
          sub={
            volatility
              ? `${volatility.elevated ? `${t('volatilityElevated')} · ` : ''}${t('volAvg', {
                  value: volatility.avgVolPct.toFixed(2),
                })}`
              : ''
          }
          subTone={volatility?.elevated ? 'neg' : undefined}
        />
        <MetricCell
          label={t('volume24h')}
          loading={volatilityLoading}
          value={volatility && volatility.volume24hUsd > 0 ? fmtUsdCompact(volatility.volume24hUsd, locale) : '—'}
          sub={
            volatility
              ? t('volumeVsAvg', {
                  value: `${volatility.volumeChangePct >= 0 ? '+' : '−'}${Math.abs(volatility.volumeChangePct).toFixed(0)} %`,
                })
              : ''
          }
          subTone={volatility ? (volatility.volumeRising ? 'pos' : 'neg') : undefined}
        />
        <MetricCell
          label={t('buySellSplit')}
          hint={t('buySellSplitHint')}
          loading={volatilityLoading}
          value={
            buyShare != null ? (
              <>
                {buyShare.toFixed(0)}
                <span className="sep"> / </span>
                {(100 - buyShare).toFixed(0)}
              </>
            ) : (
              '—'
            )
          }
          /* Перевес назван словом, но не покрашен: в этой системе цвет означает
             деньги — рост и падение, — а не сторону сделки. Зелёные «покупки»
             читались бы как «хорошо». */
          sub={volatility ? dominant[volatility.dominantSide] : ''}
        />
      </div>
      <div style={{ marginTop: 'var(--s3)' }}>
        <LiquidityCenterChart points={liquidity} isLoading={liquidityLoading} />
      </div>
    </>
  );
}
