'use client';

import { useState } from 'react';
import { useLab, type LabFilters as LabFiltersType } from '@/shared/api/lab/hooks';
import type { Trade } from '@/shared/api/bybit/hooks';
import { Wrap } from '@/shared/ui/Wrap';
import { Tags } from '@/shared/ui/Tag';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { EquityChart } from '@/page/stats/EquityChart';
import { RangeCheckModal } from '@/page/stats/RangeCheckModal';
import { usePeriodFilter } from '@/page/stats/usePeriodFilter';
import { PeriodRail } from '@/page/stats/PeriodRail';
import { formatMoney, formatPriceGrouped, moneyClass } from '@/shared/lib/utils/format';
import { formatRangePos } from '@/shared/lib/utils/range';
import { LabFilters } from './LabFilters';
import { LabCompare } from './LabCompare';
import { RANGE_TF_OPTIONS } from './constants';
import { useLabFilters } from './useLabFilters';
import { useFacetLookup } from './facets';

/** Подпись ТФ в шапке колонки — та же, что на тумблере рядом с условиями. */
const RANGE_TF_LABELS: Record<string, string> = Object.fromEntries(
  RANGE_TF_OPTIONS.map((o) => [o.value, o.label]),
);

/** Диапазон выбранного ТФ — тот же, по которому фильтрует колонка условий. */
function rangeOf(trade: Trade, tf: LabFiltersType['rangeTf']): number | null {
  const ctx = trade.context;
  if (!ctx) return null;
  return tf === '1h' ? ctx.rangePos1h : tf === '4h' ? ctx.rangePos4h : ctx.rangePos1d;
}

/**
 * Лаборатория: «а если брать только сделки при таких-то условиях — как меняется
 * результат?»
 *
 * Слева условия, справа результат; границу держит волосяная линейка, а не
 * пустая колонка сетки.
 */
export const LabPage = () => {
  const { days, customDate, customActive, effectiveDays, setDays, setCustomDate } = usePeriodFilter();
  const state = useLabFilters();
  const [rangeCheck, setRangeCheck] = useState<Trade | null>(null);

  // Период живёт в usePeriodFilter (та же рейка, что на Обзоре и Тегах) —
  // filters.days не читаем, подменяем перед каждым запросом.
  const labFilters: LabFiltersType = { ...state.filters, days: effectiveDays };
  const { data, isLoading } = useLab(labFilters);
  const fv = useFacetLookup(data);

  const equity = data?.equity ?? [];
  const trades = data?.trades ?? [];
  const filtered = data?.filtered;

  const columns: LedgerColumn<Trade>[] = [
    {
      key: 'closedAt',
      header: 'Закрыта',
      cellClassName: 'n',
      render: (t) => (
        <span style={{ color: 'var(--color-muted)' }}>
          {new Date(t.closedAt)
            .toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
            .replace('.', '')}
        </span>
      ),
    },
    { key: 'symbol', header: 'Символ', render: (t) => <span className="sym">{t.symbol}</span> },
    {
      key: 'direction',
      header: 'Напр.',
      render: (t) => <span className={`dir${t.direction === 'short' ? ' short' : ''}`}>{t.direction}</span>,
    },
    {
      key: 'entry',
      header: 'Вход',
      align: 'right',
      cellClassName: 'n',
      render: (t) => formatPriceGrouped(t.avgEntryPrice),
    },
    {
      key: 'range',
      header: `Диапазон ${RANGE_TF_LABELS[state.filters.rangeTf]}`,
      label: 'Диапазон',
      align: 'right',
      cellClassName: 'n',
      render: (t) => (
        <span style={{ color: 'var(--color-muted)' }}>{formatRangePos(rangeOf(t, state.filters.rangeTf))}</span>
      ),
    },
    {
      key: 'pnl',
      header: 'P&L',
      align: 'right',
      cellClassName: 'n',
      render: (t) => <span className={moneyClass(t.closedPnl)}>{formatMoney(t.closedPnl)}</span>,
    },
    { key: 'tags', header: 'Теги', cellClassName: 'cell-tags', render: (t) => <Tags tags={t.tags ?? []} /> },
    {
      key: 'check',
      align: 'right',
      render: (t) => (
        <button className="btn bare" onClick={() => setRangeCheck(t)}>
          Проверить
        </button>
      ),
    },
  ];

  return (
    <Wrap style={{ paddingBottom: 'var(--s6)' }}>
      <div className="pagehead">
        <div>
          <h1>Лаборатория</h1>
          <p className="lede">
            А если брать только сделки при таких-то условиях — как меняется результат? Рядом с каждым
            условием видно, во что он обойдётся.
          </p>
        </div>
        <button className="btn" onClick={state.reset} disabled={state.activeCount === 0}>
          Сбросить {state.activeCount > 0 ? `· ${state.activeCount}` : ''}
        </button>
      </div>

      <div className="strip" style={{ marginBottom: 'var(--s4)' }}>
        <PeriodRail
          title="Выборка из периода"
          days={days}
          customDate={customDate}
          customActive={customActive}
          trades={data?.baseline.trades}
          onSelectDays={setDays}
          onCustomDate={setCustomDate}
        />
      </div>

      <div className="lab">
        <LabFilters state={state} data={data} fv={fv} />

        <div className="lab-r">
          <LabCompare filtered={filtered} baseline={data?.baseline} />

          <div style={{ marginTop: 'var(--s4)' }}>
            <h2>Кривая выборки</h2>
            {equity.length > 1 ? (
              <EquityChart data={equity} height={220} />
            ) : (
              <div className="state">
                <h3>{isLoading ? 'Считаем…' : 'Ни одна сделка не подошла'}</h3>
                <p>
                  Условия взаимоисключающие. Снимите одно — рядом с каждым видно, сколько сделок оно
                  оставляет.
                </p>
              </div>
            )}
          </div>

          <div style={{ marginTop: 'var(--s4)' }}>
            <div className="h2row">
              <h2>Подходящие сделки</h2>
              <span className="lbl">
                {filtered && trades.length < filtered.trades
                  ? `последние ${trades.length} из ${filtered.trades}`
                  : `${trades.length}`}
              </span>
            </div>

            {/* Пустая выборка уже объяснена состоянием на месте кривой выше —
                второй раз повторять то же самое под пустой таблицей незачем. */}
            {trades.length > 0 && (
              <LedgerTable columns={columns} rows={trades} rowKey={(t) => t.id} />
            )}
          </div>
        </div>
      </div>

      {rangeCheck && <RangeCheckModal trade={rangeCheck} onClose={() => setRangeCheck(null)} />}
    </Wrap>
  );
};
