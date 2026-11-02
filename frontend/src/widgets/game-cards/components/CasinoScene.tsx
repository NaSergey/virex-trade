import type { CSSProperties, ReactNode, Ref } from 'react';
import { SUIT_SHAPES, type Suit } from '@/shared/ui/suits';
import {
  FULL,
  SCENE_H,
  boxAround,
  boxStyle,
  originIn,
  rectCorners,
  toScene,
  type Box,
  type Pt,
} from '../lib/scene-box';
import { Art, Fill, Place } from './SceneLayer';

/**
 * Детали сцен карточных игр витрины — покера и блэкджека: карта, фишка, пол
 * с отражением, искры. Сцена сама решает, что стоит в кадре и как движется
 * под курсором; здесь — только то, из чего она собрана. Парение (`Float`) и
 * искры (`Embers`) берёт и сцена джетпака.
 *
 * Каждый предмет — стопка HTML-слоёв (`SceneLayer.tsx`): движение, свечение и
 * переворот живут на слоях и идут на видеокарте, а SVG внутри слоя рисуется
 * один раз. Внутри SVG ничего не анимируется — иначе браузер перерисовывал бы
 * его на каждом кадре вместе со всеми размытиями.
 *
 * Краски — токены `--csn-*`, их задаёт класс сцены (`.pscene`, `.bscene` в
 * globals.css): одна и та же карта горит красным у покера и зелёным у
 * блэкджека.
 *
 * id определений (градиенты, фильтры) — с префиксом сцены `p`. Обе сцены стоят
 * на одной странице, и одинаковый id разрешался бы в первое определение
 * документа: градиент с `var()` брал бы краски чужой сцены, и блэкджек горел
 * бы красным.
 */

const url = (p: string, name: string) => `url(#${p}-${name})`;

/**
 * Ритм предмета. Периоды и задержки у всех разные, и цикл каждого замкнут
 * (кадр 0 % = кадр 100 % = собранная сцена): `prefers-reduced-motion`
 * обрывает анимацию на первой итерации, и кадр обязан остаться собранным.
 */
export type Motion = {
  /** Период подъёма, мс. */
  dur: number;
  /** Задержка старта, мс: до неё предмет стоит в собранном положении. */
  delay: number;
  /** Высота подъёма, единицы сцены. */
  lift: number;
  /** Наклон в верхней точке, градусы. */
  sway: number;
  /** Период дыхания неона, мс. */
  glow: number;
};

export const motionStyle = (m: Motion) =>
  ({
    '--dur': `${m.dur}ms`,
    '--delay': `${m.delay}ms`,
    '--lift': m.lift,
    '--sway': `${m.sway}deg`,
    '--glow': `${m.glow}ms`,
  }) as CSSProperties;

/* ── сцена ─────────────────────────────────────────────── */

/**
 * Корень сцены: определения, отсвет пола и слои предметов поверх. `scene` —
 * класс краски (`pscene`, `bscene`).
 */
export function CasinoStage({
  p,
  scene,
  floor,
  stageRef,
  children,
}: {
  p: string;
  scene: string;
  floor: number;
  stageRef: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div ref={stageRef} className={`gscene csn ${scene}`} aria-hidden>
      <Art box={FULL}>
        <SceneDefs p={p} />
        <rect x="0" y={floor} width="384" height={SCENE_H - floor} fill={url(p, 'floor')} />
      </Art>
      {children}
    </div>
  );
}

/**
 * Предмет в кадре — вложенные слои во всю его рамку: реакция на курсор
 * (`hover`, класс сцены, CSS-переход) и парение (CSS-анимация). В одном узле
 * они стёрли бы друг друга: у обоих `transform`.
 *
 * `origin` — точка поворота парения в координатах сцены (центр предмета или
 * низ карты), `hoverOrigin` — точка поворота под курсором.
 */
export function Float({
  box,
  motion,
  origin,
  hover,
  hoverOrigin,
  children,
}: {
  box: Box;
  motion: Motion;
  origin: Pt;
  hover?: string;
  hoverOrigin?: Pt;
  children: ReactNode;
}) {
  const float = (
    <Fill className="csn-float" style={{ ...motionStyle(motion), transformOrigin: originIn(box, origin) }}>
      {children}
    </Fill>
  );
  return (
    <Place box={box}>
      {hover ? (
        <Fill className={`csn-hover ${hover}`} style={{ transformOrigin: originIn(box, hoverOrigin ?? origin) }}>
          {float}
        </Fill>
      ) : (
        float
      )}
    </Place>
  );
}

