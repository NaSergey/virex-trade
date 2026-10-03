'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePrefetchRangeCheck, type RangeTf, type Trade } from '@/entities/trade';
import { Tags } from '@/entities/tag';
import { Button } from '@/shared/ui/Button';
import { LedgerTable, type LedgerColumn, type LedgerSort } from '@/shared/ui/LedgerTable';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Money } from '@/shared/ui/Money';
import { RangeCheckModal } from '@/widgets/range-check-modal';
import { TradeOrders } from './TradeOrders';
import { formatPriceGrouped, formatQty, durationUnitLabels } from '@/shared/lib/utils/format';
import { formatRangePos } from '@/shared/lib/utils/range';
import { useLocaleControl } from '@/shared/i18n';
import { holdMinutes, rangeOf } from './tradeMetrics';

/** «28 июл 11:42» — день с месяцем словом, как в записи журнала. */
function fmtClosed(iso: string, locale: string): string {
  return new Date(iso)
    .toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .replace('.', '');
}

/** Сколько сделка держалась — от входа до закрытия. */
function fmtHold(openedAt: string | null, closedAt: string, units: { d: string; h: string; m: string }): string {
  const min = holdMinutes(openedAt, closedAt);
  if (min == null) return '—';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = String(min % 60).padStart(2, '0');
  if (d > 0) return `${d} ${units.d} ${h} ${units.h} ${m} ${units.m}`;
  return h > 0 ? `${h} ${units.h} ${m} ${units.m}` : `${min} ${units.m}`;
}

/**
 * Цена в журнале — вход или выход, — за которой открывается график сделки.
 *
 * Кнопкой прямо на числе, а не отдельной колонкой: окно показывает коридор
 * вокруг ЭТОЙ цены, и десятая колонка в девятиколоночной таблице стоила бы
 * ширины тегам ради действия, которому и так есть куда встать. Раньше вход в
 * график был только в раскрытой строке — то есть его не видел никто, кто
 * строку не раскрыл.
 *
 * Клик не пускается в строку: та по клику раскрывается, и график открывался бы
 * вместе с разворотом записи.
 */
