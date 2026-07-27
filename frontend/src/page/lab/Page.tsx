'use client';

import { useMemo } from 'react';
import { FlaskConical } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/shared/ui/data-table';
import { PageShell } from '@/shared/ui/PageShell';
import { buildTradeColumns, tradeRowClass } from '@/shared/lib/utils/tradeColumns';
import type { Trade } from '@/shared/api/bybit/hooks';
import { useLab, type LabFilters } from '@/shared/api/lab/hooks';
import { EquityChart } from '@/page/stats/EquityChart';
import { usePeriodFilter } from '@/page/stats/usePeriodFilter';
import { PeriodFilterControls } from '@/page/stats/StatsHeader';
import { LabFilterPanel } from './LabFilterPanel';
import { LabSummary } from './LabSummary';
import { useLabFilters } from './useLabFilters';
import { useFacetLookup } from './facets';

export const LabPage = () => {
  const { days, customDate, effectiveDays, setDays, setCustomDate } = usePeriodFilter();
  const state = useLabFilters();
  // Период живёт в usePeriodFilter (тот же блок 7/30/90/всё + своя дата, что
  // на Обзоре/Тегах) — filters.days из состояния не читаем, подменяем перед
  // каждым запросом, чтобы не дублировать источник истины.
  const labFilters: LabFilters = { ...state.filters, days: effectiveDays };
  const { data, isLoading } = useLab(labFilters);
  const fv = useFacetLookup(data);

  const filtered = data?.filtered;
  const equity = data?.equity ?? [];
  const trades = data?.trades ?? [];
  const columns = useMemo<ColumnDef<Trade>[]>(() => buildTradeColumns({ withTagsEditable: false }), []);

  return (
    <PageShell>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-fg" />
          <h1 className="text-base font-semibold text-fg">Лаборатория</h1>
          <span className="text-xs text-muted">комбинируй фильтры — ищи, что реально работает</span>
        </div>
        <PeriodFilterControls days={days} customDate={customDate} onSelectDays={setDays} onCustomDate={setCustomDate} />
      </div>

      <LabFilterPanel state={state} data={data} fv={fv} />

      <LabSummary filtered={filtered} baseline={data?.baseline} />

      <section className="panel flex h-75 flex-col">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="text-sm font-semibold text-fg">Кривая P&L по выборке</span>
          {filtered && (
            <span className="text-xs text-muted">
              {filtered.wins} прибыльных · {filtered.losses} убыточных
            </span>
          )}
        </div>
        <div className="min-h-0 flex-1 p-2">
          {equity.length > 0 ? (
            <EquityChart data={equity} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              {isLoading ? 'Загрузка…' : 'Нет сделок под эти фильтры'}
            </div>
          )}
        </div>
      </section>

      {/* Фиксированная высота (как у графика выше): число подходящих строк
          (0..200) иначе меняло бы размер всей страницы на каждый клик. */}
      <section className="panel flex h-105 flex-col p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-fg">Сделки выборки</span>
          <span className="text-xs text-muted">
            {filtered && trades.length < filtered.trades
              ? `Показаны последние ${trades.length} из ${filtered.trades}`
              : `Всего: ${trades.length}`}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <DataTable
            data={trades}
            columns={columns}
            isLoading={isLoading}
            noDataContent={<div className="py-4 text-sm text-muted">Нет сделок под эти фильтры</div>}
            rowClassName={tradeRowClass}
          />
        </div>
      </section>
    </PageShell>
  );
};
