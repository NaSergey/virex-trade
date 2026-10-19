'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { Pagination } from '@/shared/ui/Pagination';
import { SectionHead } from '@/shared/ui/SectionHead';
import { dateFormat } from '@/shared/lib/utils/intl';
import { durationUnitLabels, formatPrice } from '@/shared/lib/utils/format';
import { useHlTrades, type HlCoinStat, type HlTrade } from '../api/hooks';
import { duration, pct, usd } from '../model/format';
import { FillsTable } from './ActivityTables';

/** Сделок на листе: десять строк читаются без прокрутки. */
const PAGE = 10;
/** Монет в разбивке: дальше хвост из единичных сделок, он ничего не говорит о привычках. */
const TOP_COINS = 8;

/**
 * Вкладка «История сделок» сохранённого кошелька: сверху — на каких монетах он
 * торгует, ниже — его сделки (позиция от входа до выхода, а не отдельные
 * исполнения), по десять на лист. Строка раскрывается исполнениями сделки.
 */
export function TradesPanel({ address }: { address: string }) {
  const t = useTranslations('hlWallets');
  const locale = useLocale();
  const units = durationUnitLabels(locale === 'en' ? 'en' : 'ru');
  const q = useHlTrades(address, true);
  const [page, setPage] = useState(1);

  const when = (ms: number) =>
    dateFormat(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
  const price = (v: number | null) => (v == null ? '—' : formatPrice(v));

  const coinColumns: LedgerColumn<HlCoinStat>[] = [
    { key: 'coin', header: t('colCoin'), render: (c) => c.coin },
    {
      key: 'share',
      header: t('colShare'),
      render: (c) => (
        <span className="hl-share">
          <span className="hl-share-bar" aria-hidden>
            <i style={{ width: `${Math.max(2, Math.round(c.share * 100))}%` }} />
          </span>
          <span className="n">{pct(c.share)}</span>
        </span>
      ),
    },
    { key: 'trades', header: t('colTrades'), align: 'right', cellClassName: 'n', render: (c) => c.trades },
    { key: 'volume', header: t('colVolume'), align: 'right', cellClassName: 'n', render: (c) => usd(c.volume) },
    {
      key: 'pnl',
      header: t('colTradePnl'),
      align: 'right',
      cellClassName: 'n',
      render: (c) => <Money value={c.pnl} digits={0} />,
    },
  ];

  const columns: LedgerColumn<HlTrade>[] = [
    {
      key: 'time',
      header: t('colClosed'),
      render: (x) => (x.closedAt == null ? <span className="muted">{t('tradeOpen')}</span> : when(x.closedAt)),
    },
    { key: 'coin', header: t('colCoin'), render: (x) => x.coin },
    {
      key: 'side',
      header: t('colSide'),
      render: (x) => <span className={x.side === 'long' ? 'pos' : 'neg'}>{t(x.side)}</span>,
    },
    { key: 'entry', header: t('colEntry'), align: 'right', cellClassName: 'n', render: (x) => price(x.entryPx) },
    { key: 'exit', header: t('colExit'), align: 'right', cellClassName: 'n', render: (x) => price(x.exitPx) },
    { key: 'size', header: t('colSize'), align: 'right', cellClassName: 'n', render: (x) => usd(x.notional) },
    {
      key: 'held',
      header: t('colHeld'),
      align: 'right',
      cellClassName: 'n',
      render: (x) =>
        x.partial ? (
          <span title={t('partialTitle')}>≥ {duration(x.lastAt - x.openedAt, units)}</span>
        ) : (
          duration(x.lastAt - x.openedAt, units)
        ),
    },
    {
      key: 'pnl',
      header: t('colTradePnl'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => <Money value={x.pnl} digits={2} />,
    },
    { key: 'fee', header: t('colFee'), align: 'right', cellClassName: 'n', render: (x) => x.fee.toFixed(2) },
    { key: 'fills', header: t('colFillsCount'), align: 'right', cellClassName: 'n', render: (x) => x.fills.length },
  ];

  const trades = q.data?.trades ?? [];
  const coins = (q.data?.coins ?? []).slice(0, TOP_COINS);

  return (
    <>
      <ErrorNote error={q.error} fallback={t('loadFailed')} />
      <SectionHead title={t('coinsTraded')} />
      <LedgerTable
        columns={coinColumns}
        rows={coins}
        rowKey={(c) => c.coin}
        minWidth={560}
        isLoading={q.isLoading}
        skeletonRows={3}
        empty={t('noTrades')}
      />
      <SectionHead title={t('tabFills')} style={{ marginTop: 'var(--s4)' }} />
      <LedgerTable
        columns={columns}
        rows={trades.slice((page - 1) * PAGE, page * PAGE)}
        rowKey={(x) => `${x.coin}:${x.side}:${x.openedAt}`}
        minWidth={980}
        isLoading={q.isLoading}
        skeletonRows={PAGE}
        empty={t('noTrades')}
        renderExpanded={(x) => <FillsTable rows={x.fills} isLoading={false} />}
      />
      <Pagination
        page={page}
        pageSize={PAGE}
        total={trades.length}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />
      {q.data?.since ? (
        <p className="muted">{t('tradesNote', { fills: q.data.fillsCount, since: when(q.data.since) })}</p>
      ) : null}
    </>
  );
}
