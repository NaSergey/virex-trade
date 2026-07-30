'use client';

import { PERIODS } from './usePeriodFilter';
import { Seg } from '@/shared/ui/Seg';
import { formatPeriodRange } from '@/shared/lib/utils/period';

const todayIso = () => new Date().toISOString().slice(0, 10);

const PERIOD_OPTIONS = PERIODS.map((p) => ({ value: p.value, label: p.label }));

/**
 * Рейка периода: слева — за что именно посчитан свод (даты прописью и число
 * записей), справа — управление этим же периодом. Одна строка, а не две полосы:
 * фильтр и подпись говорят об одном и том же, и связь между ними доказывается
 * тем, что подпись меняется от нажатия соседней кнопки.
 *
 * Своя дата — обычное поле ввода, а не пилюля с календарём: дату быстрее
 * напечатать, а нативная иконка календаря у поля никуда не делась.
 *
 * Поле и пресеты не гасят друг друга: если своя дата уже введена, клик по
 * «30 дней» подсвечивает пресет и переключает на него подпись и запросы, но
 * саму дату из поля не убирает — она остаётся под рукой, если нужно вернуться.
 * Активность в интерфейсе показывает `customActive`, а не факт того, что поле
 * непустое.
 */
export function PeriodRail({
  title,
  days,
  customDate,
  customActive,
  trades,
  onSelectDays,
  onCustomDate,
}: {
  /** Что сводится: «Свод за период», «Теги за период». */
  title: string;
  days: number;
  customDate: string | null;
  /** Своя дата сейчас управляет фильтром (а не просто стоит в поле). */
  customActive: boolean;
  /** Число записей в периоде; undefined — ещё не пришло. */
  trades?: number;
  onSelectDays: (days: number) => void;
  onCustomDate: (iso: string | null) => void;
}) {
  const effectiveDays = customActive ? -1 : days;
  const range = customActive && customDate
    ? `с ${new Date(customDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : formatPeriodRange(days);

  return (
    <div className="strip-rail">
      <span className="ctx">
        {title} · <b>{range}</b>
        {trades != null && (
          <>
            {' '}
            · <b>{trades}</b> сделок
          </>
        )}
      </span>
      <div className="period">
        <input
          type="date"
          aria-label="Начало периода"
          title={!customActive && customDate ? 'Своя дата сохранена — нажмите на поле, чтобы снова применить её' : undefined}
          className={!customActive && customDate ? 'inactive' : undefined}
          max={todayIso()}
          value={customDate ?? ''}
          onClick={() => {
            // Дата уже введена, но сейчас фильтром управляет пресет — клик по
            // полю возвращает её к управлению, без повторного набора. Если
            // пользователь кликнул, чтобы поменять дату, следующий же onChange
            // всё равно применит уже новое значение — этот клик тут не мешает.
            if (!customActive && customDate) onCustomDate(customDate);
          }}
          onChange={(e) => onCustomDate(e.target.value || null)}
        />
        <Seg options={PERIOD_OPTIONS} value={effectiveDays} onChange={onSelectDays} ariaLabel="Период" />
      </div>
    </div>
  );
}
