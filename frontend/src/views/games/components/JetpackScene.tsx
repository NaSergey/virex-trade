'use client';

import { useRef, type CSSProperties } from 'react';
import { Embers, Float, type Ember, type Motion } from './CasinoScene';
import { Art, Fill } from './SceneLayer';
import { FlameBoost, FlameGlow, FlamePlume, RocketDefs, RocketHalo, RocketHull } from '@/shared/ui/rocket';
import { formatMultiplier } from '../lib/multiplier-roll';
import { FULL, boxAround, boxStyle, originIn, rectCorners, toScene, type Box, type Pt } from '../lib/scene-box';
import { useMultiplierRoll } from '../model/useMultiplierRoll';
import { usePauseOffscreen } from '../model/usePauseOffscreen';
import { usePlayOnHover } from '../model/usePlayOnHover';

/**
 * Сцена джетпака — `jetpack.webp`, собранный кодом: та же композиция, координаты
 * сняты со снимка по сетке. Снимок не двигается, а у crash-игры есть что
 * показать движением: ракета летит, пламя бьёт, множитель растёт.
 *
 * Парение и искры — детали карточных сцен (`Float`, `Embers`), краска — та же
 * шкала `--csn-*` на акценте игры (`.jscene` в globals.css). Своё здесь —
 * ракета, пламя, дым, траектория и плашки множителей.
 *
 * В покое точки траектории вспыхивают снизу вверх, а следом загораются плашки
 * 1.8x → 3.4x → 12.6x — ставка растёт, пока ракета летит. Под курсором —
 * рывок: ракета приседает назад и выстреливает по своей оси, пламя
 * вытягивается почти вдвое и вспыхивает, корпус коротко дрожит, старший
 * множитель подрастает (`.jsc-launch`, `.jsc-thrust`, `.jsc-boost`,
 * `.jsc-shake`, `.jsc-peak`). Плашки светлеют целиком, числа на них
 * перебором растут выше своих и возвращаются, когда курсор уходит (`.jsc-lit`,
 * `useMultiplierRoll`).
 */

const P = 'jp';
const url = (name: string) => `url(#${P}-${name})`;

/* ── ракета ────────────────────────────────────────────── */

/**
 * Ракета рисуется в своей системе: хвост (центр среза корпуса) в нуле, нос
 * вверх, x — поперёк оси. В кадр её ставит поворот на угол оси от вертикали —
 * хвост и нос встают туда же, где они на снимке: (194, 311) и (321, 181).
 * Свет в своей системе приходит слева (−x): в кадре это верхний левый борт.
 */
const TAIL: Pt = [194, 311];
const ROT = 44;
const AT = `translate(${TAIL[0]} ${TAIL[1]}) rotate(${ROT})`;
const local = (p: Pt) => toScene(TAIL, ROT, p);

/** Срез сопла — отсюда растёт пламя и вокруг него оно дрожит. */
const NOZZLE = local([0, 26]);

/** Рамка корабля — ракета, пламя и их свечение с запасом под взлёт. */
const SHIP_BOX: Box = boxAround(
  (
    [
      [-62, 50],
      [70, -20],
      [0, -186],
      [-40, 150],
      [40, 150],
      [0, 330],
    ] as Pt[]
  ).map(local),
  40,
);

/** Корабль парит медленно и почти без наклона: он летит, а не качается. */
const SHIP_MOTION: Motion = { dur: 5200, delay: 0, lift: 7, sway: 0.8, glow: 2300 };


/* ── пламя ─────────────────────────────────────────────── */


/**
 * Пламя — слои внутри слоя дрожи: свечение (дышит само, `.csn-neon`), факел
 * с ядром и форсаж (`.jsc-boost`), который загорается только под курсором.
 * Дрожь и вытягивание под курсором — сжатие вдоль оси ракеты вокруг среза
 * сопла (`.jsc-flame`, `.jsc-thrust`). Свечение не заходит выше среза: за
 * корпусом оно выглядело бы светом, который идёт из-за ракеты.
 */
