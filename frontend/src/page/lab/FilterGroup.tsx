'use client';

import type { LabFacetValue } from '@/shared/api/lab/hooks';
import { MIN_N } from '@/shared/lib/utils/confidence';
import { formatMoney, moneyClass } from '@/shared/lib/utils/format';

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

/**
 * Строка условия: галка, название и цена этого условия справа — сколько сделок
 * останется, какой у среза винрейт и что он принёс.
 *
 * Цифры стоят рядом с каждым фильтром, а не появляются после нажатия: иначе
 * поиск закономерности превращается в перебор наугад — щёлкнул, посмотрел,
 * вернул. Здесь видно заранее, что условие оставит четыре сделки, и щёлкать по
 * нему уже незачем.
 */
function OptionRow({ label, hint, active, stats, onToggle }: Omit<FilterOption, 'key'>) {
  const n = stats?.trades ?? 0;
  const thin = n > 0 && n < MIN_N;

  return (
    <label className="opt" data-on={active} title={hint}>
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
            <span className={moneyClass(stats!.totalPnl)}>{formatMoney(stats!.totalPnl)}</span>
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
  defaultOpen,
  children,
}: {
  title: string;
  options: FilterOption[];
  defaultOpen?: boolean;
  /** Управление, относящееся ко всей группе (например, выбор таймфрейма). */
  children?: React.ReactNode;
}) {
  const active = options.filter((o) => o.active).length;

  return (
    <details className="fg" open={defaultOpen}>
      <summary>
        {title}
        {active > 0 && <span className="fg-c">{active}</span>}
      </summary>
      <div className="fb">
        {children}
        {options.map(({ key, ...opt }) => (
          <OptionRow key={key} {...opt} />
        ))}
        {options.length === 0 && <p style={{ color: 'var(--color-subtle)' }}>Нет данных за период</p>}
      </div>
    </details>
  );
}
