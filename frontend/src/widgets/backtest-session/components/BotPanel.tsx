'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field, Input } from '@/shared/ui/Field';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { KeyValue } from '@/shared/ui/Lookup';
import { Slider } from '@/shared/ui/Slider';
import { formatMoney, formatPriceGrouped, formatQty, moneyClass } from '@/shared/lib/utils/format';
import type { BacktestBot } from '../api/types';
import { BOT_MAX_LEVELS, botGridError, botPrices, botQty, botStep, splitAtPrice, type BotGrid } from '../lib/bot-grid';
import { levelShares } from '../lib/level-table';
import { FEE_RATE, curvedSliderPos, curvedSliderValue, fromScreen, levelSliderRange, riskAmount, toInput, toInputPrice } from '../lib/money';
import { EditCell, SplitHeader, withPin } from './EditCell';

/** Черновик бота — строками, в экранных ценах, как остальные черновики панели. */
export interface BotDraft {
  risk: string;
  upper: string;
  lower: string;
  stop: string;
  count: string;
  /** Закреплённые доли уровней в процентах — по номеру уровня снизу (0 — нижний). */
  qtyPins: Record<number, number>;
  /** «Стоп после тейка» уровня (экранные цены) — по номеру уровня снизу. */
  stopPins: Record<number, number>;
  stopFollow: boolean;
}

