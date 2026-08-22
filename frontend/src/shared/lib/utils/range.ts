/**
 * «Диапазон входа» — где цена входа стояла внутри high/low последних свечей
 * таймфрейма: 0% = взял по низу диапазона, 100% = по верху. Значение не
 * обрезается, поэтому вход на пробое читается как <0 или >100 и попадает в
 * крайнюю корзину.
 *
 * Пороги продублированы с бэкендом (lab.service.ts) намеренно: там они режут
 * выборку для фильтров, здесь — подписывают уже готовое число. Менять нужно в
 * обоих местах, иначе чип «верх диапазона» и подпись «верх» разойдутся.
 */

export const RANGE_LOW_MAX = 33;
export const RANGE_HIGH_MIN = 66;

export type RangeBucket = 'low' | 'mid' | 'high';

const RANGE_BUCKET_LABELS_RU: Record<RangeBucket, string> = {
  low: 'низ',
  mid: 'середина',
  high: 'верх',
};
const RANGE_BUCKET_LABELS_EN: Record<RangeBucket, string> = {
  low: 'low',
  mid: 'mid',
  high: 'high',
};

export function rangeBucketLabels(locale: 'ru' | 'en'): Record<RangeBucket, string> {
  return locale === 'en' ? RANGE_BUCKET_LABELS_EN : RANGE_BUCKET_LABELS_RU;
}

/** Корзина значения, либо null если диапазон для сделки не посчитан. */
export function rangeBucket(v: number | null | undefined): RangeBucket | null {
  if (v == null || !Number.isFinite(v)) return null;
  return v < RANGE_LOW_MAX ? 'low' : v < RANGE_HIGH_MIN ? 'mid' : 'high';
}

/**
 * Готовая подпись: «82% · верх». Проценты округляем до целых — доли процента
 * в такой метрике всё равно шум.
 * @param locale - 'ru' | 'en' (по умолчанию 'ru' — для мест, ещё не подключивших перевод)
 */
export function formatRangePos(v: number | null | undefined, locale: 'ru' | 'en' = 'ru'): string {
  const bucket = rangeBucket(v);
  if (bucket == null) return '—';
  return `${Math.round(v as number)}% · ${rangeBucketLabels(locale)[bucket]}`;
}

/**
 * Цвет подписи — по смыслу «где взял», а не по прибыльности: вход по верху
 * диапазона подсвечен как риск (красным), по низу — как выгодный (зелёным).
 * У шорта всё зеркально, поэтому направление обязательно.
 */
export function rangePosColor(v: number | null | undefined, direction: 'long' | 'short'): string {
  const bucket = rangeBucket(v);
  if (bucket == null || bucket === 'mid') return 'text-fg';
  const goodForLong = bucket === 'low';
  return (direction === 'long' ? goodForLong : !goodForLong) ? 'text-up' : 'text-down';
}
