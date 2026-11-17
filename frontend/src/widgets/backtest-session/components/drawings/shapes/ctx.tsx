import type { PointerEvent, ReactNode } from 'react';
import type { Drawing } from '../../../lib/drawings/types';
import type { LayerGeo } from '../DrawingLayer';

/**
 * Всё, что нужно ветке отрисовки фигуры: геометрия графика, краска фигуры и
 * хит — невидимая толстая копия штриха, за которую фигуру хватают. Один набор на
 * все группы новых инструментов (спека 2026-11-17), чтобы ветки не тянули
 * `DrawingLayer` целиком.
 */
export interface ShapeCtx {
  geo: LayerGeo;
  /** Цвет фигуры (CSS). */
  color: string;
  /** Толщина штриха в единицах холста. */
  sw: number;
  /** Пропсы видимого штриха. */
  line: { stroke: string; strokeWidth: number; strokeLinecap: 'round'; pointerEvents: 'none' };
  /** Подписи — моно, мелким кеглем. */
  font: { fontSize: number; fontFamily: string };
  /** Насколько тянуть луч за край поля (в единицах холста). */
  reach: number;
  /** Хит отрезка. */
  hitLine: (x1: number, y1: number, x2: number, y2: number, key?: string | number) => ReactNode;
  /** Хит ломаной или пути SVG (`d`). */
  hitPath: (dPath: string, key?: string | number) => ReactNode;
  /** Пропсы хита для своих узлов (заливка, надпись). */
  hitProps: () => { className: string; onPointerDown: (e: PointerEvent<SVGElement>) => void } | { style: { pointerEvents: 'none' } };
  /** Наконечник стрелки в конце отрезка (точки полигона). */
  arrowHead: (x1: number, y1: number, x2: number, y2: number, len: number) => string;
  /** Перевод подписей `backtest.drawings.*`. */
  t: (key: string) => string;
}

export type ShapeRenderer = (d: Drawing, c: ShapeCtx) => ReactNode | undefined;

/** Точки фигуры в координатах холста. */
export const xy = (d: Drawing, c: ShapeCtx) => d.points.map((q) => [c.geo.xOf(q.t), c.geo.yOf(q.p)] as const);

/** Путь SVG по точкам: `M x y L x y …`, с `close` — замкнутый. */
export const pathOf = (pts: readonly (readonly [number, number])[], close = false) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('') + (close ? 'Z' : '');

/** Ломаная по точкам с хитом — превью недоставленной фигуры и запасной вид. */
export const polylineShape: ShapeRenderer = (d, c) => {
  const p = pathOf(xy(d, c));
  return (
    <>
      <path d={p} fill="none" {...c.line} strokeLinejoin="round" />
      {c.hitPath(p)}
    </>
  );
};
