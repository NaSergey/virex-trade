'use client';

import type { PointerEvent, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import { anchorsOf, extend, fibLevels, positionOutcome, positionStats, rulerStats } from '../../lib/drawings/geometry';
import { COLOR_VAR, type Drawing } from '../../lib/drawings/types';
import type { Ruler } from './useDrawingGestures';

/** Прозрачная толщина вокруг линии, за которую её хватают, — в экранных px. */
const HIT_PX = 10;
const ANCHOR_PX = 4;
const ANCHOR_HIT_PX = 10;

export interface LayerGeo {
  xOf: (t: number) => number;
  yOf: (p: number) => number;
  px: (n: number) => number;
  /** Ширина поля свечей и вертикальные границы поля. */
  PW: number;
  top: number;
  bottom: number;
  tfMs: number;
  /** Все показанные свечи, в экранной цене — по ним long/short видит, чем кончилась позиция. */
  candles: { t: number; o: number; h: number; l: number; c: number }[];
}

/**
 * Фигуры на графике — чистая отрисовка по готовой геометрии. Жесты решает
 * `useDrawingGestures`; сюда приходят только колбэки нажатия на фигуру и якорь.
 * Пока выбран инструмент, фигуры не ловят указатель: клик по линии должен
 * ставить новую фигуру, а не выделять старую.
 */
export function DrawingLayer({
  drawings,
  selectedId,
  interactive,
  ruler,
  geo,
  onShapeDown,
  onAnchorDown,
}: {
  drawings: Drawing[];
  selectedId: string | null;
  interactive: boolean;
  ruler: Ruler | null;
  geo: LayerGeo;
  onShapeDown: (d: Drawing, e: PointerEvent<SVGElement>) => void;
  onAnchorDown: (d: Drawing, i: number, e: PointerEvent<SVGElement>) => void;
}) {
  const t = useTranslations('backtest.drawings');
  const { xOf, yOf, px, PW, top, bottom } = geo;
  const reach = PW * 4;
  const font = { fontSize: px(10), fontFamily: 'var(--font-mono)' } as const;

  const hitProps = (d: Drawing) =>
    interactive
      ? { className: 'draw-hit', onPointerDown: (e: PointerEvent<SVGElement>) => onShapeDown(d, e) }
      : { style: { pointerEvents: 'none' as const } };

  /** Невидимая толстая копия линии — за неё и хватают. */
  const hitLine = (d: Drawing, x1: number, y1: number, x2: number, y2: number, key?: string | number) => (
    <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={px(HIT_PX)} pointerEvents="stroke" {...hitProps(d)} />
  );

  /**
   * Наконечник в конце отрезка (x1,y1)→(x2,y2), длиной `len` в единицах холста:
   * точки «крыло — остриё — крыло». Полигоном — залитый треугольник, ломаной — открытая «галочка».
   */
  const arrowHead = (x1: number, y1: number, x2: number, y2: number, len: number) => {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const half = len * 0.5;
    const bx = x2 - Math.cos(ang) * len;
    const by = y2 - Math.sin(ang) * len;
    return `${bx - Math.sin(ang) * half},${by + Math.cos(ang) * half} ${x2},${y2} ${bx + Math.sin(ang) * half},${by - Math.cos(ang) * half}`;
  };

  const shape = (d: Drawing): ReactNode => {
    const color = COLOR_VAR[d.color];
    const sw = px(d.width);
    const line = { stroke: color, strokeWidth: sw, strokeLinecap: 'round' as const, pointerEvents: 'none' as const };
    const [a, b] = d.points;
    switch (d.kind) {
      case 'hline': {
        const y = yOf(a.p);
        return (
          <>
            <line x1={-reach} x2={reach} y1={y} y2={y} {...line} />
            <text x={PW - px(4)} y={y - px(4)} fill={color} textAnchor="end" pointerEvents="none" {...font}>
              {formatPriceGrouped(a.p)}
            </text>
            {hitLine(d, -reach, y, reach, y)}
          </>
        );
      }
      case 'vline': {
        const x = xOf(a.t);
        return (
          <>
            <line x1={x} x2={x} y1={top} y2={bottom} {...line} />
            {hitLine(d, x, top, x, bottom)}
          </>
        );
      }
      case 'trend':
      case 'ray':
      case 'arrow': {
        const x1 = xOf(a.t);
        const y1 = yOf(a.p);
        let x2 = xOf(b.t);
        let y2 = yOf(b.p);
        let head: ReactNode = null;
        if (d.kind === 'ray') [x2, y2] = extend(x1, y1, x2, y2, reach);
        if (d.kind === 'arrow') {
          head = <polygon points={arrowHead(x1, y1, x2, y2, px(9 + d.width * 2))} fill={color} pointerEvents="none" />;
        }
        return (
          <>
            <line x1={x1} y1={y1} x2={x2} y2={y2} {...line} />
            {head}
            {hitLine(d, x1, y1, x2, y2)}
          </>
        );
      }
      case 'arrowUp':
      case 'arrowDown': {
        const x = xOf(a.t);
        const y = yOf(a.p);
        const s = d.kind === 'arrowUp' ? 1 : -1;
        const k = px(1 + d.width * 0.25);
        const pts = [
          [0, 0],
          [-7, 8],
          [-2.5, 8],
          [-2.5, 18],
          [2.5, 18],
          [2.5, 8],
          [7, 8],
        ]
          .map(([dx, dy]) => `${x + dx * k},${y + s * dy * k}`)
          .join(' ');
        return <polygon points={pts} fill={color} {...hitProps(d)} />;
      }
      case 'rect': {
        const x = Math.min(xOf(a.t), xOf(b.t));
        const y = Math.min(yOf(a.p), yOf(b.p));
        const w = Math.abs(xOf(b.t) - xOf(a.t));
        const h = Math.abs(yOf(b.p) - yOf(a.p));
        return <rect x={x} y={y} width={w} height={h} fill={color} fillOpacity={0.12} stroke={color} strokeWidth={sw} {...hitProps(d)} />;
      }
      case 'fib': {
        // Как в TradingView: у каждого уровня свой цвет, полоса до соседнего
        // уровня залита его цветом, подписи слева от сетки. Цвет фигуры тут не
        // участвует — сетку узнают по цветам уровней.
        const xL = Math.min(xOf(a.t), xOf(b.t));
        const xR = Math.max(xOf(a.t), xOf(b.t));
        const levels = fibLevels(a, b).map((l) => ({ ...l, y: yOf(l.price) }));
        return (
          <>
            {levels.slice(1).map((l, i) => {
              const prev = levels[i];
              return (
                <rect
                  key={`band-${l.level}`}
                  x={xL}
                  y={Math.min(prev.y, l.y)}
                  width={xR - xL}
                  height={Math.abs(l.y - prev.y)}
                  fill={l.color}
                  fillOpacity={0.12}
                  pointerEvents="none"
                />
              );
            })}
            <line
              x1={xOf(a.t)}
              y1={yOf(a.p)}
              x2={xOf(b.t)}
              y2={yOf(b.p)}
              stroke="#787b86"
              strokeWidth={px(1)}
              strokeDasharray={`${px(4)} ${px(4)}`}
              pointerEvents="none"
            />
            {levels.map(({ level, price, color: c, y }) => (
              <g key={level}>
                <line x1={xL} x2={xR} y1={y} y2={y} stroke={c} strokeWidth={sw} pointerEvents="none" />
                <text x={xL - px(4)} y={y + px(3.5)} fill={c} textAnchor="end" pointerEvents="none" {...font}>
                  {level} ({formatPriceGrouped(price)})
                </text>
                {hitLine(d, xL, y, xR, y)}
              </g>
            ))}
          </>
        );
      }
      case 'long':
      case 'short': {
        const [entry, stop, take] = d.points;
        const x0 = xOf(entry.t);
        const x1 = xOf(stop.t);
        const w = Math.max(px(1), x1 - x0);
        const yE = yOf(entry.p);
        const yT = yOf(take.p);
        const yS = yOf(stop.p);
        const s = positionStats(entry.p, stop.p, take.p);
        const zone = (y1: number, y2: number, fill: string) => (
          <rect x={x0} y={Math.min(y1, y2)} width={w} height={Math.abs(y2 - y1)} fill={fill} fillOpacity={0.16} {...hitProps(d)} />
        );
        // Подпись встаёт у дальнего от входа края зоны — внутри неё, там, где не мешает линии входа.
        const labelY = (y: number) => (y < yE ? y + px(12) : y - px(4));

        // Как у позиции в TradingView: часть зоны от свечи, где цена дошла до
        // входа, до последней свечи диапазона закрашена поверх плотнее — зелёным,
        // если цена на стороне тейка, красным, если на стороне стопа. До входа
        // цена не дошла — подсветки нет: сделки не было. Задет тейк или стоп —
        // подсветка встаёт на той свече и дальше вправо не идёт.
        const out = positionOutcome(d.kind, d.points, geo.candles);
        let played: ReactNode = null;
        if (out) {
          const xs = xOf(out.from);
          const xe = xOf(out.t);
          const ye = yOf(out.p);
          const onTakeSide = d.kind === 'long' ? out.p >= entry.p : out.p <= entry.p;
          const won = out.result === 'take' || (out.result === 'open' && onTakeSide);
          played = (
            <rect
              x={xs}
              y={Math.min(yE, ye)}
              width={Math.max(0, xe - xs)}
              height={Math.abs(ye - yE)}
              fill={won ? 'var(--profit)' : 'var(--loss)'}
              fillOpacity={0.22}
              pointerEvents="none"
            />
          );
        }
        return (
          <>
            {zone(yE, yT, 'var(--profit)')}
            {zone(yE, yS, 'var(--loss)')}
            {played}
            <line x1={x0} x2={x0 + w} y1={yE} y2={yE} stroke="var(--color-fg)" strokeWidth={px(1)} pointerEvents="none" />
            <text x={x0 + px(4)} y={labelY(yT)} fill="var(--profit)" pointerEvents="none" {...font}>
              {t('take')} {s.rewardPct.toFixed(2)}%
            </text>
            <text x={x0 + px(4)} y={labelY(yS)} fill="var(--loss)" pointerEvents="none" {...font}>
              {t('stop')} {s.riskPct.toFixed(2)}%
            </text>
            {s.rr != null && (
              <text x={x0 + px(4)} y={yE - px(4)} fill="var(--color-fg)" pointerEvents="none" {...font}>
                R:R {s.rr.toFixed(2)}
              </text>
            )}
          </>
        );
      }
      case 'brush': {
        const pts = d.points.map((q) => `${xOf(q.t)},${yOf(q.p)}`).join(' ');
        return (
          <>
            <polyline points={pts} fill="none" {...line} strokeLinejoin="round" />
            <polyline
              points={pts}
              fill="none"
              stroke="transparent"
              strokeWidth={px(HIT_PX)}
              pointerEvents="stroke"
              {...hitProps(d)}
            />
          </>
        );
      }
    }
  };

  const selected = drawings.find((d) => d.id === selectedId) ?? null;

  return (
    <g className="draw-layer">
      {drawings.map((d) => (
        <g key={d.id}>{shape(d)}</g>
      ))}

      {selected &&
        interactive &&
        anchorsOf(selected).map((q, i) => {
          const x = selected.kind === 'hline' ? Math.min(Math.max(xOf(q.t), px(12)), PW - px(12)) : xOf(q.t);
          const y = selected.kind === 'vline' ? (top + bottom) / 2 : yOf(q.p);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={px(ANCHOR_PX)} fill="var(--color-background)" stroke={COLOR_VAR[selected.color]} strokeWidth={px(1.5)} pointerEvents="none" />
              <circle
                className="draw-anchor"
                cx={x}
                cy={y}
                r={px(ANCHOR_HIT_PX)}
                fill="transparent"
                onPointerDown={(e) => onAnchorDown(selected, i, e)}
              />
            </g>
          );
        })}

      {ruler && <RulerShape ruler={ruler} geo={geo} />}
    </g>
  );
}

