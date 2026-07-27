'use client';

import type { ReactNode } from 'react';

const R = 15;
const CIRC = 2 * Math.PI * R;

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/** Цвет кольца: выше порога — up, ниже — down (винрейт от 50%, PF от 1). */
export function ringColor(value: number, threshold: number): string {
  return value >= threshold ? 'var(--color-up)' : 'var(--color-down)';
}

/** Одиночное кольцо 0..max — цвет уже решает вызывающий код (up/down). */
export function StatRing({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = clamp01(max > 0 ? value / max : 0);
  return (
    <svg viewBox="0 0 40 40" className="h-8.5 w-8.5 shrink-0 -rotate-90">
      <circle cx="20" cy="20" r={R} fill="none" stroke="var(--color-line-strong)" strokeWidth="4" />
      <circle
        cx="20"
        cy="20"
        r={R}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={CIRC}
        strokeDashoffset={CIRC - pct * CIRC}
      />
    </svg>
  );
}

/** Win/loss donut — зелёная дуга поверх красной, длина = доля побед. */
export function DuoRing({ wins, total }: { wins: number; total: number }) {
  const winLen = total > 0 ? (wins / total) * CIRC : 0;
  return (
    <svg viewBox="0 0 40 40" className="h-8.5 w-8.5 shrink-0 -rotate-90">
      <circle cx="20" cy="20" r={R} fill="none" stroke="var(--color-down)" strokeWidth="4" />
      <circle
        cx="20"
        cy="20"
        r={R}
        fill="none"
        stroke="var(--color-up)"
        strokeWidth="4"
        strokeDasharray={`${winLen} ${CIRC - winLen}`}
      />
    </svg>
  );
}

/** Одна метрика мастхеда: лейбл + значение (+ кольцо/дельта опционально). */
export function Kv({
  label,
  value,
  valueClassName,
  ring,
  delta,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  ring?: ReactNode;
  delta?: string;
}) {
  return (
    <div className="flex items-center gap-2 border-l border-line pl-3.5 first:border-l-0 first:pl-0">
      {ring}
      <div className="flex flex-col gap-0.5">
        <span className="text-[9px] tracking-wide text-subtle uppercase">{label}</span>
        <span className={valueClassName ?? 'font-mono text-[15px] font-bold text-fg'}>
          {value}
          {delta && (
            <span className="ml-1 rounded bg-up/12 px-1 py-px text-[9.5px] font-bold text-up">{delta}</span>
          )}
        </span>
      </div>
    </div>
  );
}

/** Ряд метрик мастхеда — flex-wrap, разделители между ячейками. */
export function KvRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-y-3">{children}</div>;
}
