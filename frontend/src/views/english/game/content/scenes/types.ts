/**
 * Сцена — разговор с лондонцем на станции (спека, «Сцены»). Тексты свои, не из
 * книги; лексика — уровня блока, готовые обороты («Can I have…, please?»)
 * допускаются раньше грамматики фразой целиком.
 */
export interface Scene {
  id: string;
  /** Раздел курса, с которым сцена открывается (первый раздел своего блока). */
  unit: string;
  title: string;
  /** Табличка места: `{ en: 'CAFÉ · CAMDEN', ru: 'Кафе в Камдене' }`. */
  place: { en: string; ru: string };
  npc: { name: string; role: string };
  /** Цель по-русски. */
  goal: string;
  /**
   * Переменные: `{price}` в текстах — одно значение из списка на забег. До 6
   * значений, до 12 сочетаний на строку: каждое сочетание озвучивается заранее.
   */
  vars?: Record<string, string[]>;
  steps: SceneStep[];
  /** Ключевые фразы [en, ru] — в итоге сцены, с «+ в мои слова». 2–3 штуки. */
  phrases: [string, string][];
}

/** Реплика собеседника или ответ игрока. */
export type SceneStep = { npc: string; ru: string } | { reply: SceneOption[]; accept?: string[] };

/**
 * Вариант ответа. Ровно один `ok`. У неверного — `why` (почему, по-русски) и
 * `react` (что ответит собеседник). У верного может стоять `distract` — имя
 * переменной: неверные варианты тогда строятся из того же текста с другими её
 * значениями, а `why` и `react` верного — их объяснение и реакция
 * («Она сказала {price}»).
 */
export interface SceneOption {
  en: string;
  ru: string;
  ok?: true;
  why?: string;
  react?: string;
  distract?: string;
}

export const isReply = (s: SceneStep): s is { reply: SceneOption[]; accept?: string[] } => 'reply' in s;
