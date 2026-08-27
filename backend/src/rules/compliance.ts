import type { MetricValue } from './metric-values';

export interface RuleSpec {
  metric: string;
  operator: 'lte' | 'gte';
  threshold: number;
}

export interface RuleCompliance extends RuleSpec {
  followed: number;
  violated: number;
  /** Сколько субъектов не удалось проверить: нет стопа, неизвестен баланс. */
  unchecked: number;
  /** Trade.id или YYYY-MM-DD нарушивших — для отметок в журнале. */
  violatingIds: string[];
}

/**
 * Сверка значений с порогом.
 *
 * Субъект со значением null не считается ни соблюдением, ни нарушением: он
 * выпадает из обеих чаш и попадает в unchecked. Засчитать непроверенное как
 * соблюдение значило бы соврать в приятную сторону — а доверие к декларации
 * это единственное, ради чего она вообще нужна.
 *
 * Значение ровно на пороге соблюдает правило: «не больше ста» включает сто.
 */
export function evaluate(rule: RuleSpec, values: MetricValue[]): RuleCompliance {
  let followed = 0;
  let violated = 0;
  let unchecked = 0;
  const violatingIds: string[] = [];

  for (const v of values) {
    if (v.value === null || !Number.isFinite(v.value)) {
      unchecked += 1;
      continue;
    }
    const ok = rule.operator === 'lte' ? v.value <= rule.threshold : v.value >= rule.threshold;
    if (ok) {
      followed += 1;
    } else {
      violated += 1;
      violatingIds.push(v.subjectId);
    }
  }

  return { ...rule, followed, violated, unchecked, violatingIds };
}
