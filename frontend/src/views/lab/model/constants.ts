// Языконезависимые подписи и порог доверия к срезу. Переводимые подписи — в
// useLabLabels: им нужен useTranslations, а этот файл читают и не-компоненты
// (Page.tsx собирает RANGE_TF_LABELS из RANGE_TF_OPTIONS вне рендера).

/** Ниже этого числа сделок цифры среза — шум, а не закономерность. */
export { MIN_N } from '@/shared/lib/utils/confidence';

// Час суток один и тот же в любой локали — торговые сессии не переводятся.
export const SESSION_HINTS: Record<string, string> = {
  asia: '00:00–08:00 UTC',
  london: '08:00–14:00 UTC',
  ny: '14:00–21:00 UTC',
  night: '21:00–24:00 UTC',
};

// 'Long'/'Short' совпадают в обеих локалях — переводить нечего.
export const DIR_LABELS: Record<string, string> = { long: 'Long', short: 'Short' };

/** Окно, по которому считается диапазон каждого ТФ (см. TradeContextService). */
export const RANGE_TF_OPTIONS = [
  { value: '15m' as const, label: '15M' },
  { value: '30m' as const, label: '30M' },
  { value: '1h' as const, label: '1H' },
  { value: '4h' as const, label: '4H' },
  { value: '1d' as const, label: 'D' },
];
