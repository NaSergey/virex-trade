import { formatPriceGrouped } from '@/shared/lib/utils/format';
import type { Candle } from './candles';

/** Строка легенды графика: цены свечи и её изменение, уже текстом. */
export interface LegendLine {
  o: string;
  h: string;
  l: string;
  c: string;
  /** «+316 (+0.49%)»: изменение от закрытия предыдущей свечи. */
  change: string;
  /** Свеча растёт (закрытие не ниже открытия) — цвет чисел, как у самой свечи. */
  up: boolean;
}

const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '');

/**
 * Легенда свечи, как у TradingView: O H L C тем же форматом, что шкала цены, и
 * изменение от закрытия предыдущей свечи (у первой — от её открытия). Цвет
 * берётся по направлению самой свечи, а не по изменению: легенда подписывает
 * свечу под курсором, и цвет у них должен совпадать.
 */
export function legendOf(c: Candle, prev: Candle | undefined, decimals: number | undefined): LegendLine {
  const base = prev ? prev.c : c.o;
  const diff = c.c - base;
  const pct = base !== 0 ? (diff / base) * 100 : 0;
  // Знак процента — по округлённому значению: «−0.00%» читается сбоем.
  const pctText = Math.abs(pct).toFixed(2);
  const pctSign = Number(pctText) === 0 ? '' : sign(pct);
  return {
    o: formatPriceGrouped(c.o, decimals),
    h: formatPriceGrouped(c.h, decimals),
    l: formatPriceGrouped(c.l, decimals),
    c: formatPriceGrouped(c.c, decimals),
    change: `${sign(diff)}${formatPriceGrouped(Math.abs(diff), decimals)} (${pctSign}${pctText}%)`,
    up: c.c >= c.o,
  };
}
