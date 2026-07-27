'use client';

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { formatPnl } from '@/shared/lib/utils/format';
import type { EquityPoint } from '@/shared/api/bybit/hooks';

// Шкала значений справа, как в торговом терминале: глаз держится у последнего
// результата, а не у начала истории. Слева остаётся только воздух.
const PAD_L = 12;
const PAD_R = 58;
const PAD_T = 16;
const PAD_B = 20;

/** Ширина плашки под моноширинный текст — ~6.2px на знак. */
const badgeW = (text: string) => Math.round(text.length * 6.2) + 12;

/**
 * Цвет состояния кривой: 0 — рост (зелёный), 1 — дно худшей просадки
 * (красный). Смешиваем в oklab, чтобы середина не уходила в грязный бурый,
 * как это делает интерполяция в sRGB.
 */
const stateColor = (redness: number) =>
  `color-mix(in oklab, var(--color-down) ${(redness * 100).toFixed(1)}%, var(--color-up))`;

/**
 * Деления оси с «круглым» шагом (1/2/5 × 10ⁿ) — 1.5 и 3.75 на оси не место.
 * Диапазон округляется наружу (floor/ceil), поэтому крайние точки кривой
 * не ложатся на кромку холста.
 */
function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const mag = 10 ** Math.floor(Math.log10(span / count));
  const norm = span / count / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const ticks: number[] = [];
  const end = Math.ceil(max / step) * step;
  for (let v = Math.floor(min / step) * step; v <= end + step / 1000; v += step) {
    // Накопление шага плывёт на float — подчищаем, иначе подпись станет «49.99».
    ticks.push(Math.abs(v) < step / 1000 ? 0 : Number(v.toPrecision(12)));
  }
  return ticks;
}

