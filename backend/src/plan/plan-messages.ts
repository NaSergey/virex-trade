import { categoryOf } from './categories';
import { addDays, hhmm, weekdayOf } from './plan-time';
import {
  GOAL,
  outcomeOf,
  type Outcome,
  type Report,
  type StatItem,
  type Summary,
} from './plan-stats';

/**
 * Тексты и кнопки плана в Telegram — чистые функции. Сообщение блока рисуется
 * из его состояния целиком: кнопка правит статус, и сообщение перерисовывается
 * тем же `itemMessage`, второго места, где знают, что показать после «Забил»,
 * нет.
 */

export const CB = 'pl';
export type CbAction = 'go' | 'walk' | 'skip' | 'done' | 'part';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface MsgItem extends StatItem {
  id: string;
  title: string;
  tasks: { text: string; done: boolean }[];
  /** Когда сел за работу, `ЧЧ:ММ`. */
  startedAt?: string | null;
}

type Button = { text: string; callback_data: string };
export interface Keyboard {
  inline_keyboard: Button[][];
}

const btn = (text: string, action: CbAction, id: string): Button => ({
  text,
  callback_data: `${CB}|${action}|${id}`,
});

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const MONTHS = [
  'янв',
  'фев',
  'мар',
  'апр',
  'мая',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

export const dayLabel = (day: string) =>
  `${WEEKDAYS[weekdayOf(day)]} ${+day.slice(8, 10)} ${MONTHS[+day.slice(5, 7) - 1]}`;

export const pct = (score: number | null) =>
  score == null ? '—' : `${Math.round(score * 100)}%`;

const MARK: Record<Outcome, string> = {
  upcoming: '▫️',
  now: '⏰',
  started: '▶️',
  open: '▶️',
  done: '✅',
  partial: '◐',
  skipped: '✖️',
  walk: '🚶',
  missed: '⌛',
};

const head = (it: MsgItem) => {
  const c = categoryOf(it.category);
  return `${hhmm(it.startMin)}–${hhmm(it.endMin)} · ${c.emoji} ${esc(it.title)}`;
};

const lateText = (late: number | null | undefined) =>
  late == null
    ? ''
    : late > 0
      ? ` · опоздание ${late} мин`
      : late < 0
        ? ' · раньше времени'
        : ' · вовремя';

/** Сообщение блока и его кнопки — по состоянию блока на момент `today`/`nowMin`. */
export function itemMessage(
  it: MsgItem,
  today: string,
  nowMin: number,
): { text: string; kb: Keyboard } {
  const o = outcomeOf(it, today, nowMin);
  const startedAt = it.startedAt;
  const lines = headLines(it);
  let rows: Button[][] = [];
  switch (o) {
    case 'upcoming':
    case 'now':
      rows = [
        [btn('▶️ Сажусь за работу', 'go', it.id)],
        [btn('🚶 Иду гулять', 'walk', it.id), btn('✖️ Забил', 'skip', it.id)],
      ];
      lines.pop();
      break;
    case 'started':
      lines.push(
        `▶️ Сел${startedAt ? ` в ${startedAt}` : ''}${lateText(it.lateMin)}`,
      );
      rows = [
        [btn('✅ Сделал', 'done', it.id), btn('◐ Частично', 'part', it.id)],
      ];
      break;
    case 'open':
      lines.push(`🏁 Время блока вышло. Как прошло?`);
      rows = [
        [btn('✅ Сделал всё', 'done', it.id), btn('◐ Частично', 'part', it.id)],
        [btn('✖️ Не сделал', 'skip', it.id)],
      ];
      break;
    case 'missed':
      lines.push('⌛ Время вышло — ответа не было. Как было на самом деле?');
      rows = [
        [btn('✅ Сделал', 'done', it.id), btn('◐ Частично', 'part', it.id)],
        [btn('🚶 Гулял', 'walk', it.id), btn('✖️ Забил', 'skip', it.id)],
      ];
      break;
    case 'skipped':
      lines.push('✖️ Забил');
      if (it.day === today && nowMin < it.endMin)
        rows = [[btn('▶️ Всё-таки сажусь', 'go', it.id)]];
      break;
    case 'walk':
      lines.push('🚶 Пошёл гулять');
      if (it.day === today && nowMin < it.endMin)
        rows = [[btn('▶️ Всё-таки сажусь', 'go', it.id)]];
      break;
    case 'done':
      lines.push(
        `✅ Сделано${startedAt ? ` · сел в ${startedAt}${lateText(it.lateMin)}` : ''}`,
      );
      break;
    case 'partial':
      lines.push('◐ Сделано частично');
      break;
  }
  return { text: lines.join('\n'), kb: { inline_keyboard: rows } };
}

function headLines(it: MsgItem): string[] {
  const lines = [`⏰ <b>${head(it)}</b>`];
  for (const t of it.tasks) lines.push(`${t.done ? '☑️' : '•'} ${esc(t.text)}`);
  lines.push('');
  return lines;
}

/**
 * Прежнее сообщение блока, когда вопрос «как прошло» уходит новым: без кнопок,
 * чтобы в чате не было двух мест, где отвечают на одно и то же.
 */
export function sealedMessage(it: MsgItem): string {
  return [
    ...headLines(it),
    `▶️ Сел${it.startedAt ? ` в ${it.startedAt}` : ''}${lateText(it.lateMin)}`,
  ].join('\n');
}

/** План дня: блоки по порядку с отметками (утром — все ещё впереди; так же отвечает `/plan`). */
export function morningMessage(
  day: string,
  items: MsgItem[],
  nowMin: number,
): string {
  const tracked = items.filter((i) => i.track);
  if (items.length === 0)
    return `☀️ <b>${dayLabel(day)}</b>\nНа сегодня в плане ничего нет.`;
  const total = tracked.reduce((s, i) => s + i.endMin - i.startMin, 0);
  return [
    `☀️ <b>План на ${dayLabel(day)}</b>`,
    '',
    ...items.map(
      (i) => `${i.track ? MARK[outcomeOf(i, day, nowMin)] : '▪️'} ${head(i)}`,
    ),
    '',
    `Отслеживаемых блоков ${tracked.length}, ${hours(total)}. Напомню о каждом.`,
  ].join('\n');
}

const hours = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? `${h} ч ${m} мин` : h ? `${h} ч` : `${m} мин`;
};

