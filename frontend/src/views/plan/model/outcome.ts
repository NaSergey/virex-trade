import type { Outcome, Status } from '../api/hooks';

/**
 * Подписи исходов — те же слова, что у кнопок бота: на странице и в чате
 * ответ называется одинаково.
 */
export const OUTCOME_LABEL: Record<Outcome, string> = {
  upcoming: 'впереди',
  now: 'сейчас',
  started: 'в работе',
  open: 'итога нет',
  done: 'сделано',
  partial: 'частично',
  skipped: 'забил',
  walk: 'гулял',
  missed: 'без ответа',
};

/** Краска исхода: цвет — только «сделал» и «не сделал», остальное приглушено. */
export const OUTCOME_TONE: Partial<Record<Outcome, 'pos' | 'neg' | 'muted'>> = {
  done: 'pos',
  skipped: 'neg',
  missed: 'neg',
  walk: 'muted',
  upcoming: 'muted',
};

/** Какие ответы доступны в этом исходе — тот же набор, что кнопки бота. */
export function answersFor(o: Outcome): { status: Status; label: string; main?: boolean }[] {
  switch (o) {
    case 'upcoming':
    case 'now':
      return [
        { status: 'started', label: 'Сажусь за работу', main: true },
        { status: 'walk', label: 'Иду гулять' },
        { status: 'skipped', label: 'Забил' },
      ];
    case 'started':
      return [
        { status: 'done', label: 'Сделал', main: true },
        { status: 'partial', label: 'Частично' },
      ];
    case 'open':
      return [
        { status: 'done', label: 'Сделал всё', main: true },
        { status: 'partial', label: 'Частично' },
        { status: 'skipped', label: 'Не сделал' },
      ];
    case 'missed':
      return [
        { status: 'done', label: 'Сделал', main: true },
        { status: 'partial', label: 'Частично' },
        { status: 'walk', label: 'Гулял' },
        { status: 'skipped', label: 'Забил' },
      ];
    default:
      return [];
  }
}
