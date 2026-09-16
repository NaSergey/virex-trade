import { AggregateCacheService, cacheKey, buildEtag } from './aggregate-cache';

describe('AggregateCacheService — LRU', () => {
  it('возвращает записанное значение', () => {
    const cache = new AggregateCacheService();
    cache.set('k', 42);
    expect(cache.get('k')).toBe(42);
  });

  it('несуществующий ключ — undefined', () => {
    const cache = new AggregateCacheService();
    expect(cache.get('missing')).toBeUndefined();
  });

  it('вытесняет наименее недавно использованную запись при переполнении потолка (~5000)', () => {
    const cache = new AggregateCacheService();
    for (let i = 0; i < 5001; i++) cache.set(`k${i}`, i);
    expect(cache.size).toBe(5000);
    expect(cache.get('k0')).toBeUndefined(); // вытеснен первым, как самый старый
    expect(cache.get('k5000')).toBe(5000); // последняя запись жива
  });

  it('повторное чтение продлевает жизнь записи (recency), а не только порядок вставки', () => {
    const cache = new AggregateCacheService();
    for (let i = 0; i < 4999; i++) cache.set(`k${i}`, i);
    cache.get('k0'); // переносим k0 в конец очереди на вытеснение
    for (let i = 4999; i < 5002; i++) cache.set(`k${i}`, i);
    // k0 пережил вытеснение благодаря повторному чтению, а k1 (никто не читал) — нет.
    expect(cache.get('k0')).toBe(0);
    expect(cache.get('k1')).toBeUndefined();
  });
});

describe('cacheKey / buildEtag — стабильность параметров (T10)', () => {
  it('порядок ключей объекта параметров не влияет на ключ кэша', () => {
    const a = cacheKey('stats', 'u1', 1, { symbol: 'BTCUSDT', days: 30 });
    const b = cacheKey('stats', 'u1', 1, { days: 30, symbol: 'BTCUSDT' });
    expect(a).toBe(b);
  });

  it('undefined-поле не отличается от отсутствующего поля', () => {
    const a = cacheKey('stats', 'u1', 1, {});
    const b = cacheKey('stats', 'u1', 1, { symbol: undefined });
    expect(a).toBe(b);
  });

  it('другая версия данных — другой ключ, старый кэш недостижим', () => {
    const a = cacheKey('stats', 'u1', 1, {});
    const b = cacheKey('stats', 'u1', 2, {});
    expect(a).not.toBe(b);
  });

  it('другой пользователь — другой ключ при тех же параметрах', () => {
    const a = cacheKey('stats', 'u1', 1, {});
    const b = cacheKey('stats', 'u2', 1, {});
    expect(a).not.toBe(b);
  });

  it('другой scope (эндпоинт) — другой ключ при тех же остальных параметрах', () => {
    const a = cacheKey('stats', 'u1', 1, {});
    const b = cacheKey('list', 'u1', 1, {});
    expect(a).not.toBe(b);
  });

  it('разные значения одного параметра — разные ключи', () => {
    const a = cacheKey('stats', 'u1', 1, { symbol: 'BTCUSDT' });
    const b = cacheKey('stats', 'u1', 1, { symbol: 'ETHUSDT' });
    expect(a).not.toBe(b);
  });

  it('ETag слабый и несёт версию открытым текстом', () => {
    expect(buildEtag(3, { days: 30 })).toMatch(/^W\/"3:[0-9a-f]+"$/);
  });

  it('ETag меняется вместе с версией при тех же параметрах', () => {
    const e1 = buildEtag(1, { days: 30 });
    const e2 = buildEtag(2, { days: 30 });
    expect(e1).not.toBe(e2);
  });

  it('ETag не меняется, если и версия, и параметры те же', () => {
    expect(buildEtag(1, { days: 30, symbol: 'BTCUSDT' })).toBe(buildEtag(1, { days: 30, symbol: 'BTCUSDT' }));
  });
});
