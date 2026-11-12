'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader, useDialogFade } from '@/shared/ui/dialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field, Input } from '@/shared/ui/Field';
import { KeyValue } from '@/shared/ui/Lookup';
import { Slider } from '@/shared/ui/Slider';
import { formatMoney, formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import type { PositionLike } from '../api/types';
import { closeImpact, closePart, toScreen } from '../lib/money';
import { PctMarks, StepRow } from './CloseFields';

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

/** Закрытие частью объёма сразу, по текущей цене — без ожидания. */
export function MarketCloseModal({
  trade,
  remaining,
  scale,
  screenPrice,
  canClose,
  onSubmit,
  onClose,
  isPending,
  error,
  decimals,
  showSymbol = true,
  qtyStep = 0,
  minOrderHint,
}: {
  trade: PositionLike;
  remaining: number;
  /** Масштаб показа цены: итог считается в настоящих ценах. */
  scale: number;
  screenPrice: number;
  /** Как и раньше у «Закрыть по рынку» в OrderPanel: сделку нельзя закрыть в тот же
   * момент, когда она открыта (совпадает с проверкой `timeInvalid` на сервере) —
   * без этого клик по кнопке ничего не делал бы, и без единой подсказки почему. */
  canClose: boolean;
  onSubmit: (qty: number) => void;
  onClose: () => void;
  isPending: boolean;
  error: unknown;
  /** Знаков цены монеты сделки; не задано — общее правило формата. */
  decimals?: number;
  /** Монета в подзаголовке; снимается у истории со случайной монетой — она скрыта до итога. */
  showSymbol?: boolean;
  /** Шаг лота монеты: часть позиции — вниз до него, как поставит биржа. */
  qtyStep?: number;
  /** Текст «меньше минимального ордера биржи». */
  minOrderHint?: string;
}) {
  const t = useTranslations('backtest');
  const { closing, close } = useDialogFade(onClose);
  const [pct, setPct] = useState(100);
  const qty = closePart(remaining, pct, qtyStep);
  // Часть меньше шага лота биржа не примет — окно говорит это, а не молчит выключенной кнопкой.
  const tooSmall = pct > 0 && pct < 100 && qtyStep > 0 && qty < qtyStep - 1e-12;
  // Итог закрытия сейчас — от входа позиции по текущей цене, с комиссиями.
  const impact = closeImpact(trade, scale, screenPrice, qty);
  const lot = qtyStep > 0 ? qtyStep : 0.001;
  const moveQty = (dir: 1 | -1) => {
    const next = Math.max(0, Math.min(remaining, qty + dir * lot));
    setPct(remaining > 0 ? clampPct((next / remaining) * 100) : 0);
  };

  return (
    <Dialog open={!closing} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader title={t('marketCloseTitle')} subtitle={showSymbol ? trade.symbol : undefined} />
        <DialogBody>
          <KeyValue label={t('entryPrice')}>{formatPriceGrouped(toScreen(trade.entryPrice, scale), decimals)}</KeyValue>
          <KeyValue label={t('marketPrice')}>{formatPriceGrouped(screenPrice, decimals)}</KeyValue>
          <Field label={t('closedQtyCoin')}>
            {(id) => (
              <StepRow label={t('closedQtyCoin')} onDec={() => moveQty(-1)} onInc={() => moveQty(1)}>
                <Input
                  id={id}
                  full
                  inputMode="decimal"
                  value={formatQty(qty)}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setPct(remaining > 0 ? clampPct((v / remaining) * 100) : 0);
                  }}
                />
              </StepRow>
            )}
          </Field>
          <Slider value={pct} min={0} max={100} step={1} onChange={(v) => setPct(clampPct(v))} aria-label={t('closedQtyCoin')} />
          <PctMarks pct={pct} onPick={setPct} />
          <p className="close-note">{t('marketCloseHint', { qty: formatQty(qty), pnl: formatMoney(impact.usdt) })}</p>
          {/* Кнопка выключена — окно говорит почему, а не молчит (QA 2026-10-23). */}
          {!canClose && <p className="muted">{t('marketCloseTooSoon')}</p>}
          {tooSmall && minOrderHint && <p className="neg">{minOrderHint}</p>}
          <ErrorNote error={error} fallback={t('actionFailed')} />
        </DialogBody>
        <DialogActions
          confirmLabel={t('marketCloseConfirm')}
          confirmVariant="risk"
          confirmDisabled={isPending || !(qty > 0) || tooSmall || !canClose}
          onConfirm={() => onSubmit(qty)}
          onCancel={close}
        />
      </DialogContent>
    </Dialog>
  );
}