/* ── карты ─────────────────────────────────────────────── */

export type CardSpec = {
  id: string;
  rank: string;
  suit: Suit;
  /**
   * Материал масти: сталь или свет сцены. На чёрной карте масти различаются
   * материалом, а не только цветом.
   */
  tone: 'steel' | 'glow';
  x: number;
  y: number;
  rot: number;
  w: number;
  h: number;
  motion: Motion;
  /** Класс слоя наведения: как карта ведёт себя под курсором, решает сцена. */
  hover?: string;
  /**
   * Точка поворота парения: центр карты (по умолчанию) или её нижний край —
   * тогда наклон раскрывает пару карт, как в руке (тузы покера).
   */
  pivot?: 'center' | 'bottom';
  /**
   * Карта время от времени переворачивается рубашкой вверх и обратно
   * (`.csn-flip`). В покое она лежит лицом: переворот — короткий жест, а не
   * второе состояние карты.
   */
  flip?: boolean;
  /** Крупная масть — своим слоем, чтобы биться под курсором (`.csn-suit-beat`). */
  beat?: boolean;
};

type Edge = { x: number; y: number; width: number; height: number; rx: number };

const edgeOf = (w: number, h: number): Edge => ({ x: -w / 2, y: -h / 2, width: w, height: h, rx: w * 0.075 });

/**
 * Запас рамки карты — под вспышку наведения: обводка 12 и размытие 12
 * уходят за контур примерно на 42 единицы.
 */
const CARD_MARGIN = 44;

const cardBox = (c: CardSpec) => boxAround(rectCorners([c.x, c.y], c.w, c.h, c.rot), CARD_MARGIN);

/** Поле карты — общее у лица и рубашки: заливка, свет кромки внутри, контур. */
function CardField({ edge, clip, p }: { edge: Edge; clip: string; p: string }) {
  return (
    <>
      <rect {...edge} fill={url(p, 'card')} />
      <g clipPath={`url(#${clip})`}>
        {/* Свет кромки заходит внутрь: без него чёрное поле читалось бы дырой
            в кадре, а не картой. */}
        <rect {...edge} stroke="var(--csn-3)" strokeWidth="18" filter={url(p, 'soft')} opacity="0.55" />
        <rect {...edge} fill={url(p, 'gloss')} />
      </g>
      <rect {...edge} stroke="var(--csn-5)" strokeWidth="1.3" />
    </>
  );
}

/** Рубашка: то же поле, косая сетка в краске сцены и внутренняя рамка. */
function CardBack({ edge, clip, p }: { edge: Edge; clip: string; p: string }) {
  const inset = edge.width * 0.08;
  const inner = {
    x: edge.x + inset,
    y: edge.y + inset,
    width: edge.width - inset * 2,
    height: edge.height - inset * 2,
    rx: edge.rx * 0.6,
  };
  return (
    <>
      <CardField edge={edge} clip={clip} p={p} />
      <rect {...inner} fill={url(p, 'lattice')} />
      <rect {...inner} stroke="var(--csn-4)" strokeOpacity="0.6" strokeWidth="1.2" />
    </>
  );
}

/**
 * Слои карты: вспышка наведения и неон под полем (оба светят наружу, за
 * кромку), поле с индексом и мастью, у бьющейся масти — свой слой поверх. У
 * переворачивающейся карты всё это сжимается одним слоем переворота, иначе
 * свечение осталось бы полной ширины вокруг узкой карты.
 */