function RulerShape({ ruler, geo }: { ruler: Ruler; geo: LayerGeo }) {
  const t = useTranslations('backtest.drawings');
  const { xOf, yOf, px, tfMs } = geo;
  const { a, b } = ruler;
  const s = rulerStats(a, b, tfMs);
  const color = s.dp >= 0 ? 'var(--profit)' : 'var(--loss)';
  const x1 = xOf(a.t);
  const y1 = yOf(a.p);
  const x2 = xOf(b.t);
  const y2 = yOf(b.p);
  const mins = Math.round(Math.abs(s.ms) / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const dur = [d && `${d}${t('unitD')}`, h && `${h}${t('unitH')}`, (m || mins === 0) && `${m}${t('unitM')}`].filter(Boolean).join(' ');
  const lines = [
    `${s.dp >= 0 ? '+' : '−'}${formatPriceGrouped(Math.abs(s.dp))} (${s.pct >= 0 ? '+' : ''}${s.pct.toFixed(2)}%)`,
    `${Math.abs(s.bars)} ${t('bars')} · ${dur}`,
  ];
  const boxW = px(8) + Math.max(...lines.map((l) => l.length)) * px(6.2);
  const boxH = px(32);
  const bx = x2 - boxW / 2;
  const by = y2 < y1 ? y2 - boxH - px(6) : y2 + px(6);
  return (
    <g pointerEvents="none">
      <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} fill={color} fillOpacity={0.12} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={px(1)} />
      <rect x={bx} y={by} width={boxW} height={boxH} fill="var(--color-background)" stroke={color} strokeWidth={px(1)} />
      {lines.map((l, i) => (
        <text key={i} x={x2} y={by + px(13) + i * px(13)} fill={color} textAnchor="middle" fontSize={px(10)} fontFamily="var(--font-mono)">
          {l}
        </text>
      ))}
    </g>
  );
}
