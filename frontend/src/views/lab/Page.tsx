'use client';

import { useLab, type LabFilters as LabFiltersType } from './api/hooks';
import { Wrap } from '@/shared/ui/Wrap';
import { SectionHead } from '@/shared/ui/SectionHead';
import { EmptyState } from '@/shared/ui/EmptyState';
import { EquityChart } from '@/widgets/equity-chart';
import { TradesTable } from '@/widgets/trades-table';
import { usePeriodFilter, PeriodStrip } from '@/features/period-filter';
import { LabFilters } from './components/LabFilters';
import { LabCompare } from './components/LabCompare';
import { RANGE_TF_OPTIONS } from './model/constants';
import { useLabFilters } from './model/useLabFilters';
import { useFacetLookup } from './model/facets';

/**
 * Высота холста кривой — в единицах viewBox, а не в пикселях: холст размечен
 * под ширину наборной полосы и масштабируется по ширине того места, куда его
 * поставили. Правая колонка выборки заметно уже полосы, поэтому прежние 220
 * единиц оборачивались на экране сотней с небольшим пикселей — кривая выходила
 * ниже отведённой ей полосы.
 */
const EQUITY_H = 280;

/** Подпись ТФ в шапке колонки — та же, что на тумблере рядом с условиями. */
const RANGE_TF_LABELS: Record<string, string> = Object.fromEntries(
  RANGE_TF_OPTIONS.map((o) => [o.value, o.label]),
);

/**
 * Выборка: «а если брать только сделки при таких-то условиях — как меняется
 * результат?»
 *
 * Слева условия, справа результат; границу держит волосяная линейка, а не
 * пустая колонка сетки.
 *
 * В коде раздел остался `lab` — так же он называется и на бэкенде
 * (`/api/trades/lab`, `LabService`). Переименование видимого имени не тянет за
 * собой переименование по проводу.
 */
export const LabPage = () => {
  const period = usePeriodFilter();
  const state = useLabFilters();

  // Период живёт в usePeriodFilter (та же рейка, что на Обзоре и Тегах) —
  // filters.days не читаем, подменяем перед каждым запросом.
  const labFilters: LabFiltersType = { ...state.filters, days: period.effectiveDays };
  const { data, isLoading } = useLab(labFilters);
  const fv = useFacetLookup(data);

  const equity = data?.equity ?? [];
  const trades = data?.trades ?? [];
  const filtered = data?.filtered;

  return (
    <Wrap page>
      <PeriodStrip spaced period={period} title="Выборка из периода" trades={data?.baseline.trades} />

      {/* Шапки страницы нет вовсе: раздел уже назван вкладкой в верхней рейке,
          а рейка периода над ней говорит, за что считаем. Название и абзац под
          ним повторяли и то и другое, отодвигая работу на экран вниз. */}
      <div className="lab">
        <LabFilters state={state} data={data} fv={fv} />

        <div className="lab-r">
          <LabCompare filtered={filtered} baseline={data?.baseline} />

          <div className="lab-sec">
            {equity.length > 1 ? (
              <EquityChart data={equity} height={EQUITY_H} />
            ) : (
              <EmptyState title={isLoading ? 'Считаем…' : 'Ни одна сделка не подошла'}>
                Условия взаимоисключающие. Снимите одно — рядом с каждым видно, сколько сделок оно
                оставляет.
              </EmptyState>
            )}
          </div>

          {/* Пустая выборка уходит вместе с заголовком раздела: она уже
              объяснена состоянием на месте кривой выше, а «Подходящие сделки»
              над пустым местом обещают список, которого нет. */}
          {trades.length > 0 && (
            <div className="lab-sec">
              <SectionHead title="Подходящие сделки" />
              <TradesTable
                trades={trades}
                isLoading={isLoading}
                compact
                range={{ tf: state.filters.rangeTf, label: RANGE_TF_LABELS[state.filters.rangeTf] }}
              />
            </div>
          )}
        </div>
      </div>

    </Wrap>
  );
};
