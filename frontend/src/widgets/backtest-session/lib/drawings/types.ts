/** Точка рисунка: время (мс UTC) и цена. От таймфрейма не зависит — рисунок виден на любом ТФ. */
export interface DPoint {
  t: number;
  p: number;
}

export type DrawingKind =
  | 'hline'
  | 'hray'
  | 'vline'
  | 'cross'
  | 'trend'
  | 'ray'
  | 'extended'
  | 'channel'
  | 'arrow'
  | 'arrowUp'
  | 'arrowDown'
  | 'rect'
  | 'fib'
  | 'long'
  | 'short'
  | 'range'
  | 'text'
  | 'brush';

/** Инструмент панели. Линейка — не фигура: она временная и в хранилище не попадает. */
export type ToolId = DrawingKind | 'ruler';

/** Ключ палитры, а не значение цвета: фигура остаётся читаемой в обеих темах. */
export type DrawingColor = 'fg' | 'blue' | 'green' | 'red' | 'amber' | 'violet';

export type DrawingWidth = 1 | 2 | 3;

/**
 * Фигура на графике. Смысл точек зависит от `kind`:
 * - `hline` — одна точка, используется цена; `vline` — одна, используется время;
 * - `hray` — одна: луч вправо от точки; `cross` — одна, перекрестие через неё;
 * - `arrowUp` / `arrowDown`, `text` — одна;
 * - `trend`, `ray`, `extended`, `arrow`, `rect`, `fib`, `range` — две;
 * - `channel` — три: две точки основной линии и точка параллельной над первой `(a.t, a.p + сдвиг)`;
 * - `long` / `short` — три: вход `(t0, entry)`, стоп `(tEnd, stop)`, тейк `(tEnd, take)`;
 * - `brush` — сколько угодно, уже упрощённые.
 */
export interface Drawing {
  id: string;
  kind: DrawingKind;
  points: DPoint[];
  color: DrawingColor;
  width: DrawingWidth;
  /** Надпись `text`. */
  text?: string;
  /** Закреплённую фигуру можно выделить, но не сдвинуть. */
  locked?: boolean;
}

export const DRAWING_KINDS: readonly DrawingKind[] = [
  'hline',
  'hray',
  'vline',
  'cross',
  'trend',
  'ray',
  'extended',
  'channel',
  'arrow',
  'arrowUp',
  'arrowDown',
  'rect',
  'fib',
  'long',
  'short',
  'range',
  'text',
  'brush',
];

/** Длина надписи: заметка на графике, а не текст статьи. */
export const TEXT_MAX = 200;

export const DRAWING_COLORS: readonly DrawingColor[] = ['fg', 'blue', 'green', 'red', 'amber', 'violet'];

export const COLOR_VAR: Record<DrawingColor, string> = {
  fg: 'var(--color-fg)',
  blue: 'var(--draw-blue)',
  green: 'var(--profit)',
  red: 'var(--loss)',
  amber: 'var(--doubt)',
  violet: 'var(--draw-violet)',
};
