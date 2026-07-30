'use client';

import { useTags } from '@/shared/api/tags/hooks';
import { Seg } from '@/shared/ui/Seg';
import type { LabFacetValue, LabResponse, RangeTf } from '@/shared/api/lab/hooks';
import { WEEKDAY_LABELS, WEEKDAY_ORDER } from '@/shared/lib/utils/period';
import { FilterGroup, type FilterOption } from './FilterGroup';
import { EMPTY_FACET, useStickySymbols } from './facets';
import {
  ATR_LABELS,
  DIR_LABELS,
  EMA_LABELS,
  RANGE_HINTS,
  RANGE_LABELS,
  RANGE_TF_OPTIONS,
  RANGE_TF_WINDOWS,
  SESSION_HINTS,
  SESSION_LABELS,
  TREND_LABELS,
  VOL_LABELS,
} from './constants';
import type { LabFiltersState } from './useLabFilters';

type FacetLookup = (dimension: string, key: string) => LabFacetValue | undefined;

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hh = (h: number) => String(h).padStart(2, '0');

/**
 * Покрытие контекстом — первое, что стоит в колонке фильтров, до самих
 * фильтров.
 *
 * Тренд, EMA, ATR, объём и диапазон считаются по свечам, и у части сделок их
 * нет: у старых — потому что контекст тогда не считался, у редких символов —
 * потому что не хватило истории. Такие сделки не проходят контекстные фильтры,
 * то есть молча выпадают из выборки. Сказать об этом заранее — единственный
 * честный вариант: иначе «убрал один фильтр — потерял 63 сделки» выглядит как
 * ошибка программы.
 */
function Coverage({ coverage }: { coverage: LabResponse['coverage'] }) {
  const pct = coverage.total > 0 ? (coverage.withContext / coverage.total) * 100 : 0;
  const missing = coverage.total - coverage.withContext;

  return (
    <div className="cov">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span className="lbl dbt">Покрытие контекстом</span>
        <span className="n dbt">{pct.toFixed(1)} %</span>
      </div>
      <div className="cov-b">
        <i className="cov-f" style={{ width: `${pct.toFixed(1)}%` }} />
      </div>
      <p style={{ color: 'var(--color-muted)', fontSize: 'var(--t-xs)' }}>
        Контекст посчитан у <span className="n">{coverage.withContext}</span> из{' '}
        <span className="n">{coverage.total}</span>; диапазон входа — у{' '}
        <span className="n">{coverage.withRange}</span>. Остальные{' '}
        <span className="n">{missing}</span> не попадут в выборку при фильтрах по контексту — они не
        выбрасываются молча.
      </p>
    </div>
  );
}

/**
 * Колонка условий выборки. Группами и складными, а не одним полем чипов:
 * измерений тринадцать, и открытым нужно держать то, с чем работаешь сейчас.
 */
