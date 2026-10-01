'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader, useDialogFade } from '@/shared/ui/dialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field, Input } from '@/shared/ui/Field';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { KeyValue } from '@/shared/ui/Lookup';
import { Slider } from '@/shared/ui/Slider';
import { fmtPctSigned, formatMoney, formatPriceGrouped, formatQty, moneyClass } from '@/shared/lib/utils/format';
import type { BacktestTrade } from '../api/types';
import { checkCloseGridSide, closeGridAnchor, closeGridPlan, closeGridPrices, type CloseGridRow } from '../lib/close-grid';
import { fromScreen, levelSliderRange, toInputPrice, toScreen } from '../lib/money';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const MIN_ORDERS = 1;
const MAX_ORDERS = 10;

/**
 * Сетка фиксации позиции: N лимитов закрытия равными частями остатка от
 * первого тейка до последнего и «стоп за тейками» (спека
 * `2026-09-30-close-grid-design.md`). Показывает каждый уровень и итог — среднюю
 * цену выхода и прибыль при исполнении всех ордеров, с комиссиями.
 *
 * Числа — в экранных ценах, как у остальных окон позиции; на сервер уходят
 * настоящие (`fromScreen`).
 */
export function CloseGridModal({
  trade,
  scale,
  screenPrice,
  closeOrdersCount,
  onSubmit,
  onClose,
  isPending,
  error,
  decimals,
  canFollow = true,
}: {
  trade: BacktestTrade;
  scale: number;
  /** Текущая экранная цена монеты сделки. */
  screenPrice: number;
  /** Лимитов закрытия у позиции сейчас — сетка их заменит. */
  closeOrdersCount: number;
  onSubmit: (prices: number[], stopFollow: boolean) => void;
  onClose: () => void;
  isPending: boolean;
  error: unknown;
  decimals?: number;
  /**
   * Есть ли кому двигать стоп за тейками. У сессии его двигает наш сервер
   * (`followStop`); на бирже ордера исполняет она, и переноса нет — тогда окно
   * его не предлагает и не показывает колонку «стоп после».
   */
  canFollow?: boolean;
}) {
  const t = useTranslations('backtest');
  const { closing, close } = useDialogFade(onClose);
  const sign = trade.direction === 'long' ? 1 : -1;
  const entry = toScreen(trade.entryPrice, scale);
  // Тейки считаются не от цены графика, а от входа — если позиция в минусе, —
  // иначе первый тейк вставал бы в убыток (см. closeGridAnchor).
  const anchor = closeGridAnchor(trade.direction, entry, screenPrice);
  const [first, setFirst] = useState(() => anchor * (1 + sign * 0.01));
  const [last, setLast] = useState(() => anchor * (1 + sign * 0.03));
  const [count, setCount] = useState('3');
  // Позиция без сетки — перенос включён: ради него окно обычно и открывают.
  const [wantFollow, setStopFollow] = useState(() => trade.stopFollow || closeOrdersCount === 0);
  const stopFollow = canFollow && wantFollow;

  const n = clamp(Math.round(Number(count) || MIN_ORDERS), MIN_ORDERS, MAX_ORDERS);
  const range = levelSliderRange('take', anchor, trade.direction);
  const screenPrices = closeGridPrices(first, last, n);
  const remaining = trade.qty - trade.closedQty;
  const plan = closeGridPlan(
    { direction: trade.direction, entryPrice: trade.entryPrice, stopLoss: trade.stopLoss },
    screenPrices.map((p) => fromScreen(p, scale)),
    remaining,
    stopFollow,
  );
  const err = checkCloseGridSide(trade.direction, screenPrices, anchor);
  const price = (p: number) => formatPriceGrouped(toScreen(p, scale), decimals);
  /** Отступ экранной цены от входа, в процентах: тейк меряют от входа, а не от графика. */
  const pct = (screen: number) => fmtPctSigned(((screen - entry) / entry) * 100);

  const columns: LedgerColumn<CloseGridRow & { i: number }>[] = [
    { key: 'i', header: '№', render: (r) => r.i + 1 },
    { key: 'price', header: t('colOrderPrice'), align: 'right', cellClassName: 'n', render: (r) => price(r.price) },
    { key: 'qty', header: t('colOrderQty'), align: 'right', cellClassName: 'n', render: (r) => formatQty(Number(r.qty.toFixed(4))) },
    {
      key: 'pnl',
      header: t('closeGridLevelPnl'),
      align: 'right',
      cellClassName: 'n',
      render: (r) => <span className={moneyClass(r.pnl)}>{formatMoney(r.pnl)}</span>,
    },
    ...(stopFollow
      ? [
          {
            key: 'stop',
            header: t('closeGridStopAfter'),
            align: 'right' as const,
            cellClassName: 'n',
            render: (r: CloseGridRow) => (r.stopAfter != null ? price(r.stopAfter) : '—'),
          },
        ]
      : []),
  ];

  const levelField = (label: string, value: number, set: (v: number) => void) => (
    <Field
      label={
        <span className="fld-head">
          <span>{label}</span>
          <span className="fld-val">{pct(value)}</span>
        </span>
      }
    >
      {(id) => (
        <>
          <Slider
            value={clamp(value, range.min, range.max)}
            min={range.min}
            max={range.max}
            step={(range.max - range.min) / 200 || 1}
            onChange={set}
            aria-label={label}
          />
          <Input id={id} full inputMode="decimal" value={toInputPrice(value)} onChange={(e) => set(Number(e.target.value))} />
        </>
      )}
    </Field>
  );

  return (
    <Dialog open={!closing} onOpenChange={(v) => !v && close()}>
      <DialogContent>
        <DialogHeader
          title={t('closeGridTitle')}
          subtitle={`${trade.symbol} · ${t(`direction.${trade.direction}`)} · ${t('entry')} ${price(trade.entryPrice)} · ${t('unrealized')} ${formatPriceGrouped(screenPrice, decimals)}`}
        />
        <DialogBody>
          {levelField(t('closeGridFirst'), first, setFirst)}
          {levelField(t('closeGridLast'), last, setLast)}
          <Field label={t('ordersCount')}>
            {(id) => <Input id={id} full inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />}
          </Field>
          {canFollow ? (
            <label className="opt" data-on={stopFollow}>
              <input type="checkbox" checked={stopFollow} onChange={(e) => setStopFollow(e.target.checked)} />
              <span className="opt-n">
                {t('closeGridFollow')}
                <span className="muted"> — {t('closeGridFollowHint')}</span>
              </span>
            </label>
          ) : (
            <p className="muted">{t('closeGridNoFollow')}</p>
          )}

          <LedgerTable columns={columns} rows={plan.rows.map((r, i) => ({ ...r, i }))} rowKey={(r) => String(r.i)} />
          <div className="size-preview">
            <KeyValue label={t('closeGridAvgExit')}>{plan.avgExit != null ? price(plan.avgExit) : '—'}</KeyValue>
            <KeyValue label={t('closeGridTotalPnl')} valueClassName={`n ${moneyClass(plan.pnl)}`}>
              {formatMoney(plan.pnl)} USDT
            </KeyValue>
          </div>

          {closeOrdersCount > 0 && <p className="muted">{t('closeGridReplaces', { n: closeOrdersCount })}</p>}
          {err && <p className="neg">{t(`closeGridSide.${trade.direction}`)}</p>}
          <ErrorNote error={error} fallback={t('actionFailed')} />
        </DialogBody>
        <DialogActions
          confirmLabel={t('closeGridConfirm')}
          confirmDisabled={isPending || err != null || !(remaining > 0)}
          onConfirm={() => onSubmit(screenPrices.map((p) => fromScreen(p, scale)), stopFollow)}
          onCancel={close}
        />
      </DialogContent>
    </Dialog>
  );
}
