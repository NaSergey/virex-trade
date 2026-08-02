'use client';

import { useState } from 'react';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/shared/ui/dialog';
import { Seg } from '@/shared/ui/Seg';
import { Button } from '@/shared/ui/Button';
import { SectionHead } from '@/shared/ui/SectionHead';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Lookup, KeyValue } from '@/shared/ui/Lookup';
import { useRangeCheck, type RangeTf, type Trade } from '@/entities/trade';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import { formatRangePos } from '@/shared/lib/utils/range';
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
 * Длина коридора человеческими словами: «за сутки» вместо «24 свечи 1H».
 * Сколько там свечей и какого таймфрейма — вопрос реализации, а не то, что
 * человек хочет знать, глядя на два числа.
 */
function windowAge(tf: RangeTf, candles: number): string {
  const hours = candles * TF_HOURS[tf];
  if (hours <= 24) return hours === 24 ? 'за сутки' : `за ${hours} ч`;
  const days = Math.round(hours / 24);
  const last = days % 10;
  const teen = days % 100 >= 11 && days % 100 <= 14;
  const word = !teen && last === 1 ? 'день' : !teen && last >= 2 && last <= 4 ? 'дня' : 'дней';
  return `за ${days} ${word}`;
}

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
  const [tf, setTf] = useState<RangeTf>('4h');
  const { data, isLoading, isError } = useRangeCheck(trade.id, tf);

  // Расхождение в пределах округления — не расхождение: в базе значение с двумя
  // знаками, здесь оно пересчитано по свежезагруженным свечам.
  const drift = data?.stored != null && data.recomputed != null ? Math.abs(data.stored - data.recomputed) : null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent wide>
        <DialogHeader
          title="Диапазон входа"
          subtitle={`${trade.symbol} · ${trade.direction} · вход ${formatPriceGrouped(trade.avgEntryPrice)}${
            data ? ` · коридор ${windowAge(tf, data.window.expected)}` : ''
          }`}
        />
        <DialogBody>
          <SectionHead title="Цена вокруг входа">
            <Seg options={TF_OPTIONS} value={tf} onChange={setTf} ariaLabel="Таймфрейм" />
          </SectionHead>

          {isLoading ? (
            <Skeleton height={120} />
          ) : isError ? (
            <p className="neg">Не удалось загрузить свечи</p>
          ) : data && data.candles.length > 0 ? (
            /* key: смена таймфрейма — это другой график, а не тот же самый в
               новом масштабе, поэтому вид сбрасывается вместе с ней. */
            <RangeCheckChart key={tf} data={data} />
          ) : (
            <p className="muted">Биржа не отдала свечи за этот период</p>
          )}

          {data && (
            <>
              <Lookup style={{ marginTop: 'var(--s3)' }}>
                <KeyValue label="Диапазон входа">
                  {formatRangePos(data.stored ?? data.recomputed)}
                </KeyValue>
                <KeyValue label={`Цена ходила ${windowAge(tf, data.window.expected)}`}>
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
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
