import { formatPriceGrouped } from '@/shared/lib/utils/format';

/** Целое с разрядами: «12 450». */
export const int = (n: number): string => formatPriceGrouped(n, 0);

/** Целое со знаком — минус типографский, как у денег продукта: «+150», «−20». */
export const signed = (n: number): string => `${n >= 0 ? '+' : '−'}${int(Math.abs(n))}`;
