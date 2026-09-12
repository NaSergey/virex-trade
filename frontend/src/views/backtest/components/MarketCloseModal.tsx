'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Field, Input } from '@/shared/ui/Field';
import { Slider } from '@/shared/ui/Slider';
import { formatMoney, formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import type { BacktestTrade } from '../api/types';
import { levelImpact } from '../lib/money';

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

/** Закрытие частью объёма сразу, по текущей цене — без ожидания. */
export function MarketCloseModal({
  trade,
  remaining,
  screenPrice,
  canClose,
  onSubmit,
  onClose,
  isPending,
  error,
}: {
  trade: BacktestTrade;
  remaining: number;
  screenPrice: number;
  /** Как и раньше у «Закрыть по рынку» в OrderPanel: сделку нельзя закрыть в тот же
   * момент, когда она открыта (совпадает с проверкой `timeInvalid` на сервере) —
   * без этого клик по кнопке ничего не делал бы, и без единой подсказки почему. */
  canClose: boolean;
  onSubmit: (qty: number) => void;
  onClose: () => void;
  isPending: boolean;
  error: unknown;
}) {
  const t = useTranslations('backtest');
  const [pct, setPct] = useState(100);
  const qty = (remaining * pct) / 100;
  // Цена не меняется (закрытие сейчас) — levelImpact на равной цене даёт
  // только комиссии, этого достаточно для предпросмотра объёма.
  const impact = levelImpact(trade.direction, screenPrice, screenPrice, qty);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader title={t('marketCloseTitle')} subtitle={`${t('unrealized')} ${formatPriceGrouped(screenPrice)}`} />
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
          {error != null && <p className="neg">{t('actionFailed')}</p>}
        </DialogBody>
        <DialogActions
          confirmLabel={t('marketCloseConfirm')}
          confirmVariant="risk"
          confirmDisabled={isPending || !(qty > 0) || !canClose}
          onConfirm={() => onSubmit(qty)}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
