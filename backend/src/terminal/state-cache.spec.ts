import { StateCache } from './state-cache';

/** Отложенный промис: тест сам решает, когда «биржа ответила». */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeCache(ttl = 2_500) {
  let t = 0;
  const cache = new StateCache<string>(ttl, () => t);
  return { cache, advance: (ms: number) => (t += ms) };
}

describe('StateCache', () => {
  it('две вкладки одновременно — один запрос к бирже', async () => {
    const { cache } = makeCache();
    const d = deferred<string>();
    const load = jest.fn(() => d.promise);

    const a = cache.get('u', 0, load);
    const b = cache.get('u', 0, load);
    d.resolve('state');

    await expect(Promise.all([a, b])).resolves.toEqual(['state', 'state']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('в пределах срока — из кэша, после срока — снова на биржу', async () => {
    const { cache, advance } = makeCache(2_500);
    const load = jest.fn().mockResolvedValueOnce('first').mockResolvedValueOnce('second');

    await cache.get('u', 0, load);
    advance(2_499);
    await expect(cache.get('u', 0, load)).resolves.toBe('first');
    advance(1);
    await expect(cache.get('u', 0, load)).resolves.toBe('second');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('одна вкладка с опросом раз в 3 с всегда получает свежий снимок', async () => {
    const { cache, advance } = makeCache(2_500);
    const load = jest.fn().mockResolvedValue('s');
    for (let i = 0; i < 4; i++) {
      await cache.get('u', 0, load);
      advance(3_000);
    }
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('запись на бирже сдвигает версию — следующий опрос не берёт счёт до действия', async () => {
    const { cache } = makeCache();
    const load = jest.fn().mockResolvedValueOnce('before').mockResolvedValueOnce('after');

    await cache.get('u', 0, load);
    await expect(cache.get('u', 1, load)).resolves.toBe('after');
  });

  it('чтение, начатое до записи и закончившееся после, в кэш не кладётся', async () => {
    const { cache } = makeCache();
    const stale = deferred<string>();
    const load = jest
      .fn()
      .mockImplementationOnce(() => stale.promise)
      .mockResolvedValueOnce('after');

    const old = cache.get('u', 0, load); // опрос ушёл
    const fresh = await cache.get('u', 1, load); // ордер встал, версия 1
    stale.resolve('before'); // старый ответ доехал позже
    await old;

    expect(fresh).toBe('after');
    await expect(cache.get('u', 1, load)).resolves.toBe('after');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('ошибка не кэшируется — следующий вызов идёт на биржу', async () => {
    const { cache } = makeCache();
    const load = jest.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('ok');

    await expect(cache.get('u', 0, load)).rejects.toThrow('down');
    await expect(cache.get('u', 0, load)).resolves.toBe('ok');
  });

  it('пользователи не делят снимок', async () => {
    const { cache } = makeCache();
    await cache.get('a', 0, async () => 'A');
    await expect(cache.get('b', 0, async () => 'B')).resolves.toBe('B');
  });
});
