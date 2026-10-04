'use client';

import { useTranslations } from 'next-intl';
import { CoinSymbol } from '@/shared/ui/CoinSymbol';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { SectionHead } from '@/shared/ui/SectionHead';
import { cn } from '@/shared/lib/utils/css';
import { formatPriceGrouped, formatQty, formatTradeDate } from '@/shared/lib/utils/format';
import type { BacktestCloseOrder, BacktestEntryOrder, BacktestTrade, Direction } from '../api/types';
import { toScreen } from '../lib/money';

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
}) {
  const t = useTranslations('backtest');
  const tradeById = new Map(trades.map((x) => [x.id, x]));
  const price = (p: number, symbol: string | undefined) =>
    formatPriceGrouped(toScreen(p, scale), symbol ? decimalsOf?.(symbol) : undefined);

  // Сервер отдаёт ордера по цене; монета — первой, чтобы в эфире строки одной
  // монеты стояли рядом.
  const entryRows = [...entryOrders].sort((a, b) => a.symbol.localeCompare(b.symbol) || a.price - b.price);

  if (closeOrders.length === 0 && entryRows.length === 0) {
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
        return trade ? dir(trade.direction) : '—';
      },
    },
    {
      key: 'price',
      header: t('colOrderPrice'),
      align: 'right',
      cellClassName: 'n',
      render: (o) => price(o.price, tradeById.get(o.tradeId)?.symbol),
    },
    { key: 'qty', header: t('colOrderQty'), align: 'right', cellClassName: 'n', render: (o) => formatQty(o.qty) },
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
    { key: 'direction', header: t('colOrderDirection'), render: (o) => dir(o.direction) },
    {
      key: 'price',
      header: t('colOrderPrice'),
      align: 'right',
      cellClassName: 'n',
      render: (o) => price(o.price, o.symbol),
    },
    // Стоп и тейк ордера — те, с которыми он откроет позицию. Если позиция этой
    // стороны уже открыта, ордер её доливает, и уровни остаются её собственные.
    {
      key: 'stop',
      header: t('stop'),
      align: 'right',
      cellClassName: 'n',
      // Ноль — стопа у ордера нет: так бывает у лимита биржи, выставленного мимо терминала.
      render: (o) => (o.stopLoss > 0 ? price(o.stopLoss, o.symbol) : '—'),
    },
    {
      key: 'take',
      header: t('take'),
      align: 'right',
      cellClassName: 'n',
      render: (o) => (o.takeProfit != null ? price(o.takeProfit, o.symbol) : '—'),
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