function Flame() {
  const origin = originIn(SHIP_BOX, NOZZLE);
  return (
    <Fill className="jsc-thrust" style={{ transformOrigin: origin, '--rot': `${ROT}deg` } as CSSProperties}>
      <Fill className="jsc-flame" style={{ transformOrigin: origin }}>
        <Fill className="csn-neon">
          <Art box={SHIP_BOX}>
            <FlameGlow prefix={P} transform={AT} />
          </Art>
        </Fill>
        <Art box={SHIP_BOX}>
          <FlamePlume prefix={P} transform={AT} />
        </Art>
      </Fill>
      <Fill className="jsc-boost">
        <Art box={SHIP_BOX}>
          <FlameBoost prefix={P} transform={AT} />
        </Art>
      </Fill>
    </Fill>
  );
}

/* ── дым ───────────────────────────────────────────────── */

type Puff = [x: number, y: number, r: number];

/**
 * Дальние клубы — тёмные, это они касаются левого и нижнего края кадра:
 * светлое пятно, упёртое в кромку, читалось бы полосой по краю карточки.
 */
const FAR: Puff[] = [
  [10, 318, 20],
  [34, 334, 18],
  [4, 350, 22],
  [52, 356, 16],
  [24, 372, 22],
  [62, 384, 16],
  [6, 398, 24],
  [40, 404, 20],
  [16, 430, 24],
  [0, 462, 28],
  [352, 466, 14],
  [306, 468, 16],
  [244, 470, 16],
  [34, 474, 26],
  [204, 474, 16],
  [226, 482, 22],
  [150, 484, 26],
  [292, 484, 22],
  [360, 486, 22],
  [70, 488, 30],
  [112, 494, 30],
  [260, 494, 26],
  [392, 494, 26],
  [190, 496, 28],
  [326, 496, 26],
  [20, 508, 24],
  [90, 512, 26],
  [170, 512, 26],
  [384, 512, 24],
  [250, 514, 26],
  [330, 514, 26],
];

/** Ближние клубы — у пламени, подсвечены им и стоят целиком внутри кадра. */
const NEAR: Puff[] = [
  [54, 400, 16],
  [76, 410, 18],
  [98, 420, 16],
  [42, 424, 18],
  [66, 432, 20],
  [118, 436, 16],
  [92, 440, 20],
  [138, 446, 16],
  [50, 452, 20],
  [80, 458, 22],
  [112, 458, 20],
  [146, 462, 18],
  [172, 468, 16],
  [196, 474, 14],
  [62, 478, 18],
  [100, 480, 20],
  [136, 482, 18],
];

/**
 * Струйки над клубами — толстые штрихи, которые тот же шум закручивает в
 * завитки: без них верх дыма обрывался ровной кромкой облака.
 */
const FAR_WISPS = ['M8 300 C20 284 6 268 18 250', 'M40 322 C54 304 42 288 58 270', 'M26 370 C8 352 20 334 6 318'];
const NEAR_WISPS = ['M58 396 C72 378 60 360 78 344', 'M104 418 C118 400 108 384 126 370', 'M150 446 C166 430 156 414 174 400'];

/**
 * Клубы рисуются сверху вниз: нижний ближе к зрителю и ложится поверх. Дымом,
 * а не гроздью шаров, их делает фильтр (`jp-cloud-*`): шум рвёт и закручивает
 * край, второй шум делает плотность неровной, а размытая копия под ними —
 * дымку, которой клуб расходится в воздухе.
 */
