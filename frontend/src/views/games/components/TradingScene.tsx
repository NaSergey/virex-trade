'use client';

import { useRef, type CSSProperties } from 'react';
import { Art, Fill, Place } from './SceneLayer';
import { FULL, SCENE_H, originIn, type Box } from '../lib/scene-box';
import { usePauseOffscreen } from '../model/usePauseOffscreen';

/**
 * Сцена торговли — картинка карточки, нарисованная кодом, а не снятая в ассет.
 * Причина простая: свечи это данные, и снимок рынка, которого не было, обещал
 * бы конкретную историю цены. Соседние карточки показывают предметы (карты,
 * фишки, ранец) — там снимок ничего не выдумывает, и там он снимок.
 *
 * Пропорция та же, что у ассетов соседних карточек (384×514): ряд карточек
 * обязан стоять ровно, и своя высота у одной из них рвала бы сетку.
 *
 * Ряд строится из ценовой серии, а не из нарисованных на глаз прямоугольников,
 * и это главное, чем сцена похожа на настоящий график: открытие каждой свечи
 * равно закрытию предыдущей (`SERIES` ниже), тело всегда лежит внутри своего
 * фитиля, а тон берётся от уровня цены. Пока бары ставились по отдельности,
 * ряд читался гистограммой: цена в нём никуда не шла, потому что между
 * соседями не было никакой связи.
 *
 * Свечи плоские. Гранёные призмы здесь стояли и сняты: объём заставлял читать
 * рисунок как предмет, хотя свеча — это отметка цены, и у неё нет стороны.
 * Пространство сцене даёт не тело, а то, что вокруг: пол с точкой схода,
 * отражение и тень под рядом. Падающие тела полые — так их рисует любой
 * терминал, и различать направление по заливке привычнее, чем по цвету.
 *
 * Цвет тела — одна шкала (`--ts-1`…`--ts-7`): от почти чёрного зелёного через
 * зелёный продукта к кости. Красного в самих свечах нет — падение показывает
 * полая заливка, а не второй сигнальный цвет поверх той же формы. Красный
 * стоит только у метки short (`--ts-red`, тон акцента покера): long и short —
 * стороны одной сделки, и различаться должны на глаз мгновенно, ещё до того,
 * как прочитано слово.
 *
 * Сцена живёт постоянно, а не проигрывает вступление и замирает: это
 * единственная работающая игра раздела, и её карточка должна отличаться от
 * трёх обещаний не одним лишь отсутствием метки «Скоро». Движение здесь одно — то,
 * чем рынок и занят: рост, коррекция, рост, коррекция. Бегущих полос света
 * нет намеренно: они ничего не значат, а в узкой карточке любая горизонталь,
 * ездящая вверх-вниз, читается браком экрана.
 */

/** Шаг ряда и ширина тела: зазор между свечами примерно в две трети тела. */
const STEP = 24.5;
const BW = 14;
const X0 = 24;
/** Плоскость пола: относительно неё зеркалится отражение и стоят тени. */
const FLOOR = 476;
/**
 * Окно цен и экранные границы, в которые оно ложится. Ряд занимает кадр почти
 * целиком: запас сверху и снизу — проценты, а не трети. Пока под шапку
 * карточки резервировалась верхняя треть кадра, ряд читался полоской посреди
 * пустоты; теперь шапку держит собственный скрим карточки (`.gcard-scrim`), и
 * отдавать ей место в самой сцене незачем.
 */
/**
 * Границы окна — ровно минимум и максимум самой серии (не круглые 100/170):
 * иначе часть полосы уходит на цены, которых в ряду нет, и сверху остаётся
 * пустой запас, которого никто не просил.
 */
const P_MIN = 102;
const P_MAX = 166;
const Y_TOP = 30;
const Y_BOT = 468;

/**
 * Ценовая серия: открытие, максимум, минимум, закрытие. Открытие каждой равно
 * закрытию предыдущей — цена идёт непрерывно, как на бирже. Тренд растущий с
 * двумя настоящими откатами (бары 5–6 и 11), парой доджей и импульсом в конце:
 * ровный рост по линейке в живой график не превращается.
 */
