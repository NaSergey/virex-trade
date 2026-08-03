'use client';

import { PB, W, type EquityGeometry } from '../model/geometry';

/**
 * Слои кривой P&L: каждый отвечает за одно утверждение о данных и ничего не
 * знает про остальные. Все получают уже посчитанную геометрию — считать внутри
 * отрисовки нечего.
 *
 * Букв на самом холсте нет. Подписи на кривой ложились прямо на неё и на
 * заливку ям и переставали читаться, а вместе с ножками и мерными линиями
 * загораживали ровно ту форму, ради которой график и нарисован. Числа
 * возвращаются наведением — все в одной табличке, включая те, что раньше
 * стояли на холсте.
 */

/**
 * Ямы просадок. Заливка одного веса у всех — сравнивать их нужно площадью, а
 * не яркостью; глубину каждой назовёт наведение.
 */
export function DrawdownLayer({ chart, u }: { chart: EquityGeometry; u: number }) {
  return (
    <g className="equity-fade">
      {chart.underwater.map((s) => (
        <g key={s.fromIdx}>
          <path d={s.path} fill="var(--color-down)" opacity="0.22" />
          {/* Уровень воды над этой ямой — отметка, от которой отмеряется
              глубина. Пунктир тише кривой: это не данные, а линейка.
              У ямы мельче нескольких пикселей линейка легла бы прямо на
              кривую и читалась бы как грязь на ней, а не как отметка —
              такую яму показывает только заливка. */}
          {/* Порог — в экранных пикселях, а не в единицах холста: на телефоне
              одна единица меньше трети пикселя, и «яма мельче шести единиц»
              означало бы «мельче двух пикселей» — линейка ложилась бы на
              кривую ровно в тех ямах, ради которых порог и заведён. */}
          {chart.y(s.troughValue) - s.water.y >= 6 * u && (
            <line
              x1={s.water.x1.toFixed(1)}
              y1={s.water.y.toFixed(1)}
              x2={s.water.x2.toFixed(1)}
              y2={s.water.y.toFixed(1)}
              stroke="var(--color-down)"
              strokeWidth={u.toFixed(2)}
              strokeOpacity="0.75"
              strokeDasharray={`${(2 * u).toFixed(1)} ${(4 * u).toFixed(1)}`}
            />
          )}
        </g>
      ))}
    </g>
  );
}

/**
 * Кривая, перекрашенная по глубине просадки: на рекорде — кость, на дне худшей
 * ямы — полный цвет убытка, между ними растяжка.
 *
 * Это второй проход той же кривой поверх первого, а не отдельная линия. Красный
 * задан не цветом остановок, а их прозрачностью: цвета в системе живут в
 * переменных, и подмешивать один к другому в JS пришлось бы разбором hex —
 * вместо этого верхний слой просто проступает там, где глубже.
 *
 * Порядок важен: слой идёт ПОСЛЕ общей кривой и рисуется той же анимацией, иначе
 * красное проступило бы раньше, чем кость успела дорисоваться.
 */
export function DrawdownCurve({ chart, id, u }: { chart: EquityGeometry; id: string; u: number }) {
  if (chart.ddStops.length === 0) return null;
  return (
    <>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={W} y2="0">
          {chart.ddStops.map((s) => (
            <stop
              key={s.offset}
              offset={s.offset}
              style={{ stopColor: 'var(--color-down)', stopOpacity: s.ratio }}
            />
          ))}
        </linearGradient>
      </defs>
      <polyline
        points={chart.line}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth={(1.75 * u).toFixed(2)}
        strokeLinejoin="round"
        pathLength={1}
        className="equity-line"
      />
    </>
  );
}

/**
 * Перекрестье курсора: вертикаль по холсту и точка на самой кривой. Числа
 * рядом с курсором не ставятся — они собраны в табличке наведения, а та
 * свёрстана обычным HTML над холстом: так текст не масштабируется вместе с
 * viewBox и не ложится на кривую.
 */
export function HoverCursor({
  point,
  height,
  u,
}: {
  point: { x: number; y: number };
  height: number;
  u: number;
}) {
  return (
    <g>
      <line
        x1={point.x.toFixed(1)}
        y1="0"
        x2={point.x.toFixed(1)}
        y2={height - PB + 12}
        stroke="var(--color-line-strong)"
        strokeWidth={u.toFixed(2)}
        shapeRendering="crispEdges"
      />
      <circle cx={point.x.toFixed(1)} cy={point.y.toFixed(1)} r={(3 * u).toFixed(1)} fill="var(--color-fg)" />
    </g>
  );
}
