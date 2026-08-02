'use client';

/** Где вход стоял внутри диапазона таймфрейма: 0 — по низу, 100 — по верху. */
export interface RangeRow {
  tf: string;
  /** null — контекст ещё не посчитан либо у символа не хватило истории. */
  value: number | null;
}

/**
 * Приборная шкала «вход в диапазоне»: по строке на таймфрейм, треугольник —
 * куда пришёлся вход, риски снаружи поля, середина отмечена волосом.
 *
 * Раньше эти три числа стояли текстом («44% · середина»), и чтобы сравнить
 * таймфреймы между собой, приходилось читать проценты по одному. На шкале
 * согласие таймфреймов видно формой: три треугольника в одной колонне — вход
 * по низу на всех горизонтах, разлёт — вход, который на разных горизонтах
 * выглядит по-разному.
 */
export function RangeScale({ rows }: { rows: RangeRow[] }) {
  return (
    <span className="scale">
      {rows.map((r) => (
        <span className="scale-r" key={r.tf}>
          <span className="scale-tf">{r.tf}</span>
          <span className="scale-b">
            <i className="scale-mid" />
            {r.value != null && (
              // Пробой уходит за границы диапазона (<0 или >100) — прижимаем
              // маркер к краю поля, но значение рядом остаётся настоящим.
              <i className="scale-m" style={{ left: `${Math.max(0, Math.min(100, r.value))}%` }} />
            )}
          </span>
          <span className="scale-v">{r.value != null ? Math.round(r.value) : '—'}</span>
        </span>
      ))}
    </span>
  );
}
