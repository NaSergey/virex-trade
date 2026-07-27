'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/shared/lib/utils/css';
import { formatProfitFactor } from '@/shared/lib/utils/format';
import type { LabFacetValue } from '@/shared/api/lab/hooks';
import { MIN_N } from './constants';

/** Описание одного чипа для декларативного конфига групп (см. LabFilterPanel). */
export interface ChipDef {
  key: string;
  label: string;
  hint?: string;
  active: boolean;
  stats?: LabFacetValue;
  colorDot?: string;
  onClick: () => void;
}

/**
 * Фильтр-чип одного значения измерения. Показывает живую статистику своего
 * среза (n · PF · winrate) при остальных активных фильтрах — сетка чипов и
 * есть «поиск закономерностей». Срезы с n < MIN_N приглушены: не выводы,
 * а кандидаты.
 */
export function FacetChip({ label, active, stats, onClick, colorDot, hint }: Omit<ChipDef, 'key'>) {
  const n = stats?.trades ?? 0;
  const thin = n > 0 && n < MIN_N;
  const empty = n === 0;
  const pf = stats ? formatProfitFactor(stats.profitFactor, stats.wins, stats.losses) : '—';
  // У выбранного чипа заливка уже яркая и того же смыслового цвета, что и
  // сама цифра — зелёный PF на зелёном фоне давал бы 2.8:1. Там цифра белая:
  // знак прибыли всё равно читается по цвету карточки.
  const pfClass = active
    ? 'text-fg'
    : empty
      ? 'text-muted'
      : stats!.totalPnl > 0
        ? 'text-up'
        : stats!.totalPnl < 0
          ? 'text-down'
          : 'text-muted';
  // Цвет чипа: у тега — его собственный (см. TagChip), у остальных измерений
  // (сессия / день недели / тренд / символ...) своего цвета нет, поэтому
  // берётся смысловой — прибыльность среза, тот же язык, что у цифры PF рядом:
  // зелёный = срез в плюсе, красный = в минусе. Срез без сделок — синий
  // акцент (нейтрально, «данных нет»). Серого фона нет нигде: он одинаково
  // выглядел и на прибыльных, и на убыточных срезах, то есть не нёс смысла.
  const chipColor =
    colorDot ??
    (empty
      ? 'var(--color-accent)'
      : stats!.totalPnl > 0
        ? 'var(--color-up)'
        : stats!.totalPnl < 0
          ? 'var(--color-down)'
          : 'var(--color-accent)');
  // Цвет уходит в CSS-переменную, а состояния рисует класс .chip-tag:
  // инлайновый borderColor перебивал бы hover:border-* и убивал ховер.
  const colorStyle = { '--chip-color': chipColor } as CSSProperties;

  return (
    <button
      onClick={onClick}
      title={[hint, thin ? `Мало данных: ${n} сделок (< ${MIN_N})` : null].filter(Boolean).join(' · ') || undefined}
      style={colorStyle}
      data-active={active}
      className={cn('chip-tag cursor-pointer rounded-lg border px-2.5 py-1.5 text-left transition-colors', active && 'sheen')}
    >
      {/* Название — всегда почти белым (text-fg ≈ 16:1 на этом фоне). Раньше у
          неактивного чипа оно было text-muted, и на солнце читалось с трудом. */}
      <span className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
        {colorDot && <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: colorDot }} />}
        {label}
      </span>
      {/* Каждое значение — в слоте фиксированной ширины (в ch, т.к. шрифт моно):
          «5» и «13», «∞» и «8.72», «—» и «100%» иначе меняют ширину чипа при
          каждом клике по фильтру и весь ряд чипов переносится по-новому.
          Размер 11px, не 10px, и цвета не ниже text-muted (5.2:1) — 10px в
          text-subtle давало 2.8:1 при норме 4.5:1, то есть нечитаемо. */}
      <span className="mt-0.5 flex items-baseline gap-1 font-mono text-[11px] leading-tight">
        {/* Слабая выборка помечается ЦВЕТОМ счётчика (амбер = «мало данных»),
            а не приглушением всей строки: opacity-50 поверх и без того
            низкого контраста делало цифры невидимыми. */}
        <span
          className={cn(
            'inline-block w-[3ch] shrink-0 text-right font-semibold',
            empty ? 'text-muted' : thin ? 'text-warn' : 'text-fg',
          )}
        >
          {n}
        </span>
        {/* На яркой заливке выбранного чипа text-muted (#a3a3a3) теряется —
            там второстепенные подписи идут белым с прозрачностью. */}
        <span className={cn('shrink-0', active ? 'text-fg/70' : 'text-muted')}>PF</span>
        <span className={cn('inline-block w-[5ch] shrink-0 text-right font-semibold', pfClass)}>{pf}</span>
        <span className={cn('inline-block w-[4ch] shrink-0 text-right', active ? 'text-fg/70' : 'text-muted')}>
          {empty ? '—' : `${stats!.winRate.toFixed(0)}%`}
        </span>
      </span>
    </button>
  );
}

/** Подписанная группа чипов одного измерения. */
export function ChipGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      {/* text-muted, не text-subtle: subtle (#5c5c5c) на фоне панели давал
          ~2.9:1 — заголовок группы нельзя было прочитать при ярком свете. */}
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** Группа целиком из конфига — один рендерер вместо копий одинакового JSX. */
export function ChipGroupFromDefs({ title, chips }: { title: string; chips: ChipDef[] }) {
  return (
    <ChipGroup title={title}>
      {chips.map(({ key, ...chip }) => (
        <FacetChip key={key} {...chip} />
      ))}
    </ChipGroup>
  );
}
