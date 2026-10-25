import {
  atrOf,
  firstBarrier,
  statOf,
  type Bar,
  type OddsStat,
  type Outcome,
} from './odds-math';
import { divergenceEventsOf, RSI_DEFAULTS } from './rsi';

export interface DivergenceOdds {
  bull: OddsStat | null;
  bear: OddsStat | null;
}

/** Таймфреймы со статистикой дивергенций, минуты: на 1м и 5м выборка — шум. */
export const DIVERGENCE_TFS = [15, 30, 60, 240, 1440] as const;

/**
 * Частоты после дивергенций RSI одного таймфрейма: событие — подтверждение
 * второй вершины (`to + rightBars`), исход — какую границу ±1 ATR цена коснулась
 * первой. Бычья считает «вверх», медвежья — «вниз».
 */
export function divergenceOdds(bars: readonly Bar[]): DivergenceOdds {
  const atr = atrOf(bars);
  const outs: Record<'bull' | 'bear', Outcome[]> = { bull: [], bear: [] };
  for (const d of divergenceEventsOf(bars)) {
    const i = d.to + RSI_DEFAULTS.rightBars;
    if (i >= bars.length || Number.isNaN(atr[i])) continue;
    const side = firstBarrier(bars, i, atr[i]);
    if (side) outs[d.kind].push({ t: bars[i].t, side });
  }
  return { bull: statOf(outs.bull, 'up'), bear: statOf(outs.bear, 'down') };
}