const SERIES: [number, number, number, number][] = [
  [104, 112, 102, 110],
  [110, 114, 106, 108],
  [108, 118, 107, 116],
  [116, 123, 114, 121],
  [121, 123, 115, 117],
  [117, 119, 111, 113],
  [113, 124, 112, 122],
  [122, 133, 121, 131],
  [131, 135, 127, 129],
  [129, 140, 128, 138],
  [138, 141, 132, 134],
  [134, 147, 133, 145],
  [145, 156, 144, 152],
  [152, 166, 150, 163],
];

/** Шкала тонов — та же, что объявлена у `.tscene` в globals.css. */
const TONES = [
  'var(--ts-1)',
  'var(--ts-2)',
  'var(--ts-3)',
  'var(--ts-4)',
  'var(--ts-5)',
  'var(--ts-6)',
  'var(--ts-7)',
];

const priceY = (p: number) => Y_BOT - ((p - P_MIN) / (P_MAX - P_MIN)) * (Y_BOT - Y_TOP);

/** Ступень шкалы по уровню цены: чем выше закрытие, тем светлее свеча. */
const toneIndex = (close: number) => {
  const t = (close - P_MIN) / (P_MAX - P_MIN);
  return Math.min(5, Math.max(1, Math.round(1 + t * 4)));
};

type Bar = {
  i: number;
  x: number;
  /** Экранные координаты: верх и низ тела, концы фитиля. */
  top: number;
  bottom: number;
  high: number;
  low: number;
  /** Растущая — залитая, падающая — полая. */
  up: boolean;
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
    // Доджи: тело в пару пикселей всё равно должно быть видно телом, а не
    // разрывом фитиля.
    bottom: Math.max(bottom, top + 2),
    high: priceY(high),
    low: priceY(low),
    up,
    body: up ? TONES[tone] : 'var(--ts-dark)',
    edge: TONES[tone + 1],
  };
});

/** Середина тела: по ней идёт фитиль, под ней стоит тень. */
const axis = (b: Bar) => b.x + BW / 2;

/** Одна свеча: фитиль, тело и обводка. Ничего больше — она плоская. */
function Candle({ bar }: { bar: Bar }) {
  const { x, top, bottom, high, low, body, edge } = bar;
  const cx = axis(bar);
  return (
    <>
      <rect x={cx - 1} y={high} width="2" height={low - high} fill={edge} opacity="0.85" />
      <rect x={x} y={top} width={BW} height={bottom - top} fill={body} stroke={edge} strokeWidth="1.4" />
    </>
  );
}

/**
 * Ряд тел. Импульс проходит по нему слева направо: каждая группа держит свой
 * номер в `--i` (от него задержка) и свою амплитуду хода в `--amp`. Амплитуда
 * растёт к правому краю — так ряд не качается целиком, как одна картинка, а
 * раскрывается: свежие бары ходят шире старых, ровно как на живом графике, где
 * двигается правый край.
 *
 * Отражение рисует тот же узел с теми же классами: анимации стартуют
 * одновременно и разойтись не могут — второй копии таймингов не существует.
 */
function Bars() {
  return (
    <>
      {BARS.map((bar) => (
        <g
          key={bar.x}
          className="tsc-bar"
          style={{ '--i': bar.i, '--amp': Math.round((3 + bar.i * 1.1) * 10) / 10 } as CSSProperties}
        >
          <Candle bar={bar} />
        </g>
      ))}
    </>
  );
}

/** Рамки меток — метка и запас под её неон (обводка 4, размытие 5). */
const LONG_BOX: Box = { x: 200, y: 76, w: 172, h: 84 };
const SHORT_BOX: Box = { x: 2, y: 420, w: 180, h: 86 };

/**
 * Затухание отражения — CSS-маска на его слое: у пола 40 %, к 40 % глубины —
 * 10 %, к нижнему краю кадра — ноль.
 */
