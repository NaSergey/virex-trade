'use client';

export interface Line {
  label: string;
  values: number[];
  tone?: 'ink' | 'muted' | 'pos' | 'neg';
}

// Холст в своих единицах, ширина тянется листом (u = W / boxW): линии не
// толстеют от растяжения — non-scaling-stroke.
const W = 600;
const PAD = 6;

/** Линии по номеру точки с нулевой осью; подписи — легендой под графиком. */
export function LineChart({
  lines,
  marks = [],
  height = 180,
}: {
  lines: Line[];
  /** Вертикальные отметки по индексу точки. */
  marks?: { at: number; label: string }[];
  height?: number;
}) {
  const all = lines.flatMap((l) => l.values);
  if (!all.length) return <p className="muted">Сделок нет.</p>;
  let lo = 0;
  let hi = 0;
  for (const v of all) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const len = Math.max(...lines.map((l) => l.values.length));
  const x = (i: number) => (len > 1 ? (i / (len - 1)) * W : W / 2);
  const y = (v: number) => PAD + (1 - (v - lo) / (hi - lo || 1)) * (height - 2 * PAD);
  return (
    <figure className="st-chart">
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" width="100%" height={height} role="img">
        <line className="st-zero" x1={0} x2={W} y1={y(0)} y2={y(0)} vectorEffect="non-scaling-stroke" />
        {marks.map((m) => (
          <line
            key={m.label}
            className="st-mark"
            x1={x(m.at)}
            x2={x(m.at)}
            y1={0}
            y2={height}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {lines.map((l) => (
          <polyline
            key={l.label}
            className={`st-line st-line-${l.tone ?? 'ink'}`}
            points={l.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <figcaption className="st-legend">
        {lines.map((l) => (
          <span key={l.label} className={`st-key st-line-${l.tone ?? 'ink'}`}>
            {l.label}
          </span>
        ))}
        {marks.map((m) => (
          <span key={m.label} className="muted">
            ┆ {m.label}
          </span>
        ))}
        <span className="muted">
          от {lo.toFixed(1)} до {hi.toFixed(1)}
        </span>
      </figcaption>
    </figure>
  );
}
