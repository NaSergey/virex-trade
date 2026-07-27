'use client';

import { RotateCcw } from 'lucide-react';
import { cn } from '@/shared/lib/utils/css';
import { WEEKDAY_LABELS, WEEKDAY_ORDER } from '@/shared/lib/utils/period';
import { useTags } from '@/shared/api/tags/hooks';
import type { LabFacetValue, LabResponse } from '@/shared/api/lab/hooks';
import { ChipGroup, ChipGroupFromDefs, FacetChip, type ChipDef } from './FacetChip';
import { DirectionToggle } from './DirectionToggle';
import { HourRangeSelect } from './HourRangeSelect';
import { EMPTY_FACET, useStickySymbols } from './facets';
import { ATR_LABELS, EMA_LABELS, SESSION_HINTS, SESSION_LABELS, TREND_LABELS, VOL_LABELS } from './constants';
import type { LabFiltersState } from './useLabFilters';

type FacetLookup = (dimension: string, key: string) => LabFacetValue | undefined;

/** Узкая группа делит строку с такой же; широкая занимает строку целиком. */
interface ContextGroup {
  title: string;
  inline?: boolean;
  chips: ChipDef[];
}

/**
 * Контекстные измерения («когда» и «что делал рынок») — конфигом, а не
 * четырьмя почти одинаковыми блоками JSX: раньше каждый повторял один и тот
 * же паттерн «маппим ключи словаря в чип», отличаясь только словарём.
 * @param filters - состояние фильтров и его мутаторы
 * @param fv - статистика среза по измерению и значению
 * @param medians - медианы периода для подсказок ATR/объёма
 */
function buildContextGroups(
  { filters, toggleWeekday, toggleMulti, toggleSingle }: LabFiltersState,
  fv: FacetLookup,
  medians?: LabResponse['medians'],
): ContextGroup[] {
  return [
    {
      title: 'Сессия (UTC)',
      inline: true,
      chips: Object.keys(SESSION_LABELS).map((s) => ({
        key: s,
        label: SESSION_LABELS[s],
        hint: SESSION_HINTS[s],
        active: filters.sessions.includes(s),
        stats: fv('session', s),
        onClick: () => toggleMulti('sessions', s),
      })),
    },
    {
      title: 'День недели (вход)',
      chips: WEEKDAY_ORDER.map((d) => ({
        key: String(d),
        label: WEEKDAY_LABELS[d],
        active: filters.weekdays.includes(d),
        stats: fv('weekday', String(d)),
        onClick: () => toggleWeekday(d),
      })),
    },
    {
      title: 'Рынок на входе (4H / EMA200 1h)',
      chips: [
        ...Object.keys(TREND_LABELS).map((t) => ({
          key: t,
          label: TREND_LABELS[t],
          active: filters.trend4h.includes(t),
          stats: fv('trend4h', t),
          onClick: () => toggleMulti('trend4h', t),
        })),
        ...(['above', 'below'] as const).map((e) => ({
          key: e,
          label: EMA_LABELS[e],
          active: filters.ema200 === e,
          stats: fv('ema200', e),
          onClick: () => toggleSingle('ema200', e),
        })),
      ],
    },
    {
      title: 'Волатильность и объём (медиана периода)',
      inline: true,
      chips: [
        ...(['high', 'low'] as const).map((a) => ({
          key: `atr-${a}`,
          label: ATR_LABELS[a],
          hint: medians?.atrPct != null ? `Медиана ATR: ${medians.atrPct.toFixed(2)}%` : undefined,
          active: filters.atr === a,
          stats: fv('atr', a),
          onClick: () => toggleSingle('atr', a),
        })),
        ...(['high', 'low'] as const).map((v) => ({
          key: `vol-${v}`,
          label: VOL_LABELS[v],
          hint: medians?.volRel != null ? `Медиана объёма: ×${medians.volRel.toFixed(2)} от среднего` : undefined,
          active: filters.vol === v,
          stats: fv('vol', v),
          onClick: () => toggleSingle('vol', v),
        })),
      ],
    },
  ];
}

