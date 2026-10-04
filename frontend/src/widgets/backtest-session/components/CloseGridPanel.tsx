'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Equal } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Field, Input } from '@/shared/ui/Field';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { KeyValue } from '@/shared/ui/Lookup';
import { SectionHead } from '@/shared/ui/SectionHead';
import { Slider } from '@/shared/ui/Slider';
import { Tooltip } from '@/shared/ui/Tooltip';
import { fmtPctSigned, formatMoney, formatPriceGrouped, formatQty, moneyClass } from '@/shared/lib/utils/format';
import type { BacktestTrade } from '../api/types';
import { checkCloseGridSide, closeGridAnchor, closeGridFromDraft, type CloseGridDraft, type CloseGridRow } from '../lib/close-grid';
import { levelSliderRange, toInputPrice, toScreen } from '../lib/money';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Что уходит на сервер: цены и объёмы уровней, цели стопа (0 — правило) и флажок переноса. */
export interface CloseGridSubmit {
  prices: number[];
  qtys: number[];
  stops?: number[];
  stopFollow: boolean;
}

/** Закрепление по номеру уровня: число — закрепить, null — снять. */
const withPin = (pins: Record<number, number>, i: number, v: number | null): Record<number, number> => {
  const next = { ...pins };
  if (v == null) delete next[i];
  else next[i] = v;
  return next;
};

/**
 * Ячейка таблицы, которую правят руками: тихая заливка без рамки, как поля
 * биржевых терминалов, под курсором — плотнее, в фокусе — черта снизу.
 * Посчитанное значение приглушено, закреплённое руками — ярче и с чертой слева.
 * `note` — мелкая подпись в той же ячейке слева (монеты у доли объёма).
 *
 * В фокусе — свой текст, как его набирают; ушёл фокус или нажат Enter —
 * значение закрепляется, пустое снимает закрепление, неразборчивое оставляет
 * прежнее, Esc отменяет правку.
 */
