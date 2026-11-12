'use client';

import { useTranslations } from 'next-intl';
import { CoinSymbol } from '@/shared/ui/CoinSymbol';
import { CopyText, plainNumber } from '@/shared/ui/CopyText';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { SectionHead } from '@/shared/ui/SectionHead';
import { cn } from '@/shared/lib/utils/css';
import { formatPriceGrouped, formatQty, formatTradeDate } from '@/shared/lib/utils/format';
import type { BacktestCloseOrder, BacktestEntryOrder, BacktestTrade, Direction } from '../api/types';
import { pendingEntryQty, toScreen } from '../lib/money';

/** Стоп или тейк открытой позиции — строка вкладки «Ордера». */
interface LevelRow {
  key: string;
  trade: BacktestTrade;
  kind: 'stop' | 'take';
  price: number;
}

/**
 * Ещё не сработавшие ордера сессии — своя вкладка, а не часть «Открытых
 * позиций»: до срабатывания это не позиция (ордер на вход) и не окончательный
 * выход (лимит закрытия), а обещание сделки. На настоящей бирже это тоже
 * разные вкладки терминала.
 *
 * Ордера на вход — одним списком, по строке на ордер, как «Текущие ордера» у
 * биржи. Сеткой они только ставятся; дальше каждый живёт сам по себе, и
 * ордеров в одну сторону может стоять сколько угодно, в том числе из разных
 * отправок, — группа «сетка на сторону» сказала бы о них неправду.
 *
 * Та же `LedgerTable`, что у «Открытых позиций» и «Истории сделок» — раньше
 * список был голыми `<ul>/<li>` без единого класса разметки, и подпись с
 * кнопкой «Отменить» съезжались в одну строку без зазора.
 */
