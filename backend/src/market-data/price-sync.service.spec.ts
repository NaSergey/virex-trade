import { Logger } from '@nestjs/common';
import { PriceSyncService } from './price-sync.service';
import { START_MS } from './timeframes';
import { BinanceCandle } from './binance-klines.client';

const HOUR = 3_600_000;

const candle = (time: number): BinanceCandle => ({
  time,
  open: 100,
  high: 110,
  low: 90,
  close: 105,
  volume: 1,
});

/**
 * Сервис собирается руками с заглушками — тест про то, какие строки попадают
 * в базу и с какого места продолжается курсор, а не про Nest.
 */
function makeService(opts: {
  latestStored?: number; // время последней свечи в базе, мс
  pages: BinanceCandle[][]; // что Binance отдаёт по порядку
  insertedPerPage?: number; // что возвращает createMany.count
}) {
  const written: Array<Record<string, unknown>> = [];
  const prisma = {
    priceCandle: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.latestStored != null ? { time: new Date(opts.latestStored) } : null,
        ),
      createMany: jest.fn().mockImplementation(({ data }) => {
        written.push(...data);
        return { count: opts.insertedPerPage ?? data.length };
      }),
    },
  } as never;

  const fetchKlines = jest.fn();
  for (const page of opts.pages) fetchKlines.mockResolvedValueOnce(page);
  fetchKlines.mockResolvedValue([]); // дальше история кончилась

  const service = new PriceSyncService(prisma, { fetchKlines } as never);
  (service as unknown as { pause: unknown }).pause = jest.fn().mockResolvedValue(undefined);

  return { service, fetchKlines, written };
}

describe('PriceSyncService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('на пустой базе начинает с 2018-01-01', async () => {
    const { service, fetchKlines } = makeService({ pages: [[]] });

    await service.syncTimeframe(60);

    expect(fetchKlines).toHaveBeenCalledWith('BTCUSDT', 60, START_MS, 1000);
  });

  it('на заполненной продолжает со следующей миллисекунды после последней свечи', async () => {
    const stored = Date.UTC(2026, 0, 1, 10, 0, 0);
    const { service, fetchKlines } = makeService({ latestStored: stored, pages: [[]] });

    await service.syncTimeframe(60);

    expect(fetchKlines).toHaveBeenCalledWith('BTCUSDT', 60, stored + 1, 1000);
  });

  it('не пишет незакрытую свечу', async () => {
    const now = Date.UTC(2026, 0, 1, 12, 30, 0);
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const closedOpen = Date.UTC(2026, 0, 1, 11, 0, 0); // закрылась в 12:00
    const formingOpen = Date.UTC(2026, 0, 1, 12, 0, 0); // закроется в 13:00

    const { service, written } = makeService({
      latestStored: closedOpen - HOUR,
      pages: [[candle(closedOpen), candle(formingOpen)]],
    });

    await service.syncTimeframe(60);

    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ symbol: 'BTCUSDT', timeframe: 60, time: new Date(closedOpen) });
  });

  it('выходит, когда в странице нет ни одной закрытой свечи', async () => {
    const now = Date.UTC(2026, 0, 1, 12, 30, 0);
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const formingOpen = Date.UTC(2026, 0, 1, 12, 0, 0);

    const { service, fetchKlines, written } = makeService({
      latestStored: formingOpen - HOUR,
      pages: [[candle(formingOpen)]],
    });

    await service.syncTimeframe(60);

    expect(written).toHaveLength(0);
    expect(fetchKlines).toHaveBeenCalledTimes(1);
  });

  // Регрессия: если курсор двигать по числу ВСТАВЛЕННЫХ строк, страница,
  // целиком отсеянная skipDuplicates, оставит его на месте — и цикл будет
  // запрашивать одно и то же вечно.
  it('двигает курсор по полученной свече, даже когда вставлено ноль строк', async () => {
    const now = Date.UTC(2026, 0, 2, 0, 0, 0);
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const first = Date.UTC(2026, 0, 1, 10, 0, 0);
    const second = Date.UTC(2026, 0, 1, 11, 0, 0);

    const { service, fetchKlines } = makeService({
      latestStored: first - HOUR,
      pages: [[candle(first)], [candle(second)]],
      insertedPerPage: 0, // всё уже лежит в базе
    });

    await service.syncTimeframe(60);

    expect(fetchKlines).toHaveBeenNthCalledWith(2, 'BTCUSDT', 60, first + 1, 1000);
    expect(fetchKlines).toHaveBeenNthCalledWith(3, 'BTCUSDT', 60, second + 1, 1000);
  });

  it('обходит все шесть таймфреймов от крупного к мелкому', async () => {
    const { service, fetchKlines } = makeService({ pages: [] });

    await service.sync();

    const timeframes = fetchKlines.mock.calls.map((c) => c[1]);
    expect(timeframes).toEqual([1440, 240, 60, 30, 15, 5, 1]);
  });

  it('второй одновременный проход не запускается поверх идущего', async () => {
    const { service, fetchKlines } = makeService({ pages: [] });
    (service as unknown as { syncing: boolean }).syncing = true;

    const result = await service.sync();

    expect(result).toEqual({ inserted: 0 });
    expect(fetchKlines).not.toHaveBeenCalled();
  });

  // Регрессия: sync() держит флаг syncing в try/finally именно для того,
  // чтобы сбой не убивал синхронизацию навсегда. Без finally этот тест
  // падает — второй вызов молча вернёт {inserted: 0}, не тронув fetchKlines.
  it('сбрасывает флаг занятости даже после исключения в fetchKlines', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { service, fetchKlines } = makeService({ pages: [] });
    fetchKlines.mockReset();
    fetchKlines.mockRejectedValue(new Error('сеть упала'));

    // Правка 3 перехватывает исключение на уровне каждого таймфрейма, поэтому
    // sync() отдаёт результат, а не разваливается необработанным отказом.
    await expect(service.sync()).resolves.toEqual({ inserted: 0 });

    fetchKlines.mockClear();
    fetchKlines.mockResolvedValue([]);
    await service.sync();

    expect(fetchKlines).toHaveBeenCalled();
  });
});
