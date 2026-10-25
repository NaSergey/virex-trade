/** Форма ответа `GET /api/probabilities` — копия `backend/src/probabilities/types.ts`. */
export type OddsSide = 'up' | 'down';
export type DerivKind = 'funding' | 'ratio' | 'oi';
export type DerivZone = 'high' | 'low' | 'normal';

export interface OddsCount {
  n: number;
  hits: number;
  share: number;
  low: number;
  high: number;
}

export interface OddsStat {
  side: OddsSide;
  train: OddsCount;
  test: OddsCount;
  holds: boolean;
}

export interface DivergenceOdds {
  bull: OddsStat | null;
  bear: OddsStat | null;
}

export interface DerivNow {
  kind: DerivKind;
  value: number | null;
  zone: DerivZone | null;
}

export interface Probabilities {
  /** Ключ — таймфрейм в минутах. */
  divergence: Record<string, DivergenceOdds>;
  /** Ключ — `<ряд>:high` / `<ряд>:low`. */
  derivs: Record<string, OddsStat | null>;
  now: DerivNow[];
  computedAt: string | null;
  nowAt: string | null;
}