/** Компактная подпись деления: 1200 → 1.2k, мелочь без лишних нулей. */
function fmtTick(v: number): string {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1000) return `${(v / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return abs < 10 ? v.toFixed(1) : v.toFixed(0);
}

const fmtDate = (unixSec: number) =>
  new Date(unixSec * 1000).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });

/**
 * Вся геометрия графика — чистой функцией, отдельно от рендера: так её можно
 * прогнать на данных и проверить, что подписи и точки лежат внутри холста,
 * а пути не содержат NaN.
 */
export function buildEquityGeometry(data: EquityPoint[], plotW: number, plotH: number) {
  if (plotW <= 0 || plotH <= 0 || data.length === 0) return null;

  const values = data.map((p) => p.value);
  const n = values.length;
  // Ноль всегда в кадре: кривая, целиком лежащая в плюсе, всё равно должна
  // показывать, насколько она от нуля оторвалась.
  const minV = Math.min(0, ...values);
  const maxV = Math.max(0, ...values);
  const ticks = niceTicks(minV, maxV);
  let lo = Math.min(minV, ...ticks);
  let hi = Math.max(maxV, ...ticks);
  // Вырожденный случай (все значения равны — например, кривая в нуле): без
  // раздвижки домена деление на нулевой размах прижало бы линию к кромке.
  if (hi - lo < 1e-9) {
    const pad = Math.max(1, Math.abs(hi) * 0.1);
    lo -= pad;
    hi += pad;
  }

  const x = (i: number) => PAD_L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD_T + (1 - (v - lo) / (hi - lo || 1)) * plotH;

  const peaks: number[] = [];
  let running = -Infinity;
  let maxDrawdown = 0;
  for (const v of values) {
    running = Math.max(running, v);
    peaks.push(running);
    maxDrawdown = Math.max(maxDrawdown, running - v);
  }

  const points = values.map((v, i) => ({ x: x(i), y: y(v) }));
  const lastX = x(n - 1);
  const lastY = y(values[n - 1]);
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const peakPath = peaks.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');

  // Заливка замыкается на НОЛЬ, а не на дно холста, и режется по нулевой линии
  // на две части: выше — прибыль, ниже — убыток. Один сплошной подмалёвок
  // «в пол» этой границы не показывал вовсе.
  const zeroY = y(0);
  const areaPath =
    n > 1 ? `${linePath} L${lastX.toFixed(2)},${zeroY.toFixed(2)} L${x(0).toFixed(2)},${zeroY.toFixed(2)} Z` : '';

  // Цвет линии по состоянию кривой: на новом максимуме — зелёная, в просадке
  // краснеет тем сильнее, чем глубже провал относительно худшего за период.
  // Точка отсчёта — именно максимальная просадка, поэтому «полностью красный»
  // всегда означает худший момент, а не абстрактный порог.
  const ddRef = maxDrawdown > 0 ? maxDrawdown : 1;
  const redness = (i: number) => Math.min(1, (peaks[i] - values[i]) / ddRef);
  // Один stop на точку, но не больше ~120: на длинной истории лишние стопы
  // ничего не добавляют глазу и только раздувают разметку.
  const stride = Math.max(1, Math.ceil(n / 120));
  const stopIdx = [...new Set([...Array.from({ length: Math.ceil(n / stride) }, (_, k) => k * stride), n - 1])]
    .filter((i) => i < n)
    .sort((a, b) => a - b);
  const colorStops = stopIdx.map((i) => ({
    offset: n === 1 ? 0 : i / (n - 1),
    redness: redness(i),
  }));

  // 4–5 дат по оси X, привязанных к реальным точкам.
  const tickCount = Math.min(5, n);
  const xTicks =
    n === 1 ? [0] : Array.from({ length: tickCount }, (_, k) => Math.round((k / (tickCount - 1)) * (n - 1)));

  return {
    linePath,
    peakPath,
    areaPath,
    colorStops,
    lastRedness: redness(n - 1),
    points,
    peaks,
    yTicks: ticks.map((v) => ({ v, y: y(v) })),
    xTicks: [...new Set(xTicks)].map((i) => ({ i, x: x(i), time: data[i].time })),
    zeroY,
    plotTop: PAD_T,
    plotBottom: PAD_T + plotH,
    last: { x: lastX, y: lastY, v: values[n - 1] },
    peak: Math.max(...values),
    maxDrawdown,
  };
}

/** Плашка значения на правой шкале — «ценник», как в терминале биржи. */
function AxisBadge({ x, y, text, current }: { x: number; y: number; text: string; current?: boolean }) {
  const w = badgeW(text);
  return (
    <g>
      <rect
        x={x}
        y={y - 9}
        width={w}
        height={18}
        rx={3}
        fill={current ? 'var(--color-fg)' : 'var(--color-elevated-2)'}
        stroke={current ? 'none' : 'var(--color-line-strong)'}
        strokeWidth={1}
      />
      <text
        x={x + w / 2}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        className="font-mono text-[10.5px] font-bold tabular-nums"
        fill={current ? 'var(--color-surface)' : 'var(--color-fg)'}
      >
        {text}
      </text>
    </g>
  );
}

/**
 * Кумулятивная кривая P&L, оформленная как экран торгового терминала: шкала
 * значений справа, «ценник» текущего результата на ней, при наведении —
 * перекрестие с плашками значения и даты прямо на осях.
 *
 * Своё inline-SVG, а не lightweight-charts: v4 (без series primitives из v5)
 * не умеет заливку между двумя кривыми, а она здесь несёт просадку.
 *
 * Координаты считаются в реальных пикселях по замеру контейнера, а не через
 * растянутый viewBox: при неравномерном масштабе SVG искажает толщину линии,
 * превращает точку в эллипс и плющит текст — с подписями осей это несовместимо.
 *
 * Ось X — номер сделки, а не время: точки приходят по одной на сделку, и
 * равномерный шаг между ними и есть смысл equity-кривой. Даты снизу
 * подписывают конкретные точки, поэтому шкала остаётся честной.
 */
export function EquityChart({ data }: { data: EquityPoint[] }) {
  const uid = useId().replace(/:/g, '');
  const boxRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plotW = Math.max(0, box.w - PAD_L - PAD_R);
  const plotH = Math.max(0, box.h - PAD_T - PAD_B);
  const chart = useMemo(() => buildEquityGeometry(data, plotW, plotH), [data, plotW, plotH]);

  const onMove = (e: ReactPointerEvent<SVGRectElement>) => {
    if (!chart) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - PAD_L;
    setHoverIdx(Math.max(0, Math.min(data.length - 1, Math.round((px / (plotW || 1)) * (data.length - 1)))));
  };

  const hover =
    chart && hoverIdx != null && hoverIdx < chart.points.length
      ? {
          point: chart.points[hoverIdx],
          value: data[hoverIdx].value,
          peak: chart.peaks[hoverIdx],
          time: data[hoverIdx].time,
        }
      : null;

  const plotRight = PAD_L + plotW;
  const dateBadgeX = hover ? Math.min(Math.max(hover.point.x - 21, PAD_L), Math.max(PAD_L, plotRight - 42)) : 0;

  return (
    <div className="flex h-full w-full flex-col">
      {/* Шапка в духе терминала: слева «файл», справа сводка за период. */}
      <div className="mb-1.5 flex shrink-0 items-baseline gap-2 font-mono text-[10px] whitespace-nowrap">
        <span className="text-subtle">~/stats/equity.dat</span>
        {chart && (
          <>
            <span className="text-line-strong">│</span>
            <span className="text-subtle">
              n=<span className="tabular-nums text-muted">{data.length}</span>
            </span>
            <span className="ml-auto text-subtle">
              max <span className="tabular-nums text-muted">{formatPnl(chart.peak)}</span>
            </span>
            <span className="text-subtle">
              dd <span className="tabular-nums text-down">-{chart.maxDrawdown.toFixed(2)}</span>
            </span>
          </>
        )}
      </div>

      <div ref={boxRef} className="relative min-h-0 w-full flex-1">
        {chart && (
          <svg
            width={box.w}
            height={box.h}
            className="block"
            role="img"
            aria-label={`Накопленный P&L: ${formatPnl(chart.last.v)} USDT за ${data.length} сделок`}
          >
            <defs>
              {/* Продольный градиент состояния: по одному stop на точку,
                  цвет — от зелёного на новом максимуме до красного на дне
                  худшей просадки. Им красятся и линия, и заливка, поэтому
                  они всегда говорят одно и то же. */}
              <linearGradient
                id={`state-${uid}`}
                gradientUnits="userSpaceOnUse"
                x1={PAD_L}
                y1={0}
                x2={plotRight}
                y2={0}
              >
                {chart.colorStops.map((s, k) => (
                  <stop key={k} offset={s.offset} stopColor={stateColor(s.redness)} />
                ))}
              </linearGradient>
              {/* Заливка гаснет к нулевой линии: она лежит между кривой и
                  нулём, значит выцветать должна именно к нему, а не к низу. */}
              <linearGradient
                id={`fade-${uid}`}
                gradientUnits="userSpaceOnUse"
                x1={0}
                y1={chart.plotTop}
                x2={0}
                y2={chart.plotBottom}
              >
                <stop offset="0%" stopColor="#fff" stopOpacity="0.34" />
                <stop
                  offset={Math.min(1, Math.max(0, (chart.zeroY - chart.plotTop) / (chart.plotBottom - chart.plotTop)))}
                  stopColor="#fff"
                  stopOpacity="0.02"
                />
                <stop offset="100%" stopColor="#fff" stopOpacity="0.34" />
              </linearGradient>
              <mask id={`areamask-${uid}`}>
                <rect
                  x={PAD_L}
                  y={chart.plotTop}
                  width={Math.max(0, plotW)}
                  height={Math.max(0, chart.plotBottom - chart.plotTop)}
                  fill={`url(#fade-${uid})`}
                />
              </mask>
              {/* Мягкое свечение под линией — глубина вместо плоского штриха. */}
              <filter id={`glow-${uid}`} x="-10%" y="-40%" width="120%" height="180%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Сетка: волосяные линии на шаг от фона, ноль — заметнее. */}
            {chart.xTicks.map((t) => (
              <line
                key={`vx-${t.i}`}
                x1={t.x}
                y1={chart.plotTop}
                x2={t.x}
                y2={chart.plotBottom}
                stroke="var(--color-line)"
                strokeWidth={1}
                opacity={0.5}
                shapeRendering="crispEdges"
              />
            ))}
            {chart.yTicks.map((t) => (
              <line
                key={`hz-${t.v}`}
                x1={PAD_L}
                y1={t.y}
                x2={plotRight}
                y2={t.y}
                stroke={t.v === 0 ? 'var(--color-line-strong)' : 'var(--color-line)'}
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
            ))}

            <g className="equity-fade">
              <path d={chart.areaPath} fill={`url(#state-${uid})`} mask={`url(#areamask-${uid})`} />
              <path
                d={chart.peakPath}
                fill="none"
                stroke="var(--color-subtle)"
                strokeWidth={1}
                strokeDasharray="1 4"
                strokeLinecap="round"
                opacity={0.5}
              />
            </g>

            <path
              d={chart.linePath}
              fill="none"
              stroke={`url(#state-${uid})`}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              filter={`url(#glow-${uid})`}
              pathLength={1}
              className="equity-line"
            />

            {/* Правая шкала значений. */}
            <line
              x1={plotRight}
              y1={chart.plotTop}
              x2={plotRight}
              y2={chart.plotBottom}
              stroke="var(--color-line)"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
            {chart.yTicks.map((t) => (
              <text
                key={`yl-${t.v}`}
                x={plotRight + 7}
                y={t.y}
                dominantBaseline="middle"
                className="fill-subtle font-mono text-[9.5px] tabular-nums"
                // Деление под плашкой прячем — иначе цифры наезжают друг на друга.
                opacity={
                  (hover && Math.abs(t.y - hover.point.y) < 11) || Math.abs(t.y - chart.last.y) < 11 ? 0 : 1
                }
              >
                {fmtTick(t.v)}
              </text>
            ))}

            {chart.xTicks.map((t, k) => (
              <text
                key={`xl-${t.i}`}
                x={t.x}
                y={box.h - 6}
                textAnchor={k === 0 ? 'start' : k === chart.xTicks.length - 1 ? 'end' : 'middle'}
                className="fill-subtle font-mono text-[9.5px] tabular-nums"
              >
                {fmtDate(t.time)}
              </text>
            ))}

            {/* Текущий результат «ценником» на шкале — читается без наведения. */}
            <g className="equity-fade" opacity={hover ? 0.3 : 1}>
              <line
                x1={PAD_L}
                y1={chart.last.y}
                x2={plotRight}
                y2={chart.last.y}
                stroke="var(--color-fg)"
                strokeWidth={1}
                strokeDasharray="2 3"
                opacity={0.3}
              />
              <circle
                cx={chart.last.x}
                cy={chart.last.y}
                r={4}
                fill={stateColor(chart.lastRedness)}
                stroke="var(--color-surface)"
                strokeWidth={2}
              />
              <AxisBadge x={plotRight + 3} y={chart.last.y} text={formatPnl(chart.last.v)} current />
            </g>

            {hover && (
              <>
                <line
                  x1={hover.point.x}
                  y1={chart.plotTop}
                  x2={hover.point.x}
                  y2={chart.plotBottom}
                  stroke="var(--color-line-strong)"
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <line
                  x1={PAD_L}
                  y1={hover.point.y}
                  x2={plotRight}
                  y2={hover.point.y}
                  stroke="var(--color-line-strong)"
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <circle
                  cx={hover.point.x}
                  cy={hover.point.y}
                  r={4}
                  fill={stateColor(
                    chart.maxDrawdown > 0 ? Math.min(1, (hover.peak - hover.value) / chart.maxDrawdown) : 0,
                  )}
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                />
                <AxisBadge x={plotRight + 3} y={hover.point.y} text={formatPnl(hover.value)} />
                {/* Дата — плашкой на нижней шкале, под перекрестием. */}
                <rect
                  x={dateBadgeX}
                  y={box.h - 16}
                  width={42}
                  height={15}
                  rx={3}
                  fill="var(--color-elevated-2)"
                  stroke="var(--color-line-strong)"
                  strokeWidth={1}
                />
                <text
                  x={dateBadgeX + 21}
                  y={box.h - 8}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="fill-fg font-mono text-[9.5px] tabular-nums"
                >
                  {fmtDate(hover.time)}
                </text>
              </>
            )}

            <rect
              x={0}
              y={0}
              width={box.w}
              height={box.h}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setHoverIdx(null)}
            />
          </svg>
        )}

        {/* Просадка в точке — единственное, что не влезает в плашки осей. */}
        {hover && hover.peak - hover.value > 1 && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded border border-line-strong bg-surface/95 px-2 py-1 font-mono text-[10px] tabular-nums whitespace-nowrap text-down"
            style={{
              left: Math.min(Math.max(hover.point.x, 56), Math.max(56, plotRight - 56)),
              top: hover.point.y,
            }}
          >
            просадка {formatPnl(-(hover.peak - hover.value))}
          </div>
        )}
      </div>

      {/* Легенда живёт в самом графике: иначе цвет линии и пунктир остаются
          необъяснёнными везде, где график переиспользуют. */}
      <div className="mt-1.5 flex shrink-0 flex-wrap items-center gap-x-3.5 gap-y-1 font-mono text-[10px] text-subtle">
        <span className="inline-flex items-center gap-1.5">
          <svg width="22" height="2" aria-hidden>
            <defs>
              <linearGradient id={`lg-${uid}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-up)" />
                <stop offset="100%" stopColor="var(--color-down)" />
              </linearGradient>
            </defs>
            <line x1="0" y1="1" x2="22" y2="1" stroke={`url(#lg-${uid})`} strokeWidth="2" />
          </svg>
          накопленный P&amp;L
        </span>
        <span className="text-line-strong">│</span>
        <span>
          <span className="text-up">зелёная</span> — новый максимум,{' '}
          <span className="text-down">красная</span> — глубина просадки
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="12" height="2" aria-hidden>
            <line x1="0" y1="1" x2="12" y2="1" stroke="var(--color-subtle)" strokeWidth="1" strokeDasharray="1 3" />
          </svg>
          пик
        </span>
      </div>
    </div>
  );
}
