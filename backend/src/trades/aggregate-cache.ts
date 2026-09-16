import { Injectable } from '@nestjs/common';

// A2 (docs/superpowers/sdd/2026-09-16-backend-optimization): тысяча
// пользователей × 4 комбинации параметров ≈ 120 МБ без потолка — держим
// суммарную память кэша в рамках одним числом записей, а не размером в
// байтах (посчитать точный объём произвольного JS-объекта дорого и не стоит
// усложнения).
const MAX_ENTRIES = 5000;

/**
 * LRU-кэш ответов агрегатов сделок (`stats`/`statsByTime`/`statsByTag`/
 * `statsByTagCombo`/`list`/`LabService.query`/`HabitsService.scan`) в памяти
 * процесса. Ключ несёт версию данных пользователя (`DataVersionService`), так
 * что запись "протухает" сама — новым несовпадающим ключом при следующем
 * бампе, без TTL и без ручной инвалидации по месту (см. `cacheKey`).
 *
 * Один кэш на процесс, не per-request и не per-user: общий потолок
 * `MAX_ENTRIES` держит суммарную память в рамках вне зависимости от того,
 * сколько пользователей сейчас активны.
 */
@Injectable()
export class AggregateCacheService {
  private readonly store = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    if (!this.store.has(key)) return undefined;
    // JS Map хранит порядок вставки — перечитанный ключ переносим в конец,
    // чтобы вытеснение ниже действительно било по наименее недавно
    // использованному, а не по первому когда-либо вставленному.
    const value = this.store.get(key) as T;
    this.store.delete(key);
    this.store.set(key, value);
    return value;
  }

  set<T>(key: string, value: T): void {
    this.store.delete(key);
    this.store.set(key, value);
    if (this.store.size > MAX_ENTRIES) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
  }

  /** Только для тестов/отладки — число записей сейчас в кэше. */
  get size(): number {
    return this.store.size;
  }

  /** Только для тестов — сброс между независимыми сценариями. */
  clear(): void {
    this.store.clear();
  }
}

/**
 * Стабильная сериализация: ключи объекта сортируются, а поля со значением
 * `undefined` выбрасываются — иначе `{}` и `{ symbol: undefined }` (одно и то
 * же для каждого вызывающего кода, но разные JS-объекты) считались бы разными
 * ключами кэша и не переиспользовали бы друг друга.
 */
function stableStringify(v: unknown): string {
  if (v === undefined) return 'undefined';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** FNV-1a — тот же лёгкий несекретный хэш, что уже используется в habits.service.ts. */
function fnv1a(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/** Ключ LRU-кэша: (scope, userId, версия данных, параметры запроса). */
export function cacheKey(scope: string, userId: string, version: number, params: unknown): string {
  return `${scope}:${userId}:${version}:${fnv1a(stableStringify(params))}`;
}

/**
 * `ETag: W/"<version>:<hash params>"` — слабый (данные логически те же, но
 * сериализация может отличаться до байта) тег ровно из тех же двух
 * составляющих, что и ключ кэша: версия данных + параметры запроса. Не
 * трогает Prisma и не идёт в кэш агрегатов — контроллер строит его из уже
 * прочитанной версии, чтобы сравнить с `If-None-Match` ДО вызова сервиса.
 */
export function buildEtag(version: number, params: unknown): string {
  return `W/"${version}:${fnv1a(stableStringify(params))}"`;
}
