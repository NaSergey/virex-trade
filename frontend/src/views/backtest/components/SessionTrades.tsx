'use client';

import { useTranslations } from 'next-intl';
import { TagPicker, type TagItem } from '@/entities/tag';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { SectionHead } from '@/shared/ui/SectionHead';
import { durationUnitLabels, formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import { useLocaleControl } from '@/shared/i18n';
import type { BacktestTrade } from '../api/types';
import { formatR, toScreen } from '../lib/money';

/** Сколько сделка держалась — от входа до закрытия, тем же счётом, что и `fmtHold` в
 * `widgets/trades-table/TradesTable.tsx`, но от полей самой сделки бектеста. */
function fmtHold(entryTime: string, exitTime: string, units: { d: string; h: string; m: string }): string {
  const min = Math.floor((Date.parse(exitTime) - Date.parse(entryTime)) / 60_000);
  if (!Number.isFinite(min) || min < 0) return '—';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = String(min % 60).padStart(2, '0');
  if (d > 0) return `${d} ${units.d} ${h} ${units.h} ${m} ${units.m}`;
  return h > 0 ? `${h} ${units.h} ${m} ${units.m}` : `${min} ${units.m}`;
}

/**
 * Сделки сессии, свежие сверху. Колонки — по образцу «Закрытых сделок» обзора
 * (`TradesTable`): закрыто/вход/выход отдельными колонками, размер в USDT, время в
 * позиции. R и «Выход по» остаются — их даёт только бектест, в живой торговле такого нет.
 * Раскрытие строки — выбор тегов (`TagPicker`), не переезжает на ордера/график из
 * `TradesTable`: график сессии и так всегда на экране.
 */
export function SessionTrades({
  trades,
  scale,
  labelFor,
  tags,
  onSetTags,
}: {
  trades: BacktestTrade[];
  /** Масштаб показа; у завершённой сессии — 1, цены раскрыты. */
  scale: number;
  labelFor: (t: number) => string;
  tags: TagItem[];
  onSetTags: (tradeId: string, tagIds: string[]) => void;
}) {
  const t = useTranslations('backtest');
  const { locale } = useLocaleControl();
  const units = durationUnitLabels(locale);
  const price = (p: number) => formatPriceGrouped(toScreen(p, scale));

  const columns: LedgerColumn<BacktestTrade>[] = [
    {
      key: 'closed',
      header: t('colClosed'),
      cellClassName: 'n',
      render: (x) => <span className="muted">{x.exitTime ? labelFor(Date.parse(x.exitTime)) : '—'}</span>,
    },
    { key: 'dir', header: t('colDir'), render: (x) => t(`direction.${x.direction}`) },
    { key: 'entry', header: t('colEntry'), align: 'right', cellClassName: 'n', render: (x) => price(x.entryPrice) },
    {
      key: 'exit',
      header: t('colExit'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => (x.exitPrice != null ? price(x.exitPrice) : '—'),
    },
    {
      key: 'size',
      header: t('colSize'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => (
        <span title={t('qtyTitle', { qty: formatQty(x.qty) })}>{formatPriceGrouped(x.qty * toScreen(x.entryPrice, scale))}</span>
      ),
    },
    {
      key: 'hold',
      header: t('colInPosition'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => <span className="muted">{x.exitTime ? fmtHold(x.entryTime, x.exitTime, units) : '—'}</span>,
    },
    { key: 'reason', header: t('colReason'), render: (x) => t(`reason.${x.exitReason ?? 'open'}`) },
    {
      key: 'r',
      header: t('colR'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => (x.r != null ? <span className={x.r >= 0 ? 'pos' : 'neg'}>{formatR(x.r)}</span> : '—'),
    },
    {
      key: 'pnl',
      header: t('colPnl'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => (x.pnl != null ? <Money value={x.pnl} /> : '—'),
    },
    {
      key: 'tags',
      header: t('colTags'),
      cellClassName: 'cell-tags',
      render: (x) => (x.tags.length ? x.tags.map((g) => g.name).join(', ') : <span className="muted">—</span>),
    },
  ];

  return (
    <section>
      <SectionHead title={t('tradesTitle')} />
      <LedgerTable
        columns={columns}
        rows={[...trades].reverse()}
        rowKey={(x) => x.id}
        empty={t('noTrades')}
        renderExpanded={(x) => {
          const selected = new Set(x.tags.map((g) => g.id));
          return (
            <TagPicker
              tags={tags}
              selected={selected}
              onToggle={(id) => {
                const next = new Set(selected);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                onSetTags(x.id, [...next]);
              }}
            />
          );
        }}
      />
    </section>
  );
}
