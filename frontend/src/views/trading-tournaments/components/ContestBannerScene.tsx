import { useId, type CSSProperties } from 'react';

/**
 * Широкая версия сцены с карточки торговли (`TradingScene` на /games) — те же
 * токены и анимация (`.tscene`/`.tsc-*`, globals.css), но своя геометрия:
 * портретный кадр карточки (384×514) в полосу без вертикального запаса не
 * ложится. Пола и отражения здесь нет — баннер про турнир целиком, а не про
 * одну сделку, и ряд свечей занимает всю высоту сцены, а не половину над
 * плоскостью.
 *
 * Ряд втрое плотнее карточки (48 баров на всю ширину баннера вместо 14 на
 * узкий кадр) — банер во весь экран, и полтора десятка свечей на нём стояли
 * бы редкими точками. Серия строится генератором, а не таблицей чисел
 * руками: значений в три раза больше, а ручная подгонка каждого бара давала
 * бы то же самое на глаз, только дольше. Генератор — случайное блуждание с
 * редкими всплесками волатильности, а не гладкая синусоида: настоящий график
 * дёргается баром от бара, а не колышется волной. Он детерминированный
 * (сид фиксирован, `Math.random` не используется), чтобы сервер и клиент
 * нарисовали один и тот же ряд.
 */
const N = 48;
const W = 1200;
const H = 300;
const STEP = 24.9;
const BW = 14;
const X0 = 15;
const Y_TOP = 24;
const Y_BOT = H - 24;
const SEED = 913;

const TONES = [
  'var(--ts-1)',
  'var(--ts-2)',
  'var(--ts-3)',
  'var(--ts-4)',
  'var(--ts-5)',
  'var(--ts-6)',
  'var(--ts-7)',
];

/** mulberry32 — маленький детерминированный PRNG: тот же сид даёт тот же ряд на сервере и в браузере. */
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Случайное блуждание с лёгким сносом вверх и редкими всплесками — ряд, у
 * которого нет предсказуемого периода, как на настоящем графике. Открытие
 * каждого бара равно закрытию предыдущего; фитили — два независимых броска,
 * а не общий «хвост» на обе стороны, иначе верх и низ свечи всегда выходили
 * бы зеркальными.
 */
const buildSeries = (n: number): [number, number, number, number][] => {
  const rand = mulberry32(SEED);
  const closes: number[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const drift = 0.5;
    const step = (rand() - 0.48) * 5.6;
    const burst = rand() < 0.16 ? (rand() - 0.3) * 11 : 0;
    price += drift + step + burst;
    closes.push(price);
  }
  return closes.map((close, i) => {
    const open = i === 0 ? close - (rand() - 0.5) * 4 : closes[i - 1];
    const body = Math.abs(close - open);
    const up = rand() * (1.4 + body * 0.55);
    const dn = rand() * (1.4 + body * 0.55);
    return [open, Math.max(open, close) + up, Math.min(open, close) - dn, close];
  });
};

const SERIES = buildSeries(N);
const ALL_PRICES = SERIES.flat();
const P_MIN = Math.min(...ALL_PRICES);
const P_MAX = Math.max(...ALL_PRICES);

const priceY = (p: number) => Y_BOT - ((p - P_MIN) / (P_MAX - P_MIN)) * (Y_BOT - Y_TOP);

const toneIndex = (close: number) => {
  const t = (close - P_MIN) / (P_MAX - P_MIN);
  return Math.min(5, Math.max(1, Math.round(1 + t * 4)));
};

type Bar = {
  i: number;
  x: number;
  top: number;
  bottom: number;
  high: number;
  low: number;
  body: string;
  edge: string;
};

const BARS: Bar[] = SERIES.map(([open, high, low, close], i) => {
  const up = close >= open;
  const tone = toneIndex(close);
  const top = priceY(Math.max(open, close));
  const bottom = priceY(Math.min(open, close));
  return {
    i,
    x: X0 + i * STEP,
    top,
    bottom: Math.max(bottom, top + 2),
    high: priceY(high),
    low: priceY(low),
    body: up ? TONES[tone] : 'var(--ts-dark)',
    edge: TONES[tone + 1],
  };
});

const axis = (b: Bar) => b.x + BW / 2;
/** Доля пути бара по ряду — на неё завязана амплитуда хода в анимации. */
const frac = (b: Bar) => b.i / (BARS.length - 1);

function Candle({ bar }: { bar: Bar }) {
  const { x, top, bottom, high, low, body, edge } = bar;
  const cx = axis(bar);
  return (
    <>
      <rect x={cx - 0.75} y={high} width="1.5" height={low - high} fill={edge} opacity="0.85" />
      <rect x={x} y={top} width={BW} height={bottom - top} fill={body} stroke={edge} strokeWidth="1" />
    </>
  );
}

function Bars() {
  return (
    <>
      {BARS.map((bar) => (
        <g
          key={bar.x}
          className="tsc-bar"
          style={{ '--i': bar.i, '--amp': Math.round((2 + 7 * frac(bar)) * 10) / 10 } as CSSProperties}
        >
          <Candle bar={bar} />
        </g>
      ))}
    </>
  );
}

/**
 * id баннер: у зарева есть SVG-фильтр, и его id идёт с префиксом из useId —
 * страница может смонтировать баннер не один раз (например, в предпросмотре
 * формы турнира), а общий id в двух `<svg>` сломал бы фильтр второго
 * экземпляра — он сослался бы на первый.
 */
export function ContestBannerScene() {
  const uid = useId().replace(/:/g, '');
  const auraFilter = `${uid}-aura`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} fill="none" preserveAspectRatio="xMidYMid slice" aria-hidden className="tscene cscene">
      <defs>
        <filter id={auraFilter} x="-70%" y="-70%" width="240%" height="240%">
          <feGaussianBlur stdDeviation="26" />
        </filter>
      </defs>

      <g className="tsc-aura">
        <ellipse cx={W * 0.78} cy={H * 0.3} rx="220" ry="120" fill="var(--ts-4)" opacity="0.14" filter={`url(#${auraFilter})`} />
        <ellipse cx={W * 0.18} cy={H * 0.85} rx="260" ry="90" fill="var(--ts-4)" opacity="0.16" filter={`url(#${auraFilter})`} />
      </g>

      <g stroke="var(--ts-4)" strokeWidth="0.75" opacity="0.1">
        {[0.25, 0.5, 0.75].map((f) => {
          const p = P_MIN + f * (P_MAX - P_MIN);
          return <line key={f} x1="0" y1={priceY(p)} x2={W} y2={priceY(p)} />;
        })}
      </g>

      <Bars />

      <g className="tsc-sparks">
        {[
          [W * 0.1, 3.2, 0],
          [W * 0.28, 2.4, 1],
          [W * 0.46, 3, 2],
          [W * 0.64, 2.6, 3],
          [W * 0.82, 2.8, 4],
          [W * 0.94, 2.2, 5],
        ].map(([x, r, i]) => (
          <circle key={x} className="tsc-spark" style={{ '--i': i } as CSSProperties} cx={x} cy={Y_BOT - 10} r={r} fill="var(--ts-5)" />
        ))}
      </g>
    </svg>
  );
}
