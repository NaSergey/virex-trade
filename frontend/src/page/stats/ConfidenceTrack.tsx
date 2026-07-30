'use client';

/**
 * Винрейт и его нижняя граница на одной шкале: треугольник — измеренный
 * винрейт, янтарная риска — нижняя граница 95%-го интервала (поправка Уилсона),
 * янтарная полоса между ними — цена короткой выборки.
 *
 * Одно число вместо двух не годилось: «100% на шести сделках» и «65% на
 * тридцати четырёх» выглядят как «первое лучше», хотя нижняя граница у них 54%
 * против 48% — то есть почти одно и то же. Расстояние между риской и
 * треугольником и есть та самая поправка, и её видно, не читая цифр.
 */
export function ConfidenceTrack({ winRate, wilsonLow }: { winRate: number; wilsonLow: number }) {
  const wr = Math.max(0, Math.min(100, winRate));
  const lb = Math.max(0, Math.min(100, wilsonLow));

  return (
    <span className="cinl">
      <span className="cinl-p">{wr.toFixed(1)}</span>
      <span className="cinl-b">
        <i className="cinl-rng" style={{ left: `${lb.toFixed(1)}%`, width: `${Math.max(0, wr - lb).toFixed(1)}%` }} />
        <i className="cinl-lb" style={{ left: `${lb.toFixed(1)}%` }} />
        <i className="cinl-pt" style={{ left: `${wr.toFixed(1)}%` }} />
      </span>
      <span className="cinl-l">≥ {lb.toFixed(1)}</span>
    </span>
  );
}
