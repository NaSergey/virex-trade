'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/shared/ui/dialog';
import { Seg } from '@/shared/ui/Seg';
import { Button } from '@/shared/ui/Button';
import { SectionHead } from '@/shared/ui/SectionHead';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Lookup, KeyValue } from '@/shared/ui/Lookup';
import { useRangeCheck, type RangeTf, type Trade } from '@/entities/trade';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import { formatRangePos } from '@/shared/lib/utils/range';
import { useLocaleControl } from '@/shared/i18n';
import { RangeCheckChart } from './RangeCheckChart';

const TF_OPTIONS = [
  { value: '15m' as const, label: '15M' },
  { value: '30m' as const, label: '30M' },
  { value: '1h' as const, label: '1H' },
  { value: '4h' as const, label: '4H' },
  { value: '1d' as const, label: 'D' },
];

const TF_HOURS: Record<RangeTf, number> = { '15m': 0.25, '30m': 0.5, '1h': 1, '4h': 4, '1d': 24 };

/**
 * «Диапазон входа» глазами: свечи таймфрейма, границы коридора, в котором цена
 * ходила до входа, и метки входа с выходом.
 *
 * Сверка сохранённого значения с расчётом по этим же свечам осталась, но ушла
 * с глаз: два почти одинаковых процента рядом читались как две разные метрики и
 * только запутывали. Теперь она молчит, пока сходится, и говорит, когда нет —
 * то есть ровно тогда, когда фильтрам диапазона в «Выборке» верить нельзя.
 */
export function RangeCheckModal({ trade, onClose }: { trade: Trade; onClose: () => void }) {
  const t = useTranslations('rangeCheck');
  const tc = useTranslations('common');
  const { locale } = useLocaleControl();
  const [tf, setTf] = useState<RangeTf>('4h');
  const { data, isLoading, isError } = useRangeCheck(trade.id, tf);

  /**
   * Длина коридора человеческими словами: «за сутки» вместо «24 свечи 1H».
   * Сколько там свечей и какого таймфрейма — вопрос реализации, а не то, что
   * человек хочет знать, глядя на два числа.
   */
  const windowAge = (rangeTf: RangeTf, candles: number): string => {
    const hours = candles * TF_HOURS[rangeTf];
    if (hours <= 24) return hours === 24 ? t('windowDay') : t('windowHours', { hours });
    const days = Math.round(hours / 24);
    return t('windowDays', { days });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent wide>
        <DialogHeader
          title={t('title')}
          subtitle={`${trade.symbol} · ${trade.direction} · ${t('entryWord')} ${formatPriceGrouped(trade.avgEntryPrice)}${
            data ? ` · ${t('corridorPrefix')} ${windowAge(tf, data.window.expected)}` : ''
          }`}
        />
        <DialogBody>
          <SectionHead title={t('priceAroundEntry')}>
            <Seg options={TF_OPTIONS} value={tf} onChange={setTf} ariaLabel={t('timeframeAriaLabel')} />
          </SectionHead>

          {isLoading ? (
            <Skeleton height={120} />
          ) : isError ? (
            <p className="neg">{t('candlesLoadFailed')}</p>
          ) : data && data.candles.length > 0 ? (
            /* key: смена таймфрейма — это другой график, а не тот же самый в
               новом масштабе, поэтому вид сбрасывается вместе с ней. */
            <RangeCheckChart key={tf} data={data} />
          ) : (
            <p className="muted">{t('noCandlesForPeriod')}</p>
          )}

          {data && (
            <>
              <Lookup style={{ marginTop: 'var(--s3)' }}>
                <KeyValue label={t('title')}>
                  {formatRangePos(data.stored ?? data.recomputed, locale)}
                </KeyValue>
                <KeyValue label={`${t('priceMovedPrefix')} ${windowAge(tf, data.window.expected)}`}>
                  {data.window.low != null && data.window.high != null
                    ? `${formatPriceGrouped(data.window.low)} – ${formatPriceGrouped(data.window.high)}`
                    : '—'}
                </KeyValue>
              </Lookup>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="solid" onClick={onClose}>
            {tc('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
