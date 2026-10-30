/**
 * Форма отчёта стратегии — то, что лежит в `strategy_reports.data` и уходит
 * странице. Файл самодостаточен (без импортов): фронт держит его копию в
 * `frontend/src/views/strategy/api/types.ts`, правятся вместе.
 */

export type Dir = 1 | -1;
/** Чем закончилась сделка: все тейки, исходный стоп, подтянутый стоп, срок. */
export type Outcome = 'target' | 'stop' | 'trail' | 'time';

export type FeatureKey =
  | 'session'
  | 'weekend'
  | 'daily'
  | 'vol'
  | 'stopAtr'
  | 'plannedR'
  | 'pierce';
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
  /** Доля лонгов среди сделок системы. */
  longShare: number;
}

export interface OddsCheck {
  /** Доля сделок с R > 0 среди прошлых сделок той же стороны. */
  p: number;
  /** Безубыточный винрейт той же выборки. */
  needed: number;
  n: number;
  /** Доля прибыльных всех прошлых сделок стороны: шорт слабее неё пропускается. */
  sideP: number;
}

export interface TradeRow {
  id: string;
  dir: Dir;
  tf: number;
  sweepMs: number;
  obMs: number;
  fvgMs: number | null;
  bosMs: number | null;
  /** Закрытие свечи подтверждения — момент, когда выставлена сетка. */
  confirmMs: number;
  level: number;
  /** Уровни сетки входа, от верха блока к стопу. */
  entries: number[];
  /** Сколько уровней исполнилось. */
  filled: number;
  avgEntry: number;
  /** Исходный стоп. */
  stop: number;
  /** Стоп на выходе — после подтягивания за тейками. */
  finalStop: number;
  target: number;
  takes: number[];
  takesHit: number;
  /** План от первого ордера, 3–5R. */
  plannedR: number;
  /** Первое исполнение входа. */
  fillMs: number;
  exitMs: number;
  /** Цена последнего выхода. */
  exit: number;
  outcome: Outcome;
  rGross: number;
  rNet: number;
  features: Features;
  /** Оценка вероятности на момент решения; null — фильтра нет или истории мало. */
  odds: OddsCheck | null;
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

export interface MoneyBlock {
  start: number;
  final: number;
  maxDd: number;
  /** Худшая сделка, доля счёта перед ней. */
  worstTrade: number;
  /** Счёт после каждой сделки (не больше 200 точек). */
  equity: number[];
}

export interface OddsSide {
  considered: number;
  taken: number;
  skipped: number;
  /** Взято без оценки — истории ещё не было. */
  unjudged: number;
  /** Сводка взятых сделок стороны: число, винрейт, мат ожидание. */
  summary: Summary;
}

export interface OddsBlock {
  long: OddsSide;
  short: OddsSide;
  /** Доля лонгов среди взятых. */
  longShare: number;
  /** Вердикт по пропущенным шортам. */
  effect: Effect;
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
    /** Деньги основного варианта: с управлением риском и без. */
    money: { theory: MoneyBlock; plain: MoneyBlock; plainNotional: number };
  };
  odds: OddsBlock;
  author: AuthorRow[];
  learning: LearningBlock;
  theory: TheoryBlock;
}

export interface ReportResponse {
  status: 'ready' | 'pending';
  computedAt: string | null;
  report: StrategyReport | null;
}
