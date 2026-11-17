import type { DrawingKind } from '../../../lib/drawings/types';
import { quadThrough } from '../../../lib/drawings/tools';
import { pathOf, xy, type ShapeRenderer } from './ctx';

/** Заливка замкнутых фигур — как у прямоугольника. */
const FILL = 0.12;

const ellipse: ShapeRenderer = (d, c) => {
  const [[x1, y1], [x2, y2]] = xy(d, c);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = Math.abs(x2 - x1) / 2;
  const ry = Math.abs(y2 - y1) / 2;
  // Хит — контур эллипса путём: две дуги по половине.
  const p = `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0`;
  return (
    <>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={c.color} fillOpacity={FILL} {...c.line} />
      {c.hitPath(p)}
    </>
  );
};

const triangle: ShapeRenderer = (d, c) => {
  const p = pathOf(xy(d, c), true);
  return (
    <>
      <path d={p} fill={c.color} fillOpacity={FILL} {...c.line} strokeLinejoin="round" />
      {c.hitPath(p)}
    </>
  );
};

const polyline: ShapeRenderer = (d, c) => {
  const p = pathOf(xy(d, c));
  return (
    <>
      <path d={p} fill="none" {...c.line} strokeLinejoin="round" />
      {c.hitPath(p)}
    </>
  );
};

/** Путь — ломаная со стрелкой на последнем отрезке. */
const path: ShapeRenderer = (d, c) => {
  const pts = xy(d, c);
  const p = pathOf(pts);
  const [x1, y1] = pts[pts.length - 2];
  const [x2, y2] = pts[pts.length - 1];
  return (
    <>
      <path d={p} fill="none" {...c.line} strokeLinejoin="round" />
      <polygon points={c.arrowHead(x1, y1, x2, y2, c.geo.px(10) + c.sw * 2)} fill={c.color} pointerEvents="none" />
      {c.hitPath(p)}
    </>
  );
};

/** Кривая через третью точку: квадратичная Безье с контрольной `quadThrough`. */
const curvePath = (d: Parameters<ShapeRenderer>[0], c: Parameters<ShapeRenderer>[1]) => {
  const [a, b, mid] = d.points;
  const ctl = quadThrough(a, b, mid);
  const { xOf, yOf } = c.geo;
  return `M${xOf(a.t)} ${yOf(a.p)}Q${xOf(ctl.t)} ${yOf(ctl.p)} ${xOf(b.t)} ${yOf(b.p)}`;
};

const curve: ShapeRenderer = (d, c) => {
  const p = curvePath(d, c);
  return (
    <>
      <path d={p} fill="none" {...c.line} />
      {c.hitPath(p)}
    </>
  );
};

/** Дуга — та же кривая, замкнутая хордой, с заливкой. */
const arc: ShapeRenderer = (d, c) => {
  const p = `${curvePath(d, c)}Z`;
  return (
    <>
      <path d={p} fill={c.color} fillOpacity={FILL} {...c.line} strokeLinejoin="round" />
      {c.hitPath(p)}
    </>
  );
};

export const FIGURE_SHAPES: Partial<Record<DrawingKind, ShapeRenderer>> = { ellipse, triangle, polyline, path, curve, arc };
