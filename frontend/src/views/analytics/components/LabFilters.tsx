'use client';

import { useTranslations } from 'next-intl';
import { useTags } from '@/entities/tag';
import { Seg } from '@/shared/ui/Seg';
import { Button } from '@/shared/ui/Button';
import { SectionHead } from '@/shared/ui/SectionHead';
import { Select } from '@/shared/ui/Field';
import { Lookup, KeyValue } from '@/shared/ui/Lookup';
import type { LabFacetValue, LabResponse, RangeTf } from '../api/hooks';
import { weekdayLabels, WEEKDAY_ORDER } from '@/shared/lib/utils/period';
import { useLocaleControl } from '@/shared/i18n';
import { FilterGroup, type FilterOption } from './FilterGroup';
import { EMPTY_FACET, useStickySymbols } from '../model/facets';
import { DIR_LABELS, RANGE_TF_OPTIONS, SESSION_HINTS } from '../model/constants';
import { useLabLabels } from '../model/useLabLabels';
import type { LabFiltersState } from '../model/useLabFilters';

type FacetLookup = (dimension: string, key: string) => LabFacetValue | undefined;

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hh = (h: number) => String(h).padStart(2, '0');

/**
 * Один конец часового промежутка. Границы «с» и «до» отличаются только
 * подписью и минутами в пункте (00 у начала часа, 59 у конца) — всё остальное,
 * включая перевод пустого выбора в `undefined`, у них общее.
 */
