'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import type { Candle } from '../lib/candles';

const W = 720;
const H = 380;
const PR = 72; // полоса цен справа
const PT = 14;
const PB = 24;
const PW = W - PR;
/** Столько свечей помещается на холст; если их меньше, они прижаты вправо — к «сейчас». */
const SLOTS = 120;
const TICKS = 5;

export type LevelKind = 'entry' | 'stop' | 'take';

export interface Level {
  kind: LevelKind;
  price: number;
  draggable: boolean;
}

const LEVEL_COLOR: Record<LevelKind, string> = {
  entry: 'var(--color-fg)',
  stop: 'var(--loss)',
  take: 'var(--profit)',
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * График прокрутки: свечи до текущего момента и уровни сделки.
 *
 * Своё SVG, как все графики продукта (см. RangeCheckChart): библиотеке
 * пришлось бы переопределять цвета, шрифты и рамки по одному свойству. Холст
 * масштабируется целиком, поэтому пиксельные мерки переводятся в единицы
 * холста через u = W / boxW — иначе на телефоне подписи выходили бы в четыре
 * пикселя.
 *
 * Стоп и тейк перетаскиваются. Пока уровень тянут, шкала цен заморожена: иначе
 * уровень, уходящий за край, растягивал бы шкалу, и линия уезжала бы из-под
 * курсора.
 */
export function ReplayChart({
  candles,
  levels,
  labelFor,
  levelLabel,
  onDragLevel,
}: {
  candles: Candle[];
  levels: Level[];
  labelFor: (t: number) => string;
  levelLabel: (kind: LevelKind) => string;
  onDragLevel?: (kind: LevelKind, price: number, done: boolean) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [boxW, setBoxW] = useState(0);
  const [drag, setDrag] = useState<LevelKind | null>(null);
  const frozen = useRef<{ lo: number; hi: number } | null>(null);
  const lastDrag = useRef<number | null>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    setBoxW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setBoxW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const u = boxW > 0 ? W / boxW : 1;
  const px = (n: number) => n * u;

  const shown = candles.slice(-SLOTS);
  let lo: number;
  let hi: number;
  if (drag && frozen.current) {
    ({ lo, hi } = frozen.current);
  } else {
    const values = [...shown.flatMap((c) => [c.h, c.l]), ...levels.map((l) => l.price)];
    lo = values.length ? Math.min(...values) : 0;
    hi = values.length ? Math.max(...values) : 1;
    const pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.01 || 1;
    lo -= pad;
    hi += pad;
  }

  const plotH = H - PT - PB;
  const y = (p: number) => PT + ((hi - p) / (hi - lo)) * plotH;
  const priceAt = (yy: number) => clamp(hi - ((yy - PT) / plotH) * (hi - lo), lo, hi);
  const slot = PW / SLOTS;
  const offset = SLOTS - shown.length;
  const cx = (i: number) => (offset + i) * slot + slot / 2;
  const bodyW = Math.max(px(1), slot * 0.66);

  const svgY = (clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return ((clientY - r.top) / r.height) * H;
  };

  const startDrag = (kind: LevelKind) => (e: PointerEvent<SVGRectElement>) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    frozen.current = { lo, hi };
    setDrag(kind);
  };

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag || !onDragLevel) return;
    const p = priceAt(svgY(e.clientY));
    lastDrag.current = p;
    onDragLevel(drag, p, false);
  };

  const endDrag = () => {
    if (drag && onDragLevel && lastDrag.current != null) onDragLevel(drag, lastDrag.current, true);
    setDrag(null);
    frozen.current = null;
    lastDrag.current = null;
  };

  const ticks = Array.from({ length: TICKS }, (_, i) => lo + ((i + 0.5) / TICKS) * (hi - lo));
  const timeIdx = shown.length ? [...new Set([0.15, 0.5, 0.85].map((f) => Math.floor(f * (shown.length - 1))))] : [];

  return (
    <svg
      ref={svgRef}
      className="replay-chart"
      viewBox={`0 0 ${W} ${H}`}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {ticks.map((p) => (
        <g key={p}>
          <line x1={0} x2={PW} y1={y(p)} y2={y(p)} stroke="var(--color-line)" strokeWidth={px(1)} />
          <text x={PW + px(6)} y={y(p) + px(3.5)} fill="var(--color-muted)" fontSize={px(10)} fontFamily="var(--font-mono)">
            {formatPriceGrouped(p)}
          </text>
        </g>
      ))}

      {shown.map((c, i) => {
        const color = c.c >= c.o ? 'var(--profit)' : 'var(--loss)';
        const top = y(Math.max(c.o, c.c));
        const bottom = y(Math.min(c.o, c.c));
        return (
          <g key={c.t}>
            <line x1={cx(i)} x2={cx(i)} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth={px(1)} />
            <rect x={cx(i) - bodyW / 2} y={top} width={bodyW} height={Math.max(px(1), bottom - top)} fill={color} />
          </g>
        );
      })}

      {timeIdx.map((i) => (
        <text key={i} x={cx(i)} y={H - px(7)} fill="var(--color-muted)" fontSize={px(10)} textAnchor="middle">
          {labelFor(shown[i].t)}
        </text>
      ))}

      {levels.map((l) => (
        <g key={l.kind}>
          <line
            x1={0}
            x2={PW}
            y1={y(l.price)}
            y2={y(l.price)}
            stroke={LEVEL_COLOR[l.kind]}
            strokeWidth={px(1.25)}
            strokeDasharray={l.kind === 'entry' ? undefined : `${px(5)} ${px(4)}`}
          />
          <text x={px(4)} y={y(l.price) - px(4)} fill={LEVEL_COLOR[l.kind]} fontSize={px(10)} fontFamily="var(--font-mono)">
            {levelLabel(l.kind)} {formatPriceGrouped(l.price)}
          </text>
          {l.draggable && onDragLevel && (
            <rect
              className="lvl-hit"
              x={0}
              y={y(l.price) - px(8)}
              width={PW}
              height={px(16)}
              fill="transparent"
              onPointerDown={startDrag(l.kind)}
            />
          )}
        </g>
      ))}
    </svg>
  );
}
