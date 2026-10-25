import type { DerivKind } from '@/entities/probabilities';
import { RSI_DEFAULTS, type Divergence } from './rsi';

/** Свежесть дивергенции — горизонт исхода частот на сервере: позже её исход уже решился. */
export const FRESH_BARS = 20;

/**
 * Последняя дивергенция графика, подтверждённая не больше FRESH_BARS свечей
 * назад; `last` — индекс последней свечи. Подтверждение — `to + rightBars`, как
 * у событий, по которым сервер считал частоты.
 */
export function freshDivergence(divs: readonly Divergence[], last: number): { kind: 'bull' | 'bear'; ago: number } | null {
  const d = divs.at(-1);
  if (!d) return null;
  const ago = last - (d.to + RSI_DEFAULTS.rightBars);
  return ago >= 0 && ago <= FRESH_BARS ? { kind: d.kind, ago } : null;
}

/** Значение ряда для плашки: фандинг — 0.0310 %, доля лонг-аккаунтов — 64 %, открытый интерес — +6.0 % за сутки. */
export function derivValueText(kind: DerivKind, value: number): string {
  if (kind === 'funding') return `${(value * 100).toFixed(4)} %`;
  if (kind === 'ratio') return `${Math.round(value * 100)} %`;
  return `${value >= 0 ? '+' : '−'}${Math.abs(value * 100).toFixed(1)} %`;
}
