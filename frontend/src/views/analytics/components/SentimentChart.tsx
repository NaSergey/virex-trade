'use client';

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { SentimentPoint } from '../api/hooks';

const W = 900;
const PT = 18;
const PB = 22;

/** $6.1B / $840M — компактные доллары для подписи. */
export function fmtUsdCompact(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)} B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)} M`;
  return `$${Math.round(v).toLocaleString('ru-RU')}`;
}

/**
 * Позиционирование участников: доля лонг-аккаунтов во времени. Волосяная линия
 * на 50% — «толпа нейтральна»; всё, что выше, — перевес в лонг.
 *
 * Открытый интерес намеренно не наложен второй кривой со своей шкалой: две
 * несопоставимые оси на одном полотне создают ложные «пересечения», которых в
 * данных нет. Его текущее значение стоит числом в коэффициентах выше.
 */
export function SentimentChart({ data, height = 180 }: { data: SentimentPoint[]; height?: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const chart = useMemo(() => {
    if (data.length < 2) return null;
    const values = data.map((p) => p.buyRatio * 100);
    // Домен всегда включает 50: без этого нейтральная линия могла бы уехать за
    // край и перевес читался бы не от чего.
    const lo = Math.min(45, ...values) - 1;
    const hi = Math.max(55, ...values) + 1;
    const x = (i: number) => (i / (values.length - 1)) * W;
    const y = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * (height - PT - PB);
    return {
      x,
      y,
      values,
      line: values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
      neutralY: y(50),
    };
  }, [data, height]);

  if (!chart) return <p className="muted">Данных за период нет</p>;

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const frac = (e.clientX - rect.left) / rect.width;
    setHoverIdx(Math.max(0, Math.min(data.length - 1, Math.round(frac * (data.length - 1)))));
  };

  const hover = hoverIdx != null ? { point: data[hoverIdx], value: chart.values[hoverIdx] } : null;

  return (
    <div ref={boxRef} onPointerMove={onMove} onPointerLeave={() => setHoverIdx(null)}>
      <svg viewBox={`0 0 ${W} ${height}`} style={{ display: 'block', width: '100%', height: 'auto' }} role="img" aria-label="Доля лонг-аккаунтов во времени">
        <line
          x1="0"
          y1={chart.neutralY.toFixed(1)}
          x2={W}
          y2={chart.neutralY.toFixed(1)}
          stroke="var(--color-line-2)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
        <text x="0" y={(chart.neutralY - 6).toFixed(1)} fill="var(--color-subtle)" fontSize="11" fontFamily="var(--font-mono)">
          50 % — нейтрально
        </text>
        <polyline points={chart.line} fill="none" stroke="var(--color-fg)" strokeWidth="1.5" strokeLinejoin="round" />

        {hover && (
          <g>
            <line
              x1={chart.x(hoverIdx!).toFixed(1)}
              y1={PT - 10}
              x2={chart.x(hoverIdx!).toFixed(1)}
              y2={height - PB + 10}
              stroke="var(--color-line-strong)"
              strokeWidth="1"
              shapeRendering="crispEdges"
            />
            <text
              x={(chart.x(hoverIdx!) > W * 0.7 ? chart.x(hoverIdx!) - 8 : chart.x(hoverIdx!) + 8).toFixed(1)}
              y={PT - 2}
              textAnchor={chart.x(hoverIdx!) > W * 0.7 ? 'end' : 'start'}
              fill="var(--color-fg)"
              fontSize="12"
              fontFamily="var(--font-mono)"
            >
              лонг {hover.value.toFixed(1)} % ·{' '}
              {new Date(hover.point.timestamp).toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {hover.point.openInterestUsd > 0 ? ` · OI ${fmtUsdCompact(hover.point.openInterestUsd)}` : ''}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
