'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useProbabilities, type OddsStat } from '@/entities/probabilities';
import type { Candle } from '../lib/candles';
import { freshDivergence } from '../lib/odds-plaque';
import { rsiSeries } from '../lib/rsi';

/**
 * Плашка экспериментального индикатора над графиком (спека 2026-10-25):
 * последняя дивергенция RSI — с частотой из истории и проверкой вперёд. HTML
 * поверх графика, а не узел его SVG: она не двигается с графиком и
 * перерисовываться с каждым кадром жеста незачем. Нажатий не ловит.
 */
export function OddsPlaque({ tf, candles, symbol }: { tf: number; candles: readonly Candle[]; symbol: string }) {
  const t = useTranslations('backtest');
  const btc = symbol === 'BTCUSDT';
  const { data, isLoading } = useProbabilities(btc);
  // Тот же rsiSeries, что у панели RSI, но без последней свечи: плашка стоит только
  // на живом рынке, там последняя свеча ещё формируется, а сервер считал события по
  // закрытым. С ней дивергенция мелькала бы на плашке раньше подтверждения.
  const closed = useMemo(() => candles.slice(0, -1), [candles]);
  const divs = useMemo(() => (btc ? rsiSeries(closed).divergences : []), [btc, closed]);

  const stat = (s: OddsStat | null | undefined) =>
    s ? (
      <p className={s.holds ? undefined : 'muted'}>
        {t('exp.plaque.stat', {
          side: t(`exp.plaque.side.${s.side}`),
          share: Math.round(s.train.share),
          n: s.train.n,
          test: Math.round(s.test.share),
          testN: s.test.n,
        })}{' '}
        — {t(s.holds ? 'exp.plaque.holds' : 'exp.plaque.fails')}
      </p>
    ) : (
      <p className="muted">{t('exp.plaque.fewCases')}</p>
    );

  const body = () => {
    if (!btc) return <p className="muted">{t('exp.plaque.onlyBtc')}</p>;
    if (!data) return <p className="muted">{isLoading ? t('exp.plaque.loading') : t('exp.plaque.notYet')}</p>;
    const tfName = t(`tf.${tf}`);
    const byTf = data.divergence[String(tf)];
    if (!byTf) return <p className="muted">{t('exp.plaque.noTf', { tf: tfName })}</p>;
    const fresh = freshDivergence(divs, closed.length - 1);
    if (!fresh) return <p className="muted">{t('exp.plaque.noFresh')}</p>;
    return (
      <>
        <p>{t(`exp.plaque.div.${fresh.kind}`, { tf: tfName, ago: fresh.ago })}</p>
        {stat(byTf[fresh.kind])}
      </>
    );
  };

  return (
    <div className="odds-plaque">
      <p className="odds-plaque-head">{t('exp.plaque.title')}</p>
      {body()}
    </div>
  );
}
