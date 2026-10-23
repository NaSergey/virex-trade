'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader, useDialogFade } from '@/shared/ui/dialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field, Input } from '@/shared/ui/Field';
import { Slider } from '@/shared/ui/Slider';
import { formatMoney, formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import type { PositionLike } from '../api/types';
import { closeImpact } from '../lib/money';

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
}) {
  const t = useTranslations('backtest');
  const { closing, close } = useDialogFade(onClose);
  const [pct, setPct] = useState(100);
  const qty = (remaining * pct) / 100;
  // Итог закрытия сейчас — от входа позиции по текущей цене, с комиссиями.
  const impact = closeImpact(trade, scale, screenPrice, qty);

  return (
    <Dialog open={!closing} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader title={t('marketCloseTitle')} subtitle={`${showSymbol ? `${trade.symbol} · ` : ''}${t('unrealized')} ${formatPriceGrouped(screenPrice, decimals)}`} />
        <DialogBody>
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
          <p className="muted">{t('marketCloseHint', { qty: formatQty(qty), pnl: formatMoney(impact.usdt) })}</p>
          {/* Кнопка выключена — окно говорит почему, а не молчит (QA 2026-10-23). */}
          {!canClose && <p className="muted">{t('marketCloseTooSoon')}</p>}
          <ErrorNote error={error} fallback={t('actionFailed')} />
        </DialogBody>
        <DialogActions
          confirmLabel={t('marketCloseConfirm')}
          confirmVariant="risk"
          confirmDisabled={isPending || !(qty > 0) || !canClose}
          onConfirm={() => onSubmit(qty)}
          onCancel={close}
        />
      </DialogContent>
    </Dialog>
  );
}
