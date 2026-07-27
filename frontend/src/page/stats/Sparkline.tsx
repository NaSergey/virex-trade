'use client';

const W = 56;
const H = 18;

/** Крошечный спарклайн для строки таблицы тегов — без осей и hover. */
export function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <svg viewBox={`0 0 ${W} ${H}`} className="block h-4.5 w-14" />;

  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values, 1);
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / (max - min || 1)) * H;
  const path = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-4.5 w-14">
      <path d={path} fill="none" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}
