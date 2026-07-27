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

/** Куда пришёлся вход по шкале диапазона ТФ: 0–33 / 33–66 / 66–100. */
export const RANGE_LABELS: Record<string, string> = {
  low: 'Низ диапазона',
  mid: 'Середина',
  high: 'Верх диапазона',
};

export const RANGE_HINTS: Record<string, string> = {
  low: 'Вход в нижней трети диапазона таймфрейма (0–33%). Пробой вниз тоже здесь.',
  mid: 'Вход в середине диапазона таймфрейма (33–66%).',
  high: 'Вход в верхней трети диапазона таймфрейма (66–100%). Пробой вверх тоже здесь.',
};

/** Окно, по которому считается диапазон каждого ТФ (см. TradeContextService). */
export const RANGE_TF_OPTIONS = [
  { value: '1h' as const, label: '1H' },
  { value: '4h' as const, label: '4H' },
  { value: '1d' as const, label: 'D' },
];

export const RANGE_TF_WINDOWS: Record<string, string> = {
  '1h': 'Диапазон последних 24 часовых свечей (сутки)',
  '4h': 'Диапазон последних 30 четырёхчасовых свечей (5 дней)',
  '1d': 'Диапазон последних 30 дневных свечей (месяц)',
};
