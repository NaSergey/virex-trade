'use client';

import { useState, type ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Field';
import { KeyValue } from '@/shared/ui/Lookup';
import { Slider } from '@/shared/ui/Slider';
import { cn } from '@/shared/lib/utils/css';
import { fmtPctSigned, formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import type { Direction } from '../api/types';
import {
  applyStopChange,
  curvedSliderPos,
  curvedSliderValue,
  draftTakeFits,
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
import { LeverageModal } from './LeverageModal';

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
const MAX_RISK_PCT = 10;

/**
 * Вход, уровни, риск и плечо — панель никогда не смотрит на то, что уже открыто: сама
 * открытая позиция (хедж — до двух сделок разом), её закрытие и добор существующей
 * сделки живут в `OpenPositionsPanel` под графиком. Кнопки Лонг/Шорт здесь всегда
 * открывают новую независимую сделку — им нечем и незачем знать про уже открытые.
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
  scale,
  price,
  balance,
  disabled,
  hint,
  onOpen,
  onLeverageCommit,
}: {
  draft: Draft;
  onDraft: (d: Draft) => void;
  scale: number;
  /** Настоящая цена последней показанной минутки. */
  price: number | null;
  balance: number;
  /** Кнопки Лонг/Шорт. */
  disabled: boolean;
  hint: string | null;
  onOpen: (direction: Direction) => void;
  /** Плечо, выбранное в диалоге, запоминается как значение по умолчанию для
   * следующей сделки (см. useDefaultLeverage) — вызывается закрытием диалога,
   * а не каждым движением слайдера внутри него. */
  onLeverageCommit: (leverage: number) => void;
}) {
  const t = useTranslations('backtest');
  const set = (key: keyof Draft) => (e: ChangeEvent<HTMLInputElement>) => onDraft({ ...draft, [key]: e.target.value });
  const [leverageOpen, setLeverageOpen] = useState(false);

  const stop = Number(draft.stop);
  const take = draft.take.trim() ? Number(draft.take) : null;
  const risk = Number(draft.risk);
  const leverage = clamp(Number(draft.leverage) || MIN_LEVERAGE, MIN_LEVERAGE, MAX_LEVERAGE);
  const screenPrice = price != null ? toScreen(price, scale) : null;
  // Панель больше не привязана ни к какой открытой сделке — направление всегда решают
  // только уже набранные стоп/тейк (см. impliedDirection).
  const direction = screenPrice != null ? impliedDirection(null, stop, take, screenPrice) : null;
  // Диапазон тейка сужается по стороне СТОПА, а не общего `direction`: тот, пока
  // стоп не поставлен, угадывает направление по самому тейку (см. impliedDirection).
  // Возьми диапазон оттуда — и первое же движение ползунка задавало бы новое
  // направление, диапазон в тот же кадр схлопывался из симметричных ±20% в
  // одностороннюю половину и переезжал под пальцем: та же экранная точка вдруг
  // оказывалась в другом конце трека, и тейк выглядел стартующим не от цены,
  // а от края диапазона.
  const stopDirection = screenPrice != null ? impliedDirection(null, stop, null, screenPrice) : null;
  const takeRange = screenPrice != null ? levelSliderRange('take', screenPrice, stopDirection) : null;
  const stopSignedPct = screenPrice != null ? clamp(signedPctFromStop(stop || screenPrice, screenPrice), -STOP_RISK_PCT, STOP_RISK_PCT) : null;
  const stopPct = stopSignedPct != null ? -stopSignedPct : null;
  const takeValue = takeRange ? clamp(take ?? screenPrice!, takeRange.min, takeRange.max) : null;
  // Подпись — от самого тейка, а не от зажатого в диапазон слайдера: тейк не по ту
  // сторону цены иначе читался бы как «+0.00%», хотя в поле стоит совсем другая цена.
  const takeSet = take != null && take > 0;
  const takePct = screenPrice ? (((takeSet ? take : screenPrice) - screenPrice) / screenPrice) * 100 : null;
  const takeFits = !takeSet || screenPrice == null || draftTakeFits(stop, take, screenPrice);

  // Ползунки риска/стопа/тейка идут по дуге, не линейно: у нуля (0% риска,
  // цена для стопа/тейка) движение мыши даёт мелкий шаг, у края диапазона —
  // крупный. Слайдер получает и отдаёт готовую экранную позицию (−100…100),
  // а не само значение — обратно в значение она переводится в onChange.
  const riskPos = curvedSliderPos(clamp(risk || 0, 0, MAX_RISK_PCT), 0, MAX_RISK_PCT, 0);
  const stopPos = stopSignedPct != null ? curvedSliderPos(stopSignedPct, -STOP_RISK_PCT, STOP_RISK_PCT, 0) : null;
  const takePos =
    takeRange && takeValue != null && screenPrice != null
      ? curvedSliderPos(takeValue, takeRange.min, takeRange.max, screenPrice)
      : null;
  // Как только сторона стопа известна, диапазон тейка сужается на одну сторону от
  // цены (levelSliderRange) — цена становится краем диапазона, а не серединой.
  // Трек слайдера обязан сузиться вместе с ним: полная −100…100 при цене-крае
  // оставляла бы половину трека мёртвой зоной, куда ни попасть значением, ни
  // вытащить оттуда ползунок — он залипал бы в 0 на границе живой и мёртвой
  // половины, то есть на глаз ровно посередине трека.
  const takeSliderMin = takeRange && screenPrice != null && takeRange.min === screenPrice ? 0 : -100;
  const takeSliderMax = takeRange && screenPrice != null && takeRange.max === screenPrice ? 0 : 100;

  /** Стоп получил новую цену — тейк зеркалится тут же, если новый стоп сделал его неверным. */
  const setStop = (newStopScreen: number) => {
    if (screenPrice == null) return;
    onDraft({ ...draft, ...applyStopChange(draft, toInputPrice(newStopScreen), screenPrice, null) });
  };
  const setStopText = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (screenPrice == null) {
      onDraft({ ...draft, stop: raw });
      return;
    }
    onDraft({ ...draft, ...applyStopChange(draft, raw, screenPrice, null) });
  };

  const preview =
    price != null && stop > 0
      ? previewSize(balance, risk, price, fromScreen(stop, scale), leverage, direction ?? 'long')
      : null;
  const riskUsd = riskAmount(balance, risk);

  return (
    <div className="order-panel">
      <div className="fld-head">
        <p className="lbl">{t('orderType')}</p>
        <Button variant="bare" tight className="cue" onClick={() => setLeverageOpen(true)}>
          {t('leverageLabel')} {leverage.toFixed(0)}×
        </Button>
      </div>

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
            value={riskPos}
            min={0}
            max={100}
            step={0.25}
            onChange={(pos) => onDraft({ ...draft, risk: toInput(curvedSliderValue(pos, 0, MAX_RISK_PCT, 0)) })}
            aria-label={t('risk')}
          />
        )}
      </Field>

      <Field
        label={
          <span className="fld-head">
            <span>{t('take')}</span>
            {takePct != null && <span className={cn('fld-val', !takeFits && 'neg')}>{fmtPctSigned(takePct)}</span>}
          </span>
        }
      >
        {(id) => (
          <>
            {takeRange && takePos != null && screenPrice != null && (
              <Slider
                value={takePos}
                min={takeSliderMin}
                max={takeSliderMax}
                step={0.5}
                onChange={(pos) =>
                  onDraft({ ...draft, take: toInputPrice(curvedSliderValue(pos, takeRange.min, takeRange.max, screenPrice)) })
                }
                aria-label={t('take')}
              />
            )}
            <Input id={id} full inputMode="decimal" value={draft.take} onChange={set('take')} />
          </>
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
            {screenPrice != null && stopPos != null && (
              <Slider
                value={stopPos}
                min={-100}
                max={100}
                step={0.5}
                onChange={(pos) => setStop(stopFromSignedPct(curvedSliderValue(pos, -STOP_RISK_PCT, STOP_RISK_PCT, 0), screenPrice))}
                aria-label={t('stop')}
              />
            )}
            <Input id={id} full inputMode="decimal" value={draft.stop} onChange={setStopText} />
          </>
        )}
      </Field>

      <div className="size-preview">
        <KeyValue label={t('sizeCoin')}>{preview ? formatQty(Number(preview.qty.toFixed(3))) : '—'}</KeyValue>
        <KeyValue label={t('notionalLabel')}>{preview ? `${formatPriceGrouped(preview.notional)} USDT` : '—'}</KeyValue>
      </div>
      {hint && <p className="neg">{hint}</p>}

      <div className="order-actions">
        <Button variant="long" onClick={() => onOpen('long')} disabled={disabled || balance <= 0}>
          {t('long')}
        </Button>
        <Button variant="short" onClick={() => onOpen('short')} disabled={disabled || balance <= 0}>
          {t('short')}
        </Button>
      </div>

      {leverageOpen && (
        <LeverageModal
          leverage={leverage}
          onChange={(v) => onDraft({ ...draft, leverage: toInput(v) })}
          onClose={() => {
            setLeverageOpen(false);
            onLeverageCommit(leverage);
          }}
        />
      )}
    </div>
  );
}
