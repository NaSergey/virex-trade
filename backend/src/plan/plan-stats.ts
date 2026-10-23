/**
 * Отчётность плана — чистые функции: одна копия на страницу статистики,
 * вечерний отчёт и недельный итог в Telegram.
 *
 * Исход блока выводится, а не хранится: «пропущено» — это «время вышло, ответа
 * нет», и сохранённым оно стало бы враньём, как только владелец ответит поздно.
 */

export type Status =
  | 'planned'
  | 'started'
  | 'done'
  | 'partial'
  | 'skipped'
  | 'walk';
export const STATUSES: Status[] = [
  'planned',
  'started',
  'done',
  'partial',
  'skipped',
  'walk',
];

export type Outcome =
  /** Ещё не началось. */
  | 'upcoming'
  /** Идёт сейчас, ответа нет. */
  | 'now'
  /** Сел за работу, блок идёт. */
  | 'started'
  /** Сел, блок кончился, итога нет. */
  | 'open'
  | 'done'
  | 'partial'
  | 'skipped'
  | 'walk'
  /** Время вышло, ответа нет. */
  | 'missed';

export interface StatItem {
  day: string;
  startMin: number;
  endMin: number;
  category: string;
  track: boolean;
  status: string;
  /** Опоздание к началу, мин: момент «сажусь» минус начало блока. Нет — не садился. */
  lateMin?: number | null;
}

/** Порог «день по плану»: серия дней считается от него. */
export const GOAL = 0.7;

export function outcomeOf(
  item: StatItem,
  today: string,
  nowMin: number,
): Outcome {
  const s = item.status;
  if (s === 'done' || s === 'partial' || s === 'skipped' || s === 'walk')
    return s;
  const ended =
    item.day < today || (item.day === today && nowMin >= item.endMin);
  if (s === 'started') return ended ? 'open' : 'started';
  if (ended) return 'missed';
  return item.day === today && nowMin >= item.startMin ? 'now' : 'upcoming';
}

/** Вклад исхода в соблюдение плана; null — блок ещё не оценивается. */
export function scoreOf(o: Outcome): number | null {
  switch (o) {
    case 'done':
      return 1;
    case 'partial':
    case 'open':
      return 0.5;
    case 'skipped':
    case 'walk':
    case 'missed':
      return 0;
    default:
      return null;
  }
}

export interface Summary {
  /** Блоков с исходом (отслеживаемых и уже оценённых). */
  counted: number;
  done: number;
  partial: number;
  open: number;
  skipped: number;
  walk: number;
  missed: number;
  /** Соблюдение плана 0…1; null — оценивать нечего. */
  score: number | null;
  /** Минуты оценённых блоков и из них «отработанные» (частично — половина). */
  plannedMin: number;
  workedMin: number;
  /** Среднее опоздание к началу среди блоков, где садился, мин; null — не садился. */
  lateAvg: number | null;
}

export function summarize(
  items: StatItem[],
  today: string,
  nowMin: number,
): Summary {
  const s: Summary = {
    counted: 0,
    done: 0,
    partial: 0,
    open: 0,
    skipped: 0,
    walk: 0,
    missed: 0,
    score: null,
    plannedMin: 0,
    workedMin: 0,
    lateAvg: null,
  };
  let points = 0;
  let late = 0;
  let lateN = 0;
  for (const it of items) {
    if (!it.track) continue;
    const o = outcomeOf(it, today, nowMin);
    const sc = scoreOf(o);
    if (sc == null) continue;
    s.counted++;
    points += sc;
    const len = it.endMin - it.startMin;
    s.plannedMin += len;
    s.workedMin += len * sc;
    if (
      o === 'done' ||
      o === 'partial' ||
      o === 'open' ||
      o === 'skipped' ||
      o === 'walk' ||
      o === 'missed'
    )
      s[o]++;
    if (it.lateMin != null) {
      late += Math.max(0, it.lateMin);
      lateN++;
    }
  }
  if (s.counted > 0) s.score = points / s.counted;
  if (lateN > 0) s.lateAvg = Math.round(late / lateN);
  s.workedMin = Math.round(s.workedMin);
  return s;
}

/** Серия дней подряд с соблюдением не ниже `GOAL`. Дни без отслеживаемого не рвут её и не считаются. */
export function streak(
  days: { day: string; score: number | null }[],
  today: string,
): number {
  let run = 0;
  const sorted = [...days].sort((a, b) => (a.day < b.day ? 1 : -1));
  for (const d of sorted) {
    if (d.day > today || d.score == null) continue;
    if (d.score >= GOAL) run++;
    // Сегодняшний день ещё идёт: недобор сегодня серию не обрывает.
    else if (d.day !== today) break;
  }
  return run;
}

export interface Report extends Summary {
  byDay: ({ day: string } & Summary)[];
  byCategory: ({ category: string } & Summary)[];
  streak: number;
}

export function report(
  items: StatItem[],
  days: string[],
  today: string,
  nowMin: number,
): Report {
  const byDay = days.map((day) => ({
    day,
    ...summarize(
      items.filter((i) => i.day === day),
      today,
      nowMin,
    ),
  }));
  const cats = [
    ...new Set(items.filter((i) => i.track).map((i) => i.category)),
  ];
  const byCategory = cats
    .map((category) => ({
      category,
      ...summarize(
        items.filter((i) => i.category === category),
        today,
        nowMin,
      ),
    }))
    .filter((c) => c.counted > 0)
    .sort((a, b) => b.plannedMin - a.plannedMin);
  return {
    ...summarize(items, today, nowMin),
    byDay,
    byCategory,
    streak: streak(byDay, today),
  };
}
