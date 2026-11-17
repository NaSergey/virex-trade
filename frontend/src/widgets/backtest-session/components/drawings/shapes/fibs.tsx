import type { DrawingKind } from '../../../lib/drawings/types';
import { extend } from '../../../lib/drawings/geometry';
import { regression } from '../../../lib/drawings/series';
import { fibChannelLines, fibColor, fibExtLevels, fibFanTargets, fibTimeTs, gannTargets, pitchforkLines } from '../../../lib/drawings/tools';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import { pathOf, type ShapeCtx, type ShapeRenderer } from './ctx';

/** Луч из (x1,y1) через (x2,y2) до края поля — видимый штрих и хит. */
function ray(c: ShapeCtx, x1: number, y1: number, x2: number, y2: number, key: string, stroke = c.color, width = c.sw) {
  const [xe, ye] = extend(x1, y1, x2, y2, c.reach);
  return (
    <g key={key}>
      <line x1={x1} y1={y1} x2={xe} y2={ye} stroke={stroke} strokeWidth={width} strokeLinecap="round" pointerEvents="none" />
      {c.hitLine(x1, y1, xe, ye)}
    </g>
  );
}

/** Пунктир между точками фигуры — опорные ходы, как у сетки коррекции. */
const guide = (c: ShapeCtx, pts: readonly (readonly [number, number])[]) => (
  <path
    d={pathOf(pts)}
    fill="none"
    stroke="#787b86"
    strokeWidth={c.geo.px(1)}
    strokeDasharray={`${c.geo.px(4)} ${c.geo.px(4)}`}
    pointerEvents="none"
  />
);

const fibExt: ShapeRenderer = (d, c) => {
  const [a, b, cc] = d.points;
  const { xOf, yOf, px } = c.geo;
  // Уровни — от C вправо на длину хода A→B (не короче 40 px), подписи слева, как у коррекции.
  const xL = xOf(cc.t);
  const xR = xL + Math.max(px(40), Math.abs(xOf(b.t) - xOf(a.t)));
  return (
    <>
      {guide(c, [
        [xOf(a.t), yOf(a.p)],
        [xOf(b.t), yOf(b.p)],
        [xOf(cc.t), yOf(cc.p)],
      ])}
      {fibExtLevels(a, b, cc).map(({ level, price, color }) => {
        const y = yOf(price);
        return (
          <g key={level}>
            <line x1={xL} x2={xR} y1={y} y2={y} stroke={color} strokeWidth={c.sw} pointerEvents="none" />
            <text x={xL - px(4)} y={y + px(3.5)} fill={color} textAnchor="end" pointerEvents="none" {...c.font}>
              {level} ({formatPriceGrouped(price, c.geo.priceDecimals)})
            </text>
            {c.hitLine(xL, y, xR, y)}
          </g>
        );
      })}
    </>
  );
};

const fibChannel: ShapeRenderer = (d, c) => {
  const [a, b, cc] = d.points;
  const { xOf, yOf, px } = c.geo;
  return (
    <>
      {fibChannelLines(a, b, cc).map(({ k, from, to }) => {
        const [x1, y1, x2, y2] = [xOf(from.t), yOf(from.p), xOf(to.t), yOf(to.p)];
        const color = fibColor(k);
        return (
          <g key={k}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={c.sw} pointerEvents="none" />
            <text x={x2 + px(4)} y={y2 + px(3.5)} fill={color} pointerEvents="none" {...c.font}>
              {k}
            </text>
            {c.hitLine(x1, y1, x2, y2)}
          </g>
        );
      })}
    </>
  );
};

const fibFan: ShapeRenderer = (d, c) => {
  const [a, b] = d.points;
  const { xOf, yOf, px } = c.geo;
  const xa = xOf(a.t);
  const ya = yOf(a.p);
  return (
    <>
      {guide(c, [
        [xa, ya],
        [xOf(b.t), yOf(b.p)],
      ])}
      {fibFanTargets(a, b).map(({ k, to }) => (
        <g key={k}>
          {ray(c, xa, ya, xOf(to.t), yOf(to.p), `r${k}`, fibColor(k))}
          <text x={xOf(to.t) + px(4)} y={yOf(to.p) - px(3)} fill={fibColor(k)} pointerEvents="none" {...c.font}>
            {k}
          </text>
        </g>
      ))}
    </>
  );
};

