import { useMemo } from 'react';
import { windowStrips } from '../lib/landscape';

/**
 * Космодром за площадкой, как на референсе владельца: слева низкий ангар с
 * антеннами, справа корпус управления с неоновыми полосами окон, радаром и
 * решётчатой антенной. Единицы — ракеты (корпус — 182), чтобы здания стояли
 * в одном масштабе с площадкой; начало — под серединой плиты, y = 0 — земля
 * здания. Луч радара — свой HTML-слой: он качается, а SVG — нет.
 */

const VB = { x: -700, y: -240, w: 1480, h: 240 } as const;
const STRIP_TONES = ['#ff5fa0', '#5ae0ff', '#b89cff'];
/** Центр тарелки радара — отсюда бьёт луч. */
export const DISH = { x: 500, y: -172 } as const;

const id = (name: string) => `jpg-sp-${name}`;
const url = (name: string) => `url(#${id(name)})`;

function Defs() {
  return (
    <defs>
      <linearGradient id={id('hangar')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3553d8" />
        <stop offset="1" stopColor="#1b2a86" />
      </linearGradient>
      <linearGradient id={id('main')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2c3a9e" />
        <stop offset="1" stopColor="#1a2066" />
      </linearGradient>
      <linearGradient id={id('side')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4264e6" />
        <stop offset="1" stopColor="#253aa8" />
      </linearGradient>
    </defs>
  );
}

function Hangar() {
  return (
    <g>
      <rect x="-640" y="-48" width="260" height="48" fill={url('hangar')} />
      <line x1="-640" y1="-48" x2="-380" y2="-48" stroke="#8fe6ff" strokeWidth="1.4" />
      <rect x="-620" y="-30" width="170" height="6" fill="#8fe6ff" opacity="0.85" />
      <rect x="-440" y="-30" width="40" height="6" fill="#ff7ac0" opacity="0.85" />
      {[-610, -560, -500].map((x) => (
        <g key={x} stroke="#9fb4ff" strokeWidth="1.6">
          <line x1={x} y1="-48" x2={x} y2="-70" />
          <line x1={x - 6} y1="-70" x2={x + 6} y2="-70" />
          <line x1={x - 3} y1="-64" x2={x + 3} y2="-64" />
        </g>
      ))}
    </g>
  );
}

/** Тонкая белая решётчатая антенна у корпуса управления. */
function Antenna({ x }: { x: number }) {
  const top = -200;
  const n = 10;
  return (
    <g stroke="#c8d4ff" strokeWidth="1.3" fill="none" strokeOpacity="0.85">
      <path d={`M${x - 9} 0 L${x - 2} ${top} M${x + 9} 0 L${x + 2} ${top}`} strokeWidth="1.8" />
      {Array.from({ length: n }, (_, i) => {
        const y0 = (top * i) / n;
        const y1 = (top * (i + 1)) / n;
        const h0 = 9 - (7 * i) / n;
        const h1 = 9 - (7 * (i + 1)) / n;
        return <path key={i} d={`M${x - h0} ${y0} L${x + h1} ${y1} M${x + h0} ${y0} L${x - h1} ${y1}`} />;
      })}
      <line x1={x} y1={top} x2={x} y2={top - 22} />
    </g>
  );
}

function Control() {
  const strips = useMemo(() => windowStrips(240, 6, 16, 23, STRIP_TONES.length), []);
  return (
    <g>
      <Antenna x={330} />
      <rect x="380" y="-120" width="260" height="120" fill={url('main')} />
      <rect x="430" y="-150" width="140" height="30" fill="#2d3a9e" />
      <line x1="380" y1="-120" x2="640" y2="-120" stroke="#6d7cff" strokeWidth="1.2" />
      {strips.map((s) => (
        <rect key={`${s.x}-${s.y}`} x={390 + s.x} y={-106 + s.y} width={s.len} height="5" fill={STRIP_TONES[s.tone]} opacity="0.9" />
      ))}
      <rect x="640" y="-138" width="120" height="138" fill={url('side')} />
      {Array.from({ length: 24 }, (_, i) => (
        <rect key={i} x={656 + (i % 4) * 24} y={-122 + Math.floor(i / 4) * 20} width="12" height="6" fill="#8fe6ff" opacity={i % 5 === 2 ? 0.25 : 0.7} />
      ))}
      {/* Радар на крыше: стойка и тарелка, глядящая в небо влево-вверх. */}
      <line x1={DISH.x} y1="-150" x2={DISH.x} y2={DISH.y + 6} stroke="#9fb4ff" strokeWidth="3" />
      <ellipse
        cx={DISH.x}
        cy={DISH.y}
        rx="22"
        ry="9"
        transform={`rotate(-35 ${DISH.x} ${DISH.y})`}
        fill="#9fb4ff"
        stroke="#e6ecff"
        strokeWidth="1.4"
      />
      <rect x="360" y="-6" width="420" height="6" fill="#141a4a" />
    </g>
  );
}

/** Космодром: `x` — середина плиты старта, `base` — земля зданий, `hull` — масштаб. */
export function Spaceport({ x, base, hull }: { x: number; base: number; hull: number }) {
  const u = hull / 182;
  return (
    <>
      <svg
        className="jpg-art"
        width={VB.w * u}
        height={VB.h * u}
        viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
        style={{ left: x + VB.x * u, top: base + VB.y * u }}
      >
        <Defs />
        <Hangar />
        <Control />
      </svg>
      <i
        className="jpg-radar-beam"
        style={{ left: x + DISH.x * u, top: base + DISH.y * u, width: 380 * u, height: 150 * u }}
      />
    </>
  );
}
