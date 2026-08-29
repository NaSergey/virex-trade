'use client';

import { useTranslations } from 'next-intl';
import type { LabFacetValue } from '../api/hooks';
import { MIN_N } from '@/shared/lib/utils/confidence';
import { Money } from '@/shared/ui/Money';
import { Skeleton } from '@/shared/ui/Skeleton';

/** Одно условие выборки: чем оно обернётся, видно рядом с ним. */
export interface FilterOption {
  key: string;
  label: string;
  hint?: string;
  active: boolean;
  /** Срез по этому условию при остальных активных фильтрах. */
  stats?: LabFacetValue;
  onToggle: () => void;
}

function OptionRow({
  label,
  hint,
  active,
  stats,
  onToggle,
  index,
}: Omit<FilterOption, 'key'> & { index: number }) {
  const n = stats?.trades ?? 0;
  const thin = n > 0 && n < MIN_N;

  return (
    <label
      className="opt"
      data-on={active}
      title={hint}
      style={{ '--i': index } as React.CSSProperties}
    >
      <input type="checkbox" checked={active} onChange={onToggle} />
      <span className="opt-n">{label}</span>
      <span className="opt-s">
        {/* Слабая выборка помечается цветом счётчика (янтарь = «мало данных»),
            а не приглушением всей строки: приглушённые цифры просто не читались. */}
        <span className={thin ? 'dbt' : undefined}>{n}</span>
        {n > 0 && (
          <>
            {' · '}
            {stats!.winRate.toFixed(0)} %{' · '}
            <Money value={stats!.totalPnl} />
          </>
        )}
      </span>
    </label>
  );
}

/**
 * Складная группа условий. Счётчик в заголовке показывает, сколько условий
 * внутри выбрано, — поэтому свёрнутая группа не прячет от глаза факт, что
 * выборка ею сужена.
 */
export function FilterGroup({
  title,
  options,
  isLoading,
  defaultOpen,
  children,
}: {
  title: string;
  options: FilterOption[];
  /**
   * Список условий ещё едет. Без этого признака пустой список во время загрузки
   * неотличим от пустого по существу, и группа успевала сказать «нет данных за
   * период» про период, в котором данные есть.
   */
  isLoading?: boolean;
  defaultOpen?: boolean;
  /** Управление, относящееся ко всей группе (например, выбор таймфрейма). */
  children?: React.ReactNode;
}) {
  const t = useTranslations('analytics');
  const active = options.filter((o) => o.active).length;

  return (
    <details className="fg" open={defaultOpen}>
      <summary>
        {title}
        {active > 0 && <span className="fg-c">{active}</span>}
      </summary>
      <div className="fb">
        {children}
        {/* Порядковый номер строки задаёт задержку выступления (--i). Символов
            бывает под сотню, и хвост очереди ждал бы дольше, чем человек держит
            группу открытой, — после дюжины строки выступают разом. */}
        {options.map(({ key, ...opt }, i) => (
          <OptionRow key={key} {...opt} index={Math.min(i + (children ? 1 : 0), 12)} />
        ))}
        {options.length === 0 &&
          (isLoading ? (
            // Четыре строки той же высоты, что и условия: раскрытая группа не
            // схлопывается и не растёт, когда список приезжает.
            <div aria-hidden>
              {[68, 44, 76, 52].map((w, i) => (
                <span className="opt" key={i}>
                  <Skeleton as="span" flush height={9} width={`${w}%`} />
                </span>
              ))}
            </div>
          ) : (
            <p className="subtle">{t('noDataForPeriod')}</p>
          ))}
      </div>
    </details>
  );
}