function counts(s: Summary): string {
  const parts = [
    s.done && `сделано ${s.done}`,
    s.partial + s.open && `частично ${s.partial + s.open}`,
    s.skipped && `забил ${s.skipped}`,
    s.walk && `гулял ${s.walk}`,
    s.missed && `без ответа ${s.missed}`,
  ].filter(Boolean);
  return parts.join(' · ') || 'оценивать нечего';
}

/** Вечерний отчёт; в воскресенье — с итогом недели. */
export function eveningMessage(
  day: string,
  items: MsgItem[],
  todayStats: Summary,
  nowMin: number,
  streak: number,
  week?: Report,
): string {
  const lines = [
    `🌙 <b>Итог дня, ${dayLabel(day)}</b> — соблюдение ${pct(todayStats.score)}`,
    '',
  ];
  for (const it of items.filter((i) => i.track))
    lines.push(`${MARK[outcomeOf(it, day, nowMin)]} ${head(it)}`);
  lines.push('', counts(todayStats));
  if (todayStats.counted > 0)
    lines.push(
      `Отработано ${hours(todayStats.workedMin)} из ${hours(todayStats.plannedMin)}.`,
    );
  if (todayStats.lateAvg != null)
    lines.push(`Опоздание к началу — в среднем ${todayStats.lateAvg} мин.`);
  lines.push(`Серия дней по плану (от ${Math.round(GOAL * 100)}%): ${streak}.`);
  if (week) lines.push('', weekBlock(week));
  return lines.join('\n');
}

export function weekBlock(week: Report): string {
  const days = week.byDay
    .map((d) => `${WEEKDAYS[weekdayOf(d.day)]} ${pct(d.score)}`)
    .join(' · ');
  const cats = week.byCategory
    .map((c) => {
      const cat = categoryOf(c.category);
      return `${cat.emoji} ${cat.label} — ${pct(c.score)}`;
    })
    .join('\n');
  return [
    `📅 <b>Неделя</b> — соблюдение ${pct(week.score)}`,
    days,
    counts(week),
    ...(week.lateAvg != null
      ? [`Опоздание в среднем ${week.lateAvg} мин.`]
      : []),
    ...(cats ? ['', cats] : []),
  ].join('\n');
}

/** Последние 7 дней, включая `today`. */
export const lastWeek = (today: string) =>
  Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