function Puffs({
  puffs,
  fill,
  wisps,
  wisp,
  seed,
}: {
  puffs: Puff[];
  fill: (p: Puff) => string;
  wisps: string[];
  wisp: string;
  seed: 'a' | 'b';
}) {
  return (
    <g filter={url(`cloud-${seed}`)}>
      <g stroke={wisp} strokeWidth="9" strokeLinecap="round" opacity="0.7">
        {wisps.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      {puffs.map((p) => (
        <circle key={`${p[0]}:${p[1]}`} cx={p[0]} cy={p[1]} r={p[2]} fill={fill(p)} />
      ))}
    </g>
  );
}

/** Ближний клуб светится, только пока он у пламени: ниже он уходит в полутень. */
const nearFill = ([, y]: Puff) => url(y < 455 ? 'smoke-lit' : 'smoke-mid');

/* ── траектория ────────────────────────────────────────── */

/** Опорные точки кривой множителя, снизу вверх. */
const PATH_PTS: Pt[] = [
  [132, 450],
  [170, 438],
  [220, 423],
  [263, 392],
  [306, 345],
  [341, 297],
  [372, 240],
];

/** Кривая через опорные точки (Catmull-Rom): точки траектории лежат ровно на ней. */
function smooth(pts: Pt[]) {
  const at = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const n = (v: number) => +v.toFixed(2);
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);
    d += ` C${n(x1 + (x2 - x0) / 6)} ${n(y1 + (y2 - y0) / 6)} ${n(x2 - (x3 - x1) / 6)} ${n(y2 - (y3 - y1) / 6)} ${x2} ${y2}`;
  }
  return d;
}

const TRAJECTORY = smooth(PATH_PTS);

/** Точки на кривой — опорные без крайних; радиус ядра по снимку. */
const DOTS: [x: number, y: number, r: number][] = [
  [170, 438, 2],
  [220, 423, 4.2],
  [263, 392, 4.5],
  [306, 345, 5.5],
  [341, 297, 3.8],
];

/** Ореол точки — во столько раз шире её ядра. */
const HALO = 3;

/* ── множители ─────────────────────────────────────────── */

type Plate = {
  /** Множитель на плашке; подпись — `formatMultiplier`. */
  value: number;
  /**
   * Множитель под курсором: число перебором растёт до него и возвращается,
   * когда курсор уходит. Рост круче от младшей плашки к старшей — ракета
   * разгоняется.
   */
  boost: number;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  size: number;
  /** Яркость плашки: средняя на снимке тусклее соседних. */
  tone: number;
  motion: Motion;
  /** Старший множитель — вспыхивает сильнее и подрастает под курсором. */
  peak?: boolean;
};

const PLATES: Plate[] = [
  { value: 1.8, boost: 2.6, x: 68, y: 228, w: 84, h: 43, rot: -13, size: 23, tone: 0.82, motion: { dur: 6200, delay: 600, lift: 4, sway: 0.6, glow: 3400 } },
  { value: 3.4, boost: 5.9, x: 160, y: 172, w: 82, h: 43, rot: -13, size: 22, tone: 0.62, motion: { dur: 5600, delay: 1500, lift: 5, sway: -0.5, glow: 4100 } },
  { value: 12.6, boost: 25.3, x: 287, y: 112, w: 118, h: 50, rot: -14, size: 30, tone: 1, motion: { dur: 6800, delay: 200, lift: 6, sway: 0.8, glow: 3000 }, peak: true },
];

/**
 * Числа на снимке набраны округлым гротеском; в продукте такого нет (засечки
 * и моноширинный), а моноширинный разносит точку и «x» на целую клетку.
 */
const PLATE_FONT = "system-ui, 'Segoe UI', sans-serif";

/**
 * Яркость неона плашки: почти полная у всех, у тусклой плашки чуть ниже.
 * Заливка и число гаснут по `tone` целиком — неон нет: приглушённый, он
 * делал блок тусклым.
 */
const NEON = (tone: number) => 0.7 + 0.3 * tone;

/** Запас рамки плашки — под вспышку наведения (обводка 10, размытие 12). */
const PLATE_MARGIN = 44;

/**
 * Плашка — слои: вспышка наведения, дыхание неона, вспышка роста в покое
 * (`.jsc-flash`, по очереди от младшей к старшей), сама плашка, подсветка
 * наведения (`.jsc-lit`) и число.
 *
 * Под курсором светлеет каждая плашка целиком — заливка, рамка, неон и
 * цифры, — а число перебором растёт выше своего значения и возвращается,
 * когда курсор уходит (`useMultiplierRoll`). Число — свой слой: перебор
 * меняет его текст на каждом кадре, и перерисовываться при этом должен
 * маленький SVG с цифрами, а не плашка со всеми размытиями.
 */
