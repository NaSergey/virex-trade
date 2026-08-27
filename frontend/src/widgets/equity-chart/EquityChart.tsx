'use client';

import {
  memo,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslations } from 'next-intl';
import type { EquityPoint } from '@/entities/trade';
import { formatMoney } from '@/shared/lib/utils/format';
import { useLocaleControl } from '@/shared/i18n';
import { buildEquityGeometry, dipAt, hoverIndex, W } from './model/geometry';
import { DrawdownCurve, DrawdownLayer, HoverCursor } from './ui/layers';

const fmtDate = (unixSec: number, locale: string) =>
  new Date(unixSec * 1000).toLocaleDateString(locale, { day: 'numeric', month: 'short' }).replace('.', '');

/** Зазор между точкой на кривой и табличкой. */
const GAP = 12;

/**
 * В каких пределах холст стоит на экране. Пропорция задана шириной наборной
 * полосы (1360 единиц) и высотой в тех же единицах — на широком экране это
 * ровно то, что нужно, а на телефоне те же 300 единиц оборачивались полосой в
 * восемьдесят пикселей: кривая переставала быть кривой и читалась как черта с
 * шероховатостями. Ниже MIN_PX холст не опускается, выше MAX_PX не растёт —
 * иначе на большом мониторе кривая занимала бы пол-экрана.
 */
const MIN_PX = 190;
const MAX_PX = 420;

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
/**
 * Холст под memo: на Обзоре кривая стоит над журналом, и перелистывание
 * страницы журнала перерисовывало родителя — вместе с ним пересобиралась вся
 * геометрия кривой, к сделкам на листе никакого отношения не имеющая. Ряд
 * точек приходит из кэша запроса и по ссылке не меняется, поэтому сравнение
 * пропсов здесь честно отсекает лишнюю работу.
 */
export const EquityChart = memo(function EquityChart({
  data,
  height = 300,
}: {
  data: EquityPoint[];
  height?: number;
}) {
  const t = useTranslations('equityChart');
  const { locale } = useLocaleControl();
  const intlLocale = locale === 'en' ? 'en-US' : 'ru-RU';
  const boxRef = useRef<HTMLDivElement>(null);
  // Кривых на странице две (обзор и выборка) — id градиента должен быть свой,
  // иначе вторая подхватит растяжку первой.
  const gradientId = `eq-dd-${useId().replaceAll(':', '')}`;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [boxW, setBoxW] = useState(0);
  // Высота холста в единицах viewBox считается от измеренной ширины: сколько
  // бы единиц ни было объявлено пропсом, на экране холст обязан остаться в
  // пределах MIN_PX…MAX_PX. На широкой наборной полосе счёт даёт ровно
  // объявленное — правило работает только там, где пропорция врёт.
  const vbHeight = useMemo(() => {
    if (boxW <= 0) return height;
    const px = Math.min(MAX_PX, Math.max(MIN_PX, (boxW * height) / W));
    return Math.round((px * W) / boxW);
  }, [boxW, height]);
  const chart = useMemo(() => buildEquityGeometry(data, vbHeight), [data, vbHeight]);

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

  // Не hoverIdx напрямую: ряд под курсором меняется (смена фильтров на
  // выборке), и прежний индекс указывал бы в сделку, которой в нём уже нет.
  const idx = hoverIndex(chart, hoverIdx);
  const hover = idx != null ? { point: chart.points[idx], ...data[idx] } : null;
  const worst = chart.worstDrawdown;

  // Просадка — только если точка и правда внутри ямы, и та самая, в которую
  // попал курсор, а не худшая за период. На подъёме второй строки нет вовсе.
  const dip = idx != null ? dipAt(chart, idx) : null;

  const ariaLabel =
    t('ariaBase', { pnl: formatMoney(chart.last.value), n: data.length }) +
    (worst
      ? t('ariaDrawdowns', {
          count: chart.underwater.length,
          worst: formatMoney(-worst.depth),
          n: worst.endIdx - worst.fromIdx,
        }) + (worst.recovered ? t('ariaRecovered') : t('ariaNotRecovered'))
      : '');

  return (
    <div
      ref={boxRef}
      onPointerMove={onMove}
      onPointerLeave={() => setHoverIdx(null)}
      style={{ position: 'relative' }}
    >
      <svg
        viewBox={`0 0 ${W} ${vbHeight}`}
        style={{ display: 'block', width: '100%', height: 'auto' }}
        role="img"
        aria-label={ariaLabel}
      >
        <line
          x1="0"
          y1={chart.zeroY.toFixed(1)}
          x2={W}
          y2={chart.zeroY.toFixed(1)}
          stroke="var(--color-line-2)"
          strokeWidth={u.toFixed(2)}
          shapeRendering="crispEdges"
        />

        {/* Тело кривой — тихой костью до нуля: оно даёт кривой вес, но ничего
            не утверждает, поэтому и стоит на самом нижнем уровне яркости. */}
        <path d={chart.area} fill="var(--color-fg)" opacity="0.06" className="equity-fade" />

        <DrawdownLayer chart={chart} u={u} />

        {/* Толщина линий задана в экранных пикселях и переведена в единицы
            холста: полторы единицы на телефоне — это меньше половины пикселя,
            и кривая выцветала до тени от самой себя. */}
        <polyline
          points={chart.line}
          fill="none"
          stroke="var(--color-fg)"
          strokeWidth={(1.75 * u).toFixed(2)}
          strokeLinejoin="round"
          pathLength={1}
          className="equity-line"
        />
        <DrawdownCurve chart={chart} id={gradientId} u={u} />

        {hover && <HoverCursor point={hover.point} height={vbHeight} u={u} />}
      </svg>

      {/* Табличка наведения — HTML, а не текст в SVG: кегль не зависит от
          ширины холста, длинная строка переносится сама. Держится точки на
          кривой и отпрыгивает от края — у правого борта уходит влево от
          курсора, у верхнего встаёт под точку, а не над ней. */}
      {hover && (
        <div className="eq-readout" style={readoutAt(hover.point, u, boxW)}>
          <div className="n">
            {formatMoney(hover.value)}
            <span className="eq-readout-dim"> · {fmtDate(hover.time, intlLocale)}</span>
          </div>
          {dip && (
            <div className="n eq-readout-dip">
              {t('dipLabel', {
                amount: formatMoney(-dip.depth),
                trades: t('dipTrades', { n: dip.endIdx - dip.fromIdx }),
              })}
              {dip.recovered ? '' : t('ariaNotRecovered')}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