/** Что уходит на сервер, кроме цены и момента запуска: сетка в настоящих ценах. */
export interface BotSubmit {
  lower: number;
  upper: number;
  stopLoss: number;
  levels: number;
  riskPct: number;
  shares: number[];
  stopsAfter?: number[];
  stopFollow: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Число уровней из поля: целое в пределах, которые примет сервер. */
export const botLevelsOf = (count: string) => clamp(Math.round(Number(count)) || 0, 0, BOT_MAX_LEVELS);

/**
 * Сетка бота из черновика — в настоящих ценах, с долями уровней и целями стопа:
 * её показывает таблица и её же отправляет экран (`SessionScreen.startBot`).
 */
export function botFromDraft(draft: BotDraft, scale: number): { grid: BotGrid; submit: BotSubmit; over: boolean } {
  const levels = botLevelsOf(draft.count);
  const { shares, over } = levelShares(levels, draft.qtyPins);
  const grid: BotGrid = {
    lower: fromScreen(Number(draft.lower), scale),
    upper: fromScreen(Number(draft.upper), scale),
    levels,
    stopLoss: fromScreen(Number(draft.stop), scale),
    shares,
  };
  const stopsAfter = draft.stopFollow
    ? Array.from({ length: levels }, (_, j) => (draft.stopPins[j] != null ? fromScreen(draft.stopPins[j], scale) : 0))
    : undefined;
  return {
    grid,
    submit: {
      lower: grid.lower,
      upper: grid.upper,
      stopLoss: grid.stopLoss,
      levels,
      riskPct: Number(draft.risk) || 0,
      shares,
      stopsAfter,
      stopFollow: draft.stopFollow,
    },
    over,
  };
}

interface BotRow {
  j: number;
  buy: number;
  sell: number;
  share: number;
  qty: number;
  /** Цикл «покупка → продажа» с комиссиями, USDT. */
  cycle: number;
  pinned: boolean;
}

/**
 * Вкладка «Бот» панели ордера: грид-бот в диапазоне, который задаёт человек
 * (спеки 2026-10-09-range-indicator-and-grid-bot-design.md и
 * 2026-10-09-grid-tables-and-bot-everywhere-design.md). Раскладка — как у сетки
 * фиксации: границы и стоп — ползунок с полем, таблица уровней с долями объёма и
 * «Стопом после тейка». Черновик живёт у `SessionScreen`: верх, низ и стоп —
 * ещё и линии на графике. Работающий бот монеты графика показывается вместо полей.
 */
export function BotPanel({
  draft,
  onDraft,
  price,
  scale,
  balance,
  maxRisk,
  priceDecimals,
  bot,
  error,
  busy,
  onStart,
  onStop,
}: {
  draft: BotDraft;
  onDraft: (d: BotDraft) => void;
  /** Настоящая цена последней минутки; null — её ещё нет. */
  price: number | null;
  scale: number;
  balance: number;
  /** Верхняя граница ползунка риска, % депозита — из настроек терминала. */
  maxRisk: number;
  priceDecimals?: number;
  /** Работающий бот монеты графика или последний остановленный. */
  bot: BacktestBot | null;
  error: unknown;
  busy: boolean;
  onStart: () => void;
  onStop: (botId: string) => void;
}) {
  const t = useTranslations('backtest');
  const te = useTranslations('errors');
  /** Цена на экране: при скрытой цене — в единицах графика. */
  const fmtScreen = (v: number) => formatPriceGrouped(v, priceDecimals);
  const note = <p className="muted">{t('botInDev')}</p>;

  if (bot?.status === 'active') {
    return (
      <div className="bot-card">
        {note}
        <p>{t('botRunning')}</p>
        <KeyValue label={t('botRange')}>
          {fmtScreen(bot.lower * scale)}–{fmtScreen(bot.upper * scale)}
        </KeyValue>
        <KeyValue label={t('botLevels')}>{bot.levels}</KeyValue>
        <KeyValue label={t('botStopLabel')}>{fmtScreen(bot.stopLoss * scale)}</KeyValue>
        <KeyValue label={t('botClosedPnl')} valueClassName={`n ${moneyClass(bot.closedPnl)}`}>
          {formatPriceGrouped(bot.closedPnl, 2)} USDT
        </KeyValue>
        <ErrorNote error={error} fallback={t('actionFailed')} />
        <div className="order-actions">
          <Button variant="bare" onClick={() => onStop(bot.id)} disabled={busy}>
            {t('botStopButton')}
          </Button>
        </div>
      </div>
    );
  }

  const risk = Number(draft.risk) || 0;
  const loss = riskAmount(balance, risk);
  const { grid, over } = botFromDraft(draft, scale);
  const invalid = price == null ? null : botGridError(grid, price);
  const ready = price != null && invalid == null && !over;
  const step = grid.levels > 0 ? botStep(grid) : 0;
  const screenPrice = price != null ? price * scale : null;

  const rows: BotRow[] = ready
    ? botPrices(grid)
        .map((buy, j) => {
          const qty = botQty(grid, balance, risk, j);
          const sell = buy + step;
          return {
            j,
            buy,
            sell,
            share: grid.shares?.[j] ?? 1 / grid.levels,
            qty,
            cycle: qty * step - qty * (buy + sell) * FEE_RATE,
            pinned: draft.qtyPins[j] != null,
          };
        })
        .reverse()
    : [];
  const atMarket = ready ? splitAtPrice(botPrices(grid), price).market.length : null;

  const columns: LedgerColumn<BotRow>[] = [
    { key: 'j', header: '№', cellClassName: 'cg-no', render: (r) => r.j + 1 },
    { key: 'buy', header: t('botColBuy'), align: 'right', cellClassName: 'n', render: (r) => fmtScreen(r.buy * scale) },
    { key: 'sell', header: t('botColSell'), align: 'right', cellClassName: 'n', render: (r) => fmtScreen(r.sell * scale) },
    {
      key: 'qty',
      label: t('colOrderQty'),
      header: <SplitHeader label={t('colOrderQty')} hint={t('closeGridSplit')} onSplit={() => onDraft({ ...draft, qtyPins: {} })} />,
      align: 'right',
      render: (r) => (
        <EditCell
          display={`${draft.qtyPins[r.j] ?? Math.round(r.share * 1000) / 10}%`}
          note={formatQty(Number(r.qty.toFixed(4)))}
          pinned={r.pinned}
          label={`${t('colOrderQty')} ${r.j + 1}`}
          hint={t('gridQtyHint')}
          onCommit={(v) => onDraft({ ...draft, qtyPins: withPin(draft.qtyPins, r.j, v) })}
        />
      ),
    },
    {
      key: 'cycle',
      header: t('botColCycle'),
      align: 'right',
      cellClassName: 'n',
      render: (r) => <span className={moneyClass(r.cycle)}>{formatMoney(r.cycle)}</span>,
    },
    ...(draft.stopFollow
      ? [
          {
            key: 'stop',
            header: t('botStopAfter'),
            align: 'right' as const,
            render: (r: BotRow) => {
              const pin = draft.stopPins[r.j];
              // Цель не ниже цены продажи — стоп за ценой закрыл бы остаток сразу; сервер её пропустит.
              const ignored = pin != null && pin >= r.sell * scale;
              return (
                <EditCell
                  display={pin != null ? fmtScreen(pin) : ''}
                  pinned={pin != null}
                  ignored={ignored}
                  label={`${t('botStopAfter')} ${r.j + 1}`}
                  hint={ignored ? t('closeGridStopIgnored') : t('botStopHint')}
                  onCommit={(v) => onDraft({ ...draft, stopPins: withPin(draft.stopPins, r.j, v) })}
                />
              );
            },
          },
        ]
      : []),
  ];

  // Границы и стоп — ползунок с полем, как у сетки фиксации; ползунок — ±7 % от
  // цены (тот же диапазон, что у верха и низа «Сетки»), поле принимает любое число.
  const range = screenPrice != null ? levelSliderRange('stop', screenPrice, null) : null;
  const priceField = (label: string, key: 'upper' | 'lower' | 'stop') => {
    const value = Number(draft[key]);
    return (
      <Field label={label}>
        {(id) => (
          <>
            {range && screenPrice != null && (
              <Slider
                value={curvedSliderPos(clamp(value || screenPrice, range.min, range.max), range.min, range.max, screenPrice)}
                min={-100}
                max={100}
                step={0.5}
                onChange={(pos) => onDraft({ ...draft, [key]: toInputPrice(curvedSliderValue(pos, range.min, range.max, screenPrice)) })}
                aria-label={label}
              />
            )}
            <Input id={id} full inputMode="decimal" value={draft[key]} onChange={(e) => onDraft({ ...draft, [key]: e.target.value })} />
          </>
        )}
      </Field>
    );
  };

  return (
    <>
      {note}
      {bot && (
        <p className="muted">
          {t('botStoppedTitle', { reason: t(`botReason_${bot.stopReason ?? 'user'}`) })} ·{' '}
          <span className={moneyClass(bot.closedPnl)}>{formatPriceGrouped(bot.closedPnl, 2)} USDT</span>
        </p>
      )}
      <Field
        label={
          <span className="fld-head">
            <span>
              {t('risk')} {risk.toFixed(1)}%
            </span>
            {loss != null && <span className="fld-val">{formatPriceGrouped(loss)} USDT</span>}
          </span>
        }
      >
        {() => (
          <Slider
            value={curvedSliderPos(clamp(risk, 0, maxRisk), 0, maxRisk, 0)}
            min={0}
            max={100}
            step={0.25}
            onChange={(pos) => onDraft({ ...draft, risk: toInput(curvedSliderValue(pos, 0, maxRisk, 0)) })}
            aria-label={t('risk')}
          />
        )}
      </Field>
      {priceField(t('botUpper'), 'upper')}
      {priceField(t('botLower'), 'lower')}
      {priceField(t('botStopLabel'), 'stop')}
      <Field label={t('botLevels')}>
        {(id) => <Input id={id} full inputMode="numeric" value={draft.count} onChange={(e) => onDraft({ ...draft, count: e.target.value, qtyPins: {}, stopPins: {} })} />}
      </Field>
      <label className="opt" data-on={draft.stopFollow}>
        <input type="checkbox" checked={draft.stopFollow} onChange={(e) => onDraft({ ...draft, stopFollow: e.target.checked })} />
        <span className="opt-n">{t('botStopFollow')}</span>
      </label>

      {rows.length > 0 && (
        <div className="cg-table">
          <LedgerTable columns={columns} rows={rows} rowKey={(r) => String(r.j)} />
        </div>
      )}

      <div className="size-preview">
        <KeyValue label={t('botStep')}>
          {step > 0 && grid.lower > 0 ? `${fmtScreen(step * scale)} · ${((step / grid.lower) * 100).toFixed(2)}%` : '—'}
        </KeyValue>
        <KeyValue label={t('botAtMarket')}>{atMarket ?? '—'}</KeyValue>
        <KeyValue label={t('botLossAtStop')}>{loss != null ? `${formatPriceGrouped(loss)} USDT` : '—'}</KeyValue>
      </div>
      {invalid && <p className="neg">{te(invalid)}</p>}
      {over && <p className="neg">{t('closeGridPinnedOver')}</p>}
      <ErrorNote error={error} fallback={t('actionFailed')} />
      <div className="order-actions">
        <Button variant="long" onClick={onStart} disabled={busy || !ready || risk <= 0 || balance <= 0}>
          {t('botStart')}
        </Button>
      </div>
    </>
  );
}
