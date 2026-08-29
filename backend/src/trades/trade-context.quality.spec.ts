import { TradeContextService } from './trade-context.service';
import type { Candle } from './indicators.service';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function flatCandles(fromMs: number, toMs: number, low: number, high: number): Candle[] {
  const out: Candle[] = [];
  for (let t = fromMs; t <= toMs; t += HOUR) {
    out.push({ time: t, open: (low + high) / 2, high, low, close: (low + high) / 2, volume: 100 });
  }
  return out;
}

describe('TradeContextService.computeMissingQuality', () => {
  it('группирует по (символ, интервал) — один фетч на группу, не на сделку', async () => {
    const base = Date.UTC(2026, 0, 1);
    // A и B — один символ, обе длительности попадают в корзину '60' (3-30д) —
    // должны уйти одним фетчем. C — другой символ, отдельный фетч.
    const tradeA = {
      id: 'a', symbol: 'BTCUSDT', direction: 'long', positionId: null,
      openedAt: new Date(base), closedAt: new Date(base + 10 * DAY),
      avgEntryPrice: 100, avgExitPrice: 118,
    };
    const tradeB = {
      id: 'b', symbol: 'BTCUSDT', direction: 'short', positionId: null,
      openedAt: new Date(base + DAY), closedAt: new Date(base + 15 * DAY),
      avgEntryPrice: 112, avgExitPrice: 93,
    };
    const tradeC = {
      id: 'c', symbol: 'ETHUSDT', direction: 'long', positionId: null,
      openedAt: new Date(base), closedAt: new Date(base + 10 * DAY),
      avgEntryPrice: 52, avgExitPrice: 58,
    };

    const findManyMock = jest.fn().mockResolvedValue([tradeA, tradeB, tradeC]);
    const updateMock = jest.fn().mockResolvedValue(undefined);
    const prisma = { trade: { findMany: findManyMock }, tradeContext: { update: updateMock } } as any;

    const getKlinesRangeMock = jest.fn().mockImplementation((symbol: string, _interval: string, fromMs: number, toMs: number) => {
      const [low, high] = symbol === 'BTCUSDT' ? [90, 120] : [48, 60];
      return Promise.resolve(flatCandles(fromMs, toMs, low, high));
    });
    const market = { getKlinesRange: getKlinesRangeMock } as any;

    const service = new TradeContextService(prisma, market, {} as any);
    const written = await (service as any).computeMissingQuality('u1');

    expect(written).toBe(3);
    // Группировка: BTCUSDT+'60' — один фетч на A и B, ETHUSDT+'60' — отдельный.
    expect(getKlinesRangeMock).toHaveBeenCalledTimes(2);
    expect(getKlinesRangeMock).toHaveBeenCalledWith('BTCUSDT', '60', expect.any(Number), expect.any(Number));
    expect(getKlinesRangeMock).toHaveBeenCalledWith('ETHUSDT', '60', expect.any(Number), expect.any(Number));

    expect(updateMock).toHaveBeenCalledTimes(3);
    expect(updateMock).toHaveBeenCalledWith({
      where: { tradeId: 'a' },
      data: { entryQuality: 66.67, exitQuality: 93.33, qualityComputed: true },
    });
    expect(updateMock).toHaveBeenCalledWith({
      where: { tradeId: 'b' },
      data: { entryQuality: 73.33, exitQuality: 90, qualityComputed: true },
    });
    expect(updateMock).toHaveBeenCalledWith({
      where: { tradeId: 'c' },
      data: { entryQuality: 66.67, exitQuality: 83.33, qualityComputed: true },
    });
  });

  it('ничего не делает, если нет сделок, ожидающих расчёта', async () => {
    const findManyMock = jest.fn().mockResolvedValue([]);
    const updateMock = jest.fn();
    const prisma = { trade: { findMany: findManyMock }, tradeContext: { update: updateMock } } as any;
    const getKlinesRangeMock = jest.fn();
    const market = { getKlinesRange: getKlinesRangeMock } as any;

    const service = new TradeContextService(prisma, market, {} as any);
    const written = await (service as any).computeMissingQuality('u1');

    expect(written).toBe(0);
    expect(getKlinesRangeMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });
});
