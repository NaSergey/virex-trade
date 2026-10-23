'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { Summary } from '../api/hooks';
import { WEEKDAYS, dayLabel, pct, weekdayOf } from '../model/time';

const GOAL = 0.7;
const H = 120;
const AXIS = 18;

/**
 * Соблюдение по дням — столбик на день, своё SVG. Пунктир — порог «день по
 * плану» (70 %, тот же, что у серии в отчёте). День без отслеживаемого — без
 * столбика, а не нулевой: «плана не было» и «ничего не сделал» — разное.
 * Ширина в единицах экрана (`u = W / boxW`), как у графиков продукта.
 */
export function DayBars({ days }: { days: ({ day: string } & Summary)[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = days.length;
  const step = W / n;
  const bar = Math.max(2, Math.min(28, step * 0.7));
  const labelEvery = n <= 14 ? 1 : n <= 31 ? 7 : 14;
  const y = (v: number) => (1 - v) * (H - 4) + 2;

  return (
    <div ref={box} className="pl-bars">
      <svg width={W} height={H + AXIS} role="img" aria-label="Соблюдение плана по дням">
        <line x1={0} x2={W} y1={y(GOAL)} y2={y(GOAL)} className="pl-bars-goal" />
        {days.map((d, i) => {
          const x = i * step + (step - bar) / 2;
          return (
            <g key={d.day}>
              <title>{`${dayLabel(d.day)}: ${d.score == null ? 'плана не было' : `${pct(d.score)}, сделано ${d.done} из ${d.counted}`}`}</title>
              {d.score != null && (
                <rect
                  x={x}
                  y={y(Math.max(d.score, 0.02))}
                  width={bar}
                  height={H - 2 - y(Math.max(d.score, 0.02))}
                  className={d.score >= GOAL ? 'pl-bar-ok' : 'pl-bar-low'}
                />
              )}
              {(n - 1 - i) % labelEvery === 0 && (
                <text x={i * step + step / 2} y={H + AXIS - 4} textAnchor="middle" className="pl-bars-lbl">
                  {n <= 7 ? WEEKDAYS[weekdayOf(d.day)] : `${+d.day.slice(8, 10)}`}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
