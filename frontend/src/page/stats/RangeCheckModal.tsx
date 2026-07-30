'use client';

import { useState } from 'react';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from '@/shared/ui/dialog';
import { Seg } from '@/shared/ui/Seg';
import { useRangeCheck, type Trade } from '@/shared/api/bybit/hooks';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import { formatRangePos } from '@/shared/lib/utils/range';
import { RangeCheckChart } from '@/page/stats/RangeCheckChart';

const TF_OPTIONS = [
  { value: '1h' as const, label: '1H' },
  { value: '4h' as const, label: '4H' },
  { value: '1d' as const, label: 'D' },
];

/**
 * Проверка «диапазона входа» глазами: свечи таймфрейма, границы окна измерения
 * и цена входа между ними — плюс сверка того, что лежит в базе, с тем, что даёт
 * та же формула по нарисованным свечам.
 *
 * Это служебный инструмент, а не аналитика: он нужен, чтобы метрике можно было
 * доверять в Лаборатории. Сходится — верим; разошлось — видно, на каком шаге.
 */
export function RangeCheckModal({ trade, onClose }: { trade: Trade; onClose: () => void }) {
  const [tf, setTf] = useState<'1h' | '4h' | '1d'>('4h');
  const { data, isLoading, isError } = useRangeCheck(trade.id, tf);

  // Расхождение в пределах округления — не расхождение: в базе значение с двумя
  // знаками, здесь оно пересчитано по свежезагруженным свечам.
  const drift = data?.stored != null && data.recomputed != null ? Math.abs(data.stored - data.recomputed) : null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent wide>
        <DialogHeader
          title="Проверка диапазона входа"
          subtitle={`${trade.symbol} · ${trade.direction} · вход ${formatPriceGrouped(trade.avgEntryPrice)} · окно ${tf.toUpperCase()}${
            data ? `, ${data.window.candles} из ${data.window.expected} свечей` : ''
          }`}
        />
        <DialogBody>
          <div className="h2row">
            <h2>Свечи и окно измерения</h2>
            <Seg options={TF_OPTIONS} value={tf} onChange={setTf} ariaLabel="Таймфрейм" />
          </div>

          {isLoading ? (
            <>
              <div className="skel" style={{ height: 120 }} />
            </>
          ) : isError ? (
            <p className="neg">Не удалось загрузить свечи</p>
          ) : data && data.candles.length > 0 ? (
            <RangeCheckChart data={data} />
          ) : (
            <p style={{ color: 'var(--color-muted)' }}>Биржа не отдала свечи за этот период</p>
          )}

          {data && (
            <>
              <div className="lookup" style={{ marginTop: 'var(--s3)' }}>
                <div>
                  <span className="lbl">В базе</span>
                  <span className="n">{data.stored != null ? `${data.stored.toFixed(1)} %` : '—'}</span>
                </div>
                <div>
                  <span className="lbl">Пересчёт по свечам</span>
                  <span className="n">{formatRangePos(data.recomputed)}</span>
                </div>
                <div>
                  <span className="lbl">Низ окна</span>
                  <span className="n">{formatPriceGrouped(data.window.low)}</span>
                </div>
                <div>
                  <span className="lbl">Верх окна</span>
                  <span className="n">{formatPriceGrouped(data.window.high)}</span>
                </div>
              </div>

              <p className="foot">
                {data.stored == null ? (
                  <>
                    <b>†</b> В базе значения нет — контекст этой сделки ещё не посчитан.
                  </>
                ) : drift != null && drift < 0.5 ? (
                  <>
                    Расхождение {drift.toFixed(1)} п.п. — в пределах округления, диапазону можно верить.
                  </>
                ) : (
                  <>
                    <b>†</b> Расхождение {drift?.toFixed(1) ?? '—'} п.п. — база и свечи говорят разное.
                  </>
                )}{' '}
                Пунктир — границы окна, сплошная краска — цена входа. Окно кончается там же, где вход: свечи
                после входа в расчёт не попадают. Число = (вход − низ) / (верх − низ).
                {data.entry.basis === 'closed' && ' Время входа неизвестно — окно привязано к закрытию сделки.'}
              </p>
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <button className="btn solid" onClick={onClose}>
            Закрыть
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
