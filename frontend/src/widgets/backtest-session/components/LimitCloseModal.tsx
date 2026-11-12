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
import { closeImpact, closePart, fromScreen, toScreen } from '../lib/money';
import { PctMarks, StepRow } from './CloseFields';
import { PriceInput } from './PriceInput';

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

/**
 * Закрытие частью объёма по указанной цене — не исполняется сразу, ждёт, пока
 * цена реплея её достигнет (как стоп/тейк). Confirm ставит висящий
 * лимит-ордер, а не закрывает сделку.
 *
 * Раскладка — как у окна закрытия на бирже: цена входа и рыночная цена строками,
 * цена и объём со степперами, ползунок с делениями 0–100 %, итог в рамке.
 */
export function LimitCloseModal({
  trade,
  remaining,
  scale,
  screenPrice,
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
  /** Остаток открытой позиции в монете (qty - closedQty). */
  remaining: number;
  scale: number;
  screenPrice: number;
  onSubmit: (price: number, qty: number) => void;
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
  const [price, setPrice] = useState(screenPrice);
  const [pct, setPct] = useState(100);
  const qty = closePart(remaining, pct, qtyStep);
  // Часть меньше шага лота биржа не примет — окно говорит это, а не молчит выключенной кнопкой.
  const tooSmall = pct > 0 && pct < 100 && qtyStep > 0 && qty < qtyStep - 1e-12;
  const impact = closeImpact(trade, scale, price, qty);

  // Шаг цены — последний знак монеты; шаг объёма — лот биржи (у сессии без лота — тысячная).
  const priceStep = 10 ** -(decimals ?? 2);
  const lot = qtyStep > 0 ? qtyStep : 0.001;
  const movePrice = (dir: 1 | -1) => setPrice((p) => Math.max(priceStep, Number((p + dir * priceStep).toFixed(decimals ?? 2))));
  const moveQty = (dir: 1 | -1) => {
    const next = Math.max(0, Math.min(remaining, qty + dir * lot));
    setPct(remaining > 0 ? clampPct((next / remaining) * 100) : 0);
  };

  return (
    <Dialog open={!closing} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader title={t('limitCloseTitle')} subtitle={showSymbol ? trade.symbol : undefined} />
        <DialogBody>
          <KeyValue label={t('entryPrice')}>{formatPriceGrouped(toScreen(trade.entryPrice, scale), decimals)}</KeyValue>
          <KeyValue label={t('marketPrice')}>{formatPriceGrouped(screenPrice, decimals)}</KeyValue>
          <Field label={t('closingPrice')}>
            {(id) => (
              <StepRow label={t('closingPrice')} onDec={() => movePrice(-1)} onInc={() => movePrice(1)}>
                <PriceInput id={id} full value={price} onChange={setPrice} />
              </StepRow>
            )}
          </Field>
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
          <p className="close-note">
            {t('limitCloseHint', { qty: formatQty(qty), price: formatPriceGrouped(price, decimals), pnl: formatMoney(impact.usdt) })}
          </p>
          {tooSmall && minOrderHint && <p className="neg">{minOrderHint}</p>}
          <ErrorNote error={error} fallback={t('actionFailed')} />
        </DialogBody>
        <DialogActions
          confirmLabel={t('limitCloseConfirm')}
          confirmDisabled={isPending || !(qty > 0) || tooSmall || !(price > 0)}
          onConfirm={() => onSubmit(fromScreen(price, scale), qty)}
          onCancel={close}
        />
      </DialogContent>
    </Dialog>
  );
}