function EditCell({
  display,
  note,
  pinned,
  ignored,
  label,
  hint,
  onCommit,
}: {
  display: string;
  note?: string;
  pinned: boolean;
  /** Закреплённое ничего не изменит (стоп слабее прежнего) — значение зачёркнуто. */
  ignored?: boolean;
  label: string;
  hint: string;
  onCommit: (v: number | null) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const cancelled = useRef(false);
  const commit = () => {
    const raw = (text ?? '').replace(/[\s%]/g, '').replace(',', '.');
    setText(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (text == null) return;
    if (raw === '') return onCommit(null);
    const v = Number(raw);
    if (Number.isFinite(v) && v > 0) onCommit(v);
  };
  return (
    <label className="cg-edit" data-pinned={pinned || undefined} data-ignored={ignored || undefined} title={hint}>
      {note != null && <span className="cg-note">{note}</span>}
      <Input
        className="cg-cell"
        inputMode="decimal"
        aria-label={label}
        value={text ?? display}
        onFocus={(e) => {
          setText(display.replace(/[\s%]/g, ''));
          e.currentTarget.select();
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

/**
 * Сетка фиксации позиции: N лимитов закрытия от первого тейка до последнего и
 * «стоп за тейками» (спеки `2026-09-30-close-grid-design.md`,
 * `2026-10-04-close-grid-panel-design.md`, `2026-10-04-close-grid-custom-levels-design.md`).
 * Показывает каждый уровень и итог — среднюю цену выхода и прибыль при
 * исполнении всех ордеров, с комиссиями.
 *
 * Объём (доля позиции в процентах, монеты — подписью) и стоп после уровня
 * правятся прямо в таблице и закрепляются: закреплённые доли держат своё,
 * остальные делят остаток позиции; заголовок «Объём» снимает закрепления и
 * делит поровну.
 *
 * Не окно, а панель на месте панели ордера: уровни сетки стоят на графике, и
 * первый с последним тейком тянут прямо там. Поэтому черновик — у экрана
 * (`draft`/`onDraft`), а не здесь: его читает и график.
 *
 * Цены — экранные, как у остальных окон позиции; на сервер уходят настоящие.
 */
export function CloseGridPanel({
  trade,
  draft,
  onDraft,
  scale,
  screenPrice,
  closeOrdersCount,
  onSubmit,
  onCancel,
  isPending,
  error,
  decimals,
}: {
  trade: BacktestTrade;
  draft: CloseGridDraft;
  onDraft: (next: CloseGridDraft) => void;
  scale: number;
  /** Текущая экранная цена монеты сделки; null — ещё не пришла (график только что сменил монету). */
  screenPrice: number | null;
  /** Лимитов закрытия у позиции сейчас — сетка их заменит. */
  closeOrdersCount: number;
  onSubmit: (v: CloseGridSubmit) => void;
  onCancel: () => void;
  isPending: boolean;
  error: unknown;
  decimals?: number;
}) {
  const t = useTranslations('backtest');
  const tc = useTranslations('common');
  const { first, last, count, stopFollow } = draft;
  const entry = toScreen(trade.entryPrice, scale);
  // Тейки считаются не от цены графика, а от входа — если позиция в минусе, —
  // иначе первый тейк вставал бы в убыток (см. closeGridAnchor). Пока цены нет — от входа.
  const anchor = screenPrice != null ? closeGridAnchor(trade.direction, entry, screenPrice) : entry;

  const range = levelSliderRange('take', anchor, trade.direction);
  const { screenPrices, prices, split, plan } = closeGridFromDraft(trade, draft, scale);
  const remaining = trade.qty - trade.closedQty;
  const err = checkCloseGridSide(trade.direction, screenPrices, anchor);
  const emptyLevel = !split.over && split.qtys.some((q) => !(q > 0));
  const price = (p: number) => formatPriceGrouped(toScreen(p, scale), decimals);
  /** Отступ экранной цены от входа, в процентах: тейк меряют от входа, а не от графика. */
  const pct = (screen: number) => fmtPctSigned(((screen - entry) / entry) * 100);
  /** Доля уровня в позиции, процентами до десятой: 33.3 %, а не 33 — сумма должна читаться как 100. */
  const share = (qty: number) => (remaining > 0 ? Math.round((qty / remaining) * 1000) / 10 : 0);

  type Row = CloseGridRow & { i: number };
  const columns: LedgerColumn<Row>[] = [
    { key: 'i', header: '№', cellClassName: 'cg-no', render: (r) => r.i + 1 },
    { key: 'price', header: t('colOrderPrice'), align: 'right', cellClassName: 'n', render: (r) => price(r.price) },
    {
      key: 'qty',
      label: t('colOrderQty'),
      // Заголовок — кнопка: снять закрепления и поделить объём поровну.
      header: (
        <Tooltip text={t('closeGridSplit')}>
          <Button variant="none" className="cg-split" onClick={() => onDraft({ ...draft, qtyPins: {} })}>
            <Equal size={9} aria-hidden />
            {t('colOrderQty')}
          </Button>
        </Tooltip>
      ),
      align: 'right',
      render: (r) => (
        <EditCell
          display={`${draft.qtyPins[r.i] ?? share(r.qty)}%`}
          note={formatQty(Number(r.qty.toFixed(4)))}
          pinned={split.pinned[r.i]}
          label={`${t('colOrderQty')} ${r.i + 1}`}
          hint={t('closeGridQtyHint')}
          onCommit={(v) => onDraft({ ...draft, qtyPins: withPin(draft.qtyPins, r.i, v) })}
        />
      ),
    },
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
            render: (r: Row) => {
              if (r.stopTarget == null) return <span className="cg-none">—</span>;
              const pin = draft.stopPins[r.i];
              const ignored = pin != null && r.stopAfter !== r.stopTarget;
              return (
                <EditCell
                  display={pin != null ? formatPriceGrouped(pin, decimals) : r.stopAfter != null ? price(r.stopAfter) : ''}
                  pinned={pin != null}
                  ignored={ignored}
                  label={`${t('closeGridStopAfter')} ${r.i + 1}`}
                  hint={ignored ? t('closeGridStopIgnored') : t('closeGridStopHint')}
                  onCommit={(v) => onDraft({ ...draft, stopPins: withPin(draft.stopPins, r.i, v) })}
                />
              );
            },
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
    <div className="order-panel cg-panel">
      <SectionHead title={t('closeGridTitle')} className="cg-head" />

      {levelField(t('closeGridFirst'), first, (v) => onDraft({ ...draft, first: v }))}
      {levelField(t('closeGridLast'), last, (v) => onDraft({ ...draft, last: v }))}
      <Field label={t('ordersCount')}>
        {(id) => <Input id={id} full inputMode="numeric" value={count} onChange={(e) => onDraft({ ...draft, count: e.target.value })} />}
      </Field>
      <label className="opt" data-on={stopFollow}>
        <input type="checkbox" checked={stopFollow} onChange={(e) => onDraft({ ...draft, stopFollow: e.target.checked })} />
        <span className="opt-n">{t('closeGridFollow')}</span>
      </label>

      <div className="cg-table">
        <LedgerTable columns={columns} rows={plan.rows.map((r, i) => ({ ...r, i }))} rowKey={(r) => String(r.i)} />
      </div>
      {closeOrdersCount > 0 && <p className="muted">{t('closeGridReplaces', { n: closeOrdersCount })}</p>}

      {/* Итог и кнопки прилипают к низу колонки: их смотрят, пока тянут тейки
          на графике, и прокручивать к ним панель нельзя. */}
      <div className="cg-foot">
        <div className="size-preview">
          <KeyValue label={t('closeGridAvgExit')}>{plan.avgExit != null ? price(plan.avgExit) : '—'}</KeyValue>
          <KeyValue label={t('closeGridTotalPnl')} valueClassName={`n ${moneyClass(plan.pnl)}`}>
            {formatMoney(plan.pnl)} USDT
          </KeyValue>
        </div>
        {err && <p className="neg">{t(`closeGridSide.${trade.direction}`)}</p>}
        {split.over && <p className="neg">{t('closeGridPinnedOver')}</p>}
        {emptyLevel && <p className="neg">{t('closeGridEmptyLevel')}</p>}
        <ErrorNote error={error} fallback={t('actionFailed')} />
        <div className="order-actions">
          <Button
            variant="solid"
            disabled={isPending || err != null || split.over || emptyLevel || !(remaining > 0)}
            onClick={() =>
              onSubmit({
                prices,
                qtys: split.qtys,
                stops: stopFollow ? plan.rows.map((r) => r.stopTarget ?? 0) : undefined,
                stopFollow,
              })
            }
          >
            {t('closeGridConfirm')}
          </Button>
          <Button variant="bare" onClick={onCancel}>
            {tc('cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
}
