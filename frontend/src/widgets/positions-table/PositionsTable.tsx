'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { ExchangePosition } from '@/entities/position';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { SectionHead } from '@/shared/ui/SectionHead';
import { Wrap } from '@/shared/ui/Wrap';
import { formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';

/**
 * Таблица открытых позиций — одна на весь продукт: и «сейчас» на обзоре, и
 * открытые сделки сессии бектеста. Раньше это были две таблицы, написанные
 * порознь: колонки разошлись в порядке и составе, и любая правка одной
 * оставляла вторую как была.
 *
 * Колонки объявлены здесь и только здесь. То, что страницы знают по-разному —
 * возраст позиции (на обзоре его знают наши часы, в бектесте — курсор
 * симуляции), «вход в диапазоне» (живой рыночный контекст, которого у
 * симуляции нет) и теги, — приходит рендерерами. Всё остальное одинаково по
 * построению, а не по договорённости.
 */
export function PositionsTable({
  positions,
  title,
  totalPnl,
  headExtra,
  renderAge,
  renderRange,
  renderTags,
  extraColumns,
  flush,
}: {
  positions: ExchangePosition[];
  title: string;
  /** Сумма нереализованного P&L в шапке; null — цена ещё не известна. */
  totalPnl: number | null;
  /** Что стоит в шапке слева от суммы: тумблер горизонта на обзоре. */
  headExtra?: ReactNode;
  renderAge: (p: ExchangePosition) => ReactNode;
  /** Колонка «Вход в диапазоне» — только там, где рыночный контекст вообще есть. */
  renderRange?: (p: ExchangePosition) => ReactNode;
  renderTags: (p: ExchangePosition) => ReactNode;
  /** Что добавляется поверх общего набора: колонка действий бектеста. */
  extraColumns?: LedgerColumn<ExchangePosition>[];
  /**
   * Без наборной полосы: таблица занимает всю ширину родителя. Терминал
   * бектеста — единственное место продукта без читательской колонки, и поля
   * `.wrap` там были бы полями внутри полей.
   */
  flush?: boolean;
}) {
  const t = useTranslations('positionsTable');

  const columns: LedgerColumn<ExchangePosition>[] = [
    { key: 'symbol', header: t('colSymbol'), render: (p) => <span className="sym">{p.symbol}</span> },
    {
      key: 'direction',
      header: t('colDirection'),
      render: (p) => <span className={`dir${p.direction === 'short' ? ' short' : ''}`}>{p.direction}</span>,
    },
    {
      key: 'size',
      header: t('colSize'),
      align: 'right',
      cellClassName: 'n',
      // Как и у закрытых сделок — деньгами. Номинал биржа считает сама
      // (positionValue), пересчитывать его из размера и цены незачем.
      render: (p) => <span title={t('qtyTitle', { qty: formatQty(p.size) })}>{formatPriceGrouped(p.positionValue)}</span>,
    },
    { key: 'entry', header: t('colEntry'), align: 'right', cellClassName: 'n', render: (p) => formatPriceGrouped(p.avgPrice) },
    { key: 'mark', header: t('colMark'), align: 'right', cellClassName: 'n', render: (p) => formatPriceGrouped(p.markPrice) },
    {
      key: 'liq',
      header: t('colLiq'),
      align: 'right',
      cellClassName: 'n neg',
      render: (p) => (parseFloat(p.liqPrice ?? '') > 0 ? formatPriceGrouped(p.liqPrice) : '—'),
    },
    { key: 'age', header: t('colInPosition'), align: 'right', cellClassName: 'n', render: renderAge },
    ...(renderRange ? [{ key: 'range', header: t('colRangeEntry'), width: 150, render: renderRange } satisfies LedgerColumn<ExchangePosition>] : []),
    {
      key: 'pnl',
      header: t('colUnrealizedPnl'),
      align: 'right',
      cellClassName: 'n',
      render: (p) => <Money value={parseFloat(p.unrealisedPnl ?? '') || 0} large />,
    },
    { key: 'tags', header: t('colTags'), cellClassName: 'cell-tags', render: renderTags },
    ...(extraColumns ?? []),
  ];

  const body = (
    <>
      <SectionHead title={title}>
        {headExtra}
        {totalPnl != null && <Money value={totalPnl} unit="USDT" className="n" />}
      </SectionHead>
      <LedgerTable columns={columns} rows={positions} rowKey={(p) => `${p.symbol}-${p.direction}`} />
    </>
  );

  return (
    // Полоса рисуется рывком, стоило позициям открыться, — тот же приём
    // «раскрытия», что и у строк заказа в LedgerTable (row-reveal):
    // content-обёртка растёт из малой высоты в свою нужную, а не вскакивает
    // сразу. Играет один раз, на первое появление — React не пересоздаёт узел
    // при обновлении данных внутри.
    <div className="row-reveal">{flush ? body : <Wrap>{body}</Wrap>}</div>
  );
}
