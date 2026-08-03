'use client';

import type { RangeTf, Trade } from '@/entities/trade';
import { Tags } from '@/entities/tag';
import { Button } from '@/shared/ui/Button';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Money } from '@/shared/ui/Money';
import { TradeOrders } from './TradeOrders';
import { formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import { formatRangePos } from '@/shared/lib/utils/range';

/** «28 июл 11:42» — день с месяцем словом, как в записи журнала. */
function fmtClosed(iso: string): string {
  return new Date(iso)
    .toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .replace('.', '');
}

/** Сколько сделка держалась — от входа до закрытия. */
function fmtHold(openedAt: string | null, closedAt: string): string {
  if (!openedAt) return '—';
  const min = Math.round((new Date(closedAt).getTime() - new Date(openedAt).getTime()) / 60_000);
  if (!Number.isFinite(min) || min < 0) return '—';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = String(min % 60).padStart(2, '0');
  if (d > 0) return `${d} д ${h} ч ${m} м`;
  return h > 0 ? `${h} ч ${m} м` : `${min} м`;
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
  const columns: LedgerColumn<Trade>[] = [
    {
      key: 'closedAt',
      header: 'Закрыта',
      cellClassName: 'n',
      render: (t) => <span className="muted">{fmtClosed(t.closedAt)}</span>,
    },
    { key: 'symbol', header: 'Символ', render: (t) => <span className="sym">{t.symbol}</span> },
    {
      key: 'direction',
      header: 'Напр.',
      label: 'Напр.',
      render: (t) => <span className={`dir${t.direction === 'short' ? ' short' : ''}`}>{t.direction}</span>,
    },
    {
      key: 'entry',
      header: 'Вход',
      align: 'right',
      cellClassName: 'n',
      render: (t) => formatPriceGrouped(t.avgEntryPrice),
    },
    {
      key: 'exit',
      header: 'Выход',
      align: 'right',
      cellClassName: 'n',
      render: (t) => formatPriceGrouped(t.avgExitPrice),
    },
    ...(range
      ? [
          {
            key: 'range',
            header: `Диапазон ${range.label}`,
            label: 'Диапазон',
            align: 'right',
            cellClassName: 'n',
            render: (t: Trade) => (
              <span className="muted">{formatRangePos(rangeOf(t, range.tf))}</span>
            ),
          } satisfies LedgerColumn<Trade>,
        ]
      : []),
    {
      key: 'qty',
      header: 'Размер',
      align: 'right',
      cellClassName: 'n',
      // Размер деньгами, а не в монете: 47 UNI и 47 SOL между собой не
      // сравнить, а USDT сравнимы со всем остальным в журнале — P&L в соседней
      // колонке меряется той же мерой. Считается по входу: это объём, которым
      // в позицию заходили. Сколько это было монет, говорит подсказка — так же,
      // как у ордеров раскрытой записи.
      render: (t) => (
        <span title={`${formatQty(t.qty)} в монете`}>
          {formatPriceGrouped(t.qty * t.avgEntryPrice)}
          {/* ×3 — позиция закрывалась тремя ордерами: размер сложен из частей. */}
          {t.parts > 1 && <span className="lbl"> ×{t.parts}</span>}
        </span>
      ),
    },
    {
      key: 'hold',
      header: 'В позиции',
      align: 'right',
      cellClassName: 'n',
      render: (t) => <span className="muted">{fmtHold(t.openedAt, t.closedAt)}</span>,
    },
    {
      key: 'pnl',
      header: 'P&L',
      align: 'right',
      cellClassName: 'n',
      // Крупный кегль P&L — привилегия широкой раскладки: в тесной он ломает
      // строку, а ведущей величиной там всё равно стоит диапазон.
      render: (t) => <Money value={t.closedPnl} large={!compact} />,
    },
    {
      key: 'tags',
      header: 'Теги',
      cellClassName: 'cell-tags',
      render: (t) => (
        <Tags tags={t.tags ?? []}>
          {onEditTags && (
            <Button
              variant="add"
              onClick={(e) => {
                // Иначе клик уйдёт в строку и заодно раскроет её.
                e.stopPropagation();
                onEditTags(t);
              }}
            >
              {(t.tags ?? []).length === 0 ? '+ тег' : '+'}
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
      rowKey={(t) => t.id}
      isLoading={isLoading}
      renderExpanded={(t) => <TradeOrders trade={t} />}
      empty={
        empty ?? (
          <EmptyState title="За этот период сделок нет">
            Смените период в рейке выше — или синхронизируйте историю с биржей в настройках.
          </EmptyState>
        )
      }
    />
  );
}