export function LabFilters({
  state,
  data,
  fv,
}: {
  state: LabFiltersState;
  data?: LabResponse;
  fv: FacetLookup;
}) {
  const { filters, set, toggleMulti, toggleSingle, toggleWeekday } = state;
  const { data: tagsData } = useTags();
  const tags = tagsData?.tags ?? [];

  const facetSymbols = data?.facets.find((f) => f.dimension === 'symbol')?.values.map((v) => v.key) ?? [];
  const symbolKeys = useStickySymbols(facetSymbols, filters.symbols);

  const tagOptions: FilterOption[] = tags.map((t) => ({
    key: t.id,
    label: t.name,
    active: filters.tagIds.includes(t.id),
    stats: fv('tags', t.id) ?? EMPTY_FACET(t.id),
    onToggle: () => toggleMulti('tagIds', t.id),
  }));

  const symbolOptions: FilterOption[] = symbolKeys.map((s) => ({
    key: s,
    label: s.replace('USDT', ''),
    active: filters.symbols.includes(s),
    stats: fv('symbol', s) ?? EMPTY_FACET(s),
    onToggle: () => toggleMulti('symbols', s),
  }));

  const timeOptions: FilterOption[] = [
    ...Object.keys(SESSION_LABELS).map((s) => ({
      key: `session-${s}`,
      label: SESSION_LABELS[s],
      hint: SESSION_HINTS[s],
      active: filters.sessions.includes(s),
      stats: fv('session', s),
      onToggle: () => toggleMulti('sessions', s),
    })),
    ...WEEKDAY_ORDER.map((d) => ({
      key: `weekday-${d}`,
      label: WEEKDAY_LABELS[d],
      active: filters.weekdays.includes(d),
      stats: fv('weekday', String(d)),
      onToggle: () => toggleWeekday(d),
    })),
  ];

  const ctxOptions: FilterOption[] = [
    ...Object.keys(TREND_LABELS).map((t) => ({
      key: `trend-${t}`,
      label: TREND_LABELS[t],
      active: filters.trend4h.includes(t),
      stats: fv('trend4h', t),
      onToggle: () => toggleMulti('trend4h', t),
    })),
    ...(['above', 'below'] as const).map((e) => ({
      key: `ema-${e}`,
      label: EMA_LABELS[e],
      active: filters.ema200 === e,
      stats: fv('ema200', e),
      onToggle: () => toggleSingle('ema200', e),
    })),
    ...(['high', 'low'] as const).map((a) => ({
      key: `atr-${a}`,
      label: ATR_LABELS[a],
      hint: data?.medians.atrPct != null ? `Медиана ATR за период: ${data.medians.atrPct.toFixed(2)} %` : undefined,
      active: filters.atr === a,
      stats: fv('atr', a),
      onToggle: () => toggleSingle('atr', a),
    })),
    ...(['high', 'low'] as const).map((v) => ({
      key: `vol-${v}`,
      label: VOL_LABELS[v],
      hint:
        data?.medians.volRel != null
          ? `Медиана объёма за период: ×${data.medians.volRel.toFixed(2)} от среднего`
          : undefined,
      active: filters.vol === v,
      stats: fv('vol', v),
      onToggle: () => toggleSingle('vol', v),
    })),
  ];

  const rangeOptions: FilterOption[] = (['low', 'mid', 'high'] as const).map((k) => ({
    key: k,
    label: RANGE_LABELS[k],
    hint: RANGE_HINTS[k],
    active: filters.range === k,
    stats: fv('range', k),
    onToggle: () => toggleSingle('range', k),
  }));

  const sideOptions: FilterOption[] = (['long', 'short'] as const).map((d) => ({
    key: d,
    label: DIR_LABELS[d],
    active: filters.direction === d,
    stats: fv('direction', d),
    onToggle: () => toggleSingle('direction', d),
  }));

  return (
    <aside>
      {data?.coverage && <Coverage coverage={data.coverage} />}

      <FilterGroup title="Теги" options={tagOptions} defaultOpen />
      <FilterGroup title="Символы" options={symbolOptions} />
      <FilterGroup title="Время" options={timeOptions} defaultOpen>
        <div className="lookup" style={{ gridTemplateColumns: '1fr', marginBottom: 'var(--s2)' }}>
          <div>
            <span className="lbl">Часы входа</span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s1)' }}>
              <select
                className="in"
                aria-label="Час входа, с"
                value={filters.hourFrom ?? ''}
                onChange={(e) => set({ hourFrom: e.target.value === '' ? undefined : Number(e.target.value) })}
              >
                <option value="">с —</option>
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {hh(h)}:00
                  </option>
                ))}
              </select>
              <span className="lbl">–</span>
              <select
                className="in"
                aria-label="Час входа, до"
                value={filters.hourTo ?? ''}
                onChange={(e) => set({ hourTo: e.target.value === '' ? undefined : Number(e.target.value) })}
              >
                <option value="">до —</option>
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {hh(h)}:59
                  </option>
                ))}
              </select>
            </span>
          </div>
        </div>
      </FilterGroup>
      <FilterGroup title="Рыночный контекст" options={ctxOptions} />
      <FilterGroup title="Диапазон входа" options={rangeOptions}>
        {/* Тумблер ТФ живёт в этой группе, а не в общем баре: он ничего не
            фильтрует, а выбирает, какую из трёх шкал читают условия ниже. */}
        <div style={{ marginBottom: 'var(--s2)' }}>
          <Seg
            options={RANGE_TF_OPTIONS}
            value={filters.rangeTf}
            onChange={(tf: RangeTf) => set({ rangeTf: tf })}
            ariaLabel="Таймфрейм диапазона"
          />
          <p className="lbl" style={{ marginTop: 'var(--s1)', letterSpacing: '.04em' }}>
            {RANGE_TF_WINDOWS[filters.rangeTf]}
          </p>
        </div>
      </FilterGroup>
      <FilterGroup title="Направление" options={sideOptions} />
    </aside>
  );
}
