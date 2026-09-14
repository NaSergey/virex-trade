'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field } from '@/shared/ui/Field';
import { Slider } from '@/shared/ui/Slider';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import type { BacktestTrade } from '../api/types';
import { averageIn, previewSize, riskAmount, toScreen } from '../lib/money';

const DEFAULT_RISK = 1;

/**
 * Добор к открытой позиции — со своим риском, а не с тем, что стоит в панели ордера:
 * панель про следующий ордер, и её слайдер не должен молча решать размер добора. Стоп
 * у добора общий с позицией, поэтому размер считается от него, а средний вход виден
 * заранее: сервер откажет, если тот уйдёт за стоп или тейк.
 */
export function AddToPositionModal({
  trade,
  balance,
  price,
  scale,
  onSubmit,
  onClose,
  isPending,
  error,
}: {
  trade: BacktestTrade;
  balance: number;
  /** Настоящая цена момента — по ней войдёт добор. */
  price: number;
  scale: number;
  onSubmit: (riskPct: number) => void;
  onClose: () => void;
  isPending: boolean;
  error: unknown;
}) {
  const t = useTranslations('backtest');
  const [risk, setRisk] = useState(DEFAULT_RISK);
  const riskUsd = riskAmount(balance, risk);
  const size = previewSize(balance, risk, price, trade.stopLoss, trade.leverage, trade.direction);
  // Тот же расчёт, что на сервере (`addToTrade`): от полного qty сделки, не от остатка.
  const newEntry = size ? averageIn(trade.qty, trade.entryPrice, size.qty, price) : null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader
          title={t('addToPositionTitle')}
          subtitle={`${t(`direction.${trade.direction}`)} · ${formatPriceGrouped(toScreen(trade.entryPrice, scale))}`}
        />
        <DialogBody>
          <Field
            label={
              <span className="fld-head">
                <span>
                  {t('risk')} {risk.toFixed(1)}%
                </span>
                {riskUsd != null && <span className="fld-val">{formatPriceGrouped(riskUsd)} USDT</span>}
              </span>
            }
          >
            {() => <Slider value={risk} min={0.1} max={10} step={0.1} onChange={setRisk} aria-label={t('risk')} />}
          </Field>
          {newEntry != null && (
            <p className="muted">{t('addToPositionHint', { entry: formatPriceGrouped(toScreen(newEntry, scale)) })}</p>
          )}
          <ErrorNote error={error} fallback={t('actionFailed')} />
        </DialogBody>
        <DialogActions
          confirmLabel={t('addToPosition')}
          confirmDisabled={isPending || size == null}
          onConfirm={() => onSubmit(risk)}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
