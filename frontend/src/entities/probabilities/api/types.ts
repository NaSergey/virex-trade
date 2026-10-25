/** Форма ответа `GET /api/probabilities` — копия `backend/src/probabilities/types.ts`. */
export type OddsSide = 'up' | 'down';

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

export interface Probabilities {
  /** Ключ — таймфрейм в минутах. */
  divergence: Record<string, DivergenceOdds>;
  computedAt: string | null;
}
