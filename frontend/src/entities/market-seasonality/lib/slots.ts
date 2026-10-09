import type { TimeSlot } from '../api/types';

/** Ключ слота: день недели × 1440 + минута суток, по UTC — как у сервера. */
export const slotKey = (weekday: number, minute: number): number => weekday * 1440 + minute;

/** Слот свечи, открытой в `t`, на таймфрейме `tf` минут (UTC); у дневной — день целиком. */
export function slotOf(t: number, tf: number): number {
  const d = new Date(t);
  const minute = tf >= 1440 ? 0 : Math.floor((d.getUTCHours() * 60 + d.getUTCMinutes()) / tf) * tf;
  return slotKey(d.getUTCDay(), minute);
}

export const slotIndex = (slots: readonly TimeSlot[]): Map<number, TimeSlot> =>
  new Map(slots.map((s) => [slotKey(s.weekday, s.minute), s]));

/**
 * Куда клонит частота слота: сторона и её доля в целых процентах. Сторона
 * решается по уже округлённому проценту: иначе при 50,3 % написали бы
 * «рост 50 %», а рядом — «поровну».
 */
export function leanOf(upPct: number): { dir: 'up' | 'down' | null; pct: number } {
  const up = Math.round(upPct);
  if (up === 50) return { dir: null, pct: 50 };
  const dir = up > 50 ? 'up' : 'down';
  return { dir, pct: dir === 'up' ? up : 100 - up };
}

/**
 * Вывод по слоту из обоих чисел сразу — как часто свеча росла и на сколько в
 * среднем сдвигалась (владелец 2026-10-08: «это всё вместе учитывать»).
 * Говорят одно — сторона частоты. Спорят (чаще росло, а падения были
 * крупнее) — `mixed`: красить такой слот значило бы сказать половину.
 * Средний ход сравнивается округлённым до сотых, как и показан: «0.00 %» не спорит.
 */
export interface Verdict {
  dir: 'up' | 'down' | 'mixed' | null;
  /** Куда клонит одна частота — её слова и процент показываются и у «смешанно». */
  freqDir: 'up' | 'down' | null;
  /** Доля стороны частоты в целых процентах. */
  pct: number;
  /** Средний ход свечи, % — до сотых. */
  avg: number;
}

export function verdictOf(s: { upPct: number; avgChangePct: number }): Verdict {
  const f = leanOf(s.upPct);
  const avg = Math.round(s.avgChangePct * 100) / 100 || 0;
  const avgDir = avg > 0 ? 'up' : avg < 0 ? 'down' : null;
  const dir = !f.dir ? null : avgDir && avgDir !== f.dir ? 'mixed' : f.dir;
  return { dir, freqDir: f.dir, pct: f.pct, avg };
}

/**
 * Строки местного дня недели: слоты сервера в UTC, сдвинутые на `offsetMin`
 * (местное = UTC + offset). `start` — местные минуты суток; отрезок, начатый в
 * другой день по UTC, попадает в свой местный день.
 */
export function localDay(
  slots: readonly TimeSlot[],
  localWeekday: number,
  offsetMin: number,
): { slot: TimeSlot; start: number }[] {
  const week = 7 * 1440;
  const out: { slot: TimeSlot; start: number }[] = [];
  for (const s of slots) {
    const at = (((slotKey(s.weekday, s.minute) + offsetMin) % week) + week) % week;
    if (Math.floor(at / 1440) === localWeekday) out.push({ slot: s, start: at % 1440 });
  }
  return out.sort((a, b) => a.start - b.start);
}
