import { useId, type SVGProps } from 'react';

type Pt = readonly [number, number];
/** Грань осколка: треугольник и его тон — плюс светлит белым, минус темнит чёрным. */
type Facet = readonly [Pt, Pt, Pt, number];

/**
 * Осколки знака на сетке 234 × 142: T — перекладина и наклонная ножка, P —
 * перекладина, переходящая в шеврон «>», и ножка под просветом. Просвет P —
 * вырез внутри шеврона, а не отдельная деталь: отдельным треугольником в нём
 * буква читалась «7?». Ножки и левые кромки перекладин стоят на одном
 * наклоне (0.42 по x на единицу высоты), и знак читается курсивом.
 *
 * Грани — триангуляция каждого осколка с тоном на треугольник: в кегле шапки
 * линия грани тоньше пикселя, и «кристалл» читается только перепадом тона
 * между соседними треугольниками, а не обводкой.
 *
 * `crumple` — сила мелких граней «мятого» стекла (0…1): крупные грани должны
 * оставаться главными, и на эскизе мятая только ножка T, чаша P — гладкая.
 * `hatch` — направления тонкой штриховки в градусах: полосы шлифовки вдоль
 * перекладины T и волокна вдоль ножки P.
 */
const SHARDS: {
  id: string;
  outline: readonly Pt[];
  facets: readonly Facet[];
  crumple: number;
  hatch?: readonly number[];
}[] = [
  {
    id: 't-bar',
    crumple: 0.45,
    hatch: [-4],
    outline: [[6, 6], [126, 6], [118, 24], [22, 24]],
    facets: [
      [[6, 6], [62, 6], [44, 14], 0.5],
      [[6, 6], [44, 14], [22, 24], 0.25],
      [[22, 24], [44, 14], [60, 24], -0.25],
      [[44, 14], [62, 6], [78, 17], 0.1],
      [[44, 14], [78, 17], [60, 24], -0.4],
      [[62, 6], [104, 11], [78, 17], -0.15],
      [[62, 6], [126, 6], [104, 11], 0.3],
      [[78, 17], [104, 11], [118, 24], 0.2],
      [[60, 24], [78, 17], [118, 24], -0.3],
      [[104, 11], [126, 6], [118, 24], 0.6],
    ],
  },
  {
    id: 't-stem',
    crumple: 1,
    outline: [[84, 31], [112, 31], [75, 120], [40, 136]],
    facets: [
      [[84, 31], [112, 31], [92, 58], 0.45],
      [[84, 31], [92, 58], [63, 80], 0.15],
      [[112, 31], [98, 65], [92, 58], -0.2],
      [[92, 58], [98, 65], [78, 90], -0.35],
      [[92, 58], [78, 90], [63, 80], 0.05],
      [[63, 80], [78, 90], [52, 108], 0.3],
      [[98, 65], [85, 95], [78, 90], -0.1],
      [[78, 90], [85, 95], [60, 112], -0.45],
      [[78, 90], [60, 112], [52, 108], 0.1],
      [[52, 108], [60, 112], [40, 136], 0.35],
      [[60, 112], [75, 120], [40, 136], -0.25],
      [[85, 95], [75, 120], [60, 112], -0.1],
    ],
  },
  {
    id: 'p-bowl',
    crumple: 0.55,
    // Перекладина (6…24) и шеврон: верхнее плечо x − y = 188 снаружи, 157
    // внутри; нижнее x + y = 268 снаружи, 237 внутри; левая кромка нижнего
    // плеча — тем же курсивом, что ножки.
    outline: [[144, 6], [194, 6], [228, 40], [190, 78], [166, 82], [174, 63], [197, 40], [181, 24], [136.4, 24]],
    facets: [
      [[144, 6], [194, 6], [164, 15], -0.2],
      [[194, 6], [181, 24], [164, 15], -0.45],
      [[181, 24], [136.4, 24], [164, 15], -0.35],
      [[136.4, 24], [144, 6], [164, 15], 0.15],
      [[194, 6], [228, 40], [200, 27.5], 0.55],
      [[228, 40], [197, 40], [200, 27.5], 0.2],
      [[197, 40], [181, 24], [200, 27.5], -0.1],
      [[181, 24], [194, 6], [200, 27.5], 0.35],
      [[197, 40], [228, 40], [197, 55], -0.25],
      [[228, 40], [190, 78], [197, 55], -0.05],
      [[190, 78], [166, 82], [197, 55], -0.45],
      [[166, 82], [174, 63], [197, 55], -0.2],
      [[174, 63], [197, 40], [197, 55], 0.1],
    ],
  },
  {
    id: 'p-stem',
    crumple: 0.35,
    hatch: [-67, 22],
    // Параллельна ножке T, и нижний срез — того же наклона.
    outline: [[134, 62], [167, 54], [139.6, 119.3], [103, 136]],
    facets: [
      [[134, 62], [167, 54], [145, 72], 0.45],
      [[134, 62], [145, 72], [123, 88], 0.15],
      [[167, 54], [158, 76], [145, 72], -0.2],
      [[145, 72], [158, 76], [136, 92], -0.35],
      [[145, 72], [136, 92], [123, 88], 0.05],
      [[123, 88], [136, 92], [112, 114], 0.3],
      [[158, 76], [148.5, 98], [136, 92], -0.1],
      [[136, 92], [148.5, 98], [122, 112], -0.45],
      [[136, 92], [122, 112], [112, 114], 0.1],
      [[112, 114], [122, 112], [103, 136], 0.35],
      [[122, 112], [139.6, 119.3], [103, 136], -0.25],
      [[148.5, 98], [139.6, 119.3], [122, 112], -0.1],
    ],
  },
];

