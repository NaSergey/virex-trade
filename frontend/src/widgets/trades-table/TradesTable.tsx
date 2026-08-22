'use client';

import { useTranslations } from 'next-intl';
import type { RangeTf, Trade } from '@/entities/trade';
import { Tags } from '@/entities/tag';
import { Button } from '@/shared/ui/Button';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Money } from '@/shared/ui/Money';
import { TradeOrders } from './TradeOrders';
import { formatPriceGrouped, formatQty, durationUnitLabels } from '@/shared/lib/utils/format';
import { formatRangePos } from '@/shared/lib/utils/range';
import { useLocaleControl } from '@/shared/i18n';

/** «28 июл 11:42» — день с месяцем словом, как в записи журнала. */
function fmtClosed(iso: string, locale: string): string {
  return new Date(iso)
    .toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .replace('.', '');
}

/** Сколько сделка держалась — от входа до закрытия. */
function fmtHold(openedAt: string | null, closedAt: string, units: { d: string; h: string; m: string }): string {
  if (!openedAt) return '—';
  const min = Math.round((new Date(closedAt).getTime() - new Date(openedAt).getTime()) / 60_000);
  if (!Number.isFinite(min) || min < 0) return '—';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = String(min % 60).padStart(2, '0');
  if (d > 0) return `${d} ${units.d} ${h} ${units.h} ${m} ${units.m}`;
  return h > 0 ? `${h} ${units.h} ${m} ${units.m}` : `${min} ${units.m}`;
}

/** Колонка снимка, в которой лежит диапазон входа этого ТФ. */
const RANGE_FIELD: Record<RangeTf, keyof NonNullable<Trade['context']>> = {
  '15m': 'rangePos15m',
  '30m': 'rangePos30m',
  '1h': 'rangePos1h',
  '4h': 'rangePos4h',
  '1d': 'rangePos1d',
};

/** Диапазон входа того ТФ, по которому сейчас смотрят. */
function rangeOf(trade: Trade, tf: RangeTf): number | null {
  const v = trade.context?.[RANGE_FIELD[tf]];
  return typeof v === 'number' ? v : null;
}

/** Колонка диапазона: нужна там, где по нему же и фильтруют. */
export interface RangeColumn {
  tf: RangeTf;
  /** Подпись ТФ в шапке — та же, что на тумблере рядом с условиями. */
  label: string;
}

/**
 * Что снимается в тесной раскладке. Именно этих трёх колонок у «Выборки» и не
 * было: она стоит в правой половине страницы, рядом с условиями, и девять
 * колонок туда не влезают. Убраны подробности исполнения — на вопрос «а если
 * брать только такие сделки» они не отвечают; когда понадобятся, строка
 * раскрывается.
 */
const ROOMY_ONLY = new Set(['exit', 'qty', 'hold']);

/**
 * Журнал сделок. Строка раскрывается кликом — это не «детали по кнопке», а
 * разворот той же записи: сама строка отвечает «что и на сколько», раскрытая
 * часть — «из чего собралось и при каком рынке», там же лежит проверка
 * диапазона.
 *
 * Одна таблица на «Закрытые сделки» в обзоре и на «Подходящие сделки» в
 * выборке. Раньше выборка держала свой набор колонок — короче на выход, размер
 * и время в позиции, без раскрытия строки; разница ничем не объяснялась, кроме
 * того, что таблицы писались порознь. Различия остались ровно два, и оба
 * включаются пропсами: колонка диапазона (в выборке по нему фильтруют) и
 * кнопка тега (в выборке теги только читают).
 */