const floorPct = (FLOOR / SCENE_H) * 100;
const REFLECT_MASK = `linear-gradient(to bottom, transparent ${floorPct.toFixed(3)}%, rgb(0 0 0 / 0.4) ${floorPct.toFixed(3)}%, rgb(0 0 0 / 0.1) ${(((FLOOR + 0.4 * (SCENE_H - FLOOR)) / SCENE_H) * 100).toFixed(3)}%, transparent 100%)`;

/**
 * Сцена — стопка слоёв (`SceneLayer.tsx`), а не один SVG. Свечи, их тени и
 * искры по-прежнему движутся внутри одного SVG: это простые прямоугольники, и
 * перерисовать их на кадре дёшево. Всё дорогое — зарево и неон меток с их
 * размытиями — вынесено на свои слои и рисуется один раз; дышит у них только
 * прозрачность слоя, а её двигает видеокарта. Тени свечей — радиальный
 * градиент, а не размытие: размытие в движущемся SVG пересчитывалось бы на
 * каждом кадре.
 */
export function TradingScene() {
  const ref = useRef<HTMLDivElement>(null);
  usePauseOffscreen(ref);
  return (
    <div ref={ref} className="gscene tscene" aria-hidden>
      {/* Неподвижное: определения, уровни и пол. */}
      <Art box={FULL}>
        <defs>
          <linearGradient id="ts-floor-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="0.3" stopColor="#ffffff" stopOpacity="0.8" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0.12" />
          </linearGradient>
          <mask id="ts-floor-mask">
            <rect x="0" y="468" width="384" height="46" fill="url(#ts-floor-fade)" />
          </mask>
          <filter id="ts-aura" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="22" />
          </filter>
          <filter id="ts-neon" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          {/* Тень-пятно: плотная в середине и в ноль к краю — то, что давало
              размытие чёрного эллипса, без пересчёта размытия на каждом кадре. */}
          <radialGradient id="ts-shade">
            <stop offset="0" stopColor="#000000" stopOpacity="0.55" />
            <stop offset="0.5" stopColor="#000000" stopOpacity="0.35" />
            <stop offset="1" stopColor="#000000" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Уровни — четыре слабые линии по круглым ценам. Они не движутся и
            ничего не подписывают: их дело — сказать, что цена измеряется, а не
            нарисована. */}
        <g stroke="var(--ts-4)" strokeWidth="0.75" opacity="0.1">
          {[110, 125, 140, 155].map((p) => (
            <line key={p} x1="16" y1={priceY(p)} x2="368" y2={priceY(p)} />
          ))}
        </g>

        {/* Пол: единственное место сцены с точкой схода — он и даёт глубину,
            которой у плоских тел нет и быть не должно. */}
        <g mask="url(#ts-floor-mask)">
          <g stroke="var(--ts-4)" strokeWidth="1" opacity="0.26">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => {
              const y = 470 + i * i * 0.9 + i * 1.8;
              return <line key={`h${i}`} x1="-40" y1={y} x2="424" y2={y} />;
            })}
            {[-4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map((i) => (
              <line key={`v${i}`} x1={192 + i * 21} y1="470" x2={192 + i * 94} y2="514" />
            ))}
          </g>
        </g>
      </Art>

      {/* Зарево: холодное там, куда ряд вырос, и пятно у его основания. Дышит
          медленно — движение на витрине должно замечаться краем глаза, а не
          перетягивать внимание с названий игр. Рисунок на слое неподвижен,
          дышит прозрачность слоя. */}
      <Fill className="tsc-aura">
        <Art box={FULL}>
          <ellipse cx="300" cy="150" rx="112" ry="118" fill="var(--ts-4)" opacity="0.15" filter="url(#ts-aura)" />
          <ellipse cx="168" cy="464" rx="170" ry="54" fill="var(--ts-4)" opacity="0.18" filter="url(#ts-aura)" />
        </Art>
      </Fill>

      {/* Отражение — до теней и тел: оно лежит в полу, а не на нём. */}
      <Fill className="tsc-reflect" style={{ maskImage: REFLECT_MASK, WebkitMaskImage: REFLECT_MASK }}>
        <Art box={FULL}>
          <g transform={`translate(0 ${2 * FLOOR}) scale(1 -1)`}>
            <Bars />
          </g>
        </Art>
      </Fill>

      <Art box={FULL}>
        {/* Тени-пятна: чем выше тело, тем мельче и слабее пятно. */}
        {BARS.map((bar) => (
          <ellipse
            key={`s${bar.x}`}
            className="tsc-bar-shadow"
            style={{ '--i': bar.i } as CSSProperties}
            cx={axis(bar)}
            cy={FLOOR - 2}
            rx={24 - bar.i * 0.4}
            ry={13 - bar.i * 0.2}
            fill="url(#ts-shade)"
            opacity={0.5 - (Y_BOT - bar.bottom) / 900}
          />
        ))}

        <Bars />

        {/* Искры над рядом: единственное, что здесь не про цену, — воздух сцены. */}
        <g className="tsc-sparks">
          {[
            [62, 3.4, 0],
            [148, 2.6, 1],
            [236, 3, 2],
            [300, 2.2, 3],
            [344, 2.8, 4],
          ].map(([x, r, i]) => (
            <circle
              key={x}
              className="tsc-spark"
              style={{ '--i': i } as CSSProperties}
              cx={x}
              cy={FLOOR - 30}
              r={r}
              fill="var(--ts-5)"
            />
          ))}
        </g>
      </Art>

      {/* Две стороны сделки: длинная вверху, куда тела растут, короткая внизу,
          откуда вышли. Обе набраны сигнальным цветом своей стороны — это
          противоположные концы одной сделки, и различаться они должны на
          глаз мгновенно, ещё до того, как прочитано слово.

          Места у них постоянные — long вверху справа, short внизу слева, — и
          менять их вслед за тем, куда в этот раз попали тела, не надо: метка
          обозначает сторону сделки, а не свободное место в кадре. Полупрозрачная
          подложка (#050505 на половине) держит обе читаемыми там, где под ними
          оказался ряд.

          Каждая метка — свой слой: неон рисуется один раз, дышит прозрачность
          слоя. LONG под курсором подрастает (.tsc-long-lift — отдельный слой,
          transform дыхания не тронут). SHORT под курсором не меняется — его
          закрывает .gcard-reveal. */}
      <Place box={LONG_BOX}>
        <Fill className="tsc-long-lift" style={{ transformOrigin: originIn(LONG_BOX, [286, 118]) }}>
          <Fill className="tsc-long">
            <Art box={LONG_BOX}>
              <rect
                x="220"
                y="96"
                width="132"
                height="44"
                rx="12"
                stroke="var(--ts-4)"
                strokeWidth="4"
                opacity="0.75"
                filter="url(#ts-neon)"
              />
              <rect
                x="220"
                y="96"
                width="132"
                height="44"
                rx="12"
                fill="#050505"
                fillOpacity="0.5"
                stroke="var(--ts-5)"
                strokeWidth="1.6"
              />
              <text
                x="286"
                y="125"
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize="21"
                letterSpacing="3"
                fill="var(--ts-6)"
              >
                LONG
              </text>
            </Art>
          </Fill>
        </Fill>
      </Place>
      <Place box={SHORT_BOX}>
        <Fill className="tsc-short">
          <Art box={SHORT_BOX}>
            <rect
              x="22"
              y="440"
              width="140"
              height="46"
              rx="12"
              stroke="var(--ts-red)"
              strokeWidth="4"
              opacity="0.6"
              filter="url(#ts-neon)"
            />
            <rect
              x="22"
              y="440"
              width="140"
              height="46"
              rx="12"
              fill="#050505"
              fillOpacity="0.5"
              stroke="var(--ts-red)"
              strokeWidth="1.6"
            />
            <text
              x="92"
              y="470"
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fontSize="21"
              letterSpacing="3"
              fill="var(--ts-red-dim)"
            >
              SHORT
            </text>
          </Art>
        </Fill>
      </Place>
    </div>
  );
}
