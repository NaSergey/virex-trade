/**
 * Интервальное повторение карточек — единственная копия алгоритма: сервер
 * только хранит результат (`backend/src/english`). Упрощённый SM-2 на четыре
 * кнопки, как у Anki: новое и забытое слово идёт короткими шагами, выученное —
 * растущими интервалами в днях.
 */

export const MIN = 60_000;
export const DAY = 86_400_000;

/** 0 — не знаю, 1 — трудно, 2 — помню, 3 — знаю (выучено, больше не показывать). */
export type Grade = 0 | 1 | 2 | 3;

/** Время — мс эпохи. */
export interface CardState {
  due: number;
  /** Интервал в днях; 0 — слово в изучении (новое или забытое). */
  interval: number;
  ease: number;
  reps: number;
  lapses: number;
  /** Первый ответ — по нему считается «новых сегодня». */
  firstAt: number;
  /** «Знаю» — слово выучено и в карточки больше не попадает. */
  known: boolean;
}

/** Шаги изучения по кнопкам «не знаю», «трудно», «помню»: 1 мин, 10 мин, 1 день. */
const LEARN_STEPS = [MIN, 10 * MIN, DAY] as const;
const RELEARN = 10 * MIN;
const MAX_DAYS = 365;

const clampEase = (ease: number) => Math.min(3, Math.max(1.3, Math.round(ease * 100) / 100));

export function review(prev: CardState | null, grade: Grade, now: number): CardState {
  const s = prev ?? { due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0, firstAt: now, known: false };
  const base = { reps: s.reps + 1, firstAt: s.firstAt, known: false };

  // «Знаю» — слово уходит из карточек насовсем; вернуть его можно из словаря.
  if (grade === 3) return { ...s, reps: s.reps + 1, due: now, known: true };

  if (s.interval === 0) {
    const delay = LEARN_STEPS[grade];
    return { ...base, due: now + delay, interval: grade === 2 ? 1 : 0, ease: s.ease, lapses: s.lapses };
  }
  if (grade === 0) {
    return { ...base, due: now + RELEARN, interval: 0, ease: clampEase(s.ease - 0.2), lapses: s.lapses + 1 };
  }

  let days: number;
  let ease = s.ease;
  if (grade === 1) {
    days = Math.max(s.interval + 1, s.interval * 1.2);
    ease = clampEase(ease - 0.15);
  } else {
    days = s.interval * ease;
  }
  const interval = Math.min(MAX_DAYS, Math.max(1, Math.round(days)));
  return { ...base, due: now + interval * DAY, interval, ease, lapses: s.lapses };
}

/** Вернуть слово в изучение (из словаря): снова новое по интервалу, срок — сейчас. */
export function relearn(prev: CardState | null, now: number): CardState {
  const s = prev ?? { due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0, firstAt: now, known: false };
  return { ...s, known: false, interval: 0, due: now };
}
