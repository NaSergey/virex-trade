'use client';

import { memo, useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import {
  EDGES,
  GLINTS,
  H,
  HATCH_ANGLES,
  SHARDS,
  STOPS,
  W,
  pts,
  type Pt,
} from '@/shared/ui/tradePlayMarkGeometry';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';

/**
 * Построечные линии: верх и низ перекладин, базовая линия и курсив ножек,
 * вынесенные за знак, — разметка листа, по которой знак «чертят».
 */
const GUIDES: readonly (readonly [Pt, Pt])[] = (() => {
  const extend = (a: Pt, b: Pt, by: number): [Pt, Pt] => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    return [
      [a[0] - ux * by, a[1] - uy * by],
      [b[0] + ux * by, b[1] + uy * by],
    ];
  };
  return [
    [[-24, 6], [W + 24, 6]],
    [[-24, 24], [W + 24, 24]],
    [[-24, 136], [W + 24, 136]],
    extend([84, 31], [40, 136], 26),
    extend([134, 62], [103, 136], 26),
    extend([194, 6], [228, 40], 20),
    extend([228, 40], [190, 78], 20),
  ];
})();

/** Вершины осколков — точки, с которых начинается построение. */
const VERTICES: readonly Pt[] = SHARDS.flatMap((s) => s.outline);

/**
 * Грани всех осколков одним списком, по свету: сверху слева вниз направо.
 * Заливка граней идёт в этом порядке — стекло «наливается» от блика.
 */
const FACETS = SHARDS.flatMap(({ id, facets }) =>
  facets.map(([a, b, c, tone], i) => ({ key: `${id}-${i}`, a, b, c, tone })),
).sort((p, q) => {
  const k = ({ a, b, c }: { a: Pt; b: Pt; c: Pt }) => (a[0] + b[0] + c[0]) + 1.6 * (a[1] + b[1] + c[1]);
  return k(p) - k(q);
});

/**
 * Знак Trade Play, собираемый скроллом, — отдельный рисунок, а не
 * `TradePlayMark` с флажками: у сборки свои слои, которых у знака в шапке нет
 * (построечные линии, вершины, проволочный каркас граней, проход блика).
 * Геометрия общая — `tradePlayMarkGeometry`.
 *
 * Пять стадий на одном таймлайне со `scrub` по ближайшей секции-предку —
 * её высота и есть путь скролла сборки:
 *
 *   1. разметка — построечные линии и вершины;
 *   2. каркас — контуры осколков, затем триангуляция граней проволокой;
 *   3. текстура — отлив, грани по свету, штриховка; разметка и проволока
 *      гаснут;
 *   4. кромки прорисовываются, по стеклу проходит блик;
 *   5. искры на углах.
 *
 * **Начальное состояние задаёт CSS, а не JS** (`landing.css`, блок
 * `.mk`): разметка приходит с сервера уже со скрытыми слоями, и до гидрации
 * не мелькает собранный знак, который GSAP тут же спрятал бы. Линии
 * прячутся пунктиром длиной в контур (`pathLength="1"`), и рисует их сдвиг
 * пунктира — без плагина и без замеров длины.
 *
 * Секция ищется через `closest`, а не берётся рефом от родителя: эффект
 * ребёнка срабатывает раньше, чем React привяжет реф предка, и таймлайн
 * оставался бы без триггера.
 *
 * `memo`: сборка не зависит ни от чего на странице, и перерисовка родителя
 * (смена вкладки в шапке) не должна трогать полсотни узлов SVG.
 */
