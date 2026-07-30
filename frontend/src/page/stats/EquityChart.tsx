'use client';

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { EquityPoint } from '@/shared/api/bybit/hooks';
import { formatMoney } from '@/shared/lib/utils/format';

// Холст в условных единицах: ширина совпадает с наборной полосой, поэтому в
// разметке кривая уходит в край вьюпорта (см. .bleed) без искажения пропорций —
// viewBox масштабируется целиком, а не растягивается по одной оси.
const W = 1360;
const PT = 26;
const PB = 26;

const fmtDate = (unixSec: number) =>
  new Date(unixSec * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');

interface Note {
  i: number;
  value: number;
  text: string;
  color: string;
  up: boolean;
}

/** Одна яма: от вершины, с которой пошли вниз, до возврата к ней. */
export interface Underwater {
  /** Заливка между линией рекорда и кривой — форма самой ямы. */
  path: string;
  /** Уровень воды: горизонталь рекорда над этой ямой и только над ней. */
  water: { x1: number; x2: number; y: number };
  /** Глубина в деньгах: рекорд минус дно. */
  depth: number;
  /** Вершина, с которой начали падать. */
  fromIdx: number;
  troughIdx: number;
  /** Возврат к вершине, а без возврата — последняя сделка. */
  endIdx: number;
  recovered: boolean;
  peakValue: number;
  troughValue: number;
}

/**
 * Геометрия кривой — чистой функцией: её можно прогнать на данных и убедиться,
 * что точки и подписи лежат внутри холста, а пути не содержат NaN.
 */
export function buildEquityGeometry(data: EquityPoint[], height: number) {
  if (data.length === 0) return null;

  const values = data.map((p) => p.value);
  const n = values.length;
  // Ноль всегда в кадре: кривая целиком в плюсе должна показывать, насколько
  // она от нуля оторвалась.
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  const pad = (max - min) * 0.14 || 1;
  min -= pad;
  max += pad;

  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (v: number) => PT + (1 - (v - min) / (max - min)) * (height - PT - PB);

  const points = values.map((v, i) => ({ x: x(i), y: y(v) }));
  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const zeroY = y(0);
  const area =
    n > 1
      ? `M${line.replaceAll(' ', ' L')} L${x(n - 1).toFixed(1)},${zeroY.toFixed(1)} L${x(0).toFixed(1)},${zeroY.toFixed(1)} Z`
      : '';

  // Рекорд, достигнутый к этому моменту: он только растёт, и всё, что
  // провалилось под него, и есть просадка.
  const peaks: number[] = [];
  let running = -Infinity;
  for (const v of values) {
    running = Math.max(running, v);
    peaks.push(running);
  }

  // Все ямы, а не только худшая: кривая почти никогда не падает один раз, и
  // «во что обошлась эта серия» — вопрос к каждой из них. Внутри одной ямы
  // рекорд по определению постоянен (стоило его превысить — яма кончилась),
  // поэтому её верхняя граница горизонтальна.
  const underwater: Underwater[] = [];
  let i = 0;
  while (i < n) {
    if (values[i] >= peaks[i]) {
      i += 1;
      continue;
    }
    const peakValue = peaks[i];
    // Вершина — точка ПЕРЕД первой подводной: яма начинается с неё, иначе
    // заливка отрывалась бы от кривой на первой же ступеньке.
    const fromIdx = i - 1;
    let last = i;
    while (last + 1 < n && values[last + 1] < peakValue) last += 1;

    let troughIdx = i;
    for (let k = i; k <= last; k += 1) {
      if (values[k] < values[troughIdx]) troughIdx = k;
    }

    const recovered = last + 1 < n;
    // Возврат приходится между двумя сделками — берём точную точку пересечения
    // с линией рекорда, иначе у заливки справа остаётся зазубрина.
    const crossX = recovered
      ? x(last) +
        ((peakValue - values[last]) / (values[last + 1] - values[last])) * (x(last + 1) - x(last))
      : x(last);

    const curve = [];
    for (let k = fromIdx; k <= last; k += 1) curve.push(`${x(k).toFixed(1)},${y(k === fromIdx ? peakValue : values[k]).toFixed(1)}`);

    underwater.push({
      path: `M${curve.join(' L')} L${crossX.toFixed(1)},${y(peakValue).toFixed(1)} Z`,
      // Уровень воды чертится только над своей ямой: сплошная линия рекорда
      // через весь холст на подъёмах ложилась ровно на кривую и её грязнила.
      water: { x1: x(fromIdx), x2: crossX, y: y(peakValue) },
      depth: peakValue - values[troughIdx],
      fromIdx,
      troughIdx,
      endIdx: recovered ? last + 1 : n - 1,
      recovered,
      peakValue,
      troughValue: values[troughIdx],
    });

    i = last + 1;
  }

  // Худшая яма названа числом, остальные — только формой: подписать каждую
  // значило бы залить график цифрами, а сравниваются они и так, по площади.
  const worstDrawdown = underwater.reduce<Underwater | null>(
    (worst, s) => (worst == null || s.depth > worst.depth ? s : worst),
    null,
  );

  // Лучшая сделка периода — по приращению, то есть по конкретной сделке, а не
  // по уровню кривой.
  const deltas = values.map((v, k) => (k === 0 ? v : v - values[k - 1]));
  let bestI = 0;
  deltas.forEach((d, k) => {
    if (d > deltas[bestI]) bestI = k;
  });

  const notes: Note[] =
    n > 1 && deltas[bestI] > 0
      ? [
          {
            i: bestI,
            value: values[bestI],
            text: `${formatMoney(deltas[bestI])} лучшая`,
            color: 'var(--color-up)',
            up: true,
          },
        ]
      : [];

  return {
    x,
    y,
    points,
    line,
    area,
    zeroY,
    peak: Math.max(...values),
    underwater,
    worstDrawdown,
    notes,
    last: { x: x(n - 1), y: y(values[n - 1]), value: values[n - 1] },
  };
}

/**
 * Кривая накопленного P&L — единственный элемент продукта, который выходит за
 * наборную полосу в край вьюпорта. Она идёт после свода: сначала итог, потом
 * то, как он набирался.
 *
 * Просадки показаны не рамкой вокруг одной ямы, а «уровнем воды»: пунктир —
 * достигнутый рекорд, всё, что провалилось под него, залито цветом убытка.
 * Так видно сразу все ямы, их глубину и длину, а кривая при этом ничем не
 * закрыта. Числом названа только худшая: остальные сравниваются площадью.
 *
 * Ни сетки, ни оси значений: уровень уже назван в своде, а кривой важна форма.
 * Точные числа возвращаются при наведении.
 */
export function EquityChart({ data, height = 300 }: { data: EquityPoint[]; height?: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const chart = useMemo(() => buildEquityGeometry(data, height), [data, height]);

  if (!chart) return null;

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const frac = (e.clientX - rect.left) / rect.width;
    setHoverIdx(Math.max(0, Math.min(data.length - 1, Math.round(frac * (data.length - 1)))));
  };

  const hover = hoverIdx != null ? { point: chart.points[hoverIdx], ...data[hoverIdx] } : null;

  const worst = chart.worstDrawdown;
  // Мерная линия глубины стоит на дне худшей ямы: вертикаль от рекорда до дна
  // с засечками на концах — так меряют на чертеже, и так видно, что именно
  // сложилось в это число.
  const gauge = worst
    ? {
        // Дно бывает последней сделкой — тогда линия встаёт на самый край, и
        // засечки на её концах срезает границей холста. Отступаем внутрь.
        x: Math.min(Math.max(chart.x(worst.troughIdx), 5), W - 5),
        top: chart.y(worst.peakValue),
        bottom: chart.y(worst.troughValue),
        // Подпись уходит в ту сторону, где до края холста больше места.
        flip: chart.x(worst.troughIdx) > W * 0.72,
      }
    : null;

  return (
    <div
      ref={boxRef}
      onPointerMove={onMove}
      onPointerLeave={() => setHoverIdx(null)}
      style={{ position: 'relative' }}
    >
      <svg
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label={
          `Накопленный P&L: ${formatMoney(chart.last.value)} USDT за ${data.length} сделок` +
          (worst
            ? `; просадок ${chart.underwater.length}, худшая ${formatMoney(-worst.depth)} на протяжении ${worst.endIdx - worst.fromIdx} сделок` +
              (worst.recovered ? ', отыграна' : ', не отыграна')
            : '')
        }
      >
        <line
          x1="0"
          y1={chart.zeroY.toFixed(1)}
          x2={W}
          y2={chart.zeroY.toFixed(1)}
          stroke="var(--color-line-2)"
          strokeWidth="1"
          shapeRendering="crispEdges"
        />

        {/* Тело кривой — тихой костью до нуля: оно даёт кривой вес, но ничего
            не утверждает, поэтому и стоит на самом нижнем уровне яркости. */}
        <path d={chart.area} fill="var(--color-fg)" opacity="0.06" className="equity-fade" />

        <g className="equity-fade">
          {/* Ямы: заливка одного веса у всех — сравнивать их нужно площадью, а
              не яркостью; какая из них худшая, скажет мерная линия ниже. */}
          {chart.underwater.map((s) => (
            <g key={s.fromIdx}>
              <path d={s.path} fill="var(--color-down)" opacity="0.15" />
              {/* Уровень воды над этой ямой — отметка, от которой отмеряется
                  глубина. Пунктир тише кривой: это не данные, а линейка.
                  У ямы мельче нескольких пикселей линейка легла бы прямо на
                  кривую и читалась бы как грязь на ней, а не как отметка —
                  такую яму показывает только заливка. */}
              {chart.y(s.troughValue) - s.water.y >= 6 && (
                <line
                  x1={s.water.x1.toFixed(1)}
                  y1={s.water.y.toFixed(1)}
                  x2={s.water.x2.toFixed(1)}
                  y2={s.water.y.toFixed(1)}
                  stroke="var(--color-down)"
                  strokeWidth="1"
                  strokeOpacity="0.55"
                  strokeDasharray="2 4"
                />
              )}
            </g>
          ))}
        </g>

        <polyline
          points={chart.line}
          fill="none"
          stroke="var(--color-fg)"
          strokeWidth="1.75"
          strokeLinejoin="round"
          pathLength={1}
          className="equity-line"
        />

        {worst && gauge && (
          <g className="equity-fade">
            <line
              x1={gauge.x.toFixed(1)}
              y1={gauge.top.toFixed(1)}
              x2={gauge.x.toFixed(1)}
              y2={gauge.bottom.toFixed(1)}
              stroke="var(--color-down)"
              strokeWidth="1"
            />
            {[gauge.top, gauge.bottom].map((cap) => (
              <line
                key={cap}
                x1={(gauge.x - 4).toFixed(1)}
                y1={cap.toFixed(1)}
                x2={(gauge.x + 4).toFixed(1)}
                y2={cap.toFixed(1)}
                stroke="var(--color-down)"
                strokeWidth="1"
              />
            ))}
            <text
              x={(gauge.flip ? gauge.x - 10 : gauge.x + 10).toFixed(1)}
              y={((gauge.top + gauge.bottom) / 2 + 4).toFixed(1)}
              textAnchor={gauge.flip ? 'end' : 'start'}
              fill="var(--color-down)"
              fontSize="12"
              fontFamily="var(--font-mono)"
            >
              {formatMoney(-worst.depth)} · {worst.endIdx - worst.fromIdx} сделок
              {worst.recovered ? '' : ' · не отыграна'}
            </text>
          </g>
        )}

        {chart.notes.map((note) => {
          const nx = chart.x(note.i);
          const ny = chart.y(note.value);
          const endY = note.up ? ny - 26 : ny + 26;
          const atEnd = nx > W * 0.72;
          return (
            <g key={note.text} className="equity-fade">
              <line
                x1={nx.toFixed(1)}
                y1={ny.toFixed(1)}
                x2={nx.toFixed(1)}
                y2={endY.toFixed(1)}
                stroke="var(--color-line-strong)"
                strokeWidth="1"
              />
              <circle cx={nx.toFixed(1)} cy={ny.toFixed(1)} r="2.5" fill={note.color} />
              <text
                x={(atEnd ? nx - 6 : nx + 6).toFixed(1)}
                y={(note.up ? ny - 28 : ny + 34).toFixed(1)}
                textAnchor={atEnd ? 'end' : 'start'}
                fill={note.color}
                fontSize="12"
                fontFamily="var(--font-mono)"
              >
                {note.text}
              </text>
            </g>
          );
        })}

        {hover && (
          <g>
            <line
              x1={hover.point.x.toFixed(1)}
              y1={PT - 12}
              x2={hover.point.x.toFixed(1)}
              y2={height - PB + 12}
              stroke="var(--color-line-strong)"
              strokeWidth="1"
              shapeRendering="crispEdges"
            />
            <circle cx={hover.point.x.toFixed(1)} cy={hover.point.y.toFixed(1)} r="3" fill="var(--color-fg)" />
            <text
              x={(hover.point.x > W * 0.72 ? hover.point.x - 8 : hover.point.x + 8).toFixed(1)}
              y={PT - 4}
              textAnchor={hover.point.x > W * 0.72 ? 'end' : 'start'}
              fill="var(--color-fg)"
              fontSize="12"
              fontFamily="var(--font-mono)"
            >
              {formatMoney(hover.value)} · {fmtDate(hover.time)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
