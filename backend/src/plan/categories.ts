/**
 * Виды блоков — единственный список: сервер проверяет по нему, фронт и бот
 * берут подписи отсюда же (едет в `GET /api/admin/plan/state`). Список
 * фиксированный, а не свободный текст: статистика по «Бектест» / «бектесты» /
 * «БТ» разъехалась бы на три строки.
 */
export const CATEGORIES = [
  { id: 'trading', label: 'Торговля', emoji: '📈' },
  { id: 'backtest', label: 'Бектест', emoji: '🧪' },
  { id: 'english', label: 'Английский', emoji: '🇬🇧' },
  { id: 'work', label: 'Работа', emoji: '💻' },
  { id: 'study', label: 'Учёба', emoji: '📚' },
  { id: 'sport', label: 'Спорт', emoji: '🏃' },
  { id: 'rest', label: 'Отдых', emoji: '🌿' },
  { id: 'life', label: 'Быт', emoji: '🏠' },
  { id: 'other', label: 'Другое', emoji: '•' },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export const CATEGORY_IDS: string[] = CATEGORIES.map((c) => c.id);

export function categoryOf(id: string) {
  return (
    CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]
  );
}
