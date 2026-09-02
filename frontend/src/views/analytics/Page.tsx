'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useLab, type LabFilters as LabFiltersType } from './api/hooks';
import { Wrap } from '@/shared/ui/Wrap';
import { SectionHead } from '@/shared/ui/SectionHead';
import { EmptyState } from '@/shared/ui/EmptyState';
import { EquityChart, EquityChartSkeleton } from '@/widgets/equity-chart';
import { TradesTable } from '@/widgets/trades-table';
import { Pagination } from '@/shared/ui/Pagination';
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

/**
 * Сколько сделок на листе. Выборка отдаёт все подходящие сделки одним ответом,
 * поэтому листается на клиенте: у `/api/trades/lab` нет постраничной ручки, а
 * заводить её ради списка под кривой — менять провод из-за вёрстки.
 */
const PAGE_SIZE = 30;

/** Подпись ТФ в шапке колонки — та же, что на тумблере рядом с условиями. */
const RANGE_TF_LABELS: Record<string, string> = Object.fromEntries(
  RANGE_TF_OPTIONS.map((o) => [o.value, o.label]),
);

/**
 * Аналитика (была «Выборка» на `/lab`): «а если брать только сделки при
 * таких-то условиях — как меняется результат?»
 *
 * Слева условия, справа результат; границу держит волосяная линейка, а не
 * пустая колонка сетки.
 *
 * В коде раздел остался `lab` — так же он называется и на бэкенде
 * (`/api/trades/lab`, `LabService`). Переименование видимого имени и адреса не
 * тянет за собой переименование по проводу.
 */
export const AnalyticsPage = () => {
  const t = useTranslations('analytics');
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

  // Смена условий сбрасывает список на первый лист: третий лист прежней
  // выборки в новой означал бы уже не те сделки — та же причина, по которой
  // Обзор сбрасывает журнал при смене периода.
  const [page, setPage] = useState(1);
  const filtersKey = JSON.stringify(labFilters);
  useEffect(() => {
    setPage(1);
  }, [filtersKey]);

  const pageTrades = useMemo(
    () => trades.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [trades, page],
  );

  return (
    <Wrap page>
      {/* Без `title` — как на «Обзоре» и «Тегах»: полоса говорит только за
          сколько сделок сейчас идёт речь. Раздел уже назван вкладкой в
          верхней рейке, и повторять это над каждой страницей незачем. */}
      <PeriodStrip spaced period={period} trades={data?.baseline.trades} />

      {/* Шапки страницы нет вовсе: раздел уже назван вкладкой в верхней рейке,
          а рейка периода над ней говорит, за что считаем. Название и абзац под
          ним повторяли и то и другое, отодвигая работу на экран вниз. */}
      <div className="lab">
        <LabFilters state={state} data={data} fv={fv} />

        <div className="lab-r">
          <LabCompare filtered={filtered} baseline={data?.baseline} isLoading={isLoading} />

          <div className="lab-sec" data-tour="lab-equity">
            {/* Счёт и пустая выборка — разные состояния, и раньше их различало
                одно слово в заголовке одной и той же плашки: «Считаю» на месте,
                где через секунду встанет «Ни одна сделка не подошла». Теперь
                ожидание держит холст кривой той же высоты, что и сама кривая,
                а плашка осталась только настоящему ответу «ничего не нашлось». */}
            {isLoading ? (
              <EquityChartSkeleton height={EQUITY_H} />
            ) : equity.length > 1 ? (
              <EquityChart data={equity} height={EQUITY_H} />
            ) : (
              <EmptyState title={t('noTradesMatched')}>{t('mutuallyExclusiveNote')}</EmptyState>
            )}
          </div>

          {/* Пустая выборка уходит вместе с заголовком раздела: она уже
              объяснена состоянием на месте кривой выше, а «Подходящие сделки»
              над пустым местом обещают список, которого нет. */}
          {/* Во время счёта список стоит заглушками, а не отсутствует: без него
              правая колонка кончалась кривой, а с приходом ответа под ней
              разворачивались тридцать строк и уносили страницу вниз. Убирается
              он только тогда, когда ответ пришёл и в нём пусто. */}
          {(isLoading || trades.length > 0) && (
            <div className="lab-sec">
              <SectionHead title={t('matchingTrades')} />
              <TradesTable
                trades={pageTrades}
                isLoading={isLoading}
                skeletonRows={10}
                compact
                range={{ tf: state.filters.rangeTf, label: RANGE_TF_LABELS[state.filters.rangeTf] }}
              />
              {trades.length > PAGE_SIZE && (
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={trades.length}
                  onPrev={() => setPage((p) => Math.max(1, p - 1))}
                  onNext={() => setPage((p) => p + 1)}
                />
              )}
            </div>
          )}
        </div>
      </div>

    </Wrap>
  );
};
