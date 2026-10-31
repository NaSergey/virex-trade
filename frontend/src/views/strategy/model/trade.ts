import type { TradeRow } from '../api/types';
import { fmtPct } from './format';

type Position = Pick<TradeRow, 'dir' | 'avgEntry'>;

/** Ход цены от среднего входа в сторону сделки, доля: плюс — в прибыль. */
export const moveOf = (t: Position, price: number): number => (t.dir * (price - t.avgEntry)) / Math.abs(t.avgEntry);

/** Расстояние от первого входа до цены в сторону сделки, доля: так считается план. */
export const planMoveOf = (t: Pick<TradeRow, 'dir' | 'entries'>, price: number): number =>
  (t.dir * (price - t.entries[0])) / Math.abs(t.entries[0]);

export const fmtMove = (x: number): string => `${x > 0 ? '+' : x < 0 ? '−' : ''}${fmtPct(Math.abs(x), 2)}`;

export function fmtDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d) return `${d} д ${h} ч`;
  return h ? `${h} ч ${m} м` : `${m} м`;
}

export interface LevelLine {
  key: string;
  kind: 'take' | 'entry' | 'stop' | 'trail';
  label: string;
  price: number;
  /** От среднего входа. */
  move: number;
  /** Исполнен, взят или сработал. */
  done: boolean;
  state: string;
}

/** Все уровни сделки сверху вниз по ходу: тейки, входы, подтянутый стоп, стоп. */
export function levelLines(t: TradeRow): LevelLine[] {
  const line = (key: string, kind: LevelLine['kind'], label: string, price: number, done: boolean, yes: string): LevelLine => ({
    key,
    kind,
    label,
    price,
    move: moveOf(t, price),
    done,
    state: done ? yes : 'нет',
  });
  const takes = t.takes
    .map((p, i) => line(`t${i}`, 'take', `Тейк ${i + 1}`, p, i < t.takesHit, 'взят'))
    .reverse();
  const entries = t.entries.map((p, i) => line(`e${i}`, 'entry', `Вход ${i + 1}`, p, i < t.filled, 'исполнен'));
  const trail = t.finalStop !== t.stop ? [line('trail', 'trail', 'Стоп за тейками', t.finalStop, t.outcome === 'trail', 'сработал')] : [];
  const stop = line('stop', 'stop', 'Стоп', t.stop, t.outcome === 'stop', 'сработал');
  return [...takes, ...trail, ...entries, stop];
}