const W = 234;
const H = 142;

const pts = (list: readonly Pt[]) => list.map(([x, y]) => `${x},${y}`).join(' ');

/** Точка внутри многоугольника — чётность пересечений луча. */
function inside([x, y]: Pt, poly: readonly Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** ГПСЧ с зерном (mulberry32): мелкие грани одни и те же на сервере и клиенте. */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CRUMPLE_TONES = [-0.18, -0.11, -0.045, 0.045, 0.11, 0.18] as const;

/**
 * «Мятое» стекло внутри крупных граней: сетка с дрожащими узлами, каждая
 * клетка — два треугольника со случайным тоном, умноженным на `crumple`
 * осколка. Треугольники одного тона собраны в один path — иначе знак в шапке
 * нёс бы сотни узлов DOM, — и посчитаны один раз при загрузке модуля.
 * Берутся только те, что задевают осколок; край по осколку режет clipPath.
 */
const CRUMPLE = (() => {
  const rand = seeded(0x7e11);
  const step = 8;
  const cols = Math.ceil(W / step) + 1;
  const rows = Math.ceil(H / step) + 1;
  const grid: Pt[][] = [];
  for (let r = 0; r < rows; r++) {
    grid.push([]);
    for (let c = 0; c < cols; c++) {
      grid[r].push([
        Math.round(c * step + (rand() - 0.5) * step * 0.8),
        Math.round(r * step + (rand() - 0.5) * step * 0.8),
      ]);
    }
  }
  const mid = (p: Pt, q: Pt): Pt => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const shardOf = ([a, b, c]: readonly Pt[]) => {
    const probes: Pt[] = [[(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3], a, b, c, mid(a, b), mid(b, c), mid(c, a)];
    for (const p of probes) {
      const shard = SHARDS.find((s) => inside(p, s.outline));
      if (shard) return shard;
    }
    return null;
  };
  // Ключ — итоговый тон: сколько разных тонов, столько path.
  const paths = new Map<number, string>();
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c + 1 < cols; c++) {
      const [a, b, cc, d] = [grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]];
      const tris = rand() < 0.5 ? [[a, b, cc], [a, cc, d]] : [[a, b, d], [b, cc, d]];
      for (const tri of tris) {
        const base = CRUMPLE_TONES[Math.floor(rand() * CRUMPLE_TONES.length)];
        const shard = shardOf(tri);
        if (!shard) continue;
        const tone = Math.round(base * shard.crumple * 1000) / 1000;
        paths.set(tone, `${paths.get(tone) ?? ''}M${tri[0]}L${tri[1]}L${tri[2]}Z`);
      }
    }
  }
  return [...paths].map(([tone, d]) => ({ tone, d }));
})();

/**
 * Кромки осколков по отдельности: яркость — от того, насколько кромка
 * смотрит на свет (сверху слева). Одна обводка на весь осколок светилась бы
 * ровно со всех сторон, и объёма у стекла не было бы.
 */
const LIGHT: Pt = [-0.45 / Math.hypot(0.45, 1), -1 / Math.hypot(0.45, 1)];
const EDGES = SHARDS.flatMap(({ id, outline }) =>
  outline.map((a, i) => {
    const b = outline[(i + 1) % outline.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let n: Pt = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len];
    if (inside([(a[0] + b[0]) / 2 + n[0], (a[1] + b[1]) / 2 + n[1]], outline)) n = [-n[0], -n[1]];
    const facing = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1]);
    return { key: `${id}-${i}`, a, b, opacity: Math.round((0.25 + 0.75 * facing) * 100) / 100 };
  }),
);

/** Искры на углах: x, y, сила 0…1. Самая яркая — на конце перекладины T, как на эскизе. */
const GLINTS: readonly (readonly [number, number, number])[] = [
  [126, 6, 1],
  [194, 6, 0.6],
  [228, 40, 0.45],
  [40, 136, 0.55],
  [139.6, 119.3, 0.5],
  [112, 31, 0.35],
];

const HATCH_ANGLES = [...new Set(SHARDS.flatMap((s) => s.hatch ?? []))];

/** Пять стопов отлива — имена из globals.css (`--tpm-1`…`--tpm-5`), у каждой темы свои. */
const STOPS = [0, 0.33, 0.52, 0.78, 1] as const;

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
