import { useId, type SVGProps } from 'react';

import {
  CRUMPLE,
  EDGES,
  GLINTS,
  H,
  HATCH_ANGLES,
  SHARDS,
  STOPS,
  W,
  pts,
} from './tradePlayMarkGeometry';

/**
 * Знак Trade Play: курсивное «TP» из стеклянных осколков.
 *
 * Слои снизу вверх: отлив → крупные грани → мятое стекло → штриховка →
 * кромки → искры. В кегле шапки мелкие слои сливаются в зерно и блеск, в
 * крупном виде читаются по отдельности.
 *
 * Отлив — один градиент на весь знак, а не свой у каждого осколка: полоса
 * блика проходит через щели между ними, и осколки читаются кусками одного
 * расколотого стекла, а не пятью отдельными деталями. Краски отлива и кромки —
 * токенами темы (`--tpm-*`): на бумаге светлой темы серебро терялось бы, там
 * знак — тёмный графит, а не перевёрнутый фильтром рисунок.
 *
 * Искры выходят за рамку рисунка (`overflow="visible"`): обрезанная о край
 * вспышка читалась бы квадратом.
 *
 * id определений — из `useId`: знак может стоять на странице дважды, а
 * одинаковый id разрешается в первое определение документа.
 */
export function TradePlayMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  const uid = `tpm-${useId()}`;
  const sheen = `${uid}-sheen`;
  const clip = `${uid}-clip`;
  const glint = `${uid}-glint`;
  const hatch = (angle: number) => `${uid}-hatch${HATCH_ANGLES.indexOf(angle)}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${W} ${H}`}
      overflow="visible"
      className={['tp-mark', className].filter(Boolean).join(' ')}
      role="img"
      aria-label="Trade Play"
      {...props}
    >
      <defs>
        <linearGradient id={sheen} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2={H}>
          {STOPS.map((offset, i) => (
            <stop key={offset} offset={offset} style={{ stopColor: `var(--tpm-${i + 1})` }} />
          ))}
        </linearGradient>
        <clipPath id={clip}>
          {SHARDS.map(({ id, outline }) => (
            <polygon key={id} points={pts(outline)} />
          ))}
        </clipPath>
        {HATCH_ANGLES.map((angle) => (
          <pattern
            key={angle}
            id={hatch(angle)}
            width="12"
            height="2.2"
            patternUnits="userSpaceOnUse"
            patternTransform={`rotate(${angle})`}
          >
            <rect width="12" height="0.45" fill="#fff" />
          </pattern>
        ))}
        <radialGradient id={glint}>
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.25" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {SHARDS.map(({ id, outline, facets }) => (
        <g key={id}>
          <polygon points={pts(outline)} fill={`url(#${sheen})`} />
          {facets.map(([a, b, c, tone], i) => (
            <polygon
              key={i}
              points={pts([a, b, c])}
              fill={tone > 0 ? '#fff' : '#000'}
              fillOpacity={tone > 0 ? tone : -tone}
            />
          ))}
        </g>
      ))}
      <g clipPath={`url(#${clip})`}>
        {CRUMPLE.map(({ tone, d }) => (
          <path
            key={tone}
            d={d}
            fill={tone > 0 ? '#fff' : '#000'}
            fillOpacity={Math.abs(tone)}
            stroke="#fff"
            strokeOpacity={0.07}
            strokeWidth={0.35}
          />
        ))}
      </g>
      {SHARDS.flatMap(({ id, outline, hatch: angles = [] }) =>
        angles.map((angle) => (
          <polygon key={`${id}${angle}`} points={pts(outline)} fill={`url(#${hatch(angle)})`} fillOpacity={0.16} />
        )),
      )}
      <g className="tp-mark-edge">
        {EDGES.map(({ key, a, b, opacity }) => (
          <line key={key} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} strokeOpacity={opacity} />
        ))}
      </g>
      {GLINTS.map(([x, y, k]) => (
        <g key={`${x},${y}`} transform={`translate(${x} ${y})`} opacity={k}>
          <circle r="9" fill={`url(#${glint})`} />
          <ellipse rx="26" ry="1.1" fill={`url(#${glint})`} />
          <ellipse rx="1" ry="12" fill={`url(#${glint})`} />
        </g>
      ))}
    </svg>
  );
}