export function TradesTable({
  trades,
  isLoading,
  onEditTags,
  range,
  compact,
  empty,
}: {
  trades: Trade[];
  isLoading?: boolean;
  /** Без обработчика тег из таблицы не завести — плашки останутся только на чтение. */
  onEditTags?: (trade: Trade) => void;
  /** Показать колонку «Диапазон» выбранного таймфрейма. */
  range?: RangeColumn;
  /** Таблица стоит в узкой колонке: подробности исполнения снимаются. */
  compact?: boolean;
  /** Чем заменить таблицу, когда сделок нет. */
  empty?: React.ReactNode;
}) {
  const t = useTranslations('tradesTable');
  const { locale } = useLocaleControl();
  const intlLocale = locale === 'en' ? 'en-US' : 'ru-RU';
  const units = durationUnitLabels(locale);

  const columns: LedgerColumn<Trade>[] = [
    {
      key: 'closedAt',
      header: t('colClosed'),
      cellClassName: 'n',
      render: (tr) => <span className="muted">{fmtClosed(tr.closedAt, intlLocale)}</span>,
    },
    { key: 'symbol', header: t('colSymbol'), render: (tr) => <span className="sym">{tr.symbol}</span> },
    {
      key: 'direction',
      header: t('colDirection'),
      label: t('colDirection'),
      render: (tr) => <span className={`dir${tr.direction === 'short' ? ' short' : ''}`}>{tr.direction}</span>,
    },
    {
      key: 'entry',
      header: t('colEntry'),
      align: 'right',
      cellClassName: 'n',
      render: (tr) => formatPriceGrouped(tr.avgEntryPrice),
    },
    {
      key: 'exit',
      header: t('colExit'),
      align: 'right',
      cellClassName: 'n',
      render: (tr) => formatPriceGrouped(tr.avgExitPrice),
    },
    ...(range
      ? [
          {
            key: 'range',
            header: t('colRange', { tf: range.label }),
            label: t('colRangeLabel'),
            align: 'right',
            cellClassName: 'n',
            render: (tr: Trade) => (
              <span className="muted">{formatRangePos(rangeOf(tr, range.tf), locale)}</span>
            ),
          } satisfies LedgerColumn<Trade>,
        ]
      : []),
    {
      key: 'qty',
      header: t('colSize'),
      align: 'right',
      cellClassName: 'n',
      // Размер деньгами, а не в монете: 47 UNI и 47 SOL между собой не
      // сравнить, а USDT сравнимы со всем остальным в журнале — P&L в соседней
      // колонке меряется той же мерой. Считается по входу: это объём, которым
      // в позицию заходили. Сколько это было монет, говорит подсказка — так же,
      // как у ордеров раскрытой записи.
      render: (tr) => (
        <span title={t('qtyTitle', { qty: formatQty(tr.qty) })}>
          {formatPriceGrouped(tr.qty * tr.avgEntryPrice)}
          {/* ×3 — позиция закрывалась тремя ордерами: размер сложен из частей. */}
          {tr.parts > 1 && <span className="lbl"> ×{tr.parts}</span>}
        </span>
      ),
    },
    {
      key: 'hold',
      header: t('colInPosition'),
      align: 'right',
      cellClassName: 'n',
      render: (tr) => <span className="muted">{fmtHold(tr.openedAt, tr.closedAt, units)}</span>,
    },
    {
      key: 'pnl',
      header: 'P&L',
      align: 'right',
      cellClassName: 'n',
      // Крупный кегль P&L — привилегия широкой раскладки: в тесной он ломает
      // строку, а ведущей величиной там всё равно стоит диапазон.
      render: (tr) => <Money value={tr.closedPnl} large={!compact} />,
    },
    {
      key: 'tags',
      header: t('colTags'),
      cellClassName: 'cell-tags',
      render: (tr) => (
        <Tags tags={tr.tags ?? []}>
          {onEditTags && (
            <Button
              variant="add"
              onClick={(e) => {
                // Иначе клик уйдёт в строку и заодно раскроет её.
                e.stopPropagation();
                onEditTags(tr);
              }}
            >
              {(tr.tags ?? []).length === 0 ? t('addTag') : '+'}
            </Button>
          )}
        </Tags>
      ),
    },
  ];

  return (
    <LedgerTable
      columns={compact ? columns.filter((c) => !ROOMY_ONLY.has(c.key)) : columns}
      rows={trades}
      rowKey={(tr) => tr.id}
      isLoading={isLoading}
      renderExpanded={(tr) => <TradeOrders trade={tr} />}
      empty={
        empty ?? (
          <EmptyState title={t('emptyTitle')}>{t('emptyBody')}</EmptyState>
        )
      }
    />
  );
}
