'use client';

import type { ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Field';
import { KeyValue } from '@/shared/ui/Lookup';
import { Money } from '@/shared/ui/Money';
import { Slider } from '@/shared/ui/Slider';
import { Tooltip } from '@/shared/ui/Tooltip';
import { formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import type { BacktestTrade, Direction } from '../api/types';
import { formatR, fromScreen, levelSliderRange, previewSize, riskAmount, toScreen, unrealizedPnl } from '../lib/money';

/** Поля панели — строками, как их набирает человек, и в экранных ценах. */
export interface Draft {
  risk: string;
  stop: string;
  take: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Вход, уровни и выход. Размер позиции показывается номиналом в USDT, плечом
 * и количеством монет — количество монет добавлено рядом с уже видимым
 * номиналом, а не самостоятельной строкой: при скрытой цене число монет
 * вместе с расстоянием до стопа выдало бы настоящий уровень цены, но рядом
 * с номиналом в USDT это уже не новая утечка.
 *
 * Риск и уровни правит слайдер поверх текстового поля: оба меняют один и тот
 * же черновик, поле остаётся источником точного числа тем, кому слайдер
 * недостаточно точен. Диапазон слайдера стопа/тейка симметричный вокруг
 * цены, пока сделка не открыта (направление ещё не выбрано), и сужается на
 * верную сторону, когда сделка уже идёт (`levelSliderRange`).
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
  const take = draft.take.trim() ? Number(draft.take) : null;
  const risk = Number(draft.risk);
  const direction = openTrade?.direction ?? null;
  const screenPrice = price != null ? toScreen(price, scale) : null;
  const stopRange = screenPrice != null ? levelSliderRange('stop', screenPrice, direction) : null;
  const takeRange = screenPrice != null ? levelSliderRange('take', screenPrice, direction) : null;

  const preview =
    !openTrade && price != null && stop > 0 ? previewSize(balance, risk, price, fromScreen(stop, scale)) : null;
  const pnl = openTrade && price != null ? unrealizedPnl(openTrade.direction, openTrade.entryPrice, price, openTrade.qty) : null;
  const riskUsd = riskAmount(balance, risk);

  return (
    <div className="order-panel">
      <p className="lbl">{t('orderType')}</p>

      <KeyValue label={t('balance')}>{formatPriceGrouped(balance)} USDT</KeyValue>

      {openTrade ? (
        <>
          <KeyValue label={t('positionLabel')} valueClassName="">
            <span className={`dir${openTrade.direction === 'short' ? ' short' : ''}`}>
              {t(`direction.${openTrade.direction}`)}
            </span>
          </KeyValue>
          <KeyValue label={t('entry')}>{formatPriceGrouped(toScreen(openTrade.entryPrice, scale))}</KeyValue>
          {pnl != null && (
            <KeyValue label={t('unrealized')} valueClassName={`n ${pnl >= 0 ? 'pos' : 'neg'}`}>
              <Money value={pnl} unit="USDT" />{' '}
              <Tooltip text={t('rHint')}>
                <span>{formatR(pnl / openTrade.riskUsdt)}</span>
              </Tooltip>
            </KeyValue>
          )}
        </>
      ) : (
        <Field label={t('risk')}>
          {(id) => (
            <>
              <Slider
                value={clamp(risk || 0, 0, 10)}
                min={0}
                max={10}
                step={0.1}
                onChange={(v) => onDraft({ ...draft, risk: String(v) })}
                aria-label={t('risk')}
              />
              <Input id={id} full inputMode="decimal" value={draft.risk} onChange={set('risk')} />
            </>
          )}
        </Field>
      )}

      {!openTrade && riskUsd != null && (
        <KeyValue label={t('riskAmountLabel')}>{formatPriceGrouped(riskUsd)} USDT</KeyValue>
      )}

      <Field label={t('stop')}>
        {(id) => (
          <>
            {stopRange && (
              <Slider
                value={clamp(stop || screenPrice!, stopRange.min, stopRange.max)}
                min={stopRange.min}
                max={stopRange.max}
                step={(stopRange.max - stopRange.min) / 200 || 1}
                onChange={(v) => onDraft({ ...draft, stop: String(v) })}
                aria-label={t('stop')}
              />
            )}
            <Input id={id} full inputMode="decimal" value={draft.stop} onChange={set('stop')} />
          </>
        )}
      </Field>
      <Field label={t('take')}>
        {(id) => (
          <>
            {takeRange && (
              <Slider
                value={clamp(take ?? screenPrice!, takeRange.min, takeRange.max)}
                min={takeRange.min}
                max={takeRange.max}
                step={(takeRange.max - takeRange.min) / 200 || 1}
                onChange={(v) => onDraft({ ...draft, take: String(v) })}
                aria-label={t('take')}
              />
            )}
            <Input id={id} full inputMode="decimal" value={draft.take} onChange={set('take')} />
          </>
        )}
      </Field>

      {!openTrade && preview && (
        <div className="size-preview">
          <KeyValue label={t('sizeCoin')}>{formatQty(preview.qty)}</KeyValue>
          <KeyValue label={t('notionalLabel')}>{formatPriceGrouped(preview.notional)} USDT</KeyValue>
        </div>
      )}
      {!openTrade && preview && <KeyValue label={t('leverageLabel')}>{preview.leverage.toFixed(1)}×</KeyValue>}

      {hint && <p className="neg">{hint}</p>}

      {openTrade ? (
        <>
          <Button onClick={onApply} disabled={disabled}>
            {t('apply')}
          </Button>
          <Button variant="risk" onClick={onClose} disabled={disabled || !canClose}>
            {t('closeMarket')}
          </Button>
        </>
      ) : (
        <div className="order-actions">
          <Button variant="long" onClick={() => onOpen('long')} disabled={disabled || balance <= 0}>
            {t('long')}
          </Button>
          <Button variant="short" onClick={() => onOpen('short')} disabled={disabled || balance <= 0}>
            {t('short')}
          </Button>
        </div>
      )}

      <div className="risk-zone">
        <Button variant="risk" onClick={onFinish} disabled={disabled}>
          {t('finish')}
        </Button>
      </div>
    </div>
  );
}
