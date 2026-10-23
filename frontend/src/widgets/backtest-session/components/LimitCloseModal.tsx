'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader, useDialogFade } from '@/shared/ui/dialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field, Input } from '@/shared/ui/Field';
import { Slider } from '@/shared/ui/Slider';
import { formatMoney, formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import type { PositionLike } from '../api/types';
import { closeImpact, fromScreen, toScreen } from '../lib/money';
import { PriceInput } from './PriceInput';

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

/**
 * Закрытие частью объёма по указанной цене — не исполняется сразу, ждёт, пока
 * цена реплея её достигнет (как стоп/тейк). Confirm ставит висящий
 * лимит-ордер, а не закрывает сделку.
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
}) {
  const t = useTranslations('backtest');
  const { closing, close } = useDialogFade(onClose);
  const [price, setPrice] = useState(screenPrice);
  const [pct, setPct] = useState(100);
  const qty = (remaining * pct) / 100;
  const impact = closeImpact(trade, scale, price, qty);

  return (
    <Dialog open={!closing} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader
          title={t('limitCloseTitle')}
          subtitle={`${showSymbol ? `${trade.symbol} · ` : ''}${t('entry')} ${formatPriceGrouped(toScreen(trade.entryPrice, scale), decimals)} · ${t('unrealized')} ${formatPriceGrouped(screenPrice, decimals)}`}
        />
        <DialogBody>
          <Field label={t('closingPrice')}>
            {(id) => (
              <PriceInput id={id} full value={price} onChange={setPrice} />
            )}
          </Field>
          <Field label={t('closedQtyCoin')}>
            {(id) => (
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
            )}
          </Field>
          <Slider value={pct} min={0} max={100} step={1} onChange={(v) => setPct(clampPct(v))} aria-label={t('closedQtyCoin')} />
          <p className="muted">
            {t('limitCloseHint', { qty: formatQty(qty), price: formatPriceGrouped(price, decimals), pnl: formatMoney(impact.usdt) })}
          </p>
          <ErrorNote error={error} fallback={t('actionFailed')} />
        </DialogBody>
        <DialogActions
          confirmLabel={t('limitCloseConfirm')}
          confirmDisabled={isPending || !(qty > 0) || !(price > 0)}
          onConfirm={() => onSubmit(fromScreen(price, scale), qty)}
          onCancel={close}
        />
      </DialogContent>
    </Dialog>
  );
}
