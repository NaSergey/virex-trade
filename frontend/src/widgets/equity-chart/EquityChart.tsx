'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { EquityPoint } from '@/entities/trade';
import { formatMoney } from '@/shared/lib/utils/format';
import { buildEquityGeometry, dipAt, W } from './model/geometry';
import { DrawdownCurve, DrawdownLayer, HoverCursor } from './ui/layers';

const fmtDate = (unixSec: number) =>
  new Date(unixSec * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');

/** «2 сделки», а не «2 сделок»: числа в табличке читают глазами, а не парсером. */
const trades = (n: number) => {
  const tail = n % 100;
  if (tail > 10 && tail < 20) return `${n} сделок`;
  const last = n % 10;
  if (last === 1) return `${n} сделка`;
  if (last >= 2 && last <= 4) return `${n} сделки`;
  return `${n} сделок`;
};

/** Зазор между точкой на кривой и табличкой. */
const GAP = 12;

/**
 * Табличка стоит у самой точки: справа-сверху от неё, а у края холста
 * переворачивается на другую сторону — ширину и высоту она отмеряет сама,
 * поэтому смещение считается процентами от собственного размера, а не
 * прикидкой в пикселях.
 */
function readoutAt(point: { x: number; y: number }, u: number, boxW: number) {
  // Геометрия кривой — в единицах холста, табличка — в пикселях страницы.
  const px = point.x / u;
  const py = point.y / u;
  const flipX = boxW > 0 && px > boxW * 0.62;
  const flipY = py < 64;

  return {
    left: `${px.toFixed(1)}px`,
    top: `${py.toFixed(1)}px`,
    transform: `translate(${flipX ? `calc(-100% - ${GAP}px)` : `${GAP}px`}, ${
      flipY ? `${GAP}px` : `calc(-100% - ${GAP}px)`
    })`,
  };
}

/**
 * Кривая накопленного P&L — единственный элемент продукта, который выходит за
 * наборную полосу в край вьюпорта. Она идёт после свода: сначала итог, потом
 * то, как он набирался.
 *
 * Просадки показаны не рамкой вокруг одной ямы, а «уровнем воды»: пунктир —
 * достигнутый рекорд, всё, что провалилось под него, залито цветом убытка, а
 * сама кривая по ходу ямы наливается красным тем сильнее, чем глубже сидит. Так
 * видно сразу все ямы, их глубину и длину, а кривая при этом ничем не закрыта.
 *
 * Чисел на холсте нет вовсе: они собраны в табличке наведения — накопленный
 * итог с датой, а под ним просадка, но только если точка внутри ямы. Раньше
 * эти подписи стояли прямо на кривой и перечёркивались ею.
 *
 * Сам компонент — только порядок слоёв и наведение: что где лежит, считает
 * `model/geometry`, как это выглядит — `ui/layers`.
 */
export function EquityChart({ data, height = 300 }: { data: EquityPoint[]; height?: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  // Кривых на странице две (обзор и выборка) — id градиента должен быть свой,
  // иначе вторая подхватит растяжку первой.
  const gradientId = `eq-dd-${useId().replaceAll(':', '')}`;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [boxW, setBoxW] = useState(0);
  const chart = useMemo(() => buildEquityGeometry(data, height), [data, height]);

  // Холст масштабируется целиком, вместе с подписями: в узкой колонке
  // (кривая выборки) единица viewBox — это половина пикселя, и кегль,
  // заданный в единицах, на экране вдвое мельче, чем в широкой раскладке.
  // Меряем ширину и пересчитываем подписи в экранные пиксели.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    setBoxW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setBoxW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Сколько единиц холста приходится на один экранный пиксель. */
  const u = boxW > 0 ? W / boxW : 1;

  if (!chart) return null;

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const frac = (e.clientX - rect.left) / rect.width;
    setHoverIdx(Math.max(0, Math.min(data.length - 1, Math.round(frac * (data.length - 1)))));
  };

  const hover = hoverIdx != null ? { point: chart.points[hoverIdx], ...data[hoverIdx] } : null;
  const worst = chart.worstDrawdown;

  // Просадка — только если точка и правда внутри ямы, и та самая, в которую
  // попал курсор, а не худшая за период. На подъёме второй строки нет вовсе.
  const dip = hoverIdx != null ? dipAt(chart, hoverIdx) : null;

  return (
    <div
      ref={boxRef}
      onPointerMove={onMove}
      onPointerLeave={() => setHoverIdx(null)}
      style={{ position: 'relative' }}
    >
      <svg
        viewBox={`0 0 ${W} ${height}`}
        style={{ display: 'block', width: '100%', height: 'auto' }}
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

        <DrawdownLayer chart={chart} />

        <polyline
          points={chart.line}
          fill="none"
          stroke="var(--color-fg)"
          strokeWidth="1.75"
          strokeLinejoin="round"
          pathLength={1}
          className="equity-line"
        />
        <DrawdownCurve chart={chart} id={gradientId} />

        {hover && <HoverCursor point={hover.point} height={height} u={u} />}
      </svg>

      {/* Табличка наведения — HTML, а не текст в SVG: кегль не зависит от
          ширины холста, длинная строка переносится сама. Держится точки на
          кривой и отпрыгивает от края — у правого борта уходит влево от
          курсора, у верхнего встаёт под точку, а не над ней. */}
      {hover && (
        <div className="eq-readout" style={readoutAt(hover.point, u, boxW)}>
          <div className="n">
            {formatMoney(hover.value)}
            <span className="eq-readout-dim"> · {fmtDate(hover.time)}</span>
          </div>
          {dip && (
            <div className="n eq-readout-dip">
              {formatMoney(-dip.depth)} просадка за {trades(dip.endIdx - dip.fromIdx)}
              {dip.recovered ? '' : ', не отыграна'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
