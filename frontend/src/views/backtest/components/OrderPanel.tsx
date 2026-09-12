'use client';

import type { ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Field';
import { KeyValue } from '@/shared/ui/Lookup';
import { Money } from '@/shared/ui/Money';
import { Slider } from '@/shared/ui/Slider';
import { Tooltip } from '@/shared/ui/Tooltip';
import { fmtPctSigned, formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import type { BacktestTrade, Direction } from '../api/types';
import {
  applyStopChange,
  formatR,
  fromScreen,
  impliedDirection,
  levelSliderRange,
  previewSize,
  riskAmount,
  signedPctFromStop,
  stopFromSignedPct,
  STOP_RISK_PCT,
  toInput,
  toScreen,
  unrealizedPnl,
} from '../lib/money';

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
 * недостаточно точен.
 *
 * Слайдер стопа задаёт направление и дистанцию одним движением: центр —
 * цена, вправо (плюс) — лонг, влево (минус) — шорт, по 7% в каждую сторону
 * (`stopFromSignedPct`/`signedPctFromStop`). Тейк идёт следом: направление
 * стопа — общее для обоих уровней (`impliedDirection`), диапазон тейка
 * сужается на верную сторону, как только сторона стопа известна
 * (`levelSliderRange`), а если стоп меняет сторону — уже введённый тейк
 * зеркалится вместе с ним, синхронно, в том же обработчике, что двигает
 * стоп (`applyStopChange`), а не отдельным эффектом на кадр позже.
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
  const screenPrice = price != null ? toScreen(price, scale) : null;
  // Сторона стопа/тейка одна на двоих: без неё диапазоны выбирались бы
  // независимо, и слайдер тейка на глаз никак не был бы связан со стопом,
  // хотя в одной сделке они обязаны стоять по разные стороны цены.
  const direction = screenPrice != null ? impliedDirection(openTrade?.direction ?? null, stop, take, screenPrice) : null;
  const takeRange = screenPrice != null ? levelSliderRange('take', screenPrice, direction) : null;
  // Слайдер стопа — центр на цене, вправо (плюс) лонг, влево (минус) шорт,
  // по 7% в каждую сторону: направление и дистанция одним числом, вместо
  // диапазона, который сужался в сторону уже выбранного (или подразумеваемого
  // по знаку самого стопа) направления — это путало, куда крутить.
  const stopSignedPct = screenPrice != null ? clamp(signedPctFromStop(stop || screenPrice, screenPrice), -STOP_RISK_PCT, STOP_RISK_PCT) : null;
  // Значение тейка и подпись — от одного и того же зажатого числа, иначе на
  // краю диапазона слайдер и подпись разошлись бы на глаз.
  const takeValue = takeRange ? clamp(take ?? screenPrice!, takeRange.min, takeRange.max) : null;
  const takePct = takeValue != null && screenPrice ? ((takeValue - screenPrice) / screenPrice) * 100 : null;

  /** Стоп получил новую цену — тейк зеркалится тут же, если сторона поменялась (см. `applyStopChange`). */
  const setStop = (newStopScreen: number) => {
    if (screenPrice == null) return;
    onDraft({ ...draft, ...applyStopChange(draft, newStopScreen, screenPrice, openTrade?.direction ?? null) });
  };
  /** То же самое из текстового поля: сам стоп остаётся как напечатан (без переформатирования на каждый знак), зеркалится только тейк. */
  const setStopText = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (screenPrice == null) {
      onDraft({ ...draft, stop: raw });
      return;
    }
    const { take: nextTake } = applyStopChange(draft, Number(raw), screenPrice, openTrade?.direction ?? null);
    onDraft({ ...draft, stop: raw, take: nextTake });
  };

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
                onChange={(v) => onDraft({ ...draft, risk: toInput(v) })}
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
            {screenPrice != null && stopSignedPct != null && (
              <div className="lvl-row">
                <Slider
                  value={stopSignedPct}
                  min={-STOP_RISK_PCT}
                  max={STOP_RISK_PCT}
                  step={(STOP_RISK_PCT * 2) / 200}
                  onChange={(pct) => setStop(stopFromSignedPct(pct, screenPrice))}
                  aria-label={t('stop')}
                />
                <span className="lvl-pct">{fmtPctSigned(stopSignedPct)}</span>
              </div>
            )}
            <Input id={id} full inputMode="decimal" value={draft.stop} onChange={setStopText} />
          </>
        )}
      </Field>
      <Field label={t('take')}>
        {(id) => (
          <>
            {takeRange && takeValue != null && (
              <div className="lvl-row">
                <Slider
                  value={takeValue}
                  min={takeRange.min}
                  max={takeRange.max}
                  step={(takeRange.max - takeRange.min) / 200 || 1}
                  onChange={(v) => onDraft({ ...draft, take: toInput(v) })}
                  aria-label={t('take')}
                />
                <span className="lvl-pct">{fmtPctSigned(takePct!)}</span>
              </div>
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
