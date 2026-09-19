'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Field, Input } from '@/shared/ui/Field';
import { Slider } from '@/shared/ui/Slider';
import { formatMoney, formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import type { BacktestTrade } from '../api/types';
import { fromScreen, levelImpact, toInputPrice, toScreen } from '../lib/money';

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
}: {
  trade: BacktestTrade;
  /** Остаток открытой позиции в монете (qty - closedQty). */
  remaining: number;
  scale: number;
  screenPrice: number;
  onSubmit: (price: number, qty: number) => void;
  onClose: () => void;
  isPending: boolean;
  error: unknown;
}) {
  const t = useTranslations('backtest');
  const [price, setPrice] = useState(screenPrice);
  const [pct, setPct] = useState(100);
  const qty = (remaining * pct) / 100;
  const impact = levelImpact(trade.direction, screenPrice, price, qty);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader
          title={t('limitCloseTitle')}
          subtitle={`${t('entry')} ${formatPriceGrouped(toScreen(trade.entryPrice, scale))} · ${t('unrealized')} ${formatPriceGrouped(screenPrice)}`}
        />
        <DialogBody>
          <Field label={t('closingPrice')}>
            {(id) => (
              <Input id={id} full inputMode="decimal" value={toInputPrice(price)} onChange={(e) => setPrice(Number(e.target.value))} />
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
            {t('limitCloseHint', { qty: formatQty(qty), price: formatPriceGrouped(price), pnl: formatMoney(impact.usdt) })}
          </p>
          {error != null && <p className="neg">{t('actionFailed')}</p>}
        </DialogBody>
        <DialogActions
          confirmLabel={t('limitCloseConfirm')}
          confirmDisabled={isPending || !(qty > 0) || !(price > 0)}
          onConfirm={() => onSubmit(fromScreen(price, scale), qty)}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
