import type { DrawingKind } from '../../../lib/drawings/types';
import { anchoredVwap, volumeProfile } from '../../../lib/drawings/series';
import { pathOf, type ShapeRenderer } from './ctx';

/** Строк цены у профиля и длина самой длинной полосы — доля ширины рамки. */
const ROWS = 24;
const BAR_FRAC = 0.4;

/**
 * Профиль объёма на участке: рамка от минимума до максимума свечей участка,
 * полосы объёма по строкам цены от левого края, зона 70 % — ярче, POC — линией.
 * Свечей с объёмом на участке нет (тренажёр, история не загружена) — только рамка
 * по точкам: видно, где участок.
 */
const volumeProfileShape: ShapeRenderer = (d, c) => {
  const [a, b] = d.points;
  const { xOf, yOf, px } = c.geo;
  const x1 = Math.min(xOf(a.t), xOf(b.t));
  const x2 = Math.max(xOf(a.t), xOf(b.t));
  const prof = volumeProfile(c.geo.candles, a.t, b.t, ROWS);
  if (!prof) {
    const y1 = Math.min(yOf(a.p), yOf(b.p));
    const y2 = Math.max(yOf(a.p), yOf(b.p));
    return <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} fill="none" stroke={c.color} strokeWidth={px(1)} strokeDasharray={`${px(4)} ${px(4)}`} {...c.hitProps()} />;
  }
  const yTop = yOf(prof.hi);
  const yBot = yOf(prof.lo);
  const rowH = (yBot - yTop) / ROWS;
  const max = Math.max(...prof.rows);
  const width = (x2 - x1) * BAR_FRAC;
  const pocY = yBot - (prof.poc + 0.5) * rowH;
  return (
    <>
      <rect x={x1} y={yTop} width={x2 - x1} height={yBot - yTop} fill={c.color} fillOpacity={0.04} stroke={c.color} strokeOpacity={0.4} strokeWidth={px(1)} {...c.hitProps()} />
      {prof.rows.map((v, i) => {
        if (!(v > 0)) return null;
        const inVa = i >= prof.vaLo && i <= prof.vaHi;
        return (
          <rect
            key={i}
            x={x1}
            y={yBot - (i + 1) * rowH + rowH * 0.1}
            width={(v / max) * width}
            height={rowH * 0.8}
            fill={c.color}
            fillOpacity={inVa ? 0.5 : 0.2}
            pointerEvents="none"
          />
        );
      })}
      <line x1={x1} x2={x2} y1={pocY} y2={pocY} stroke={c.color} strokeWidth={c.sw} pointerEvents="none" />
      <text x={x2 + px(4)} y={pocY + px(3.5)} fill={c.color} pointerEvents="none" {...c.font}>
        POC
      </text>
    </>
  );
};

/** Привязанный VWAP: линия от свечи якоря до последней. Без объёма — точка якоря. */
const vwap: ShapeRenderer = (d, c) => {
  const [a] = d.points;
  const { xOf, yOf, px } = c.geo;
  const pts = anchoredVwap(c.geo.candles, a.t).map((q) => [xOf(q.t), yOf(q.p)] as const);
  if (pts.length < 2) return <circle cx={xOf(a.t)} cy={yOf(a.p)} r={px(4)} fill="none" stroke={c.color} strokeWidth={px(1.5)} {...c.hitProps()} />;
  const p = pathOf(pts);
  const [xl, yl] = pts[pts.length - 1];
  return (
    <>
      <path d={p} fill="none" {...c.line} strokeLinejoin="round" />
      <text x={xl + px(4)} y={yl + px(3.5)} fill={c.color} pointerEvents="none" {...c.font}>
        VWAP
      </text>
      {c.hitPath(p)}
    </>
  );
};

export const VOLUME_SHAPES: Partial<Record<DrawingKind, ShapeRenderer>> = { volumeProfile: volumeProfileShape, vwap };
