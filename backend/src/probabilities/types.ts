import type { DivergenceOdds } from './divergence-stats';

/** Ответ `GET /api/probabilities` (спека 2026-10-25); фронт держит копию формы в `entities/probabilities`. */
export interface ProbabilitiesResponse {
  /** Ключ — таймфрейм в минутах. */
  divergence: Record<string, DivergenceOdds>;
  computedAt: string | null;
}
