'use client';

import type { ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Field';
import { KeyValue } from '@/shared/ui/Lookup';
import { Slider } from '@/shared/ui/Slider';
import { fmtPctSigned, formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import type { Direction } from '../api/types';
import {
  applyStopChange,
  fromScreen,
  impliedDirection,
  levelSliderRange,
  previewSize,
  riskAmount,
  signedPctFromStop,
  stopFromSignedPct,
  STOP_RISK_PCT,
  toInput,
  toInputPrice,
  toScreen,
} from '../lib/money';

/** Поля панели — строками, как их набирает человек, и в экранных ценах. */
export interface Draft {
  risk: string;
  stop: string;
  take: string;
  leverage: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const MIN_LEVERAGE = 1;
const MAX_LEVERAGE = 100;

/**
 * Вход, уровни, риск и плечо — панель никогда не смотрит на то, что уже открыто: сама
 * открытая позиция (хедж — до двух сделок разом) и её закрытие живут в
 * `OpenPositionsPanel` под графиком. Единственное, что меняется по тому, какие стороны
 * уже открыты (`openDirections`), — подписи и обработчик кнопок Лонг/Шорт: свой
 * направление добирает уже открытую, чужое — открывает новую независимо от первой.
 *
 * Слайдер стопа задаёт направление и дистанцию одним движением: центр — цена,
 * вправо (плюс) — лонг, влево (минус) — шорт, по 7% в каждую сторону
 * (`stopFromSignedPct`/`signedPctFromStop`). Тейк идёт следом: направление
 * стопа — общее для обоих уровней (`impliedDirection`), диапазон тейка
 * сужается на верную сторону, как только сторона стопа известна
 * (`levelSliderRange`), а если стоп меняет сторону — уже введённый тейк
 * зеркалится вместе с ним, синхронно, в том же обработчике, что двигает стоп
 * (`applyStopChange`).
 */
export function OrderPanel({
  draft,
  onDraft,
  openDirections,
  scale,
  price,
  balance,
  disabled,
  hint,
  onOpen,
  onAdd,
  onFinish,
}: {
  draft: Draft;
  onDraft: (d: Draft) => void;
  /** Стороны уже открытых сделок (хедж — до двух) — решают только подпись и обработчик
   * кнопок Лонг/Шорт: своя сторона добирает, а не открывает заново. Больше ни на что
   * панель не смотрит. */
  openDirections: Direction[];
  scale: number;
  /** Настоящая цена последней показанной минутки. */
  price: number | null;
  balance: number;
  disabled: boolean;
  hint: string | null;
  onOpen: (direction: Direction) => void;
  onAdd: (direction: Direction) => void;
  onFinish: () => void;
}) {
  const t = useTranslations('backtest');
  const set = (key: keyof Draft) => (e: ChangeEvent<HTMLInputElement>) => onDraft({ ...draft, [key]: e.target.value });

  const stop = Number(draft.stop);
  const take = draft.take.trim() ? Number(draft.take) : null;
  const risk = Number(draft.risk);
  const leverage = clamp(Number(draft.leverage) || MIN_LEVERAGE, MIN_LEVERAGE, MAX_LEVERAGE);
  const screenPrice = price != null ? toScreen(price, scale) : null;
  // Панель больше не привязана ни к какой открытой сделке — направление всегда решают
  // только уже набранные стоп/тейк (см. impliedDirection).
  const direction = screenPrice != null ? impliedDirection(null, stop, take, screenPrice) : null;
  const takeRange = screenPrice != null ? levelSliderRange('take', screenPrice, direction) : null;
  const stopSignedPct = screenPrice != null ? clamp(signedPctFromStop(stop || screenPrice, screenPrice), -STOP_RISK_PCT, STOP_RISK_PCT) : null;
  const stopPct = stopSignedPct != null ? -stopSignedPct : null;
  const takeValue = takeRange ? clamp(take ?? screenPrice!, takeRange.min, takeRange.max) : null;
  const takePct = takeValue != null && screenPrice ? ((takeValue - screenPrice) / screenPrice) * 100 : null;

  /** Стоп получил новую цену — тейк зеркалится тут же, если сторона поменялась. */
  const setStop = (newStopScreen: number) => {
    if (screenPrice == null) return;
    onDraft({ ...draft, ...applyStopChange(draft, newStopScreen, screenPrice, null) });
  };
  const setStopText = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (screenPrice == null) {
      onDraft({ ...draft, stop: raw });
      return;
    }
    const { take: nextTake } = applyStopChange(draft, Number(raw), screenPrice, null);
    onDraft({ ...draft, stop: raw, take: nextTake });
  };

  const preview =
    price != null && stop > 0
      ? previewSize(balance, risk, price, fromScreen(stop, scale), leverage, direction ?? 'long')
      : null;
  const riskUsd = riskAmount(balance, risk);

  return (
    <div className="order-panel">
      <p className="lbl">{t('orderType')}</p>

      <KeyValue label={t('balance')}>{formatPriceGrouped(balance)} USDT</KeyValue>

      <Field
        label={
          <span className="fld-head">
            <span className="fld-left">
              <span className="fld-val"></span>
              <span>{t('risk')} {(risk || 0).toFixed(1)}%</span>
            </span>
            {riskUsd != null && <span className="fld-val">{formatPriceGrouped(riskUsd)} USDT</span>}
          </span>
        }
      >
        {() => (
          <Slider
            value={clamp(risk || 0, 0, 10)}
            min={0}
            max={10}
            step={0.1}
            onChange={(v) => onDraft({ ...draft, risk: toInput(v) })}
            aria-label={t('risk')}
          />
        )}
      </Field>

      <Field label={<span className="fld-head"><span>{t('leverageLabel')} {leverage.toFixed(0)}×</span></span>}>
        {() => (
          <Slider
            value={leverage}
            min={MIN_LEVERAGE}
            max={MAX_LEVERAGE}
            step={1}
            onChange={(v) => onDraft({ ...draft, leverage: toInput(v) })}
            aria-label={t('leverageLabel')}
          />
        )}
      </Field>

      <Field
        label={
          <span className="fld-head">
            <span>{t('stop')}</span>
            {stopPct != null && <span className="fld-val">{fmtPctSigned(stopPct)}</span>}
          </span>
        }
      >
        {(id) => (
          <>
            {screenPrice != null && stopSignedPct != null && (
              <Slider
                value={stopSignedPct}
                min={-STOP_RISK_PCT}
                max={STOP_RISK_PCT}
                step={(STOP_RISK_PCT * 2) / 200}
                onChange={(pct) => setStop(stopFromSignedPct(pct, screenPrice))}
                aria-label={t('stop')}
              />
            )}
            <Input id={id} full inputMode="decimal" value={draft.stop} onChange={setStopText} />
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
            {takeRange && takeValue != null && (
              <Slider
                value={takeValue}
                min={takeRange.min}
                max={takeRange.max}
                step={(takeRange.max - takeRange.min) / 200 || 1}
                onChange={(v) => onDraft({ ...draft, take: toInputPrice(v) })}
                aria-label={t('take')}
              />
            )}
            <Input id={id} full inputMode="decimal" value={draft.take} onChange={set('take')} />
          </>
        )}
      </Field>

      {preview && (
        <div className="size-preview">
          <KeyValue label={t('sizeCoin')}>{formatQty(Number(preview.qty.toFixed(3)))}</KeyValue>
          <KeyValue label={t('notionalLabel')}>{formatPriceGrouped(preview.notional)} USDT</KeyValue>
        </div>
      )}
      {preview && <KeyValue label={t('marginLabel')}>{formatPriceGrouped(preview.margin)} USDT</KeyValue>}
      {preview && (
        <KeyValue label={t('liqLabel')} valueClassName="n neg">
          {formatPriceGrouped(toScreen(preview.liqPrice, scale))}
        </KeyValue>
      )}

      {hint && <p className="neg">{hint}</p>}

      <div className="order-actions">
        <Button
          variant="long"
          onClick={() => (openDirections.includes('long') ? onAdd('long') : onOpen('long'))}
          disabled={disabled || balance <= 0}
        >
          {openDirections.includes('long') ? t('addLong') : t('long')}
        </Button>
        <Button
          variant="short"
          onClick={() => (openDirections.includes('short') ? onAdd('short') : onOpen('short'))}
          disabled={disabled || balance <= 0}
        >
          {openDirections.includes('short') ? t('addShort') : t('short')}
        </Button>
      </div>

      <div className="risk-zone">
        <Button variant="risk" onClick={onFinish} disabled={disabled}>
          {t('finish')}
        </Button>
      </div>
    </div>
  );
}
