import { SUIT_SHAPES } from '@/shared/ui/suits';
import { DENOMS, type Denom } from '../lib/chips';

/**
 * Общие определения SVG стола: фигуры мастей, градиенты карт, узор рубашки,
 * цвета фишек. Рисуются один раз на странице, а карты и фишки ссылаются на
 * них по id: полсотни одинаковых градиентов в каждой карте — это и лишний
 * DOM, и повторяющиеся id. Фигуры мастей — `SUIT_SHAPES` из shared: их же
 * рисует сцена карточки покера на витрине.
 */

/** Колода четырёхцветная: пики, червы, бубны и трефы различаются заливкой. */
export const SUIT_COLORS: Record<string, [light: string, dark: string]> = {
  s: ['#636a7e', '#2e313b'],
  h: ['#ec5656', '#b01f28'],
  d: ['#3f8cf0', '#1d5bb8'],
  c: ['#3cbf72', '#1f7f47'],
};

/** Фишка: основной цвет, тень ребра и цвет вставок по кромке. */
export const CHIP_COLORS: Record<Denom, { base: string; dark: string; insert: string }> = {
  1: { base: '#ecebe6', dark: '#a9a79f', insert: '#2f6fd6' },
  5: { base: '#d8423d', dark: '#8f1f1c', insert: '#ffffff' },
  25: { base: '#35a864', dark: '#1d6a3c', insert: '#ffffff' },
  100: { base: '#34363d', dark: '#141519', insert: '#ffffff' },
  500: { base: '#8458e0', dark: '#4c2a94', insert: '#ffffff' },
  1000: { base: '#e2ad35', dark: '#9a6d12', insert: '#3a2a06' },
};

export function TableDefs() {
  return (
    <svg className="ct-defs" width="0" height="0" aria-hidden focusable="false">
      <defs>
        {Object.entries(SUIT_SHAPES).map(([k, d]) => (
          <symbol key={k} id={`ct-suit-${k}`} viewBox="0 0 100 100">
            {d}
          </symbol>
        ))}

        {Object.entries(SUIT_COLORS).map(([k, [light, dark]]) => (
          <linearGradient key={k} id={`ct-card-${k}`} x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0" stopColor={light} />
            <stop offset="1" stopColor={dark} />
          </linearGradient>
        ))}
        <linearGradient id="ct-gloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.06" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>

        <linearGradient id="ct-back" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#d6333a" />
          <stop offset="1" stopColor="#7d1419" />
        </linearGradient>
        <pattern id="ct-back-lattice" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0 H9 M0 0 V9" stroke="#fff" strokeOpacity="0.16" strokeWidth="1.2" />
        </pattern>

        {DENOMS.map((d) => (
          <radialGradient key={d} id={`ct-chip-${d}`} cx="0.35" cy="0.3" r="0.9">
            <stop offset="0" stopColor={CHIP_COLORS[d].base} stopOpacity="1" />
            <stop offset="0.7" stopColor={CHIP_COLORS[d].base} />
            <stop offset="1" stopColor={CHIP_COLORS[d].dark} />
          </radialGradient>
        ))}
      </defs>
    </svg>
  );
}
