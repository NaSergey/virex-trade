'use client';

import type { RangeCheckResponse } from '@/shared/api/bybit/hooks';
import { formatPriceGrouped } from '@/shared/lib/utils/format';

const W = 660;
const H = 230;
const PR = 96; // полоса справа под подписи уровней
const PT = 14;
const PB = 14;

/**
 * Свечи таймфрейма с нанесённым окном измерения: пунктиром — верх и низ того
 * самого окна, по которому считался «диапазон входа», сплошной краской — цена
 * входа между ними.
 *
 * Своё SVG, а не lightweight-charts: библиотеке нужны свои цвета, свои шрифты и
 * свои рамки, и всё это приходится переопределять по одному свойству. Здесь
 * рисуются три линии и N свечей — ровно то, что нужно, чтобы глазами сверить
 * число с картинкой, и ни одного пикселя чужого оформления.
 */
export function RangeCheckChart({ data }: { data: RangeCheckResponse }) {
  const candles = data.candles;
  if (candles.length === 0) return null;

  const lows = candles.map((c) => c.low);
  const highs = candles.map((c) => c.high);
  const levels = [data.window.high, data.window.low, data.entry.price].filter(
    (v): v is number => v != null,
  );
  const lo = Math.min(...lows, ...levels);
  const hi = Math.max(...highs, ...levels);
  const span = hi - lo || 1;
  const y = (v: number) => PT + (1 - (v - lo) / span) * (H - PT - PB);
  const bw = (W - PR) / candles.length;

  // Свеча входа: время уже привязано бэкендом к конкретной свече.
  const entryIdx = data.entry.barTime != null ? candles.findIndex((c) => c.time === data.entry.barTime) : -1;
  const exitIdx = data.exit.barTime != null ? candles.findIndex((c) => c.time === data.exit.barTime) : -1;

  const level = (value: number | null, label: string, color: string, dashed: boolean) => {
    if (value == null) return null;
    const ly = y(value);
    return (
      <g key={label}>
        <line
          x1="0"
          y1={ly.toFixed(1)}
          x2={W - PR}
          y2={ly.toFixed(1)}
          stroke={color}
          strokeWidth="1"
          strokeDasharray={dashed ? '3 4' : undefined}
        />
        <text
          x={W - PR + 8}
          y={(ly + 4).toFixed(1)}
          fill={color}
          fontSize="11"
          fontFamily="var(--font-mono)"
        >
          {label} {formatPriceGrouped(value)}
        </text>
      </g>
    );
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 'auto' }}
      role="img"
      aria-label="Свечи, границы окна измерения и цена входа"
    >
      {level(data.window.high, 'верх', 'var(--color-muted)', true)}
      {level(data.window.low, 'низ', 'var(--color-muted)', true)}

      {candles.map((c, i) => {
        const x = i * bw + bw / 2;
        const up = c.close >= c.open;
        const color = up ? 'var(--color-up)' : 'var(--color-down)';
        const top = Math.min(y(c.open), y(c.close));
        return (
          <g key={c.time}>
            <line
              x1={x.toFixed(1)}
              y1={y(c.high).toFixed(1)}
              x2={x.toFixed(1)}
              y2={y(c.low).toFixed(1)}
              stroke={color}
              strokeWidth="1"
            />
            <rect
              x={(x - bw * 0.28).toFixed(1)}
              y={top.toFixed(1)}
              width={(bw * 0.56).toFixed(1)}
              height={Math.max(1.5, Math.abs(y(c.close) - y(c.open))).toFixed(1)}
              fill={color}
            />
          </g>
        );
      })}

      {level(data.entry.price, 'вход', 'var(--color-fg)', false)}

      {/* Треугольник у своей свечи: видно не только по какой цене вошли, но и
          когда именно относительно окна измерения. */}
      {entryIdx >= 0 &&
        (() => {
          const x = entryIdx * bw + bw / 2;
          const ey = y(data.entry.price);
          return (
            <polygon
              points={`${(x - 5).toFixed(1)},${(ey - 9).toFixed(1)} ${(x + 5).toFixed(1)},${(ey - 9).toFixed(1)} ${x.toFixed(1)},${ey.toFixed(1)}`}
              fill="var(--color-fg)"
            />
          );
        })()}
      {exitIdx >= 0 && (
        <circle
          cx={(exitIdx * bw + bw / 2).toFixed(1)}
          cy={y(data.exit.price).toFixed(1)}
          r="3.5"
          fill="none"
          stroke={data.closedPnl >= 0 ? 'var(--color-up)' : 'var(--color-down)'}
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
}
