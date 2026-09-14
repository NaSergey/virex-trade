import { BinanceKlinesClient } from './binance-klines.client';

/** Строка klines у Binance: [openTime, o, h, l, c, v, closeTime, ...]. */
const row = (openTime: number) => [
  openTime,
  '100.5',
  '110.0',
  '90.25',
  '105.75',
  '12.5',
  openTime + 59_999,
  '1312.5',
  42,
  '6.0',
  '630.0',
  '0',
];

function mockFetch(...responses: Array<{ status?: number; body?: unknown; retryAfter?: string }>) {
  const fn = jest.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      json: async () => r.body ?? [],
      headers: { get: (name: string) => (name === 'Retry-After' ? (r.retryAfter ?? null) : null) },
    });
  }
  global.fetch = fn as never;
  return fn;
}

/** Клиент со снятым настоящим сном — иначе тест на 429 ждал бы секунду. */
function makeClient() {
  const client = new BinanceKlinesClient();
  const sleep = jest.fn().mockResolvedValue(undefined);
  (client as unknown as { sleep: unknown }).sleep = sleep;
  return { client, sleep };
}

describe('BinanceKlinesClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('разбирает строки Binance в свечи', async () => {
    mockFetch({ body: [row(1_700_000_000_000)] });
    const { client } = makeClient();

    const candles = await client.fetchKlines('BTCUSDT', 60, 1_700_000_000_000);

    expect(candles).toEqual([
      { time: 1_700_000_000_000, open: 100.5, high: 110, low: 90.25, close: 105.75, volume: 12.5 },
    ]);
  });

  it('листается ВПЕРЁД: запрашивает startTime, а не end', async () => {
    const fetchMock = mockFetch({ body: [] });
    const { client } = makeClient();

    await client.fetchKlines('BTCUSDT', 240, 1_700_000_000_000, 1000);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('symbol=BTCUSDT');
    expect(url).toContain('interval=4h');
    expect(url).toContain('startTime=1700000000000');
    expect(url).toContain('limit=1000');
    expect(url).not.toContain('endTime');
  });

  it('хвост запрашивается без startTime — Binance отдаёт последние свечи', async () => {
    const fetchMock = mockFetch({ body: [row(1_700_000_000_000)] });
    const { client } = makeClient();

    const candles = await client.fetchRecent('BTCUSDT', 1, 30);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('interval=1m');
    expect(url).toContain('limit=30');
    expect(url).not.toContain('startTime');
    expect(candles).toHaveLength(1);
  });

  it('на 429 отступает и повторяет, а не теряет страницу', async () => {
    mockFetch({ status: 429 }, { body: [row(1_700_000_000_000)] });
    const { client, sleep } = makeClient();

    const candles = await client.fetchKlines('BTCUSDT', 60, 1_700_000_000_000);

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(candles).toHaveLength(1);
  });

  it('уважает заголовок Retry-After, если он пришёл', async () => {
    mockFetch({ status: 429, retryAfter: '7' }, { body: [] });
    const { client, sleep } = makeClient();

    await client.fetchKlines('BTCUSDT', 60, 1_700_000_000_000);

    expect(sleep).toHaveBeenCalledWith(7000);
  });

  it('сдаётся после трёх повторов, а не крутится вечно', async () => {
    mockFetch({ status: 429 }, { status: 429 }, { status: 429 }, { status: 429 });
    const { client } = makeClient();

    await expect(client.fetchKlines('BTCUSDT', 60, 1)).rejects.toThrow(/429/);
  });

  it('на прочую ошибку HTTP падает сразу, не пряча её пустым массивом', async () => {
    mockFetch({ status: 500 });
    const { client } = makeClient();

    await expect(client.fetchKlines('BTCUSDT', 60, 1)).rejects.toThrow(/500/);
  });
});
