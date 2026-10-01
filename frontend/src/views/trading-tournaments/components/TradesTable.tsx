'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { FeedTrade } from '@/entities/tournament';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Монета без котировки: в эфире все монеты к USDT, и хвост только съедал бы узкую колонку. */
const coin = (symbol: string) => symbol.replace(/USDT$/, '');

/**
 * Таблица сделок турниров — одна на ленту «Сделки игроков» и на блок «Сделки»
 * в окне турнира. Видно всё, открытые позиции тоже: сторону, вход, стоп и тейк
 * (решение владельца 2026-09-26 — за турниром смотрят).
 *
 * `showTournament` — подпись турнира под именем игрока: в ленте строки из
 * разных турниров, а в окне турнир один, и его имя стоит в шапке.
 */
export function TradesTable({
  rows,
  isLoading,
  showTournament,
  onRowClick,
  empty,
}: {
  rows: FeedTrade[];
  isLoading: boolean;
  showTournament: boolean;
  onRowClick?: (row: FeedTrade) => void;
  empty: ReactNode;
}) {
  const t = useTranslations('tournaments');

  const columns: LedgerColumn<FeedTrade>[] = [
    { key: 'time', header: t('colTime'), cellClassName: 'n', width: 56, render: (x) => time(x.entryTime) },
    {
      key: 'player',
      header: t('colPlayer'),
      render: (x) =>
        showTournament ? (
          <span className="feed-cell">
            <span>{x.playerName ?? '—'}</span>
            <span className="subtle">{x.tournamentName}</span>
          </span>
        ) : (
          (x.playerName ?? '—')
        ),
    },
    {
      key: 'trade',
      header: t('colTrade'),
      render: (x) => (
        <span className="feed-cell">
          <span>
            <span className={`dir${x.direction === 'short' ? ' short' : ''}`}>{x.direction}</span>
            {` ${coin(x.symbol)} ×${x.leverage}`}
          </span>
          <span className="subtle n">
            {formatPriceGrouped(x.entryPrice)}
            {x.stopLoss > 0 && ` · SL ${formatPriceGrouped(x.stopLoss)}`}
            {x.takeProfit != null && ` · TP ${formatPriceGrouped(x.takeProfit)}`}
          </span>
        </span>
      ),
    },
    {
      key: 'result',
      header: t('colResult'),
      align: 'right',
      cellClassName: 'n',
      render: (x) =>
        x.exitTime != null && x.pnl != null ? (
          <Money value={x.pnl} />
        ) : (
          <span className="muted">{t('inPosition')}</span>
        ),
    },
  ];

  return (
    <LedgerTable
      columns={columns}
      rows={rows}
      rowKey={(x) => x.id}
      // Узкая боковая колонка у ленты: дефолтные 760px журнала шире её самой.
      minWidth={300}
      isLoading={isLoading}
      skeletonRows={5}
      onRowClick={onRowClick}
      empty={empty}
    />
  );
}
