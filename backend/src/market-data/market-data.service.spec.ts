import { BadRequestException } from '@nestjs/common';
import { MarketDataService } from './market-data.service';

const rowsAsc = [
  { time: new Date('2026-01-01T00:00:00Z'), open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
  { time: new Date('2026-01-01T01:00:00Z'), open: 1.5, high: 2.5, low: 1, close: 2, volume: 20 },
];

function makeService() {
  const findMany = jest.fn().mockResolvedValue(rowsAsc.map((r) => ({ ...r })));
  const findFirst = jest.fn().mockResolvedValue(null);
  const prisma = { priceCandle: { findMany, findFirst } } as never;
  return { service: new MarketDataService(prisma), findMany, findFirst };
}

describe('MarketDataService.getCandles', () => {
  it('отвергает таймфрейм вне списка, а не отдаёт пустоту', async () => {
    const { service } = makeService();

    await expect(service.getCandles({ timeframe: 30 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('фильтрует по символу, таймфрейму и диапазону', async () => {
    const { service, findMany } = makeService();
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-01-02T00:00:00Z');

    await service.getCandles({ timeframe: 60, from, to });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { symbol: 'BTCUSDT', timeframe: 60, time: { gte: from, lte: to } },
        orderBy: { time: 'asc' },
      }),
    );
  });

  it('без limit не ставит take — внутренним потребителям нужен весь диапазон', async () => {
    const { service, findMany } = makeService();

    await service.getCandles({ timeframe: 60, from: new Date('2026-01-01T00:00:00Z') });

    expect(findMany.mock.calls[0][0].take).toBeUndefined();
  });

  // Без from «последние N свечей» — это хвост, а не голова истории.
  it('с limit и без from берёт ПОСЛЕДНИЕ свечи, но отдаёт их по возрастанию', async () => {
    const { service, findMany } = makeService();
    findMany.mockResolvedValue([{ ...rowsAsc[1] }, { ...rowsAsc[0] }]); // desc из базы

    const candles = await service.getCandles({ timeframe: 60, limit: 2 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { time: 'desc' }, take: 2 }),
    );
    expect(candles.map((c) => c.time)).toEqual([rowsAsc[0].time, rowsAsc[1].time]);
  });

  it('с limit и с from листается вперёд', async () => {
    const { service, findMany } = makeService();

    await service.getCandles({ timeframe: 60, from: new Date('2026-01-01T00:00:00Z'), limit: 2 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { time: 'asc' }, take: 2 }),
    );
  });
});

describe('MarketDataService.getCoverage', () => {
  it('отдаёт границы по каждому из шести таймфреймов', async () => {
    const { service, findFirst } = makeService();
    findFirst.mockResolvedValue({ time: new Date('2026-01-01T00:00:00Z') });

    const coverage = await service.getCoverage();

    expect(coverage.map((c) => c.timeframe)).toEqual([1, 5, 15, 60, 240, 1440]);
    expect(coverage[0].from).toEqual(new Date('2026-01-01T00:00:00Z'));
  });

  it('на пустом таймфрейме отдаёт null, а не выдумывает даты', async () => {
    const { service } = makeService(); // findFirst → null

    const coverage = await service.getCoverage();

    expect(coverage[0]).toEqual({ timeframe: 1, from: null, to: null });
  });
});
