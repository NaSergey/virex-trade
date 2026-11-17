/** Рынок списка монет: у биржи и эфира списки разные и хранятся отдельно. */
export type WatchKind = 'bybit' | 'live';

/** Столько монет у биржи в списке по умолчанию: в нём сотни перпов, а список — то, за чем следят. */
export const WATCH_DEFAULT_BYBIT = 12;

/**
 * Список по умолчанию. У биржи — первые по обороту за сутки (`symbols` терминала
 * уже отсортирован), у эфира — все его монеты: их около десятка.
 */
export function watchDefaults(all: readonly string[], kind: WatchKind): string[] {
  return kind === 'bybit' ? all.slice(0, WATCH_DEFAULT_BYBIT) : [...all];
}

/** Что показать: монета, которой больше нет у рынка (делистинг), выпадает. */
export function watchShown(list: readonly string[], all: readonly string[]): string[] {
  const known = new Set(all);
  return list.filter((s) => known.has(s));
}

/** Добавить в конец; уже есть — список как был. */
export function watchAdd(list: readonly string[], symbol: string): string[] {
  return list.includes(symbol) ? [...list] : [...list, symbol];
}

export function watchRemove(list: readonly string[], symbol: string): string[] {
  return list.filter((s) => s !== symbol);
}