export const MarkAssembly = memo(function MarkAssembly({ className }: { className?: string }) {
  const root = useRef<SVGSVGElement>(null);

  useGSAP(
    () => {
      registerGsap();
      const svg = root.current;
      const section = svg?.closest('section');
      if (!svg || !section || prefersReducedMotion()) return;

      const q = (sel: string) => gsap.utils.toArray<SVGElement>(sel, svg);
      const guides = q('.mk-guide');
      const dots = q('.mk-dot');
      const outline = q('.mk-outline');
      const wire = q('.mk-wire');
      const fills = q('.mk-fill');
      const facets = q('.mk-facet');
      const hatch = q('.mk-hatch');
      const edges = q('.mk-edge');
      const sweep = svg.querySelector('.mk-sweep-grad');
      const sweepRect = svg.querySelector('.mk-sweep');
      const glints = q('.mk-glint');
      const glintK = glints.map((g) => Number(g.dataset.k ?? 1));

      gsap.set(dots, { scale: 0, transformOrigin: '50% 50%' });
      gsap.set(glints, { scale: 0.2, transformOrigin: '50% 50%' });

      const draw = { strokeDashoffset: 0 };
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: section, start: 'top top', end: 'bottom bottom', scrub: 0.8 },
      });

      // 1 · разметка
      tl.to(guides, { ...draw, duration: 1.2, stagger: 0.12, ease: 'power1.inOut' }, 0.2)
        .to(dots, { opacity: 1, scale: 1, duration: 0.5, stagger: 0.03, ease: 'back.out(2)' }, 0.8)
        // 2 · каркас
        .to(outline, { ...draw, duration: 1.6, stagger: 0.35, ease: 'power1.inOut' }, 1.6)
        .to(wire, { ...draw, duration: 0.7, stagger: 0.035, ease: 'power1.out' }, 2.8)
        // 3 · текстура
        .to(guides, { opacity: 0, duration: 0.8 }, 5)
        .to(dots, { opacity: 0, scale: 0.4, duration: 0.6, stagger: 0.01 }, 5)
        .to(fills, { opacity: 1, duration: 1, stagger: 0.25 }, 5.2)
        .to(facets, { opacity: 1, duration: 0.5, stagger: 0.035 }, 5.5)
        .to(hatch, { opacity: 1, duration: 0.8, stagger: 0.15 }, 7.6)
        .to(wire, { opacity: 0, duration: 1 }, 7.6)
        .to(outline, { opacity: 0, duration: 1 }, 8.2)
        // 4 · кромки и блик
        .to(edges, { ...draw, duration: 0.6, stagger: 0.02, ease: 'power1.out' }, 8.4)
        // Блик рисуется только на своём отрезке: наложение `screen` на весь
        // знак — больше половины растра каждого кадра сборки, даже когда
        // полоса стоит за краем знака и ничего не видно.
        .set(sweepRect, { display: 'inline' }, 9)
        .fromTo(sweep, { attr: { x1: -90, x2: -20 } }, { attr: { x1: W + 40, x2: W + 110 }, duration: 1.6, ease: 'power1.inOut' }, 9)
        .set(sweepRect, { display: 'none' }, 10.6)
        // 5 · искры
        .to(glints, { opacity: (i: number) => glintK[i], scale: 1, duration: 0.7, stagger: 0.12, ease: 'back.out(3)' }, 9.8)
        // Хвост: знак стоит собранным, пока скролл доезжает до конца секции.
        .to({}, { duration: 1.2 }, 11);
    },
    { scope: root },
  );

  return (
    <svg
      ref={root}
      className={['mk', className].filter(Boolean).join(' ')}
      viewBox={`-30 -14 ${W + 60} ${H + 28}`}
      overflow="visible"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="mk-sheen" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2={H}>
          {STOPS.map((offset, i) => (
            <stop key={offset} offset={offset} style={{ stopColor: `var(--tpm-${i + 1})` }} />
          ))}
        </linearGradient>
        {/* Блик: узкая полоса под курсивом знака, едущая слева направо. */}
        <linearGradient
          id="mk-sweep"
          className="mk-sweep-grad"
          gradientUnits="userSpaceOnUse"
          x1={W + 40}
          y1="0"
          x2={W + 110}
          y2="0"
          gradientTransform="skewX(-23)"
        >
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.7" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="mk-clip">
          {SHARDS.map(({ id, outline }) => (
            <polygon key={id} points={pts(outline)} />
          ))}
        </clipPath>
        {HATCH_ANGLES.map((angle, i) => (
          <pattern
            key={angle}
            id={`mk-hatch${i}`}
            width="12"
            height="2.2"
            patternUnits="userSpaceOnUse"
            patternTransform={`rotate(${angle})`}
          >
            <rect width="12" height="0.45" fill="#fff" />
          </pattern>
        ))}
        <radialGradient id="mk-glint">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.25" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 1 · разметка */}
      <g className="mk-guides">
        {GUIDES.map(([a, b], i) => (
          <line key={i} className="mk-guide mk-line" x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} pathLength={1} />
        ))}
      </g>

      {/* 3 · текстура (под каркасом: каркас гаснет поверх неё) */}
      {SHARDS.map(({ id, outline }) => (
        <polygon key={id} className="mk-fill" points={pts(outline)} fill="url(#mk-sheen)" />
      ))}
      {FACETS.map(({ key, a, b, c, tone }) => (
        <polygon
          key={key}
          className="mk-facet"
          points={pts([a, b, c])}
          fill={tone > 0 ? '#fff' : '#000'}
          fillOpacity={Math.abs(tone)}
        />
      ))}
      {SHARDS.flatMap(({ id, outline, hatch = [] }) =>
        hatch.map((angle) => (
          <polygon
            key={`${id}${angle}`}
            className="mk-hatch"
            points={pts(outline)}
            fill={`url(#mk-hatch${HATCH_ANGLES.indexOf(angle)})`}
            fillOpacity={0.16}
          />
        )),
      )}

      {/* 2 · каркас */}
      <g className="mk-wires">
        {FACETS.map(({ key, a, b, c }) => (
          <polygon key={key} className="mk-wire mk-line" points={pts([a, b, c])} pathLength={1} />
        ))}
      </g>
      {SHARDS.map(({ id, outline }) => (
        <polygon key={id} className="mk-outline mk-line" points={pts(outline)} pathLength={1} />
      ))}
      <g className="mk-dots">
        {VERTICES.map(([x, y], i) => (
          <circle key={i} className="mk-dot" cx={x} cy={y} r={1.7} />
        ))}
      </g>

      {/* 4 · кромки и блик */}
      <g className="mk-edges">
        {EDGES.map(({ key, a, b, opacity }) => (
          <line
            key={key}
            className="mk-edge mk-line"
            x1={a[0]}
            y1={a[1]}
            x2={b[0]}
            y2={b[1]}
            strokeOpacity={opacity}
            pathLength={1}
          />
        ))}
      </g>
      <rect
        className="mk-sweep"
        clipPath="url(#mk-clip)"
        x={-40}
        y={-10}
        width={W + 80}
        height={H + 20}
        fill="url(#mk-sweep)"
      />

      {/* 5 · искры */}
      {GLINTS.map(([x, y, k]) => (
        <g key={`${x},${y}`} transform={`translate(${x} ${y})`}>
          <g className="mk-glint" data-k={k} opacity={k}>
            <circle r="9" fill="url(#mk-glint)" />
            <ellipse rx="26" ry="1.1" fill="url(#mk-glint)" />
            <ellipse rx="1" ry="12" fill="url(#mk-glint)" />
          </g>
        </g>
      ))}
    </svg>
  );
});
