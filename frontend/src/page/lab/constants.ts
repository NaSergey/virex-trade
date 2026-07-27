// Подписи измерений Лаборатории и порог доверия к срезу. Вынесены из Page.tsx:
// их читают и чипы, и конфиг групп фильтров, и сводка — страница сама теперь
// только собирает блоки.

/** Ниже этого числа сделок цифры среза — шум, а не закономерность. */
export const MIN_N = 20;

export const SESSION_LABELS: Record<string, string> = { asia: 'Азия', london: 'Лондон', ny: 'Нью-Йорк', night: 'Ночь' };

export const SESSION_HINTS: Record<string, string> = {
  asia: '00:00–08:00 UTC',
  london: '08:00–14:00 UTC',
  ny: '14:00–21:00 UTC',
  night: '21:00–24:00 UTC',
};

export const TREND_LABELS: Record<string, string> = {
  trend_up: 'Тренд 4H ↑',
  trend_down: 'Тренд 4H ↓',
  range: 'Боковик 4H',
};

export const DIR_LABELS: Record<string, string> = { long: 'Long', short: 'Short' };
export const EMA_LABELS: Record<string, string> = { above: 'Выше EMA200', below: 'Ниже EMA200' };
export const ATR_LABELS: Record<string, string> = { high: 'ATR высокий', low: 'ATR низкий' };
export const VOL_LABELS: Record<string, string> = { high: 'Объём высокий', low: 'Объём низкий' };
