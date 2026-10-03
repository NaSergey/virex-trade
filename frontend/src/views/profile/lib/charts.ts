/**
 * Геометрия графиков профиля — чистые функции, без React: их проверяет vitest,
 * а компоненты только рисуют то, что здесь посчитано.
 */

/**
 * Изменение за последние `days` дней ряда: последнее значение против
 * значения `days` дней назад (у короткого ряда — против первого).
 * `pct` — null, когда считать долю не от чего (база ноль).
 */
export function trend(values: number[], days: number): { abs: number; pct: number | null } {
  if (values.length === 0) return { abs: 0, pct: null };
  const last = values[values.length - 1];
  const base = values[Math.max(0, values.length - 1 - days)];
  const abs = last - base;
  return { abs, pct: base !== 0 ? (abs / Math.abs(base)) * 100 : null };
}

/** Сумма последних `days` значений и такого же отрезка перед ними. */
export function windowSums(values: number[], days: number): { now: number; before: number } {
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  const end = values.length;
  return {
    now: sum(values.slice(Math.max(0, end - days), end)),
    before: sum(values.slice(Math.max(0, end - 2 * days), Math.max(0, end - days))),
  };
}

/**
 * Точки линии в прямоугольнике `w × h` с полями `pad`. Ровный ряд стоит по
 * середине высоты, а не прижат к низу: ноль на нижней кромке читался бы
 * «ничего не было», хотя баланс просто не менялся.
 */
export function linePoints(values: number[], w: number, h: number, pad: number): { x: number; y: number }[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const innerW = Math.max(0, w - 2 * pad);
  const innerH = Math.max(0, h - 2 * pad);
  const step = values.length > 1 ? innerW / (values.length - 1) : 0;
  return values.map((v, i) => ({
    x: pad + i * step,
    y: span === 0 ? h / 2 : pad + innerH - ((v - min) / span) * innerH,
  }));
}

/** `d` для `<path>` по точкам. */
export const pathOf = (pts: { x: number; y: number }[]): string =>
  pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

/**
 * Вершины паутинки: ось `i` из `n` начинается сверху и идёт по часовой
 * стрелке, значение — доля радиуса 0–1.
 */
export function radarPoint(i: number, n: number, value: number, r: number, cx: number, cy: number) {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
  const k = Math.max(0, Math.min(1, value));
  return { x: cx + Math.cos(a) * r * k, y: cy + Math.sin(a) * r * k };
}

/**
 * Игры по частоте: дней за 90, при равенстве — сыграно за всё время. Игр
 * будет двадцать и больше, и паутинка берёт отсюда первые несколько, а
 * таблица — всех в этом порядке.
 */
export function byFrequency<T extends { days90: number; played: number }>(games: T[]): T[] {
  return [...games].sort((a, b) => b.days90 - a.days90 || b.played - a.played);
}
