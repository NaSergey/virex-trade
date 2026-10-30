/**
 * Копия `backend/src/strategy/report.types.ts` — правятся вместе: форма отчёта
 * стратегии, который считает worker и отдаёт `GET /api/admin/strategy/report`.
 */

export type Dir = 1 | -1;
export type Outcome = 'target' | 'stop' | 'time';

export type FeatureKey =
  | 'session'
  | 'weekend'
  | 'daily'
  | 'vol'
  | 'stopAtr'
  | 'plannedR'
  | 'pierce'
  | 'deep';
export type Features = Record<FeatureKey, string>;

export interface Summary {
  n: number;
  wins: number;
  /** Доля сделок с R > 0. */
  winrate: number;
  /** Средняя прибыль и средний убыток (модулем), в R. */
  avgWin: number;
  avgLoss: number;
  /** Мат ожидание — средний R сделки. */
  expectancy: number;
  /** Профит-фактор; null — убыточных сделок нет. */
  pf: number | null;
  sumR: number;
  /** Винрейт, при котором эти avgWin/avgLoss дают ноль. */
  breakeven: number;
}

export interface Point {
  ms: number;
  r: number;
}

export interface VariantRow {
  id: string;
  label: string;
  setups: number;
  filled: number;
  missed: number;
  expired: number;
  /** Сводка по сделкам системы (одна позиция за раз), R после комиссии. */
  summary: Summary;
  grossExpectancy: number;
  /** Макс. просадка при риске 1 % на сделку, доля. */
  maxDd1: number;
}

export interface TradeRow {
  id: string;
  dir: Dir;
  tf: number;
  sweepMs: number;
  obMs: number;
  fvgMs: number | null;
  bosMs: number | null;
  /** Закрытие свечи подтверждения — момент, когда выставлен лимит. */
  confirmMs: number;
  level: number;
  entry: number;
  stop: number;
  target: number;
  plannedR: number;
  fillMs: number;
  fill: number;
  exitMs: number;
  exit: number;
  outcome: Outcome;
  rGross: number;
  rNet: number;
  features: Features;
}

export interface YearRow {
  year: number;
  summary: Summary;
}

export interface Share {
  n: number;
  /** Доля успехов среди решившихся; null — решившихся нет. */
  share: number | null;
  lo: number | null;
  hi: number | null;
  /** Чего ждать от самого рынка на этих же сторонах. */
  base: number | null;
  unresolved: number;
}

export interface AuthorRow {
  key: string;
  label: string;
  /** Цифра автора, доля. */
  author: number;
  fromEvent: Share;
  /** От свечи, на которой выполнилось условие; null у строк без условия. */
  fromConfirm: Share | null;
}

export interface Rule {
  feature: FeatureKey;
  value: string;
}

export interface QuarterRow {
  key: string;
  rules: Rule[];
  added: Rule[];
  removed: Rule[];
  trainN: number;
  /** Сетапов квартала (исполненных) и сколько из них правила отсекли. */
  trades: number;
  excluded: number;
}

export interface Effect {
  n: number;
  mean: number | null;
  lo: number | null;
  hi: number | null;
  verdict: 'helped' | 'hurt' | 'unproven';
}

export interface Mistake {
  feature: FeatureKey;
  value: string;
  n: number;
  mean: number;
  lo: number;
  hi: number;
}

export interface SystemBlock {
  summary: Summary;
  maxDd1: number;
  equity: Point[];
}

export interface LearningBlock {
  fromMs: number;
  quarters: QuarterRow[];
  base: SystemBlock;
  learned: SystemBlock;
  effect: Effect;
  mistakes: Mistake[];
  next: { key: string; rules: Rule[] };
}

export interface TheoryBlock {
  expectancy: {
    winrate: number;
    avgWin: number;
    avgLoss: number;
    gross: number;
    net: number;
  };
  breakeven: {
    table: { r: number; winrate: number }[];
    avgWin: number;
    winrate: number;
    needed: number;
  };
  running: { n: number; mean: number }[];
  variance: {
    paths: { label: string; points: number[] }[];
    maxStreak: number;
    pStreak: number;
    sims: number;
  };
  sizing: {
    account: number;
    riskPct: number;
    riskUsd: number;
    /** Медианный стоп сделок, доля цены входа. */
    stopPct: number;
    position: number;
    streak20: { risk: number; loss: number }[];
  };
  ruin: { trades: number; sims: number; rows: { risk: number; p: number }[] };
  asymmetry: {
    table: { loss: number; need: number }[];
    maxDd1: number;
    need: number | null;
  };
}

export interface StrategyReport {
  version: number;
  computedAt: string;
  dataFrom: number;
  dataTo: number;
  variants: VariantRow[];
  main: {
    variant: VariantRow;
    equity: Point[];
    byYear: YearRow[];
    trades: TradeRow[];
  };
  author: AuthorRow[];
  learning: LearningBlock;
  theory: TheoryBlock;
}

export interface ReportResponse {
  status: 'ready' | 'pending';
  computedAt: string | null;
  report: StrategyReport | null;
}
