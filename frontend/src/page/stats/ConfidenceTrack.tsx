'use client';

/**
 * Винрейт-трек для карточки комбинации: заливка = winRate, метка-риска =
 * нижняя граница доверительного интервала Уилсона (консервативная оценка
 * при малой выборке) — та же идея, что раньше показывал текстовый LB рядом
 * с WinrateBar, но как в макете: заливка + маркер на одной шкале.
 */
export function ConfidenceTrack({ winRate, wilsonLow, trades }: { winRate: number; wilsonLow: number; trades: number }) {
  const color = winRate >= 50 ? 'var(--color-up)' : 'var(--color-down)';
  return (
    <div>
      <div className="relative mt-1.5 h-[5px] rounded-full bg-elevated-2">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${winRate}%`, background: color }} />
        <div className="absolute top-[-2.5px] h-[10px] w-[2px] rounded-sm bg-fg" style={{ left: `${wilsonLow}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[9.5px] text-subtle">
        <span>winrate {winRate}%</span>
        <span title="Нижняя граница 95% доверительного интервала (поправка Уилсона)">
          LB {wilsonLow}% (n={trades})
        </span>
      </div>
    </div>
  );
}
