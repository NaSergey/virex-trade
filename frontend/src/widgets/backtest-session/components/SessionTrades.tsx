'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Trade } from '@/entities/trade';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Pagination } from '@/shared/ui/Pagination';
import { SectionHead } from '@/shared/ui/SectionHead';
import { TradesTable } from '@/widgets/trades-table';
import type { BacktestTrade } from '../api/types';
import { toScreen } from '../lib/money';
import { TradeDetails } from './TradeDetails';

/** Столько же записей на лист, сколько в журнале обзора (см. OverviewPage). */
const PAGE_SIZE = 10;

/**
 * Сделка сессии в форме журнальной записи. Цены переводятся в показ (`toScreen`):
 * пока сессия идёт, настоящие цены могут быть скрыты, и таблица обязана
 * показывать ровно то же, что график рядом.
 */
function toTrade(x: BacktestTrade, scale: number): Trade {
  return {
    id: x.id,
    symbol: x.symbol,
    direction: x.direction,
    qty: x.qty,
    avgEntryPrice: toScreen(x.entryPrice, scale),
    avgExitPrice: x.exitPrice != null ? toScreen(x.exitPrice, scale) : 0,
    closedPnl: x.pnl ?? 0,
    openFee: 0,
    closeFee: x.fee ?? 0,
    leverage: x.leverage,
    // Открытая сделка закрытого времени не имеет: колонка «Закрыта» получит
    // время входа, а «В позиции» посчитается от него же и даст ноль. Врать
    // датой закрытия нечем — до закрытия её просто нет.
    closedAt: x.exitTime ?? x.entryTime,
    openedAt: x.entryTime,
    parts: 1,
    tags: x.tags,
  };
}

/**
 * Сделки сессии — тот же журнал, что «Закрытые сделки» на обзоре: та же
 * `TradesTable`, те же колонки, тот же разворот листами по {@link PAGE_SIZE}
 * (там — снаружи через `Pagination`, здесь — своя: сессия приходит целиком, и
 * ходить за страницей на сервер не за чем). Строка так же раскрывается разбором сделки —
 * только разбор свой (`TradeDetails`): филлов биржи у симуляции нет, есть план
 * входа. Не переносится одно — окно с биржевым графиком вокруг цены: свечей
 * сделки бектеста на бирже не существует.
 *
 * Своей таблицы у бектеста больше нет намеренно: пока их было две, колонки
 * расходились составом и порядком при любой правке одной из них.
 */
export function SessionTrades({
  trades,
  scale,
  labelFor,
  onEditTags,
  decimalsOf,
  onSymbol,
}: {
  trades: BacktestTrade[];
  /** Масштаб показа; у завершённой сессии — 1, цены раскрыты. */
  scale: number;
  labelFor: (t: number) => string;
  /** Без обработчика тег из таблицы не завести — плашки останутся только на чтение. */
  onEditTags?: (trade: BacktestTrade) => void;
  /** Знаков цены монеты (эфир); не задано — общее правило формата. */
  decimalsOf?: (symbol: string) => number | undefined;
  /** Нажатие на символ монеты — открыть её на графике (терминал); не задано — символ просто текст. */
  onSymbol?: (symbol: string) => void;
}) {
  const t = useTranslations('backtest');
  const [page, setPage] = useState(1);

  // Свежие сверху — как в журнале обзора, где сервер отдаёт сделки тем же порядком.
  const rows = [...trades].reverse();
  const lastPage = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const shownPage = Math.min(page, lastPage);
  const pageRows = rows.slice((shownPage - 1) * PAGE_SIZE, shownPage * PAGE_SIZE);
  const byId = new Map(trades.map((x) => [x.id, x]));

  return (
    <section>
      <SectionHead title={t('closedTradesTitle')} />
      <TradesTable
        trades={pageRows.map((x) => toTrade(x, scale))}
        formatClosed={(iso) => labelFor(Date.parse(iso))}
        chart={false}
        priceDecimals={decimalsOf && ((tr) => decimalsOf(tr.symbol))}
        renderExpanded={(tr) => (
          <TradeDetails trade={byId.get(tr.id)!} scale={scale} labelFor={labelFor} decimals={decimalsOf?.(tr.symbol)} />
        )}
        onEditTags={onEditTags && ((tr) => onEditTags(byId.get(tr.id)!))}
        onSymbol={onSymbol}
        empty={<EmptyState title={t('noTrades')} />}
      />
      {rows.length > 0 && (
        <Pagination
          page={shownPage}
          pageSize={PAGE_SIZE}
          total={rows.length}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => p + 1)}
        />
      )}
    </section>
  );
}
