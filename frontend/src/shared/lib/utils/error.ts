/**
 * Текст ошибки из чего угодно, что дошло до слоя показа.
 *
 * React Query типизирует `error` как `unknown`, и на каждом экране это
 * разворачивалось по-своему: где-то `(error as Error).message` (упадёт, если с
 * провода прилетела строка), где-то полная лесенка `instanceof` на четыре
 * строки. Разбор один и тот же везде, а вот запасное слово — своё: «не удалось
 * сохранить теги» полезнее, чем общее «ошибка».
 * @param error - что поймали
 * @param fallback - что сказать, если внятного сообщения нет
 */
export function errorMessage(error: unknown, fallback = 'Что-то пошло не так'): string {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === 'string') return error || fallback;
  return fallback;
}
