export type TFunc = (key: string) => string;

const FNG_LABEL_KEYS: Record<string, string> = {
  'Extreme Fear': 'fngExtremeFear',
  Fear: 'fngFear',
  Neutral: 'fngNeutral',
  Greed: 'fngGreed',
  'Extreme Greed': 'fngExtremeGreed',
};

/**
 * `classification` с alternative.me — фиксированный английский набор из пяти
 * значений. Незнакомое значение (API расширит набор) возвращает как есть —
 * нелокализованная строка лучше пустого места (тот же приём, что у
 * `habitLabel` в `overview/lib/habit-labels.ts`).
 */
export function fearGreedLabel(classification: string, t: TFunc): string {
  const key = FNG_LABEL_KEYS[classification];
  return key ? t(key) : classification;
}