function Plates() {
  return (
    <>
      {PLATES.map((pl, i) => {
        const box = boxAround(rectCorners([pl.x, pl.y], pl.w, pl.h, pl.rot), PLATE_MARGIN);
        const at = `translate(${pl.x} ${pl.y}) rotate(${pl.rot})`;
        const edge = { x: -pl.w / 2, y: -pl.h / 2, width: pl.w, height: pl.h, rx: 8 };
        const baseline = pl.size * 0.36;
        const label = formatMultiplier(pl.value);
        return (
          <Float key={label} box={box} motion={pl.motion} origin={[pl.x, pl.y]} hover={pl.peak ? 'jsc-peak' : undefined}>
            <Fill className="csn-flare">
              <Art box={box}>
                <rect
                  {...edge}
                  transform={at}
                  stroke="var(--csn-4)"
                  strokeWidth={pl.peak ? 10 : 8}
                  opacity={pl.peak ? 1 : 0.7}
                  filter={url('flare')}
                />
              </Art>
            </Fill>
            <Fill className="csn-neon">
              <Art box={box}>
                <rect {...edge} transform={at} stroke="var(--csn-4)" strokeWidth="6" opacity={NEON(pl.tone)} filter={url('glow')} />
              </Art>
            </Fill>
            <Fill className="jsc-flash" style={{ '--i': i } as CSSProperties}>
              <Art box={box}>
                <rect
                  {...edge}
                  transform={at}
                  fill="var(--csn-4)"
                  fillOpacity="0.18"
                  stroke="#a974ff"
                  strokeWidth="6"
                  filter={url('glow')}
                />
              </Art>
            </Fill>
            <Art box={box}>
              <rect
                {...edge}
                transform={at}
                opacity={pl.tone}
                fill={pl.peak ? url('plate-peak') : '#12082e'}
                fillOpacity={pl.peak ? 1 : 0.55}
              />
              {/* Кромка — фиолетовая трубка неона, а не белая линия, и яркость
                  плашки её почти не гасит: светлая кромка читалась белой
                  рамкой, а приглушённая — тусклым блоком. */}
              <rect {...edge} transform={at} stroke="#a974ff" strokeWidth="1.6" opacity={NEON(pl.tone)} />
            </Art>
            <Fill className="jsc-lit">
              <Art box={box}>
                <g transform={at}>
                  <rect {...edge} stroke="var(--csn-4)" strokeWidth="8" filter={url('glow')} />
                  <rect {...edge} fill="var(--csn-4)" fillOpacity="0.3" stroke="#b98aff" strokeWidth="1.8" />
                </g>
              </Art>
            </Fill>
            <Art box={box}>
              <g
                className="jsc-digits"
                transform={at}
                textAnchor="middle"
                fontFamily={PLATE_FONT}
                fontSize={pl.size}
                fontWeight={pl.peak ? 700 : 600}
                opacity={Math.max(pl.tone, 0.85)}
                data-roll={pl.value}
                data-roll-to={pl.boost}
                data-roll-i={i}
              >
                <text
                  className="jsc-num-glow"
                  y={baseline}
                  stroke="var(--csn-4)"
                  strokeWidth="3"
                  opacity="0.6"
                  filter={url('soft')}
                >
                  {label}
                </text>
                <text className="jsc-num" y={baseline} fill="var(--csn-6)">
                  {label}
                </text>
              </g>
            </Art>
          </Float>
        );
      })}
    </>
  );
}

/* ── искры ─────────────────────────────────────────────── */

const EMBERS: Ember[] = [
  [40, 430, 1.8, 8],
  [92, 452, 2.2, -6],
  [132, 440, 1.6, 10],
  [176, 466, 2, -8],
  [64, 396, 1.5, 6],
  [210, 470, 1.7, -5],
  [22, 462, 2, 6],
];

