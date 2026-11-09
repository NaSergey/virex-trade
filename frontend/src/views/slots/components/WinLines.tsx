'use client';

import { useEffect, useState } from 'react';
import type { SlotsLineWin } from '@/entities/slots';

/** Цвет линии по номеру — у значков по краям окна тот же. */
export const LINE_COLORS = [
  '#ffd34a',
  '#ff3b5c',
  '#2bd0ff',
  '#7cff6b',
  '#c46bff',
  '#ff8a1f',
  '#ff6bd5',
  '#3bffd8',
  '#f5f5f5',
  '#9fb4ff',
];

const pointsOf = (rows: number[]) =>
  [`0,${rows[0] * 100 + 50}`, ...rows.map((r, i) => `${i * 100 + 50},${r * 100 + 50}`), `500,${rows[4] * 100 + 50}`].join(
    ' ',
  );

/**
 * Линии выигрыша поверх барабанов, в координатах окна (барабан 100×300).
 * Сначала горят все разом, потом — по очереди, каждая со своей суммой:
 * так видно, какая линия что принесла. `preview` — линия под курсором на
 * значке сбоку, когда выигрыша нет.
 */
export function WinLines({
  paylines,
  wins,
  cycling,
  preview,
}: {
  paylines: number[][];
  wins: SlotsLineWin[];
  cycling: boolean;
  preview: number | null;
}) {
  const [k, setK] = useState(-1);

  useEffect(() => {
    if (!cycling || wins.length < 2) return;
    const id = setInterval(() => setK((v) => (v + 1) % wins.length), 1300);
    return () => clearInterval(id);
  }, [cycling, wins]);

  const shown = k < 0 ? wins : [wins[k]];

  return (
    <svg className="sl-lines" viewBox="0 0 500 300" preserveAspectRatio="none" aria-hidden>
      {preview !== null && wins.length === 0 && (
        <polyline
          className="sl-line sl-line-preview"
          points={pointsOf(paylines[preview])}
          style={{ ['--c' as string]: LINE_COLORS[preview] }}
        />
      )}
      {shown.map((w) => (
        <g key={`${w.line}:${k}`} style={{ ['--c' as string]: LINE_COLORS[w.line] }}>
          <polyline className="sl-line-glow" points={pointsOf(paylines[w.line])} />
          <polyline className="sl-line" points={pointsOf(paylines[w.line])} pathLength={1} />
        </g>
      ))}
    </svg>
  );
}
