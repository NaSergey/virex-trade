/**
 * T12 (A3): свой ограничитель параллелизма, без новой зависимости.
 *
 * `Promise.all` без ограничения на обходе пользователей означало бы тысячу
 * одновременных исходящих HTTPS-запросов к биржам и тысячу параллельных
 * транзакций Prisma разом — это кладёт и пул соединений, и сеть. Простой
 * последовательный `for` — другая крайность: обход перестаёт помещаться в
 * минуту уже на ~60 подключённых аккаунтах (250 мс × 4 вызова на биржу на
 * пользователя).
 *
 * `runWithConcurrency` — золотая середина: не больше `limit` воркеров
 * работают одновременно, каждый вытягивает следующий элемент из общей
 * очереди сразу, как освобождается (а не ждёт всю пачку из `limit` штук —
 * иначе один медленный пользователь держал бы простаивать остальных `limit
 * - 1` слотов до конца своей пачки).
 */
export async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const runners = Array.from({ length: workerCount }, async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}
