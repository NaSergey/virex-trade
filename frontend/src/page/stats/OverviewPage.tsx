'use client';

import { useMemo, useState } from 'react';
import { useTradeStats, useTimeStats, useTrades, type Trade } from '@/shared/api/bybit/hooks';
import { Wrap } from '@/shared/ui/Wrap';
import { Pagination } from '@/shared/ui/Pagination';
import { usePeriodFilter } from './usePeriodFilter';
import { PeriodRail } from './PeriodRail';
import { SummaryStrip, SummaryStripSkeleton } from './SummaryStrip';
import { EquityChart, buildEquityGeometry } from './EquityChart';
import { OpenPositions } from './OpenPositions';
import { HourBars, HoldTimes, WeekdayRows } from './TimeBreakdown';
import { TradesTable } from './TradesTable';
import { TradeTagsModal } from './TradeTagsModal';

const PAGE_SIZE = 10;

/**
 * Обзор — лист гроссбуха, читаемый сверху вниз в одном порядке:
 * что за период (рейка) → сколько вышло (свод) → как оно набиралось (кривая) →
 * что открыто сейчас (единственная заливка) → когда получается (разбивки) →
 * из чего всё это состоит (журнал сделок).
 *
 * Порядок не произвольный: каждый следующий блок отвечает на вопрос, который
 * возникает от предыдущего.
 */
export function OverviewPage() {
  const { days, customDate, customActive, effectiveDays, setDays, setCustomDate } = usePeriodFilter();
  const [page, setPage] = useState(1);
  const [taggingTrade, setTaggingTrade] = useState<Trade | null>(null);

  const { data: statsData } = useTradeStats({ days: effectiveDays });
  const { data: timeData } = useTimeStats({ days: effectiveDays });
  const { data: tradesData, isLoading: tradesLoading } = useTrades({
    days: effectiveDays,
    page,
    pageSize: PAGE_SIZE,
  });

  const stats = statsData?.stats;
  const equity = useMemo(() => statsData?.equity ?? [], [statsData]);
  // Пик и просадка снимаются с той же геометрии, что рисует кривую, — иначе
  // подпись в маргиналии и картинка могли бы разойтись.
  const curve = useMemo(() => buildEquityGeometry(equity, 300), [equity]);

  return (
    <>
      <Wrap style={{ marginTop: 'var(--s4)' }}>
        <div className="strip">
          <PeriodRail
            title="Свод за период"
            days={days}
            customDate={customDate}
            customActive={customActive}
            trades={stats?.totalTrades}
            onSelectDays={(d) => {
              setDays(d);
              setPage(1);
            }}
            onCustomDate={(iso) => {
              setCustomDate(iso);
              setPage(1);
            }}
          />
          {stats ? <SummaryStrip stats={stats} /> : <SummaryStripSkeleton />}
        </div>
      </Wrap>

      {equity.length > 1 && (
        <div className="bleed">
          <EquityChart data={equity} />
        </div>
      )}

      <OpenPositions />

      <Wrap style={{ marginTop: 'var(--s5)' }}>
        <div className="asym">
          {/* Колонка — flex, чтобы список дней (.wk-list) забрал всю её высоту
              и кончился на одной линии с маргиналиями справа. */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h2>По дням недели</h2>
            {timeData ? <WeekdayRows buckets={timeData.byWeekday} /> : <div className="skel" />}
          </div>
          <aside className="marg">
            <h2>По часам входа</h2>
            <HourBars buckets={timeData?.byHour ?? []} />
            <p style={{ marginTop: 'var(--s3)', color: 'var(--color-muted)', fontSize: 'var(--t-xs)' }}>
              Высота — число сделок, заливка — винрейт.
            </p>
            {timeData && <HoldTimes duration={timeData.duration} peak={curve?.peak} />}
          </aside>
        </div>
      </Wrap>

      <Wrap style={{ marginTop: 'var(--s5)', paddingBottom: 'var(--s6)' }}>
        <h2>Закрытые сделки</h2>
        <TradesTable
          trades={tradesData?.trades ?? []}
          isLoading={tradesLoading && !tradesData}
          onEditTags={setTaggingTrade}
        />
        {tradesData && tradesData.total > 0 && (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={tradesData.total}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        )}
      </Wrap>

      {taggingTrade && <TradeTagsModal trade={taggingTrade} onClose={() => setTaggingTrade(null)} />}
    </>
  );
}