function PriceCue({
  price,
  trade,
  onOpen,
  title,
  tour,
}: {
  price: number;
  trade: Trade;
  onOpen: (trade: Trade) => void;
  title: string;
  /** Якорь обучения. Стоит на входе — обе цены ведут в одно окно, а подсветить тур умеет один узел. */
  tour?: boolean;
}) {
  const prefetchRange = usePrefetchRangeCheck();
  return (
    <button
      type="button"
      className="px-cue"
      title={title}
      data-tour={tour ? 'trade-chart' : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(trade);
      }}
      // Свечи заказываются, пока курсор ещё идёт к числу: за ними бэкенд ходит
      // на биржу, и без прогрева окно открывается заглушкой.
      onPointerEnter={() => prefetchRange(trade.id)}
      onFocus={() => prefetchRange(trade.id)}
      onTouchStart={() => prefetchRange(trade.id)}
    >
      {formatPriceGrouped(price)}
    </button>
  );
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
  skeletonRows,
  onEditTags,
  range,
  compact,
  empty,
  sort,
  onSort,
  formatClosed,
  chart = true,
  expand = true,
  tags: showTags = true,
  renderExpanded,
  priceDecimals,
}: {
  trades: Trade[];
  isLoading?: boolean;
  /** Сколько строк-заглушек показать при загрузке — размер листа страницы. */
  skeletonRows?: number;
  /** Без обработчика тег из таблицы не завести — плашки останутся только на чтение. */
  onEditTags?: (trade: Trade) => void;
  /** Показать колонку «Диапазон» выбранного таймфрейма. */
  range?: RangeColumn;
  /** Таблица стоит в узкой колонке: подробности исполнения снимаются. */
  compact?: boolean;
  /** Чем заменить таблицу, когда сделок нет. */
  empty?: React.ReactNode;
  /**
   * Текущая сортировка и обработчик клика по заголовку. Оба необязательны и
   * приходят парой: без `onSort` таблица не сортирует сама (список режут на
   * листы снаружи — см. AnalyticsPage, — и сортировать надо ДО этого), а
   * заголовки без `onSort` остаются некликабельными, как на Обзоре.
   */
  sort?: LedgerSort;
  onSort?: (key: string) => void;
  /**
   * Как печатать время закрытия. По умолчанию — дата и время местным форматом.
   * Бектест передаёт своё: пока сессия идёт, настоящая дата отрезка скрыта, и
   * на её месте стоит день недели с номером дня от старта.
   */
  formatClosed?: (iso: string) => string;
  /**
   * Цены входа и выхода открывают окно с графиком сделки. Выключается там, где
   * свечей для него нет: сделка бектеста живёт в симуляции, и биржевого
   * коридора вокруг её цены не существует.
   */
  chart?: boolean;
  /**
   * Строка раскрывается. Выключается там, где разбирать позицию нечем: у чужой
   * сделки на профиле нет ни ордеров исполнения, ни рыночного контекста — те
   * эндпоинты отвечают только про свои сделки, и каретка обещала бы разбор,
   * которого не будет.
   */
  expand?: boolean;
  /**
   * Колонка тегов. Снимается на чужих сделках: «почему вошёл» — личная
   * заметка, её нет в ответе, и пустая колонка говорила бы «не разметил».
   */
  tags?: boolean;
  /**
   * Чем раскрывается строка. По умолчанию — ордерами исполнения и рыночным
   * контекстом входа (`TradeOrders`). Бектест передаёт свой разбор: филлов
   * биржи у симулированной сделки нет, а разбирать в ней есть что — стоп,
   * тейк, риск и то, чем всё кончилось.
   */
  renderExpanded?: (trade: Trade) => React.ReactNode;
  /**
   * Знаков цены у инструмента строки — у монет эфира бектеста они известны.
   * Не задано — общее правило `formatPriceGrouped`, как в журнале. Действует
   * только без окна графика (`chart={false}`): там цена печатается здесь.
   */
  priceDecimals?: (trade: Trade) => number | undefined;
}) {
  const t = useTranslations('tradesTable');
  const { locale } = useLocaleControl();
  const intlLocale = locale === 'en' ? 'en-US' : 'ru-RU';
  const units = durationUnitLabels(locale);
  // Окно графика живёт здесь, а не в раскрытой строке: открыть его теперь можно
  // из двух мест — с цены в строке и кнопкой в развороте, — а окно одно.
  const [chartTrade, setChartTrade] = useState<Trade | null>(null);
  // sortKey ставится только когда есть onSort: сам по себе sortKey красит
  // заголовок LedgerTable курсором-указателем (см. LedgerTable.tsx), и без
  // этого условия заголовки на Обзоре выглядели бы кликабельными, ничего не
  // делая по клику.
  const colSortKey = (key: string) => (onSort ? key : undefined);

  const columns: LedgerColumn<Trade>[] = [
    {
      key: 'closedAt',
      header: t('colClosed'),
      cellClassName: 'n',
      sortKey: colSortKey('closedAt'),
      render: (tr) => <span className="muted">{formatClosed ? formatClosed(tr.closedAt) : fmtClosed(tr.closedAt, intlLocale)}</span>,
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
      sortKey: colSortKey('entry'),
      render: (tr) =>
        chart ? (
          <PriceCue price={tr.avgEntryPrice} trade={tr} onOpen={setChartTrade} title={t('showOnChartTitle')} tour />
        ) : (
          formatPriceGrouped(tr.avgEntryPrice, priceDecimals?.(tr))
        ),
    },
    {
      key: 'exit',
      header: t('colExit'),
      align: 'right',
      cellClassName: 'n',
      sortKey: colSortKey('exit'),
      render: (tr) =>
        chart ? (
          <PriceCue price={tr.avgExitPrice} trade={tr} onOpen={setChartTrade} title={t('showOnChartTitle')} />
        ) : (
          formatPriceGrouped(tr.avgExitPrice, priceDecimals?.(tr))
        ),
    },
    ...(range
      ? [
          {
            key: 'range',
            header: t('colRange', { tf: range.label }),
            label: t('colRangeLabel'),
            align: 'right',
            cellClassName: 'n',
            sortKey: colSortKey('range'),
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
      sortKey: colSortKey('qty'),
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
      sortKey: colSortKey('hold'),
      render: (tr) => <span className="muted">{fmtHold(tr.openedAt, tr.closedAt, units)}</span>,
    },
    {
      key: 'pnl',
      header: 'P&L',
      align: 'right',
      cellClassName: 'n',
      sortKey: colSortKey('pnl'),
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

  const shown = columns.filter(
    (c) => !(compact && ROOMY_ONLY.has(c.key)) && !(c.key === 'tags' && !showTags),
  );

  return (
    <>
      <LedgerTable
        columns={shown}
        rows={trades}
        rowKey={(tr) => tr.id}
        isLoading={isLoading}
        skeletonRows={skeletonRows}
        // undefined, а не пустой рендер: LedgerTable по нему и решает, быть ли
        // каретке и раскрытию вообще.
        renderExpanded={
          expand ? (renderExpanded ?? ((tr) => <TradeOrders trade={tr} onRangeCheck={() => setChartTrade(tr)} />)) : undefined
        }
        sort={sort}
        onSort={onSort}
        empty={
          empty ?? (
            <EmptyState title={t('emptyTitle')}>{t('emptyBody')}</EmptyState>
          )
        }
      />
      {chartTrade && <RangeCheckModal trade={chartTrade} onClose={() => setChartTrade(null)} />}
    </>
  );
}
