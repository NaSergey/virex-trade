import type { DrawingKind } from '../../../lib/drawings/types';
import { cycleTs, necklineOf, xabcdRatios } from '../../../lib/drawings/tools';
import { pathOf, xy, type ShapeCtx, type ShapeRenderer } from './ctx';

/** Подпись у точки: над вершиной, под впадиной — по соседям, чтобы не лечь на линию. */
function pointLabel(c: ShapeCtx, pts: readonly (readonly [number, number])[], i: number, text: string) {
  const [x, y] = pts[i];
  const prev = pts[i - 1]?.[1] ?? pts[i + 1]?.[1] ?? y;
  const next = pts[i + 1]?.[1] ?? prev;
  // y растёт вниз: точка выше соседей — вершина, подпись над ней.
  const peak = y <= Math.min(prev, next);
  const dy = peak ? -c.geo.px(6) : c.geo.px(14);
  return (
    <text key={`l${i}`} x={x} y={y + dy} fill={c.color} textAnchor="middle" pointerEvents="none" {...c.font} fontWeight={600}>
      {text}
    </text>
  );
}

/** Ломаная по точкам с подписями — основа волн и паттернов. */
function labelled(c: ShapeCtx, pts: readonly (readonly [number, number])[], labels: readonly (string | null)[]) {
  const p = pathOf(pts);
  return (
    <>
      <path d={p} fill="none" {...c.line} strokeLinejoin="round" />
      {c.hitPath(p)}
      {labels.map((l, i) => (l ? pointLabel(c, pts, i, l) : null))}
    </>
  );
}

const ratio = (v: number | null) => (v == null ? '—' : v.toFixed(3));

const xabcd: ShapeRenderer = (d, c) => {
  const pts = xy(d, c);
  const [X, A, B, C, D] = d.points;
  const r = xabcdRatios(X, A, B, C, D);
  const fill = (ids: number[]) => pathOf(ids.map((i) => pts[i]), true);
  // Отношение — посередине диагонали, пунктиром соединяющей концы хода.
  const diag = (i: number, j: number, value: number | null) => {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[j];
    return (
      <g key={`d${i}${j}`} pointerEvents="none">
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c.color} strokeWidth={c.geo.px(1)} strokeDasharray={`${c.geo.px(3)} ${c.geo.px(3)}`} />
        <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - c.geo.px(3)} fill={c.color} textAnchor="middle" {...c.font}>
          {ratio(value)}
        </text>
      </g>
    );
  };
  return (
    <>
      <path d={fill([0, 1, 2])} fill={c.color} fillOpacity={0.1} pointerEvents="none" />
      <path d={fill([2, 3, 4])} fill={c.color} fillOpacity={0.1} pointerEvents="none" />
      {diag(0, 2, r.xb)}
      {diag(1, 3, r.ac)}
      {diag(2, 4, r.bd)}
      {diag(1, 4, r.xd)}
      {labelled(c, pts, ['X', 'A', 'B', 'C', 'D'])}
    </>
  );
};

const headShoulders: ShapeRenderer = (d, c) => {
  const pts = xy(d, c);
  const [n1, n2] = necklineOf(d.points);
  const { xOf, yOf } = c.geo;
  return (
    <>
      <line
        x1={xOf(n1.t)}
        y1={yOf(n1.p)}
        x2={xOf(n2.t)}
        y2={yOf(n2.p)}
        stroke={c.color}
        strokeWidth={c.sw}
        strokeDasharray={`${c.geo.px(5)} ${c.geo.px(4)}`}
        pointerEvents="none"
      />
      {c.hitLine(xOf(n1.t), yOf(n1.p), xOf(n2.t), yOf(n2.p))}
      {labelled(c, pts, [null, c.t('hsLeft'), null, c.t('hsHead'), null, c.t('hsRight'), null])}
    </>
  );
};

const elliottImpulse: ShapeRenderer = (d, c) => labelled(c, xy(d, c), [null, '(1)', '(2)', '(3)', '(4)', '(5)']);

const elliottCorrection: ShapeRenderer = (d, c) => labelled(c, xy(d, c), [null, '(A)', '(B)', '(C)']);

const cycleLines: ShapeRenderer = (d, c) => {
  const [a, b] = d.points;
  const { xOf, top, bottom, PW, candles, tfMs } = c.geo;
  // До правого края поля: время у края — последняя свеча плюс то, что уместилось бы правее.
  const last = candles[candles.length - 1]?.t ?? Math.max(a.t, b.t);
  const tEnd = last + tfMs * Math.max(0, (PW - xOf(last)) / Math.max(1, xOf(last + tfMs) - xOf(last)));
  return (
    <>
      {cycleTs(a, b, tEnd).map((t) => {
        const x = xOf(t);
        if (x < 0 || x > PW) return null;
        return (
          <g key={t}>
            <line x1={x} x2={x} y1={top} y2={bottom} {...c.line} />
            {c.hitLine(x, top, x, bottom)}
          </g>
        );
      })}
    </>
  );
};

export const PATTERN_SHAPES: Partial<Record<DrawingKind, ShapeRenderer>> = {
  xabcd,
  headShoulders,
  elliottImpulse,
  elliottCorrection,
  cycleLines,
};
