'use client';

import { useState } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { SegmentedControl } from '@/shared/ui/SegmentedControl';
import { useRangeCheck, type Trade } from '@/shared/api/bybit/hooks';
import { formatPrice } from '@/shared/lib/utils/format';
import { formatRangePos, rangePosColor } from '@/shared/lib/utils/range';
import { RangeCheckChart } from '@/page/stats/RangeCheckChart';

const TF_OPTIONS = [
  { value: '1h' as const, label: '1H' },
  { value: '4h' as const, label: '4H' },
  { value: '1d' as const, label: 'D' },
];

/** Пара «подпись → значение» в сводке под графиком. */
function Fact({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] tracking-wide text-subtle uppercase">{label}</span>
      <span className={className ?? 'font-mono text-xs text-fg'}>{value}</span>
    </div>
  );
}

/**
 * Проверка «диапазона входа» одной сделки глазами: свечи таймфрейма, границы
 * окна измерения и цена входа между ними — плюс сверка того, что лежит в базе,
 * с тем, что даёт та же формула по нарисованным свечам.
 *
 * Это инструмент доверия к метрике, а не аналитика: если картинка и число
 * сходятся, диапазону можно верить в Лаборатории; если разошлись — видно, на
 * каком именно шаге.
 */
export function RangeCheckModal({ trade, onClose }: { trade: Trade; onClose: () => void }) {
  const [tf, setTf] = useState<'1h' | '4h' | '1d'>('4h');
  const { data, isLoading, isError } = useRangeCheck(trade.id, tf);

  // Расхождение в пределах округления — не расхождение: в базе значение с
  // двумя знаками, здесь оно пересчитано по свежезагруженным свечам.
  const drift =
    data?.stored != null && data.recomputed != null ? Math.abs(data.stored - data.recomputed) : null;
  const matches = drift != null && drift < 0.5;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3 text-base">
            <span>Диапазон входа · {trade.symbol}</span>
            <span className={`text-xs font-medium ${trade.direction === 'long' ? 'text-up' : 'text-down'}`}>
              {trade.direction === 'long' ? 'LONG' : 'SHORT'}
            </span>
            <SegmentedControl options={TF_OPTIONS} value={tf} onChange={setTf} size="sm" />
          </DialogTitle>
        </DialogHeader>

        <div className="h-96 w-full">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">Загрузка свечей…</div>
          ) : isError ? (
            <div className="flex h-full items-center justify-center text-sm text-down">
              Не удалось загрузить свечи
            </div>
          ) : data && data.candles.length > 0 ? (
            <RangeCheckChart data={data} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              Биржа не отдала свечи за этот период
            </div>
          )}
        </div>

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-elevated px-3 py-2.5 sm:grid-cols-4">
              <Fact label="низ окна" value={data.window.low != null ? formatPrice(data.window.low) : '—'} />
              <Fact label="верх окна" value={data.window.high != null ? formatPrice(data.window.high) : '—'} />
              <Fact label="цена входа" value={formatPrice(data.entry.price)} />
              <Fact
                label="диапазон входа"
                value={formatRangePos(data.recomputed)}
                className={`font-mono text-xs font-bold ${rangePosColor(data.recomputed, data.direction)}`}
              />
            </div>

            {/* Сверка: база против пересчёта по тем же свечам. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px]">
              {data.stored == null ? (
                <span className="inline-flex items-center gap-1.5 text-warn">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                  В базе значения нет — контекст этой сделки ещё не посчитан
                </span>
              ) : matches ? (
                <span className="inline-flex items-center gap-1.5 text-up">
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  В базе {data.stored.toFixed(2)}% — сходится с пересчётом по этим свечам
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-down">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                  В базе {data.stored.toFixed(2)}%, по этим свечам{' '}
                  {data.recomputed?.toFixed(2) ?? '—'}% — расхождение
                </span>
              )}
              <span className="text-muted">
                Окно: {data.window.candles} из {data.window.expected} свечей
              </span>
              {data.entry.basis === 'closed' && (
                <span className="text-warn">
                  Время входа неизвестно — окно привязано к закрытию сделки
                </span>
              )}
            </div>

            <p className="text-[11px] text-muted">
              Пунктир — границы окна измерения, сплошная белая — цена входа. Окно кончается там же, где
              стрелка входа: свечи после входа в расчёт не попадают. Число = (вход − низ) / (верх − низ).
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