function HourSelect({
  ariaLabel,
  placeholder,
  minute,
  value,
  onChange,
}: {
  ariaLabel: string;
  placeholder: string;
  minute: '00' | '59';
  value: number | undefined;
  onChange: (hour: number | undefined) => void;
}) {
  return (
    <Select
      aria-label={ariaLabel}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
    >
      <option value="">{placeholder}</option>
      {HOURS.map((h) => (
        <option key={h} value={h}>
          {hh(h)}:{minute}
        </option>
      ))}
    </Select>
  );
}

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
  const t = useTranslations('analytics');
  const pct = coverage.total > 0 ? (coverage.withContext / coverage.total) * 100 : 0;
  const missing = coverage.total - coverage.withContext;
  const noRange = coverage.withContext - coverage.withRange;

  // Полное покрытие — не новость. Полоса на 100 % и абзац о том, что ноль
  // сделок никуда не денется, занимали верх колонки условий и ничего не
  // сообщали. Блок существует ради предупреждения — без повода его нет.
  if (missing === 0 && noRange === 0) return null;

  return (
    <div className="cov">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span className="lbl dbt">{t('contextCoverage')}</span>
        <span className="n dbt">{pct.toFixed(1)} %</span>
      </div>
      <div className="cov-b">
        <i className="cov-f" style={{ width: `${pct.toFixed(1)}%` }} />
      </div>
      <p className="foot" style={{ marginTop: 0 }}>
        {missing > 0 && t('missingContextNote', { missing, total: coverage.total })}
        {noRange > 0 && t('missingRangeNote', { n: noRange })}
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
  const t = useTranslations('analytics');
  const tNav = useTranslations('nav');
  const { locale } = useLocaleControl();
  const WEEKDAY_LABELS = weekdayLabels(locale);
  const { sessionLabels, trendLabels, emaLabels, atrLabels, volLabels, rangeLabels, rangeHints, rangeTfWindows } =
    useLabLabels();
  const { filters, set, toggleMulti, toggleSingle, toggleWeekday } = state;
  const { data: tagsData, isLoading: tagsLoading } = useTags();
  const tags = tagsData?.tags ?? [];

  const facetSymbols = data?.facets.find((f) => f.dimension === 'symbol')?.values.map((v) => v.key) ?? [];
  const symbolKeys = useStickySymbols(facetSymbols, filters.symbols);

  const tagOptions: FilterOption[] = tags.map((tag) => ({
    key: tag.id,
    label: tag.name,
    active: filters.tagIds.includes(tag.id),
    stats: fv('tags', tag.id) ?? EMPTY_FACET(tag.id),
    onToggle: () => toggleMulti('tagIds', tag.id),
  }));

  const symbolOptions: FilterOption[] = symbolKeys.map((s) => ({
    key: s,
    label: s.replace('USDT', ''),
    active: filters.symbols.includes(s),
    stats: fv('symbol', s) ?? EMPTY_FACET(s),
    onToggle: () => toggleMulti('symbols', s),
  }));

  const timeOptions: FilterOption[] = [
    ...Object.keys(sessionLabels).map((s) => ({
      key: `session-${s}`,
      label: sessionLabels[s],
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
    ...Object.keys(trendLabels).map((tr) => ({
      key: `trend-${tr}`,
      label: trendLabels[tr],
      active: filters.trend4h.includes(tr),
      stats: fv('trend4h', tr),
      onToggle: () => toggleMulti('trend4h', tr),
    })),
    ...(['above', 'below'] as const).map((e) => ({
      key: `ema-${e}`,
      label: emaLabels[e],
      active: filters.ema200 === e,
      stats: fv('ema200', e),
      onToggle: () => toggleSingle('ema200', e),
    })),
    ...(['high', 'low'] as const).map((a) => ({
      key: `atr-${a}`,
      label: atrLabels[a],
      hint: data?.medians.atrPct != null ? t('atrMedianHint', { v: data.medians.atrPct.toFixed(2) }) : undefined,
      active: filters.atr === a,
      stats: fv('atr', a),
      onToggle: () => toggleSingle('atr', a),
    })),
    ...(['high', 'low'] as const).map((v) => ({
      key: `vol-${v}`,
      label: volLabels[v],
      hint:
        data?.medians.volRel != null ? t('volMedianHint', { v: data.medians.volRel.toFixed(2) }) : undefined,
      active: filters.vol === v,
      stats: fv('vol', v),
      onToggle: () => toggleSingle('vol', v),
    })),
  ];

  const rangeOptions: FilterOption[] = (['low', 'mid', 'high'] as const).map((k) => ({
    key: k,
    label: rangeLabels[k],
    hint: rangeHints[k],
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
      {/* Липнет не сама колонка, а эта обёртка: грид-элемент липнуть отказывался
          (его высота — высота ряда, съезжать некуда), а внутри него обычный блок
          ведёт себя предсказуемо и держится, пока едет длинная правая часть. */}
      <div className="lab-stick">
      {/* Сброс стоит над самими условиями, а не в шапке страницы: он относится
          к ним, а не ко всей «Выборке», и счётчик активных условий читается
          рядом с тем, что он считает. */}
      <SectionHead title={t('filtersTitle')}>
        <Button variant="bare" tight onClick={state.reset} disabled={state.activeCount === 0}>
          {t('reset')}{state.activeCount > 0 ? ` · ${state.activeCount}` : ''}
        </Button>
      </SectionHead>
      {data?.coverage && <Coverage coverage={data.coverage} />}

      <FilterGroup title={tNav('tags')} options={tagOptions} isLoading={tagsLoading} />
      <FilterGroup title={t('symbolsGroupTitle')} options={symbolOptions} isLoading={!data} />
      <FilterGroup title={t('timeGroupTitle')} options={timeOptions}>
        <Lookup one style={{ marginBottom: 'var(--s2)' }}>
          <KeyValue label={t('entryHours')} valueClassName="">
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s1)' }}>
              <HourSelect
                ariaLabel={t('hourFromAriaLabel')}
                placeholder={t('fromPlaceholder')}
                minute="00"
                value={filters.hourFrom}
                onChange={(hourFrom) => set({ hourFrom })}
              />
              <span className="lbl">–</span>
              <HourSelect
                ariaLabel={t('hourToAriaLabel')}
                placeholder={t('toPlaceholder')}
                minute="59"
                value={filters.hourTo}
                onChange={(hourTo) => set({ hourTo })}
              />
            </span>
          </KeyValue>
        </Lookup>
      </FilterGroup>
      <FilterGroup title={t('marketContextGroupTitle')} options={ctxOptions} />
      <FilterGroup title={t('entryRangeGroupTitle')} options={rangeOptions}>
        {/* Тумблер ТФ живёт в этой группе, а не в общем баре: он ничего не
            фильтрует, а выбирает, какую из пяти шкал читают условия ниже. */}
        <div style={{ marginBottom: 'var(--s2)' }}>
          <Seg
            options={RANGE_TF_OPTIONS}
            value={filters.rangeTf}
            onChange={(tf: RangeTf) => set({ rangeTf: tf })}
            ariaLabel={t('rangeTfAriaLabel')}
          />
          <p className="lbl" style={{ marginTop: 'var(--s1)', letterSpacing: '.04em' }}>
            {rangeTfWindows[filters.rangeTf]}
          </p>
        </div>
      </FilterGroup>
      <FilterGroup title={t('directionGroupTitle')} options={sideOptions} />
      </div>
    </aside>
  );
}
