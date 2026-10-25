jest.mock('../bybit/bybit-gate', () => ({
  BYBIT_API: 'https://api.bybit.com/v5',
  bybitFetch: jest.fn(),
}));

import { bybitFetch } from '../bybit/bybit-gate';
import { DerivFeed, SERIES, SERIES_START, windowsOf } from './deriv-feed';

const H = 3_600_000;
const fetchMock = bybitFetch as jest.Mock;
const ok = (json: unknown) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(json),
});

describe('windowsOf', () => {
  it('окна по limit точек, без пропусков и наложений', () => {
    expect(windowsOf(0, 10 * H, H, 4)).toEqual([
      [0, 3 * H],
      [3 * H + 1, 6 * H + 1],
      [6 * H + 2, 9 * H + 2],
      [9 * H + 3, 10 * H],
    ]);
  });
  it('начало позже конца — пусто', () => {
    expect(windowsOf(10, 5, H, 4)).toEqual([]);
  });
});

describe('SERIES.parse', () => {
  it('фандинг, доля лонгов, открытый интерес', () => {
    expect(
      SERIES.funding.parse({
        retCode: 0,
        result: {
          list: [
            { fundingRate: '0.0001', fundingRateTimestamp: '1590969600000' },
          ],
        },
      }),
    ).toEqual([{ time: 1590969600000, value: 0.0001 }]);
    expect(
      SERIES.ratio.parse({
        retCode: 0,
        result: { list: [{ buyRatio: '0.5953', timestamp: '1609459200000' }] },
      }),
    ).toEqual([{ time: 1609459200000, value: 0.5953 }]);
    expect(
      SERIES.oi.parse({
        retCode: 0,
        result: {
          list: [{ openInterest: '5505.046', timestamp: '1609459200000' }],
        },
      }),
    ).toEqual([{ time: 1609459200000, value: 5505.046 }]);
  });
  it('отказ биржи и ответ без retCode — исключение, а не пустой ряд', () => {
    expect(() =>
      SERIES.ratio.parse({ retCode: 10001, retMsg: 'bad' }),
    ).toThrow();
    expect(() => SERIES.ratio.parse({ result: { list: [] } })).toThrow();
  });
});

describe('DerivFeed.pull', () => {
  const prisma = {
    derivPoint: {
      findFirst: jest.fn(),
      deleteMany: jest.fn(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        (_: { where: { kind: string; time: { in: Date[] } } }) =>
          Promise.resolve({ count: 0 }),
      ),
      createMany: jest.fn(
        ({ data }: { data: unknown[]; skipDuplicates?: boolean }) =>
          Promise.resolve({ count: data.length }),
      ),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const feed = new DerivFeed(prisma as never);

  beforeEach(() => {
    fetchMock.mockReset();
    prisma.derivPoint.findFirst.mockReset();
    prisma.derivPoint.deleteMany.mockClear();
    prisma.derivPoint.createMany.mockClear();
    prisma.$transaction.mockClear();
  });

  it('пришедшие точки перезаписываются одной транзакцией, остальные не трогаются', async () => {
    const last = Date.UTC(2026, 9, 25, 0);
    prisma.derivPoint.findFirst.mockResolvedValue({ time: new Date(last) });
    fetchMock.mockResolvedValue(
      ok({
        retCode: 0,
        result: {
          list: [
            {
              buyRatio: '0.6',
              openInterest: '1',
              fundingRate: '0.0001',
              fundingRateTimestamp: String(last),
              timestamp: String(last),
            },
          ],
        },
      }),
    );
    await feed.pull(last + H);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    const where = prisma.derivPoint.deleteMany.mock.calls[0][0].where;
    expect(where.time.in.map((d) => d.getTime())).toEqual([last]);
  });

  it('пустой ответ ничего не удаляет', async () => {
    prisma.derivPoint.findFirst.mockResolvedValue({
      time: new Date(Date.UTC(2026, 9, 25)),
    });
    fetchMock.mockResolvedValue(ok({ retCode: 0, result: { list: [] } }));
    await feed.pull(Date.UTC(2026, 9, 25, 1));
    expect(prisma.derivPoint.deleteMany).not.toHaveBeenCalled();
  });

  it('доливает с последней точки и пишет точки каждого ряда', async () => {
    const last = Date.UTC(2026, 9, 25, 0);
    prisma.derivPoint.findFirst.mockResolvedValue({ time: new Date(last) });
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('funding'))
        return Promise.resolve(
          ok({
            retCode: 0,
            result: {
              list: [
                {
                  fundingRate: '0.0002',
                  fundingRateTimestamp: String(last + 8 * H),
                },
              ],
            },
          }),
        );
      if (url.includes('account-ratio'))
        return Promise.resolve(
          ok({
            retCode: 0,
            result: {
              list: [{ buyRatio: '0.6', timestamp: String(last + 4 * H) }],
            },
          }),
        );
      return Promise.resolve(
        ok({
          retCode: 0,
          result: {
            list: [{ openInterest: '100', timestamp: String(last + 4 * H) }],
          },
        }),
      );
    });
    const written = await feed.pull(last + 9 * H);
    expect(written).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [url] of fetchMock.mock.calls as [string][])
      expect(url).toContain(`startTime=${last}&`);
    const calls = prisma.derivPoint.createMany.mock.calls;
    const kinds = calls.map(([arg]) => (arg.data[0] as { kind: string }).kind);
    expect(kinds.sort()).toEqual(['funding', 'oi', 'ratio']);
    expect(calls[0][0].skipDuplicates).toBe(true);
  });

  it('пустая таблица — с начала рядов', async () => {
    prisma.derivPoint.findFirst.mockResolvedValue(null);
    fetchMock.mockResolvedValue(ok({ retCode: 0, result: { list: [] } }));
    await feed.pull(SERIES_START + H);
    expect(fetchMock.mock.calls[0][0]).toContain(`startTime=${SERIES_START}`);
  });

  it('сбой одного ряда не мешает остальным', async () => {
    prisma.derivPoint.findFirst.mockResolvedValue({
      time: new Date(Date.UTC(2026, 9, 25)),
    });
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('funding'))
        return Promise.reject(new Error('BYBIT_BUSY'));
      return Promise.resolve(
        ok({
          retCode: 0,
          result: {
            list: [
              {
                buyRatio: '0.6',
                openInterest: '1',
                timestamp: String(Date.UTC(2026, 9, 25, 4)),
              },
            ],
          },
        }),
      );
    });
    await expect(feed.pull(Date.UTC(2026, 9, 25, 5))).resolves.toBe(2);
  });
});
