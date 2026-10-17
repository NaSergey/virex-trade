import { linePoints, pathOf } from '../lib/charts';

/** Холст строчного графика клетки: ширину тянет клетка (`preserveAspectRatio="none"`). */
const W = 200;
const H = 34;
const PAD = 2;

/**
 * Линия ряда по дням — баланс монет за 90 дней. Заливка под линией, базовая
 * черта и точка на последнем дне. Обводка не тянется вместе с холстом
 * (`vector-effect`), а точка — отрезок нулевой длины с круглым концом: круг
 * сплющился бы вместе с холстом, а конец обводки остаётся круглым.
 */
export function LineSpark({ values }: { values: number[] }) {
  const pts = linePoints(values, W, H, PAD);
  const last = pts[pts.length - 1];
  const line = pathOf(pts);
  return (
    <svg className="pf-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <line className="pf-spark-base" x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} />
      {pts.length > 1 && (
        <>
          <path
            className="pf-spark-area"
            d={`${line} L${last.x.toFixed(1)} ${H} L${pts[0].x.toFixed(1)} ${H} Z`}
          />
          <path className="pf-spark-ln" d={line} />
          <line className="pf-spark-dot" x1={last.x} y1={last.y} x2={last.x} y2={last.y} />
        </>
      )}
    </svg>
  );
}

/**
 * Столбики по дням — опыт за 90 дней. Последние `recent` дней — светлые: это
 * та неделя, что стоит числом над графиком. Пустой день — без столбика, а не
 * столбик нулевой высоты.
 */
export function BarSpark({ values, recent }: { values: number[]; recent: number }) {
  const top = Math.max(1, ...values);
  const step = values.length > 0 ? W / values.length : W;
  const from = values.length - recent;
  return (
    <svg className="pf-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <line className="pf-spark-base" x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} />
      {values.map((v, i) => {
        if (v <= 0) return null;
        const h = Math.max(1.5, (v / top) * (H - PAD));
        return (
          <rect
            key={i}
            className={i >= from ? 'pf-spark-b is-now' : 'pf-spark-b'}
            x={i * step + step * 0.15}
            y={H - h}
            width={step * 0.7}
            height={h}
          />
        );
      })}
    </svg>
  );
}