function CardLayers({ card, box, p }: { card: CardSpec; box: Box; p: string }) {
  const { id, rank, suit, tone, x, y, rot, w, h, flip, beat } = card;
  const glow = tone === 'glow';
  const at = `translate(${x} ${y}) rotate(${rot})`;
  const edge = edgeOf(w, h);
  const clip = `${p}-clip-${id}`;
  // Индекс в углу — ранг и масть под ним, на одной оси.
  const ix = edge.x + w * 0.16;
  const small = w * 0.13;
  // Крупная масть — чуть правее и ниже центра.
  const big = w * 0.48;
  const bx = w * 0.07 - big / 2;
  const by = h * 0.1 - big / 2;

  const bigSuit = (
    <>
      {glow && (
        <g filter={url(p, 'glow')} opacity="0.9">
          <svg x={bx} y={by} width={big} height={big} viewBox="0 0 100 100" fill="var(--csn-4)">
            {SUIT_SHAPES[suit]}
          </svg>
        </g>
      )}
      <svg x={bx} y={by} width={big} height={big} viewBox="0 0 100 100" fill={glow ? url(p, 'accent') : url(p, 'steel')}>
        {SUIT_SHAPES[suit]}
      </svg>
    </>
  );

  const flare = (
    <Fill className="csn-flare">
      <Art box={box}>
        <rect {...edge} transform={at} stroke="var(--csn-4)" strokeWidth="12" filter={url(p, 'flare')} />
      </Art>
    </Fill>
  );
  const neon = (
    <Fill className="csn-neon">
      <Art box={box}>
        <rect {...edge} transform={at} stroke="var(--csn-4)" strokeWidth="6" filter={url(p, 'glow')} />
      </Art>
    </Fill>
  );
  const face = (
    <Art box={box}>
      <defs>
        <clipPath id={clip}>
          <rect {...edge} />
        </clipPath>
      </defs>
      <g transform={at}>
        <CardField edge={edge} clip={clip} p={p} />
        <text
          x={ix}
          y={edge.y + h * 0.2}
          textAnchor="middle"
          fontSize={h * 0.17}
          className="csn-rank"
          fill={glow ? 'var(--csn-5)' : 'var(--csn-7)'}
        >
          {rank}
        </text>
        <svg
          x={ix - small / 2}
          y={edge.y + h * 0.235}
          width={small}
          height={small}
          viewBox="0 0 100 100"
          fill={glow ? 'var(--csn-4)' : 'var(--csn-7)'}
        >
          {SUIT_SHAPES[suit]}
        </svg>
        {!beat && bigSuit}
      </g>
    </Art>
  );
  const heart = beat && (
    <Fill className="csn-suit-beat" style={{ transformOrigin: originIn(box, toScene([x, y], rot, [w * 0.07, h * 0.1])) }}>
      <Art box={box}>
        <g transform={at}>{bigSuit}</g>
      </Art>
    </Fill>
  );

  if (!flip) {
    return (
      <>
        {flare}
        {neon}
        {face}
        {heart}
      </>
    );
  }
  return (
    // Переворот — сжатие вдоль собственной оси карты: слой поворачивается на
    // угол карты, сжимается и поворачивается обратно (`--rot` в keyframes).
    // Сжатие по оси кадра перекосило бы наклонённую карту в параллелограмм.
    <Fill
      className="csn-flip"
      style={{ transformOrigin: originIn(box, [x, y]), '--rot': `${rot}deg` } as CSSProperties}
    >
      {flare}
      {neon}
      <Fill className="csn-flip-face">
        {face}
        {heart}
      </Fill>
      <Fill className="csn-flip-back">
        <Art box={box}>
          <g transform={at}>
            <CardBack edge={edge} clip={clip} p={p} />
          </g>
        </Art>
      </Fill>
    </Fill>
  );
}

/** Карты в порядке рисования: первая — дальняя. */
export function Cards({ cards, p }: { cards: CardSpec[]; p: string }) {
  return (
    <>
      {cards.map((c) => {
        const box = cardBox(c);
        const bottom = toScene([c.x, c.y], c.rot, [0, c.h / 2]);
        return (
          <Float
            key={c.id}
            box={box}
            motion={c.motion}
            origin={c.pivot === 'bottom' ? bottom : [c.x, c.y]}
            hover={c.hover}
            hoverOrigin={bottom}
          >
            <CardLayers card={c} box={box} p={p} />
          </Float>
        );
      })}
    </>
  );
}

/* ── фишки ─────────────────────────────────────────────── */

/**
 * Фишка в ракурсе: диск радиуса `r`, сжатый по вертикали в `k` раз (наклон к
 * зрителю), с кромкой толщиной `t`. `stack` — сколько фишек в стопке, `shade`
 * — плотность тени на полу: у висящей выше тень слабее. В центре лица —
 * масть (`mark`) или надпись (`label`).
 *
 * Своя, не `ChipStack` стола: там вид сверху и цвета номиналов, по которым
 * читается ставка. Здесь фишка — предмет, в тех же двух красках, что и сцена.
 */
