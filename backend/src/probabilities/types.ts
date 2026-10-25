import type { DerivNow } from './deriv-stats';
import type { DivergenceOdds } from './divergence-stats';
import type { OddsStat } from './odds-math';

/** Ответ `GET /api/probabilities` (спека 2026-10-25); фронт держит копию формы в `entities/probabilities`. */
export interface ProbabilitiesResponse {
  /** Ключ — таймфрейм в минутах. */
  divergence: Record<string, DivergenceOdds>;
  /** Ключ — `<ряд>:high` / `<ряд>:low`. */
  derivs: Record<string, OddsStat | null>;
  now: DerivNow[];
  computedAt: string | null;
  nowAt: string | null;
}
