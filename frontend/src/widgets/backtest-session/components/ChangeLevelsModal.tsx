'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader, useDialogFade } from '@/shared/ui/dialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field, Input } from '@/shared/ui/Field';
import { Slider } from '@/shared/ui/Slider';
import { fmtPctSigned, formatPriceGrouped } from '@/shared/lib/utils/format';
import type { PositionLike } from '../api/types';
import { checkLevels, levelSliderRange, toInputPrice, toScreen } from '../lib/money';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Правка стопа/тейка открытой сделки — модалка, а не инлайн-поля панели:
 * `OrderPanel` больше не смотрит на то, открыта ли сделка, значит редактировать
 * уже существующие уровни негде, кроме отдельного диалога.
 */
export function ChangeLevelsModal({
  trade,
  scale,
  screenPrice,
  onApply,
  onClose,
  isPending,
  error,
  decimals,
}: {
  trade: PositionLike;
  scale: number;
  /** Текущая экранная цена — источник для диапазонов и процентов. */
  screenPrice: number;
  onApply: (stop: number, take: number | null) => void;
  onClose: () => void;
  isPending: boolean;
  error: unknown;
  /** Знаков цены монеты сделки; не задано — общее правило формата. */
  decimals?: number;
}) {
  const t = useTranslations('backtest');
  const { closing, close } = useDialogFade(onClose);
  // Позиция без стопа (бывает только на бирже) начинает с цены: это заведомо неверный
  // стоп, и окно не даст применить его, пока человек не поставит свой.
  const [stop, setStop] = useState(() => (trade.stopLoss > 0 ? toScreen(trade.stopLoss, scale) : screenPrice));
  const [take, setTake] = useState<number | null>(() => (trade.takeProfit != null ? toScreen(trade.takeProfit, scale) : null));
  const takeRange = levelSliderRange('take', screenPrice, trade.direction);
  const stopRange = levelSliderRange('stop', screenPrice, trade.direction);
  const stopPct = ((stop - screenPrice) / screenPrice) * 100;
  const takePct = take != null ? ((take - screenPrice) / screenPrice) * 100 : null;
  const err = checkLevels(trade.direction, screenPrice, stop, take);

  return (
    <Dialog open={!closing} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader
          title={t('changeLevelsTitle')}
          subtitle={`${trade.symbol} · ${t(`direction.${trade.direction}`)} · ${formatPriceGrouped(toScreen(trade.entryPrice, scale), decimals)}`}
        />
        <DialogBody>
          <Field
            label={
              <span className="fld-head">
                <span>{t('stop')}</span>
                <span className="fld-val">{fmtPctSigned(-stopPct)}</span>
              </span>
            }
          >
            {(id) => (
              <>
                <Slider
                  value={clamp(stop, stopRange.min, stopRange.max)}
                  min={stopRange.min}
                  max={stopRange.max}
                  step={(stopRange.max - stopRange.min) / 200 || 1}
                  onChange={setStop}
                  aria-label={t('stop')}
                />
                <Input id={id} full inputMode="decimal" value={toInputPrice(stop)} onChange={(e) => setStop(Number(e.target.value))} />
              </>
            )}
          </Field>
          <Field
            label={
              <span className="fld-head">
                <span>{t('take')}</span>
                {takePct != null && <span className="fld-val">{fmtPctSigned(takePct)}</span>}
              </span>
            }
          >
            {(id) => (
              <>
                <Slider
                  value={clamp(take ?? screenPrice, takeRange.min, takeRange.max)}
                  min={takeRange.min}
                  max={takeRange.max}
                  step={(takeRange.max - takeRange.min) / 200 || 1}
                  onChange={setTake}
                  aria-label={t('take')}
                />
                <Input
                  id={id}
                  full
                  inputMode="decimal"
                  value={take != null ? toInputPrice(take) : ''}
                  onChange={(e) => setTake(e.target.value.trim() ? Number(e.target.value) : null)}
                />
              </>
            )}
          </Field>
          {err && <p className="neg">{t(err)}</p>}
          <ErrorNote error={error} fallback={t('actionFailed')} />
        </DialogBody>
        <DialogActions
          confirmLabel={t('apply')}
          confirmDisabled={isPending || err != null}
          onConfirm={() => onApply(stop, take)}
          onCancel={close}
        />
      </DialogContent>
    </Dialog>
  );
}