const fibTime: ShapeRenderer = (d, c) => {
  const [a, b] = d.points;
  const { xOf, px, top, bottom, PW } = c.geo;
  return (
    <>
      {fibTimeTs(a, b).map(({ n, t }) => {
        const x = xOf(t);
        if (x < 0 || x > PW) return null;
        return (
          <g key={n}>
            <line x1={x} x2={x} y1={top} y2={bottom} {...c.line} />
            <text x={x + px(3)} y={top + px(12)} fill={c.color} pointerEvents="none" {...c.font}>
              {n}
            </text>
            {c.hitLine(x, top, x, bottom)}
          </g>
        );
      })}
    </>
  );
};

const gannFan: ShapeRenderer = (d, c) => {
  const [a, b] = d.points;
  const { xOf, yOf, px } = c.geo;
  const xa = xOf(a.t);
  const ya = yOf(a.p);
  return (
    <>
      {gannTargets(a, b).map(({ label, to }) => (
        <g key={label}>
          {ray(c, xa, ya, xOf(to.t), yOf(to.p), label, c.color, label === '1×1' ? c.sw : c.geo.px(1))}
          <text x={xOf(to.t) + px(4)} y={yOf(to.p) - px(3)} fill={c.color} pointerEvents="none" {...c.font}>
            {label}
          </text>
        </g>
      ))}
    </>
  );
};

const pitchfork: ShapeRenderer = (d, c) => {
  const [p0, p1, p2] = d.points;
  const { xOf, yOf } = c.geo;
  const { median, upper, lower } = pitchforkLines(p0, p1, p2);
  const line = (pts: readonly [{ t: number; p: number }, { t: number; p: number }], key: string) =>
    ray(c, xOf(pts[0].t), yOf(pts[0].p), xOf(pts[1].t), yOf(pts[1].p), key);
  return (
    <>
      <line x1={xOf(p1.t)} y1={yOf(p1.p)} x2={xOf(p2.t)} y2={yOf(p2.p)} {...c.line} />
      {c.hitLine(xOf(p1.t), yOf(p1.p), xOf(p2.t), yOf(p2.p))}
      {line(median, 'm')}
      {line(upper, 'u')}
      {line(lower, 'l')}
    </>
  );
};

const regressionShape: ShapeRenderer = (d, c) => {
  const [a, b] = d.points;
  const { xOf, yOf } = c.geo;
  const r = regression(c.geo.candles, a.t, b.t);
  // Свечей на участке нет (ушёл за загруженную историю) — видно хотя бы, где он.
  if (!r)
    return (
      <>
        {guide(c, [
          [xOf(a.t), yOf(a.p)],
          [xOf(b.t), yOf(b.p)],
        ])}
        {c.hitLine(xOf(a.t), yOf(a.p), xOf(b.t), yOf(b.p))}
      </>
    );
  const k = 2 * r.sigma;
  const x1 = xOf(r.from.t);
  const x2 = xOf(r.to.t);
  const [y1, y2] = [yOf(r.from.p), yOf(r.to.p)];
  const [u1, u2, l1, l2] = [yOf(r.from.p + k), yOf(r.to.p + k), yOf(r.from.p - k), yOf(r.to.p - k)];
  return (
    <>
      <path d={`M${x1} ${u1}L${x2} ${u2}L${x2} ${l2}L${x1} ${l1}Z`} fill={c.color} fillOpacity={0.08} pointerEvents="none" />
      <line x1={x1} y1={y1} x2={x2} y2={y2} {...c.line} strokeDasharray={`${c.geo.px(4)} ${c.geo.px(3)}`} />
      <line x1={x1} y1={u1} x2={x2} y2={u2} {...c.line} />
      <line x1={x1} y1={l1} x2={x2} y2={l2} {...c.line} />
      {c.hitLine(x1, y1, x2, y2)}
      {c.hitLine(x1, u1, x2, u2)}
      {c.hitLine(x1, l1, x2, l2)}
    </>
  );
};

export const FIB_SHAPES: Partial<Record<DrawingKind, ShapeRenderer>> = {
  fibExt,
  fibChannel,
  fibFan,
  fibTime,
  gannFan,
  pitchfork,
  regression: regressionShape,
};