export type ChipSpec = {
  x: number;
  y: number;
  rot: number;
  r: number;
  k: number;
  t: number;
  stack: number;
  mark?: Suit;
  label?: string;
  shade: number;
  motion: Motion;
};

/** Запас рамки фишки — под её свечение (размытие 6). */
const CHIP_MARGIN = 26;

const chipBox = (c: ChipSpec) => {
  const reach = c.r + c.t * c.stack + 2;
  return boxAround(
    [
      [c.x - reach, c.y - reach],
      [c.x + reach, c.y + reach],
    ],
    CHIP_MARGIN,
  );
};

/**
 * Вставки — десять по окружности, через одну с чёрным. Углы отсчитываются по
 * параметру эллипса, от правого края через низ: на видимой половине кромки их
 * пять, и те же углы у кольца вставок на лице — вставка переходит с лица на
 * кромку, как у настоящей фишки.
 */
const INSERTS = [18, 54, 90, 126, 162];
const INSERT_HALF = 9;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Вставка на кромке — четырёхугольник по дуге, а не прямоугольник: у краёв диска она сужается. */
function insertPoints(r: number, ry: number, t: number, dy: number, a: number) {
  const pt = (deg: number, down: number) =>
    `${(r * Math.cos(rad(deg))).toFixed(2)},${(dy + down + ry * Math.sin(rad(deg))).toFixed(2)}`;
  const a1 = a - INSERT_HALF;
  const a2 = a + INSERT_HALF;
  return `${pt(a1, 0)} ${pt(a2, 0)} ${pt(a2, t)} ${pt(a1, t)}`;
}

/** Кромка одной фишки стопки: видимая нижняя половина цилиндра, опущенная на `dy`. */
function ChipEdge({ r, ry, t, dy, p }: { r: number; ry: number; t: number; dy: number; p: string }) {
  return (
    <>
      <path d={`M${-r} ${dy} V${dy + t} A${r} ${ry} 0 0 0 ${r} ${dy + t} V${dy} Z`} fill={url(p, 'chip-edge')} />
      {INSERTS.map((a) => (
        <polygon key={a} points={insertPoints(r, ry, t, dy, a)} fill="var(--csn-4)" />
      ))}
      <path d={`M${-r} ${dy + t} A${r} ${ry} 0 0 0 ${r} ${dy + t}`} stroke="var(--csn-1)" strokeWidth="1" />
    </>
  );
}

/**
 * Лицо фишки рисуется кругом и сжимается целиком (`scale(1 k)`): так в
 * ракурс уходят и кольцо вставок, и масть или надпись в центре, и толщина
 * линий, — надпись лежит на фишке, а не висит перед ней.
 * Пунктир — 360 единиц длины, вставка 18°, сдвиг −9°: вставки лица стоят на
 * тех же углах, что и вставки кромки.
 */
function ChipFace({ r, k, mark, label, p }: { r: number; k: number; mark?: Suit; label?: string; p: string }) {
  return (
    <g transform={`scale(1 ${k})`}>
      <circle r={r} fill={url(p, 'chip-face')} />
      <circle
        r={r * 0.85}
        stroke="var(--csn-4)"
        strokeWidth={r * 0.13}
        pathLength={360}
        strokeDasharray="18 18"
        strokeDashoffset={-(INSERTS[0] - INSERT_HALF)}
      />
      <circle r={r * 0.64} fill={url(p, 'chip-core')} stroke="var(--csn-3)" strokeWidth="1.4" />
      {mark && (
        <svg x={-r * 0.3} y={-r * 0.3} width={r * 0.6} height={r * 0.6} viewBox="0 0 100 100" fill="var(--csn-4)">
          {SUIT_SHAPES[mark]}
        </svg>
      )}
      {label && (
        // Надпись светится краской сцены: размытая обводка под чистыми цифрами.
        <g textAnchor="middle" fontFamily="var(--font-mono)" fontSize={r * 0.56} letterSpacing="1">
          <text y={r * 0.2} stroke="var(--csn-4)" strokeWidth="3" opacity="0.7" filter={url(p, 'soft')}>
            {label}
          </text>
          <text y={r * 0.2} fill="var(--csn-6)">
            {label}
          </text>
        </g>
      )}
      <circle r={r} stroke="var(--csn-5)" strokeOpacity="0.5" strokeWidth="1.2" />
      <ellipse cx={-r * 0.28} cy={-r * 0.38} rx={r * 0.42} ry={r * 0.2} fill="#fff" fillOpacity="0.06" />
    </g>
  );
}

