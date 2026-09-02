/**
 * Опорные точки широко цитируемой шкалы Van Tharp (SQN). Несколько независимых
 * источников по-разному проводят стык «средняя/хорошая» (2.0–2.5 против
 * 2.5–2.9) — здесь взята чаще встречающаяся версия, это не дословная цитата
 * из его книги: прямого доступа к первоисточнику нет.
 */
const POINTS: Array<[sqn: number, score: number]> = [
  [0, 0],
  [1.6, 25],
  [2.0, 40],
  [2.5, 55],
  [3.0, 70],
  [5.0, 88],
  [7.0, 100],
];

/** SQN → 0..100 кусочно-линейной интерполяцией по шкале Тарпа. Клампится по краям. */
export function sqnToScore(sqn: number): number {
  if (sqn <= 0) return 0;
  if (sqn >= 7) return 100;
  for (let i = 1; i < POINTS.length; i++) {
    const [x1, y1] = POINTS[i - 1];
    const [x2, y2] = POINTS[i];
    if (sqn <= x2) return Math.round(y1 + ((sqn - x1) / (x2 - x1)) * (y2 - y1));
  }
  return 100; // недостижимо при упорядоченных POINTS — успокаивает TS
}

export type SqnTier = 'poor' | 'belowAverage' | 'average' | 'good' | 'excellent' | 'superb' | 'holyGrail';

/** Ярлык уровня по границам той же шкалы — для тултипа, не для основной цифры. */
export function sqnTier(sqn: number): SqnTier {
  if (sqn < 1.6) return 'poor';
  if (sqn < 2.0) return 'belowAverage';
  if (sqn < 2.5) return 'average';
  if (sqn < 3.0) return 'good';
  if (sqn < 5.0) return 'excellent';
  if (sqn < 7.0) return 'superb';
  return 'holyGrail';
}
