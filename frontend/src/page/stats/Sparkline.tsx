'use client';

const W = 80;
const H = 18;

/**
 * Динамика тега в строке таблицы: только форма кривой, без осей и подписей.
 * Отвечает на единственный вопрос — «этот итог набирался ровно или одним
 * выбросом», — на который сумма в соседней колонке ответить не может.
 */
export function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden />;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - ((v - min) / span) * H).toFixed(1)}`)
    .join(' ');

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1" />
    </svg>
  );
}