export function OrdersPanel({
  trades,
  scale,
  closeOrders,
  entryOrders,
  onCancelOrder,
  onCancelEntryOrder,
  showSymbol = false,
  decimalsOf,
  onSymbol,
  balance,
  qtyStepOf,
  onChangeLevels,
}: {
  trades: BacktestTrade[];
  scale: number;
  closeOrders: BacktestCloseOrder[];
  /** Ордера на вход — до срабатывания сделки ещё нет, поэтому эти строки
   * показываются здесь и тогда, когда trades пуст. */
  entryOrders: BacktestEntryOrder[];
  onCancelOrder: (orderId: string) => void;
  onCancelEntryOrder: (orderId: string) => void;
  /** Колонка монеты — в эфире, где монет несколько. */
  showSymbol?: boolean;
  /** Знаков цены монеты; не задано — общее правило формата. */
  decimalsOf?: (symbol: string) => number | undefined;
  /** Нажатие на символ монеты — открыть её на графике (терминал); не задано — символ просто текст. */
  onSymbol?: (symbol: string) => void;
  /** Депозит сейчас — от него объём лимита сессии, как на линии графика. */
  balance: number;
  /** Шаг лота монеты: объём лимита — вниз до него, как поставит сервер. */
  qtyStepOf: (symbol: string) => number;
  /** Окно правки стопа и тейка позиции — из строки «Стоп и тейк»; не задано — кнопки нет. */
  onChangeLevels?: (trade: BacktestTrade) => void;
}) {
  const t = useTranslations('backtest');
  const tradeById = new Map(trades.map((x) => [x.id, x]));
  const price = (p: number, symbol: string | undefined) =>
    formatPriceGrouped(toScreen(p, scale), symbol ? decimalsOf?.(symbol) : undefined);
  /** Число, которое копируется нажатием: как показано, без разделителей разрядов. */
  const copyable = (shown: string) => <CopyText value={plainNumber(shown)}>{shown}</CopyText>;
  // Объём лимита — тот же, что на его линии графика (`pendingEntryQty`): от стопа
  // открытой позиции той же стороны, если лимит её дольёт, иначе от своего.
  const entryQty = (o: BacktestEntryOrder) =>
    pendingEntryQty(
      o,
      trades.find((x) => x.symbol === o.symbol && x.direction === o.direction)?.stopLoss,
      balance,
      qtyStepOf(o.symbol),
    );

  // Сервер отдаёт ордера по цене; монета — первой, чтобы в эфире строки одной
  // монеты стояли рядом.
  const entryRows = [...entryOrders].sort((a, b) => a.symbol.localeCompare(b.symbol) || a.price - b.price);

  // Стоп и тейк открытых позиций — тоже ордера на продажу: на бирже они висят в той же
  // вкладке (условные), и человек ждёт их здесь же. Объём — остаток позиции.
  const levelRows: LevelRow[] = trades
    .flatMap((trade) => [
      ...(trade.stopLoss > 0 ? [{ key: `${trade.id}:stop`, trade, kind: 'stop' as const, price: trade.stopLoss }] : []),
      ...(trade.takeProfit != null ? [{ key: `${trade.id}:take`, trade, kind: 'take' as const, price: trade.takeProfit }] : []),
    ])
    .sort((a, b) => a.trade.symbol.localeCompare(b.trade.symbol) || a.trade.direction.localeCompare(b.trade.direction) || a.price - b.price);

  if (closeOrders.length === 0 && entryRows.length === 0 && levelRows.length === 0) {
    return <EmptyState title={t('noOrders')}>{t('noOrdersHint')}</EmptyState>;
  }

  const dir = (d: Direction) => <span className={cn('dir', d === 'short' && 'short')}>{t(`direction.${d}`)}</span>;

  // У BacktestCloseOrder своего направления нет в модели — он закрывает уже
  // открытую сделку, поэтому направление колонки берётся у неё же (tradeById).
  const closeColumns: LedgerColumn<BacktestCloseOrder>[] = [
    ...(showSymbol
      ? [
          {
            key: 'symbol',
            header: t('colOrderSymbol'),
            render: (o: BacktestCloseOrder) => {
              const symbol = tradeById.get(o.tradeId)?.symbol;
              return symbol ? <CoinSymbol symbol={symbol} onPick={onSymbol} /> : '—';
            },
          } satisfies LedgerColumn<BacktestCloseOrder>,
        ]
      : []),
    {
      key: 'direction',
      header: t('colOrderDirection'),
      render: (o) => {
        const trade = tradeById.get(o.tradeId);
        return (
          <>
            {trade ? dir(trade.direction) : '—'}
            {o.botId ? <span className="muted"> · {t('orderBotMark')}</span> : null}
          </>
        );
      },
    },
    {
      key: 'price',
      header: t('colOrderPrice'),
      align: 'right',
      cellClassName: 'n',
      render: (o) => copyable(price(o.price, tradeById.get(o.tradeId)?.symbol)),
    },
    { key: 'qty', header: t('colOrderQty'), align: 'right', cellClassName: 'n', render: (o) => copyable(formatQty(o.qty)) },
    {
      key: 'time',
      header: t('colOrderTime'),
      align: 'right',
      cellClassName: 'n',
      render: (o) => formatTradeDate(o.createdAt),
    },
    {
      key: 'actions',
      render: (o) => (
        <Button tight onClick={() => onCancelOrder(o.id)}>
          {t('cancelOrder')}
        </Button>
      ),
    },
  ];

  const levelColumns: LedgerColumn<LevelRow>[] = [
    ...(showSymbol
      ? [
          {
            key: 'symbol',
            header: t('colOrderSymbol'),
            render: (r: LevelRow) => <CoinSymbol symbol={r.trade.symbol} onPick={onSymbol} />,
          } satisfies LedgerColumn<LevelRow>,
        ]
      : []),
    { key: 'direction', header: t('colOrderDirection'), render: (r) => dir(r.trade.direction) },
    {
      key: 'kind',
      header: t('colOrderType'),
      render: (r) => (r.kind === 'take' ? t('take') : r.trade.trailDist != null ? t('level.trailStop') : t('stop')),
    },
    {
      key: 'price',
      header: t('colOrderPrice'),
      align: 'right',
      cellClassName: 'n',
      render: (r) => copyable(price(r.price, r.trade.symbol)),
    },
    {
      key: 'qty',
      header: t('colOrderQty'),
      align: 'right',
      cellClassName: 'n',
      render: (r) => copyable(formatQty(Number((r.trade.qty - r.trade.closedQty).toFixed(8)))),
    },
    {
      key: 'actions',
      render: (r) =>
        onChangeLevels ? (
          <Button tight onClick={() => onChangeLevels(r.trade)}>
            {t('changeLevels')}
          </Button>
        ) : null,
    },
  ];

  const entryColumns: LedgerColumn<BacktestEntryOrder>[] = [
    ...(showSymbol
      ? [
          {
            key: 'symbol',
            header: t('colOrderSymbol'),
            render: (o: BacktestEntryOrder) => <CoinSymbol symbol={o.symbol} onPick={onSymbol} />,
          } satisfies LedgerColumn<BacktestEntryOrder>,
        ]
      : []),
    {
      key: 'direction',
      header: t('colOrderDirection'),
      render: (o) => (
        <>
          {dir(o.direction)}
          {o.botId ? <span className="muted"> · {t('orderBotMark')}</span> : null}
        </>
      ),
    },
    {
      key: 'price',
      header: t('colOrderPrice'),
      align: 'right',
      cellClassName: 'n',
      render: (o) => copyable(price(o.price, o.symbol)),
    },
    {
      key: 'qty',
      header: t('colOrderQty'),
      align: 'right',
      cellClassName: 'n',
      render: (o) => {
        const qty = entryQty(o);
        return qty != null ? copyable(formatQty(Number(qty.toFixed(8)))) : '—';
      },
    },
    // Стоп и тейк ордера — те, с которыми он откроет позицию. Если позиция этой
    // стороны уже открыта, ордер её доливает, и уровни остаются её собственные.
    {
      key: 'stop',
      header: t('stop'),
      align: 'right',
      cellClassName: 'n',
      // Ноль — стопа у ордера нет: так бывает у лимита биржи, выставленного мимо терминала.
      render: (o) => (o.stopLoss > 0 ? copyable(price(o.stopLoss, o.symbol)) : '—'),
    },
    {
      key: 'take',
      header: t('take'),
      align: 'right',
      cellClassName: 'n',
      render: (o) => (o.takeProfit != null ? copyable(price(o.takeProfit, o.symbol)) : '—'),
    },
    {
      key: 'risk',
      header: t('colOrderRisk'),
      align: 'right',
      cellClassName: 'n',
      render: (o) => `${o.riskPct.toFixed(2)}%`,
    },
    {
      key: 'time',
      header: t('colOrderTime'),
      align: 'right',
      cellClassName: 'n',
      render: (o) => formatTradeDate(o.createdAt),
    },
    {
      key: 'actions',
      render: (o) => (
        <Button tight onClick={() => onCancelEntryOrder(o.id)}>
          {t('cancelOrder')}
        </Button>
      ),
    },
  ];

  return (
    <div>
      {levelRows.length > 0 && (
        <>
          <SectionHead title={t('levelOrdersTitle')} />
          <LedgerTable columns={levelColumns} rows={levelRows} rowKey={(r) => r.key} />
        </>
      )}
      {closeOrders.length > 0 && (
        <>
          <SectionHead title={t('limitCloseOrdersTitle')} />
          <LedgerTable columns={closeColumns} rows={closeOrders} rowKey={(o) => o.id} />
        </>
      )}
      {entryRows.length > 0 && (
        <>
          <SectionHead title={t('pendingEntryOrdersTitle')}>
            {entryRows.length > 1 && (
              <Button tight onClick={() => entryRows.forEach((o) => onCancelEntryOrder(o.id))}>
                {t('cancelAllOrders')}
              </Button>
            )}
          </SectionHead>
          <LedgerTable columns={entryColumns} rows={entryRows} rowKey={(o) => o.id} />
        </>
      )}
    </div>
  );
}