/**
 * Слои фишки: свечение (дышит) и сама фишка. Кромки — от дальней к ближней,
 * лицо — только у верхней: лица нижних целиком закрыты верхней фишкой и её
 * кромкой.
 */
function ChipLayers({ chip, box, p }: { chip: ChipSpec; box: Box; p: string }) {
  const { x, y, rot, r, k, t, stack, mark, label } = chip;
  const at = `translate(${x} ${y}) rotate(${rot})`;
  const ry = r * k;
  const depth = t * stack;
  const layers = Array.from({ length: stack }, (_, i) => (stack - 1 - i) * t);
  return (
    <>
      <Fill className="csn-neon">
        <Art box={box}>
          <g transform={at} opacity="0.55">
            <ellipse cy={depth / 2} rx={r + 2} ry={ry + depth / 2 + 2} fill="var(--csn-4)" filter={url(p, 'glow')} />
          </g>
        </Art>
      </Fill>
      <Art box={box}>
        <g transform={at}>
          {layers.map((dy) => (
            <ChipEdge key={dy} r={r} ry={ry} t={t} dy={dy} p={p} />
          ))}
          <ChipFace r={r} k={k} mark={mark} label={label} p={p} />
        </g>
      </Art>
    </>
  );
}

/** Фишки в порядке рисования. */
export function Chips({ chips, p }: { chips: ChipSpec[]; p: string }) {
  return (
    <>
      {chips.map((c) => {
        const box = chipBox(c);
        return (
          <Float key={`${c.x}`} box={box} motion={c.motion} origin={[c.x, c.y]}>
            <ChipLayers chip={c} box={box} p={p} />
          </Float>
        );
      })}
    </>
  );
}

/* ── пол ───────────────────────────────────────────────── */

/** Глубина отражения под линией пола — до нижнего края кадра. */
const REFLECT_DEPTH = (floor: number) => SCENE_H - floor;

/**
 * Отражение фишек в глянце пола: те же слои фишек с теми же ритмами,
 * отзеркаленные относительно линии пола, — идёт синхронно само собой, второй
 * копии таймингов нет. Затухание — CSS-маска на слое: у пола 20 % и в ноль к
 * нижнему краю. Маска задана до зеркала, поэтому полоса затухания лежит над
 * линией пола и после отражения уходит под неё.
 */
export function Reflection({ chips, p, floor }: { chips: ChipSpec[]; p: string; floor: number }) {
  const f = (floor / SCENE_H) * 100;
  const fade = (REFLECT_DEPTH(floor) / SCENE_H) * 100;
  const mask = `linear-gradient(to bottom, transparent ${(f - fade).toFixed(3)}%, rgb(0 0 0 / 0.2) ${f.toFixed(3)}%, transparent ${f.toFixed(3)}%)`;
  return (
    <Fill className="csn-reflect" style={{ transformOrigin: `50% ${f.toFixed(3)}%`, maskImage: mask, WebkitMaskImage: mask }}>
      <Chips chips={chips} p={p} />
    </Fill>
  );
}

/**
 * Тени фишек на полу — у каждой свой слой: тень ходит в такт своей фишке
 * (поднялась — тень мельче). Плотность — на внешнем слое, движение — на
 * внутреннем: анимация тоже водит opacity и перебила бы плотность.
 */
export function Shadows({ chips, p, floor }: { chips: ChipSpec[]; p: string; floor: number }) {
  return (
    <>
      {chips.map((c) => {
        const box = boxAround(
          [
            [c.x - c.r, floor - 8],
            [c.x + c.r, floor + 6],
          ],
          22,
        );
        return (
          <Place key={`s${c.x}`} box={box} style={{ opacity: c.shade }}>
            <Fill
              className="csn-shadow"
              style={{ ...motionStyle(c.motion), transformOrigin: originIn(box, [c.x, floor - 1]) }}
            >
              <Art box={box}>
                <ellipse cx={c.x} cy={floor - 1} rx={c.r * 0.95} ry="7" fill="#000000" filter={url(p, 'shadow')} />
              </Art>
            </Fill>
          </Place>
        );
      })}
    </>
  );
}

