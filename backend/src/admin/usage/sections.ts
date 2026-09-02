/**
 * Раздел продукта, к которому относится запрос.
 *
 * Нужен ровно для одного вопроса владельца: чем в сервисе реально пользуются, а
 * что написано и стоит мёртвым. Поэтому разбивка идёт по продуктовым разделам,
 * а не по контроллерам: «Лаборатория» и «Привычки» живут в TradesController, но
 * это разные функции, и мерить их вместе с журналом бессмысленно.
 *
 * Порядок правил значим — первое совпадение по префиксу выигрывает, поэтому
 * более длинные пути стоят раньше своих родителей.
 */
const RULES: ReadonlyArray<readonly [prefix: string, section: string]> = [
  ['/api/trades/lab', 'lab'],
  ['/api/trades/habits', 'habits'],
  ['/api/trades/stats', 'stats'],
  ['/api/trades/sync', 'sync'],
  ['/api/trades', 'journal'],
  ['/api/tags', 'tags'],
  ['/api/analytics', 'market'],
  ['/api/market-events', 'market'],
  ['/api/settings', 'settings'],
  ['/api/exchange', 'settings'],
  ['/api/telegram', 'telegram'],
  ['/api/bybit', 'terminal'],
  ['/auth', 'auth'],
];

export const UNKNOWN_SECTION = 'other';

/**
 * Пути, которые не считаются использованием продукта.
 *
 * Админка — это владелец, смотрящий на своих пользователей; засчитывать её в
 * ту же статистику значит мерить собственные визиты и видеть рост там, где его
 * нет. Health-check по той же причине: его дёргает Docker, а не человек.
 */
const IGNORED_PREFIXES = ['/api/admin', '/health'];

export function isTrackedPath(path: string): boolean {
  const p = normalize(path);
  return !IGNORED_PREFIXES.some((prefix) => matches(p, prefix));
}

export function sectionOf(path: string): string {
  const p = normalize(path);
  for (const [prefix, section] of RULES) {
    if (matches(p, prefix)) return section;
  }
  return UNKNOWN_SECTION;
}

/**
 * Префикс считается совпавшим только на границе сегмента или дефиса.
 *
 * Дефис здесь не украшение: статистика разъехалась по маршрутам
 * `/api/trades/stats-by-tag` и `/api/trades/stats-by-time` — по одному слэшу
 * они не попадали под `/api/trades/stats` и молча уезжали в журнал. Голый
 * startsWith при этом не годится в другую сторону: `/api/tagsomething` не
 * должен читаться как теги.
 */
function matches(path: string, prefix: string): boolean {
  if (path === prefix) return true;
  if (!path.startsWith(prefix)) return false;
  const next = path[prefix.length];
  return next === '/' || next === '-';
}

// Query-строка к разделу отношения не имеет, а хвостовой слэш иначе ломает
// сравнение с префиксом.
function normalize(path: string): string {
  const withoutQuery = path.split('?')[0];
  return withoutQuery.length > 1
    ? withoutQuery.replace(/\/+$/, '')
    : withoutQuery;
}