/**
 * Панель фильтров Лаборатории: бар контролов сверху (покрытие контекстом,
 * часы входа, Long/Short, сброс), затем главные измерения — теги и символы,
 * к которым тянешься первыми, — и ниже контекст рынка.
 */
export function LabFilterPanel({
  state,
  data,
  fv,
}: {
  state: LabFiltersState;
  data?: LabResponse;
  fv: FacetLookup;
}) {
  const { filters, set, toggleMulti, toggleSingle, reset, activeCount } = state;
  const { data: tagsData } = useTags();
  const tags = tagsData?.tags ?? [];
  const coverage = data?.coverage;

  const facetSymbols = data?.facets.find((f) => f.dimension === 'symbol')?.values.map((v) => v.key) ?? [];
  const symbolKeys = useStickySymbols(facetSymbols, filters.symbols);
  const contextGroups = buildContextGroups(state, fv, data?.medians);

  return (
    <section className="panel flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-fg">Фильтры</span>
        <div className="flex flex-wrap items-center gap-2">
          {coverage && coverage.withContext < coverage.total && (
            <span
              className="text-[11px] text-muted"
              title="Тренд/EMA/ATR/объём рассчитываются из свечей после закрытия сделки. Старые сделки без данных не проходят контекстные фильтры."
            >
              Контекст рынка: {coverage.withContext} из {coverage.total} сделок
            </span>
          )}

          <HourRangeSelect from={filters.hourFrom} to={filters.hourTo} onChange={set} />

          {/* Винрейт-тумблер и «Сбросить» — один бар, а не два случайных
              соседних контрола. «Сбросить» рендерится всегда в одном и том же
              виде (текст, размер), просто тусклый и disabled при 0 — раньше он
              был invisible, то есть пустым провалом в макете; теперь макет не
              дёргается И не пустует. */}
          <div className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-elevated-2 p-0.5 text-xs">
            <DirectionToggle
              value={filters.direction}
              statsOf={(d) => fv('direction', d)}
              onToggle={(d) => toggleSingle('direction', d)}
            />
            <div className="mx-0.5 h-4 w-px bg-line" />
            <button
              onClick={reset}
              disabled={activeCount === 0}
              className={cn(
                'flex cursor-pointer items-center gap-1 rounded px-2 py-1 font-medium transition-colors',
                activeCount > 0 ? 'text-fg hover:bg-elevated-2' : 'cursor-default text-muted',
              )}
            >
              <RotateCcw className="h-3 w-3" />
              Сбросить ({activeCount})
            </button>
          </div>
        </div>
      </div>

      {/* Главное: тег/символ — фильтры, к которым тянешься первыми */}
      <div className="flex flex-col gap-3">
        <ChipGroup title="Теги (сделка содержит все выбранные)">
          {tags.map((t) => (
            <FacetChip
              key={t.id}
              label={t.name}
              colorDot={t.color}
              active={filters.tagIds.includes(t.id)}
              stats={fv('tags', t.id) ?? EMPTY_FACET(t.id)}
              onClick={() => toggleMulti('tagIds', t.id)}
            />
          ))}
          {tags.length === 0 && <span className="text-xs text-muted">Тегов пока нет</span>}
        </ChipGroup>

        <ChipGroup title="Символ">
          {symbolKeys.map((s) => (
            <FacetChip
              key={s}
              label={s.replace('USDT', '')}
              active={filters.symbols.includes(s)}
              stats={fv('symbol', s)}
              onClick={() => toggleMulti('symbols', s)}
            />
          ))}
          {symbolKeys.length === 0 && <span className="text-xs text-muted">Нет сделок</span>}
        </ChipGroup>
      </div>

      {/* Контекст: когда/что делал рынок. Узкие группы (Сессия + Волатильность
          и объём) делят одну строку, широкие идут каждая на своей. */}
      <div className="flex flex-col gap-3 border-t border-line pt-3">
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          {contextGroups.filter((g) => g.inline).map((g) => (
            <ChipGroupFromDefs key={g.title} title={g.title} chips={g.chips} />
          ))}
        </div>
        {contextGroups.filter((g) => !g.inline).map((g) => (
          <ChipGroupFromDefs key={g.title} title={g.title} chips={g.chips} />
        ))}
      </div>
    </section>
  );
}
