'use client';

import { useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useTradeStats, useTimeStats, useTrades, type Trade, type TimeBucket } from '@/shared/api/bybit/hooks';
import { StatCard } from '@/shared/ui/StatCard';
import { DataTable } from '@/shared/ui/data-table';
import { Pagination } from '@/shared/ui/Pagination';
import { TermWindow } from '@/page/stats/TermWindow';
import { TradeOrders } from '@/page/stats/TradeOrders';
import { TradeTagsModal } from '@/page/stats/TradeTagsModal';
import { OpenPositions } from '@/page/stats/OpenPositions';
import { EquityChart } from '@/page/stats/EquityChart';
import { Kv, KvRow, StatRing, DuoRing, ringColor } from '@/page/stats/KvRow';
import { formatPnl, pnlColor } from '@/shared/lib/utils/format';
import { buildTradeColumns } from '@/shared/lib/utils/tradeColumns';

const WEEKDAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function fmtDuration(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}ч ${m}м` : `${m}м`;
}

function WeekdayBars({ buckets }: { buckets: TimeBucket[] }) {
  const maxAbs = Math.max(1, ...buckets.map((b) => Math.abs(b.totalPnl)));
  return (
    <div className="flex h-28 items-end gap-2 px-1">
      {WEEKDAY_ORDER.map((d) => {
        const b = buckets[d];
        const h = b?.trades ? Math.max(3, Math.round((Math.abs(b.totalPnl) / maxAbs) * 44)) : 0;
        return (
          <div
            key={d}
            className="flex h-full flex-1 flex-col items-center"
            title={b ? `${WEEKDAY_LABELS[d]}: ${formatPnl(b.totalPnl)} USDT · winrate ${b.winRate}%` : WEEKDAY_LABELS[d]}
          >
            <div className="relative flex w-full flex-1 flex-col justify-center">
              <div className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
              {b && b.trades > 0 && (
                <div
                  className={`absolute left-1/2 w-4 -translate-x-1/2 rounded-sm ${b.totalPnl >= 0 ? 'bg-up' : 'bg-down'}`}
                  style={b.totalPnl >= 0 ? { height: h, bottom: '50%' } : { height: h, top: '50%' }}
                />
              )}
            </div>
            <div className="mt-1.5 text-[11px] font-medium text-muted">{WEEKDAY_LABELS[d]}</div>
            <div className="text-[10px] text-subtle">{b?.trades ? `${b.winRate}%` : '—'}</div>
          </div>
        );
      })}
    </div>
  );
}

function HourHeatmap({ buckets }: { buckets: TimeBucket[] }) {
  return (
    <div>
      <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]">
        {buckets.map((b, h) => {
          const t = b.trades ? Math.min(1, Math.abs(b.winRate - 50) / 50) : 0;
          const good = b.winRate >= 50;
          const bg = !b.trades
            ? 'var(--color-elevated)'
            : good
              ? `rgba(38,165,68,${0.15 + t * 0.55})`
              : `rgba(235,87,87,${0.15 + t * 0.55})`;
          return (
            <div
              key={h}
              className="aspect-[1/1.3] rounded-sm"
              style={{ background: bg }}
              title={`${String(h).padStart(2, '0')}:00 · winrate ${b.trades ? b.winRate : '—'}% · ${b.trades} сделок`}
            />
          );
        })}
      </div>
      <div className="mt-1 grid grid-cols-[repeat(24,minmax(0,1fr))] gap-[3px]">
        {buckets.map((_, h) => (
          <span key={h} className="text-center text-[9px] text-subtle">
            {h % 3 === 0 ? h : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

export function OverviewTab({ days }: { days: number }) {
  const [page, setPage] = useState(1);
  // Сделка, которой сейчас правят теги (null — модалка закрыта).
  const [taggingTrade, setTaggingTrade] = useState<Trade | null>(null);
  const pageSize = 10;

  const { data: statsData } = useTradeStats({ days });
  const { data: timeData } = useTimeStats({ days });
  const { data: tradesData, isLoading: tradesLoading } = useTrades({ days, page, pageSize });

  const stats = statsData?.stats;
  const equity = statsData?.equity ?? [];
  const totalPages = tradesData ? Math.max(1, Math.ceil(tradesData.total / pageSize)) : 1;
  const columns: ColumnDef<Trade>[] = buildTradeColumns({
    withTagsEditable: true,
    onEditTags: setTaggingTrade,
    withExpander: true,
  });

  return (
    <>
      <TermWindow accent>
        {stats && (
          <KvRow>
            <Kv label="Сделок" value={stats.totalTrades} />
            <Kv
              label="Net P&L"
              value={`${formatPnl(stats.totalPnl)} USDT`}
              valueClassName={`font-mono text-[15px] font-bold ${pnlColor(stats.totalPnl)}`}
            />
            <Kv
              label="Winrate"
              value={`${stats.winRate.toFixed(1)}%`}
              ring={<StatRing value={stats.winRate} max={100} color={ringColor(stats.winRate, 50)} />}
            />
            <Kv
              label="Profit Factor"
              value={stats.losses === 0 ? (stats.wins > 0 ? '∞' : '—') : stats.profitFactor.toFixed(2)}
              ring={<StatRing value={stats.profitFactor} max={3} color={ringColor(stats.profitFactor, 1)} />}
            />
            <Kv label="W / L" value={`${stats.wins}/${stats.losses}`} ring={<DuoRing wins={stats.wins} total={stats.wins + stats.losses} />} />
            <Kv
              label="Avg trade"
              value={`${formatPnl(stats.avgPnl)} USDT`}
              valueClassName={`font-mono text-[15px] font-bold ${pnlColor(stats.avgPnl)}`}
            />
            <Kv label="Fees" value={`${stats.totalFees.toFixed(2)} USDT`} />
            <Kv label="Best / Worst" value={`${formatPnl(stats.bestPnl)} / ${formatPnl(stats.worstPnl)}`} />
          </KvRow>
        )}
      </TermWindow>

      {/* Что открыто прямо сейчас — сразу под метриками: таблица ниже знает
          только о закрытых сделках. Само себя прячет, если позиций нет. */}
      <OpenPositions />

      <section className="mt-3">
        <TermWindow>
          {/* Высота с запасом под полосу дат и легенду — иначе ось съедала бы
              область данных (легенда теперь внутри самого графика). */}
          <div className="h-55">
            {equity.length > 0 ? (
              <EquityChart data={equity} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted">Нет данных за период</div>
            )}
          </div>
        </TermWindow>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <TermWindow>{timeData ? <WeekdayBars buckets={timeData.byWeekday} /> : null}</TermWindow>
        <TermWindow>
          <HourHeatmap buckets={timeData?.byHour ?? []} />
          {timeData && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <StatCard
                label="avg hold"
                value={fmtDuration(timeData.duration.avgHoldMin)}
                containerClassName="rounded-md border border-line bg-elevated p-2"
                labelClassName="mb-0.5 text-[9px] tracking-wide text-muted uppercase"
                valueClassName="font-mono text-[13.5px] font-semibold text-fg"
              />
              <StatCard
                label="победители"
                value={fmtDuration(timeData.duration.avgWinHoldMin)}
                containerClassName="rounded-md border border-line bg-elevated p-2"
                labelClassName="mb-0.5 text-[9px] tracking-wide text-muted uppercase"
                valueClassName="font-mono text-[13.5px] font-semibold text-up"
              />
              <StatCard
                label="убыточные"
                value={fmtDuration(timeData.duration.avgLossHoldMin)}
                containerClassName="rounded-md border border-line bg-elevated p-2"
                labelClassName="mb-0.5 text-[9px] tracking-wide text-muted uppercase"
                valueClassName="font-mono text-[13.5px] font-semibold text-down"
              />
            </div>
          )}
        </TermWindow>
      </div>

      <section className="mt-3">
        <TermWindow tight>
          <DataTable
            data={tradesData?.trades ?? []}
            columns={columns}
            isLoading={tradesLoading}
            noDataContent={<div className="py-4 text-sm text-muted">Нет сделок за период</div>}
            rowClassName={(row: Trade) =>
              row.closedPnl > 0 ? 'bg-up/5 hover:bg-up/10' : row.closedPnl < 0 ? 'bg-down/5 hover:bg-down/10' : ''
            }
            getRowId={(row: Trade) => row.id}
            renderExpanded={(row: Trade) => <TradeOrders trade={row} />}
          />
          <Pagination
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="border-t border-line px-3 py-2.5"
          />
        </TermWindow>
      </section>

      {taggingTrade && <TradeTagsModal trade={taggingTrade} onClose={() => setTaggingTrade(null)} />}
    </>
  );
}
