import { chipsFor, type Denom } from '../lib/chips';
import { CHIP_COLORS } from './TableDefs';

/** Геометрия одной фишки в стопке, в единицах viewBox. */
const W = 40;
const RX = 18.5;
const RY = 8.5;
/** Толщина ребра — на столько каждая следующая фишка выше предыдущей. */
const T = 4.2;
/** Где по ребру стоят белые вставки: смещения от центра по горизонтали. */
const EDGE_STRIPES = [-13, -4.5, 4.5, 13];

/**
 * Стопка фишек в ракурсе — ребро с белыми вставками и лицо с кольцом
 * вставок, внутренним диском и бликом, как у настоящей казино-фишки. Номиналы
 * стопки — разложение суммы (`chipsFor`): по цвету видно порядок ставки
 * раньше, чем прочитано число.
 *
 * `width` — ширина в пикселях; высота растёт со стопкой.
 */
export function ChipStack({ amount, width = 22, max }: { amount: number; width?: number; max?: number }) {
  const chips = chipsFor(amount, max);
  if (!chips.length) return null;
  const h = 2 * RY + T + (chips.length - 1) * T + 1;
  return (
    <svg
      className="ct-stack-svg"
      viewBox={`0 0 ${W} ${h}`}
      width={width}
      height={(width / W) * h}
      aria-hidden
    >
      {chips.map((d, i) => (
        <Chip key={i} denom={d} cy={h - RY - T - 0.5 - i * T} />
      ))}
    </svg>
  );
}

function Chip({ denom, cy }: { denom: Denom; cy: number }) {
  const c = CHIP_COLORS[denom];
  const cx = W / 2;
  // Ребро — нижняя половина эллипса, опущенная на толщину фишки.
  const side = `M${cx - RX} ${cy} V${cy + T} A${RX} ${RY} 0 0 0 ${cx + RX} ${cy + T} V${cy} Z`;
  return (
    <g>
      <path d={side} fill={c.dark} />
      {EDGE_STRIPES.map((dx) => {
        const y = cy + RY * Math.sqrt(1 - (dx / RX) ** 2);
        return <rect key={dx} x={cx + dx - 1.4} y={y} width="2.8" height={T} fill={c.insert} fillOpacity="0.9" />;
      })}
      <ellipse cx={cx} cy={cy} rx={RX} ry={RY} fill={`url(#ct-chip-${denom})`} />
      {/* Кольцо вставок по кромке — пунктир по длине эллипса. */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={RX * 0.82}
        ry={RY * 0.82}
        fill="none"
        stroke={c.insert}
        strokeWidth="2.4"
        pathLength={120}
        strokeDasharray="10 10"
        strokeOpacity="0.95"
      />
      <ellipse cx={cx} cy={cy} rx={RX * 0.55} ry={RY * 0.55} fill={c.base} stroke={c.insert} strokeOpacity="0.55" strokeWidth="0.8" />
      <ellipse cx={cx - 4} cy={cy - 2.2} rx={RX * 0.45} ry={RY * 0.28} fill="#fff" fillOpacity="0.14" />
    </g>
  );
}
