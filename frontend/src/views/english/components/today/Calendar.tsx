'use client';

import { cn } from '@/shared/lib/utils/css';
import { dateFormat } from '@/shared/lib/utils/intl';
import { activityOf, calendar, type DayRow } from '../../model/activity';
import { activityLevel, dayTitle } from '../../model/today';

const WEEKS = 17;
/** Подписаны не все дни — по одному через строку, иначе на телефоне они слипнутся. */
const DAY_LABELS = ['Пн', '', 'Ср', '', 'Пт', '', ''];

const labelOf = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return dateFormat('ru', { day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d)).replace('.', '');
};

/**
 * Календарь занятий за 17 недель: столбец — неделя с понедельника, клетка — день,
 * заливка по числу действий (карточки, задания, фразы).
 */
export function Calendar({ today, days }: { today: string; days: ReadonlyMap<string, DayRow> }) {
  const cols = calendar(today, WEEKS);
  return (
    <div className="en-cal" role="img" aria-label="Календарь занятий за 17 недель">
      {DAY_LABELS.map((label, row) => (
        <div key={row} className="en-cal-row">
          <span className="en-cal-dow muted" aria-hidden>
            {label}
          </span>
          {cols.map((col, i) => {
            const day = col[row];
            if (day === null) return <span key={i} className="en-cal-x" />;
            return (
              <span
                key={i}
                className={cn(
                  'en-cal-cell',
                  `en-cal-${activityLevel(activityOf(days.get(day)))}`,
                  day === today && 'is-today',
                )}
                title={dayTitle(labelOf(day), days.get(day))}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