/* ── сцена ─────────────────────────────────────────────── */

export function JetpackScene() {
  const ref = useRef<HTMLDivElement>(null);
  usePauseOffscreen(ref);
  // Дрожь корпуса на рывке доигрывает до конца: наведение ставит data-play,
  // снимает его конец дрожи (jsc-shake).
  usePlayOnHover(ref, 'jsc-shake');
  useMultiplierRoll(ref);
  return (
    <div ref={ref} className="gscene csn jscene" aria-hidden>
      {/* Неподвижное: определения и фон — глубокий фиолетовый к центру, в
          почти чёрный у краёв, чтобы кромка карточки не светилась. */}
      <Art box={FULL}>
        <SceneDefs />
        <rect x="0" y="0" width="384" height="514" fill={url('bg')} />
      </Art>

      {/* Зарево за ракетой и над дымом; дышит прозрачность слоя. */}
      <Fill className="csn-aura">
        <Art box={FULL}>
          <g filter={url('aura')} fill="var(--csn-3)">
            <ellipse cx="250" cy="256" rx="100" ry="96" opacity="0.18" />
            <ellipse cx="290" cy="112" rx="80" ry="44" opacity="0.1" />
            <ellipse cx="110" cy="430" rx="120" ry="64" opacity="0.4" />
            <ellipse cx="320" cy="470" rx="80" ry="36" opacity="0.18" />
          </g>
        </Art>
      </Fill>

      <Fill className="jsc-smoke-far">
        <Art box={FULL}>
          <Puffs puffs={FAR} fill={() => url('smoke-dim')} wisps={FAR_WISPS} wisp="#3a2596" seed="a" />
        </Art>
      </Fill>

      {/* Траектория: кривая неподвижна, точки на ней вспыхивают снизу вверх. */}
      <Art box={FULL}>
        <path d={TRAJECTORY} stroke="var(--csn-4)" strokeWidth="4" opacity="0.7" filter={url('glow-sm')} />
        <path d={TRAJECTORY} stroke={url('trail')} strokeWidth="1.3" />
      </Art>
      {DOTS.map(([x, y, r], i) => (
        <i
          key={x}
          className="jsc-dot"
          style={{ ...boxStyle({ x: x - r * HALO, y: y - r * HALO, w: 2 * r * HALO, h: 2 * r * HALO }), '--i': i } as CSSProperties}
        />
      ))}

      <Float box={SHIP_BOX} motion={SHIP_MOTION} origin={local([0, -90])} hover="jsc-launch">
        <Fill className="jsc-shake">
          {/* Контровой ореол: ракета светится по силуэту от пламени и зарева. */}
          <Fill className="csn-neon">
            <Art box={SHIP_BOX}>
              <RocketHalo prefix={P} transform={AT} />
            </Art>
          </Fill>
          <Flame />
          <Art box={SHIP_BOX}>
            <g transform={AT}>
              <RocketHull prefix={P} />
            </g>
          </Art>
        </Fill>
      </Float>

      {/* Ближний дым ложится на хвост пламени, как на снимке. */}
      <Fill className="jsc-smoke-near" style={{ transformOrigin: originIn(FULL, [100, 450]) }}>
        <Art box={FULL}>
          <Puffs puffs={NEAR} fill={nearFill} wisps={NEAR_WISPS} wisp="#7a5cf0" seed="b" />
          {/* Свет пламени на клубах. */}
          <ellipse cx="104" cy="424" rx="50" ry="28" fill="#d5b8ff" opacity="0.42" filter={url('glow')} />
        </Art>
      </Fill>

      <Plates />
      <Embers embers={EMBERS} />
    </div>
  );
}

/* ── определения ───────────────────────────────────────── */

/**
 * Фильтры и градиенты сцены — все id с префиксом `jp`: на странице стоят и
 * другие сцены, и одинаковый id разрешался бы в первое определение документа.
 * Градиенты ракеты — в её собственной системе (`userSpaceOnUse` внутри
 * повёрнутой группы), поэтому свет поворачивается вместе с ней.
 */
