'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTradeStats, useTimeStats, useTrades, type Trade } from '@/entities/trade';
import { Wrap } from '@/shared/ui/Wrap';
import { Pagination } from '@/shared/ui/Pagination';
import { usePeriodFilter, PeriodStrip } from '@/features/period-filter';
import { buildEquityGeometry, EquityChart, EquityChartSkeleton } from '@/widgets/equity-chart';
import { SummaryStrip, SummaryStripSkeleton } from './components/SummaryStrip';
import { OpenPositions } from './components/OpenPositions';
// «Цена привычек» временно снята с показа — закомментировано, не удалено.
// import { HabitsBlock } from './components/HabitsBlock';
import {
  HourBars,
  HourBarsSkeleton,
  HoldTimes,
  HoldTimesSkeleton,
  WeekdayRows,
  WeekdayRowsSkeleton,
} from './components/TimeBreakdown';
import { TradesTable } from '@/widgets/trades-table';
import { TradeTagsModal } from './components/TradeTagsModal';

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
  const t = useTranslations('overview');
  const period = usePeriodFilter();
  const [page, setPage] = useState(1);
  const [taggingTrade, setTaggingTrade] = useState<Trade | null>(null);

  const { effectiveDays } = period;
  const { data: statsData } = useTradeStats({ days: effectiveDays });
  const { data: timeData } = useTimeStats({ days: effectiveDays });
  // const { data: habitsData, isLoading: habitsLoading } = useHabits({ days: effectiveDays });
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
        {/* Смена периода сбрасывает журнал на первую страницу: седьмая страница
            прежнего периода в новом означала бы уже не те сделки. */}
        <PeriodStrip
          period={period}
          trades={stats?.totalTrades}
          onChange={() => setPage(1)}
        >
          {stats ? <SummaryStrip stats={stats} /> : <SummaryStripSkeleton />}
        </PeriodStrip>
      </Wrap>

      {/* Холст держит место, пока свод не пришёл: без заглушки блок кривой
          занимает ноль, а с ответом вырастает и сдвигает вниз всю страницу.
          Когда ответ пришёл и рисовать нечего (сделок нет), блока нет вовсе —
          пустой холст обещал бы кривую, которой не будет. */}
      {!statsData ? (
        <div className="bleed">
          <EquityChartSkeleton />
        </div>
      ) : (
        equity.length > 1 && (
          <div className="bleed" data-tour="equity">
            <EquityChart data={equity} />
          </div>
        )
      )}

      <OpenPositions />

      {/* «Цена привычек» временно снята с показа — закомментировано, не удалено.
      <Wrap style={{ marginTop: 'var(--s5)' }}>
        <HabitsBlock data={habitsData} isLoading={habitsLoading && !habitsData} />
      </Wrap>
      */}

      <Wrap style={{ marginTop: 'var(--s5)' }}>
        <div className="asym">
          {/* Колонка — flex, чтобы список дней (.wk-list) забрал всю её высоту
              и кончился на одной линии с маргиналиями справа. */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h2>{t('byWeekday')}</h2>
            {timeData ? <WeekdayRows buckets={timeData.byWeekday} /> : <WeekdayRowsSkeleton />}
          </div>
          <aside className="marg">
            <h2>{t('byHour')}</h2>
            {timeData ? <HourBars buckets={timeData.byHour} /> : <HourBarsSkeleton />}
            <p className="foot">{t('hourBarsCaption')}</p>
            {timeData ? (
              <HoldTimes duration={timeData.duration} peak={curve?.peak} />
            ) : (
              <HoldTimesSkeleton />
            )}
          </aside>
        </div>
      </Wrap>

      <Wrap page className="trades" style={{ marginTop: 'var(--s5)' }} data-tour="trades">
        <h2>{t('closedTrades')}</h2>
        <TradesTable
          trades={tradesData?.trades ?? []}
          isLoading={tradesLoading && !tradesData}
          skeletonRows={PAGE_SIZE}
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
