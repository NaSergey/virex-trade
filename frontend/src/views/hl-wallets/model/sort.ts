/**
 * Сортировка на клиенте: строк — сотни, и приходят все сразу. Пустые значения
 * (кошелёк ещё не разобран) — всегда в конце: наверху они обещали бы лучший
 * или худший результат, которого нет.
 */
export function sortRows<T>(rows: T[], key: keyof T, dir: 1 | -1): T[] {
  return [...rows].sort((a, b) => {
    const x = a[key] as unknown as number | null;
    const y = b[key] as unknown as number | null;
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (x - y) * dir;
  });
}