function SceneDefs() {
  const id = (name: string) => `${P}-${name}`;
  return (
    <defs>
      {/* Ракета и пламя — общий рисунок (`shared/ui/rocket.tsx`). Его фильтры
          blur/soft/plume/glow берут и плашки с дымом: префикс у них тот же. */}
      <RocketDefs prefix={P} />
      <filter id={id('glow-sm')} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" />
      </filter>
      <filter id={id('flare')} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="12" />
      </filter>
      <filter id={id('aura')} x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="28" />
      </filter>

      <radialGradient id={id('bg')} cx="0.6" cy="0.5" r="0.75">
        <stop offset="0" stopColor="#070515" />
        <stop offset="0.5" stopColor="#04030c" />
        <stop offset="1" stopColor="#020205" />
      </radialGradient>



      {/* Клуб освещён сверху и уходит в тень книзу, а не по кругу: тёмный
          ободок вокруг каждого клуба собирал дым в гроздь шаров. Перекрытие
          даёт светлый верх переднего клуба на тёмном низе заднего. */}
      <linearGradient id={id('smoke-lit')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#9a7aff" />
        <stop offset="0.25" stopColor="#6a48e6" />
        <stop offset="0.6" stopColor="#33199a" />
        <stop offset="1" stopColor="#1a0d5a" />
      </linearGradient>
      <linearGradient id={id('smoke-mid')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#6040d8" />
        <stop offset="0.3" stopColor="#3d22b0" />
        <stop offset="0.7" stopColor="#22117a" />
        <stop offset="1" stopColor="#140a48" />
      </linearGradient>
      <linearGradient id={id('smoke-dim')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3a2596" />
        <stop offset="0.35" stopColor="#22137a" />
        <stop offset="1" stopColor="#0f0838" />
      </linearGradient>
      {/* Дым из кругов. Шум сдвигает пиксели края — клубы рвутся и
          закручиваются; второй шум, переведённый в прозрачность, делает
          плотность неровной (от 40 % до сплошной); размытая копия на
          половине прозрачности ложится под всё — дымка вокруг клубов. Два
          зерна — у дальнего и ближнего дыма разный рисунок. Слой статичный:
          фильтр считается один раз, движется уже готовая картинка. */}
      {(['a', 'b'] as const).map((seed, i) => (
        <filter key={seed} id={id(`cloud-${seed}`)} x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.022 0.035" numOctaves="4" seed={7 + i * 12} result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="26" xChannelSelector="R" yChannelSelector="G" result="torn" />
          <feGaussianBlur in="torn" stdDeviation="3" result="soft" />
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="3" seed={31 + i * 12} result="grain" />
          <feColorMatrix in="grain" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.6 0 0 0 -0.1" result="density" />
          <feComposite in="soft" in2="density" operator="in" result="thin" />
          <feGaussianBlur in="torn" stdDeviation="10" result="haze" />
          <feComponentTransfer in="haze" result="veil">
            <feFuncA type="linear" slope="0.5" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="veil" />
            <feMergeNode in="thin" />
          </feMerge>
        </filter>
      ))}

      <linearGradient id={id('plate-peak')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3a1f9e" stopOpacity="0.75" />
        <stop offset="1" stopColor="#1c0d58" stopOpacity="0.75" />
      </linearGradient>

      {/* Кривая проявляется из дыма и гаснет за последней точкой. */}
      <linearGradient id={id('trail')} gradientUnits="userSpaceOnUse" x1="132" y1="0" x2="372" y2="0">
        <stop offset="0" stopColor="var(--csn-5)" stopOpacity="0" />
        <stop offset="0.16" stopColor="var(--csn-5)" />
        <stop offset="0.86" stopColor="var(--csn-5)" />
        <stop offset="1" stopColor="var(--csn-5)" stopOpacity="0.15" />
      </linearGradient>
    </defs>
  );
}