/* ── искры ─────────────────────────────────────────────── */

/** Искра: место у пола, радиус и снос вбок на подъёме (единицы сцены). */
export type Ember = [x: number, y: number, r: number, dx: number];

/** Ореол искры — во столько раз шире её ядра. */
const HALO = 2.6;

/**
 * Искры — не SVG, а HTML-точки: квадрат под ореол, в нём радиальный градиент
 * с ядром и ореолом (`.csn-ember`). Не скругление с тенью: глобальный сброс
 * радиусов и теней (`@layer base`) молча снял бы оба. Семь мелких слоёв без
 * рисунка внутри дешевле, чем SVG, перерисовываемый ради них на каждом кадре.
 */
export function Embers({ embers }: { embers: Ember[] }) {
  return (
    <>
      {embers.map(([x, y, r, dx], i) => (
        <i
          key={x}
          className="csn-ember"
          style={
            {
              ...boxStyle({ x: x - r * HALO, y: y - r * HALO, w: 2 * r * HALO, h: 2 * r * HALO }),
              '--i': i,
              '--dx': dx,
            } as CSSProperties
          }
        />
      ))}
    </>
  );
}

/* ── определения ───────────────────────────────────────── */

/** Фильтры и градиенты сцены — все id с префиксом `p`. */
function SceneDefs({ p }: { p: string }) {
  const id = (name: string) => `${p}-${name}`;
  return (
    <defs>
      <filter id={id('glow')} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" />
      </filter>
      <filter id={id('flare')} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="12" />
      </filter>
      <filter id={id('soft')} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="5" />
      </filter>
      <filter id={id('aura')} x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="26" />
      </filter>
      <filter id={id('shadow')} x="-60%" y="-200%" width="220%" height="500%">
        <feGaussianBlur stdDeviation="6" />
      </filter>
      <linearGradient id={id('card')} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="var(--csn-card-1)" />
        <stop offset="1" stopColor="var(--csn-card-2)" />
      </linearGradient>
      <linearGradient id={id('gloss')} x1="0" y1="0" x2="0.7" y2="0.8">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.09" />
        <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.015" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
      </linearGradient>
      <pattern id={id('lattice')} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <path d="M0 0 H9 M0 0 V9" stroke="var(--csn-4)" strokeOpacity="0.28" strokeWidth="1.2" />
      </pattern>
      <linearGradient id={id('steel')} x1="0.2" y1="0" x2="0.8" y2="1">
        <stop offset="0" stopColor="var(--csn-steel-1)" />
        <stop offset="0.5" stopColor="var(--csn-steel-2)" />
        <stop offset="1" stopColor="var(--csn-steel-3)" />
      </linearGradient>
      <linearGradient id={id('accent')} x1="0.2" y1="0" x2="0.8" y2="1">
        <stop offset="0" stopColor="var(--csn-5)" />
        <stop offset="0.45" stopColor="var(--csn-4)" />
        <stop offset="1" stopColor="var(--csn-3)" />
      </linearGradient>
      <radialGradient id={id('chip-face')} cx="0.38" cy="0.32" r="0.8">
        <stop offset="0" stopColor="var(--csn-chip-1)" />
        <stop offset="1" stopColor="var(--csn-chip-2)" />
      </radialGradient>
      <radialGradient id={id('chip-core')} cx="0.4" cy="0.35" r="0.75">
        <stop offset="0" stopColor="var(--csn-chip-1)" />
        <stop offset="1" stopColor="var(--csn-card-2)" />
      </radialGradient>
      {/* Кромка светлее к середине — так плоская полоса читается цилиндром. */}
      <linearGradient id={id('chip-edge')} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="var(--csn-card-2)" />
        <stop offset="0.4" stopColor="var(--csn-chip-1)" />
        <stop offset="1" stopColor="var(--csn-card-2)" />
      </linearGradient>
      <linearGradient id={id('floor')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--csn-2)" stopOpacity="0.35" />
        <stop offset="1" stopColor="var(--csn-2)" stopOpacity="0" />
      </linearGradient>
    </defs>
  );
}
