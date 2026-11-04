import { ICONS, type IconId } from '../icons';
import { BUILDINGS, type HoldState } from '../model/rules';

/**
 * Лагерь сверху: рельефная земля (шум со светом — фильтр SVG), лес по краям, поляна с
 * костром. Постройки стоят на своих местах: готовая — в полный тон, начатая — пунктиром
 * и полупрозрачная, не начатая — не видна. Частокол растёт кольями по прогрессу стены.
 * Рисунок статичен, кроме пламени костра (CSS-анимация прозрачности слоя).
 */

const W = 390;
const H = 250;

/** Деревья по краям — один и тот же лес на сервере и в браузере. */
const TREES: { x: number; y: number; s: number; k: IconId; c: number }[] = (() => {
  let seed = 17;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: { x: number; y: number; s: number; k: IconId; c: number }[] = [];
  const zone = (n: number, x0: number, y0: number, x1: number, y1: number) => {
    for (let i = 0; i < n; i++)
      out.push({
        x: x0 + rnd() * (x1 - x0),
        y: y0 + rnd() * (y1 - y0),
        s: 28 + rnd() * 30,
        k: rnd() < 0.6 ? 'pine' : 'deadtree',
        c: 7 + Math.floor(rnd() * 8),
      });
  };
  zone(26, -20, 0, W + 20, 50);
  zone(9, -20, 40, 50, H);
  zone(9, W - 50, 40, W + 20, H);
  return out.sort((a, b) => a.y - b.y);
})();

function Ico({
  id,
  x,
  y,
  s,
  className,
  fill,
}: {
  id: IconId;
  x: number;
  y: number;
  s: number;
  className?: string;
  fill?: string;
}) {
  return (
    <svg x={x - s / 2} y={y - s / 2} width={s} height={s} viewBox="0 0 512 512" className={className}>
      <path d={ICONS[id]} fill={fill} />
    </svg>
  );
}

const SPOTS = {
  well: { x: 268, y: 168, s: 36 },
  forge: { x: 118, y: 172, s: 32 },
  tower: { x: 322, y: 112, s: 44 },
} as const;

export function CampScene({ s }: { s: HoldState }) {
  const wall = s.buildings.wall;
  const stakes = 28;
  const built = wall.done ? stakes : Math.floor((wall.progress / BUILDINGS.wall.work) * stakes);
  const ring = Array.from({ length: stakes }, (_, i) => {
    const a = Math.PI * (1.06 + (i / (stakes - 1)) * 0.88);
    return { x: 195 + 172 * Math.cos(a), y: 150 + 104 * Math.sin(a) + 2 };
  });
  return (
    <svg className="ah-scene" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-label="The camp">
      <rect width={W} height={H} fill="#2a2219" />
      <rect width={W} height={H} filter="url(#ah-terrain)" />
      <rect width={W} height={H} fill="#0c0907" opacity=".5" />
      <rect width={W} height={H} filter="url(#ah-moss)" opacity=".9" />
      <ellipse cx="195" cy="150" rx="170" ry="96" fill="#3a2e20" opacity=".55" filter="url(#ah-blur)" />
      {TREES.map((t, i) => (
        <Ico key={i} id={t.k} x={t.x} y={t.y - t.s / 2} s={t.s} fill={`rgb(${t.c},${t.c - 2},${t.c - 4})`} />
      ))}
      {ring.map((p, i) =>
        i < built ? (
          <rect key={i} x={p.x - 3} y={p.y - 14} width="6" height="18" fill="#4a3a28" stroke="#120c08" />
        ) : (
          <rect
            key={i}
            x={p.x - 3}
            y={p.y - 14}
            width="6"
            height="18"
            fill="none"
            stroke="#e8913c"
            strokeOpacity=".35"
            strokeDasharray="2 3"
          />
        ),
      )}
      <circle cx="195" cy="150" r="96" fill="url(#ah-light)" className="ah-glow" />
      <Ico id="tent" x={122} y={122} s={46} fill="#7a6a52" />
      <Ico id="tent" x={262} y={118} s={42} fill="#7a6a52" />
      <Ico id="fire" x={195} y={150} s={34} fill="#e8913c" className="ah-flame" />
      {(['well', 'forge', 'tower'] as const).map((id) => {
        const b = s.buildings[id];
        if (!b.started) return null;
        const p = SPOTS[id];
        return (
          <Ico
            key={id}
            id={id}
            x={p.x}
            y={p.y}
            s={p.s}
            fill={b.done ? '#9a8e78' : '#e8913c'}
            className={b.done ? undefined : 'ah-ghost'}
          />
        );
      })}
      <rect width={W} height={H} fill="url(#ah-vig)" />
      <rect width={W} height={H} filter="url(#ah-grain)" opacity=".5" />
    </svg>
  );
}

/** Определения SVG на всю страницу: градиенты и фильтры, на которые ссылаются сцена и иконки. */
export function HoldDefs() {
  return (
    <svg width="0" height="0" className="ah-defs" aria-hidden>
      <defs>
        <linearGradient id="ah-bone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f1e6cc" />
          <stop offset=".55" stopColor="#c7b792" />
          <stop offset="1" stopColor="#7d6f55" />
        </linearGradient>
        <radialGradient id="ah-light" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ff9a40" stopOpacity=".55" />
          <stop offset=".5" stopColor="#e8913c" stopOpacity=".14" />
          <stop offset="1" stopColor="#e8913c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ah-vig" cx="50%" cy="50%" r="72%">
          <stop offset=".45" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".9" />
        </radialGradient>
        <filter id="ah-terrain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".016" numOctaves={6} seed={9} result="n" />
          <feDiffuseLighting in="n" surfaceScale={6} lightingColor="#b8a684" result="l">
            <feDistantLight azimuth={230} elevation={38} />
          </feDiffuseLighting>
          <feColorMatrix in="n" type="matrix" values="0 0 0 .55 0  0 0 0 .45 0  0 0 0 .33 0  0 0 0 0 1" result="c" />
          <feComposite in="l" in2="c" operator="arithmetic" k1={1.1} k2={0} k3={0} k4={0} />
        </filter>
        <filter id="ah-moss" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves={4} seed={21} />
          <feColorMatrix type="matrix" values="0 0 0 0 .1  0 0 0 0 .14  0 0 0 0 .08  0 0 0 2.4 -1.25" />
        </filter>
        <filter id="ah-grain">
          <feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves={2} seed={3} />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .5 -.12" />
        </filter>
        <filter id="ah-blur">
          <feGaussianBlur stdDeviation={3} />
        </filter>
      </defs>
    </svg>
  );
}
