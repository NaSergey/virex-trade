'use client';

import type { ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Field';
import { Money } from '@/shared/ui/Money';
import { Tooltip } from '@/shared/ui/Tooltip';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import type { BacktestTrade, Direction } from '../api/types';
import { formatR, fromScreen, previewSize, toScreen, unrealizedPnl } from '../lib/money';

/** Поля панели — строками, как их набирает человек, и в экранных ценах. */
export interface Draft {
  risk: string;
  stop: string;
  take: string;
}

/**
 * Вход, уровни и выход. Размер позиции показывается номиналом в USDT и плечом,
 * а не в монетах: при скрытой цене число монет вместе с расстоянием до стопа
 * выдало бы настоящий уровень цены.
 */
export function OrderPanel({
  draft,
  onDraft,
  openTrade,
  scale,
  price,
  balance,
  disabled,
  canClose,
  hint,
  onOpen,
  onApply,
  onClose,
  onFinish,
}: {
  draft: Draft;
  onDraft: (d: Draft) => void;
  openTrade: BacktestTrade | null;
  scale: number;
  /** Настоящая цена последней показанной минутки. */
  price: number | null;
  balance: number;
  disabled: boolean;
  canClose: boolean;
  hint: string | null;
  onOpen: (direction: Direction) => void;
  onApply: () => void;
  onClose: () => void;
  onFinish: () => void;
}) {
  const t = useTranslations('backtest');
  const set = (key: keyof Draft) => (e: ChangeEvent<HTMLInputElement>) => onDraft({ ...draft, [key]: e.target.value });

  const stop = Number(draft.stop);
  const preview =
    !openTrade && price != null && stop > 0 ? previewSize(balance, Number(draft.risk), price, fromScreen(stop, scale)) : null;
  const pnl = openTrade && price != null ? unrealizedPnl(openTrade.direction, openTrade.entryPrice, price, openTrade.qty) : null;

  return (
    <div className="order-panel">
      <p className="muted">
        {t('balance')}: {formatPriceGrouped(balance)} USDT
      </p>

      {openTrade ? (
        <>
          <p>
            {t(`direction.${openTrade.direction}`)} · {t('entry')} {formatPriceGrouped(toScreen(openTrade.entryPrice, scale))}
          </p>
          {pnl != null && (
            <p>
              {t('unrealized')}: <Money value={pnl} unit="USDT" />{' '}
              <Tooltip text={t('rHint')}>
                <span className={pnl >= 0 ? 'pos' : 'neg'}>{formatR(pnl / openTrade.riskUsdt)}</span>
              </Tooltip>
            </p>
          )}
        </>
      ) : (
        <Field label={t('risk')}>
          {(id) => <Input id={id} full inputMode="decimal" value={draft.risk} onChange={set('risk')} />}
        </Field>
      )}

      <Field label={t('stop')}>
        {(id) => <Input id={id} full inputMode="decimal" value={draft.stop} onChange={set('stop')} />}
      </Field>
      <Field label={t('take')}>
        {(id) => <Input id={id} full inputMode="decimal" value={draft.take} onChange={set('take')} />}
      </Field>

      {hint && <p className="neg">{hint}</p>}

      {openTrade ? (
        <>
          <Button onClick={onApply} disabled={disabled}>
            {t('apply')}
          </Button>
          <Button onClick={onClose} disabled={disabled || !canClose}>
            {t('closeMarket')}
          </Button>
        </>
      ) : (
        <>
          {preview && (
            <p className="muted">
              {t('preview', {
                notional: formatPriceGrouped(preview.notional),
                leverage: preview.leverage.toFixed(1),
                risk: formatPriceGrouped(preview.riskUsdt),
              })}
            </p>
          )}
          <Button variant="solid" onClick={() => onOpen('long')} disabled={disabled}>
            {t('long')}
          </Button>
          <Button onClick={() => onOpen('short')} disabled={disabled}>
            {t('short')}
          </Button>
        </>
      )}

      <Button variant="risk" onClick={onFinish} disabled={disabled}>
        {t('finish')}
      </Button>
    </div>
  );
}
