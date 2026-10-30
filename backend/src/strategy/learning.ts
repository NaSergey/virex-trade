import type { Effect, Features, Mistake, Rule } from './report.types';
import { FEATURE_KEYS } from './setups';
import { meanCi, upper95 } from './stats';

/** С какого квартала система учится (до него — разгон истории с 2018). */
export const LEARN_FROM_MS = Date.UTC(2020, 0, 1);
export const MIN_TRAIN = 60;
export const MIN_RULE_N = 20;
export const MAX_RULES = 3;
/** Меньше отсечённых сделок — вердикта нет: t-интервал на 2–9 точках обманчив. */
export const MIN_EFFECT_N = 10;

export interface LearnTrade {
  id: string;
  fillMs: number;
  exitMs: number;
  rNet: number;
  features: Features;
}

export interface Quarter {
  key: string;
  startMs: number;
  endMs: number;
  rules: Rule[];
  added: Rule[];
  removed: Rule[];
  trainN: number;
}

export function quarterStart(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1);
}

export function nextQuarter(ms: number): number {
  const d = new Date(quarterStart(ms));
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1);
}

export function quarterKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

const sameRule = (a: Rule, b: Rule) =>
  a.feature === b.feature && a.value === b.value;

/** Сетап проходит правила — ни одно правило под него не подходит. */
export const kept = (t: { features: Features }, rules: Rule[]): boolean =>
  !rules.some((r) => t.features[r.feature] === r.value);

/**
 * Правила из обучающих сделок: жадно берётся корзина признака, чьи сделки
 * уверенно убыточны (≥ MIN_RULE_N, сумма R < 0, верхняя граница
 * одностороннего 95 % интервала среднего < 0) с самым отрицательным суммарным
 * R; её сделки уходят из выборки, поиск повторяется — не больше MAX_RULES.
 */
export function learnRules(train: LearnTrade[]): Rule[] {
  if (train.length < MIN_TRAIN) return [];
  const rules: Rule[] = [];
  let pool = train;
  while (rules.length < MAX_RULES) {
    let best: { rule: Rule; sum: number } | null = null;
    for (const feature of FEATURE_KEYS) {
      const values = [...new Set(pool.map((t) => t.features[feature]))].sort();
      for (const value of values) {
        const rs = pool
          .filter((t) => t.features[feature] === value)
          .map((t) => t.rNet);
        if (rs.length < MIN_RULE_N) continue;
        const sum = rs.reduce((a, b) => a + b, 0);
        if (!(sum < 0 && upper95(rs) < 0)) continue;
        if (!best || sum < best.sum) best = { rule: { feature, value }, sum };
      }
    }
    if (!best) break;
    const rule = best.rule;
    rules.push(rule);
    pool = pool.filter((t) => t.features[rule.feature] !== rule.value);
  }
  return rules;
}

/**
 * Проверка вперёд: каждый квартал правила выводятся заново из сделок,
 * закрытых до его начала, и применяются только к сетапам квартала.
 */
export function walkForward(
  trades: LearnTrade[],
  fromMs: number,
  toMs: number,
): Quarter[] {
  const out: Quarter[] = [];
  let prev: Rule[] = [];
  for (let q = quarterStart(fromMs); q < toMs; q = nextQuarter(q)) {
    const train = trades.filter((t) => t.exitMs < q);
    const rules = learnRules(train);
    out.push({
      key: quarterKey(q),
      startMs: q,
      endMs: nextQuarter(q),
      rules,
      added: rules.filter((r) => !prev.some((p) => sameRule(p, r))),
      removed: prev.filter((p) => !rules.some((r) => sameRule(p, r))),
      trainN: train.length,
    });
    prev = rules;
  }
  return out;
}

/** Правила квартала, в который попал момент; null — до начала обучения. */
export function rulesAt(quarters: Quarter[], ms: number): Rule[] | null {
  const q = quarters.find((x) => ms >= x.startMs && ms < x.endMs);
  return q ? q.rules : null;
}

/**
 * Вердикт по сетапам, которые правила отсекли вперёд: их средний R уверенно
 * ниже нуля — правила помогли, выше — вредят, иначе эффект не доказан.
 */
export function effectOf(excluded: number[]): Effect {
  if (excluded.length < MIN_EFFECT_N) {
    return {
      n: excluded.length,
      mean: null,
      lo: null,
      hi: null,
      verdict: 'unproven',
    };
  }
  const ci = meanCi(excluded);
  return {
    n: excluded.length,
    mean: ci.mean,
    lo: ci.lo,
    hi: ci.hi,
    verdict: ci.hi < 0 ? 'helped' : ci.lo > 0 ? 'hurt' : 'unproven',
  };
}

/** Корзины признаков с худшим средним R за всю историю — диагностика, не правило. */
export function topMistakes(trades: LearnTrade[], limit = 6): Mistake[] {
  const out: Mistake[] = [];
  for (const feature of FEATURE_KEYS) {
    const values = [...new Set(trades.map((t) => t.features[feature]))].sort();
    for (const value of values) {
      const rs = trades
        .filter((t) => t.features[feature] === value)
        .map((t) => t.rNet);
      if (rs.length < MIN_RULE_N) continue;
      const ci = meanCi(rs);
      if (ci.mean >= 0) continue;
      out.push({
        feature,
        value,
        n: rs.length,
        mean: ci.mean,
        lo: ci.lo,
        hi: ci.hi,
      });
    }
  }
  return out.sort((a, b) => a.mean - b.mean).slice(0, limit);
}
