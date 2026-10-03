import { TerminalMarketService } from './terminal-market.service';

/**
 * График терминала — тот же, что у бектеста, и ждёт от истории той же формы:
 * только закрытые свечи, по возрастанию. Bybit отдаёт их наоборот и вместе с
 * формирующейся — перевод и проверяется.
 */

const MIN = 60_000;
const NOW = Date.UTC(2026, 8, 30, 12, 0, 30);

const INSTRUMENT = {
  symbol: 'BTCUSDT',
  baseCoin: 'BTC',
  quoteCoin: 'USDT',
  status: 'Trading',
  contractType: 'LinearPerpetual',
  priceFilter: { tickSize: '0.10' },
  lotSizeFilter: { qtyStep: '0.001', minOrderQty: '0.001', maxOrderQty: '1000' },
  leverageFilter: { minLeverage: '1', maxLeverage: '100' },
};

/** Свеча Bybit: [start, open, high, low, close, volume, turnover]. */
const kline = (t: number) => [String(t), '1', '2', '0.5', '1.5', '10', '15'];

class TestMarket extends TerminalMarketService {
  setNow(ms: number) {
    this.now = () => ms;
  }
}

function setup(klines: (params: Record<string, string>) => string[][]) {
  const calls: Record<string, string>[] = [];
  const bybit = {
    publicGet: jest.fn(async (path: string, params: Record<string, string>) => {
      if (path === '/market/instruments-info') return { list: [INSTRUMENT, { ...INSTRUMENT, symbol: 'ETHUSDC', quoteCoin: 'USDC' }] };
      if (path === '/market/tickers') {
        return { list: [{ symbol: 'BTCUSDT', lastPrice: '60000', markPrice: '60010', turnover24h: '5' }] };
      }
      if (path === '/market/kline') {
        calls.push(params);
        return { list: klines(params) };
      }
      throw new Error(`unexpected ${path}`);
    }),
  };
  const market = new TestMarket(bybit as any);
  market.setNow(NOW);
  return { market, calls, bybit };
}

describe('TerminalMarketService', () => {
  it('returns closed candles only, oldest first', async () => {
    // Последняя минутка (12:00) ещё идёт; 11:59 закрылась 30 секунд назад.
    const open = Date.UTC(2026, 8, 30, 12, 0, 0);
    const { market } = setup(() => [kline(open), kline(open - MIN), kline(open - 2 * MIN)]);

    const rows = await market.candles('BTCUSDT', { timeframe: 1, limit: 300 });

    expect(rows.map((c) => c.time.getTime())).toEqual([open - 2 * MIN, open - MIN]);
    expect(rows[0]).toMatchObject({ open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 });
  });

  it('pages backwards until the window is covered', async () => {
    const end = Date.UTC(2026, 8, 30, 10, 0, 0);
    const { market, calls } = setup((p) => {
      const to = Number(p.end);
      const n = Number(p.limit);
      return Array.from({ length: n }, (_, i) => kline(Math.floor(to / MIN) * MIN - i * MIN));
    });

    const rows = await market.candles('BTCUSDT', { timeframe: 1, to: new Date(end), limit: 1500 });

    expect(rows).toHaveLength(1500);
    expect(calls.map((c) => c.limit)).toEqual(['1000', '500']);
    // Вторая страница начинается там, где кончилась первая, без дыры и без повтора.
    const times = rows.map((c) => c.time.getTime());
    expect(times[times.length - 1]).toBe(end);
    expect(new Set(times).size).toBe(1500);
    expect(times.every((t, i) => i === 0 || t - times[i - 1] === MIN)).toBe(true);
  });

  it('refuses a symbol that is not a tradable USDT perpetual', async () => {
    const { market, calls } = setup(() => []);

    await expect(market.candles('ETHUSDC', { timeframe: 1, limit: 10 })).rejects.toMatchObject({
      response: { code: 'TERMINAL_SYMBOL_UNKNOWN' },
    });
    await expect(market.tail('../etc')).rejects.toMatchObject({ response: { code: 'TERMINAL_SYMBOL_UNKNOWN' } });
    expect(calls).toHaveLength(0);
  });

  it('asks the exchange for the tail once per window, however many charts are open', async () => {
    const open = Date.UTC(2026, 8, 30, 12, 0, 0);
    const { market, calls } = setup(() => [kline(open), kline(open - MIN)]);

    const [a, b] = await Promise.all([market.tail('BTCUSDT'), market.tail('BTCUSDT')]);
    await market.tail('BTCUSDT');

    expect(calls).toHaveLength(1);
    // Хвост — по возрастанию и вместе с формирующейся минуткой.
    expect(a.map((c) => c.time.getTime())).toEqual([open - MIN, open]);
    expect(b).toBe(a);
  });

  it('lists the coins with the decimals of their price step', async () => {
    const { market } = setup(() => []);

    expect(await market.symbols()).toEqual([{ symbol: 'BTCUSDT', base: 'BTC', decimals: 2, maxLeverage: 100 }]);
  });

  it('маркировка — один запрос на все монеты, кэш 2 с, после сбоя — прошлый ответ до 30 с', async () => {
    const { market, bybit } = setup(() => []);
    const tickers = () => bybit.publicGet.mock.calls.filter(([p]) => p === '/market/tickers').length;

    expect((await market.markPrices()).get('BTCUSDT')).toBe(60_010);
    await market.markPrices();
    expect(tickers()).toBe(1);

    market.setNow(NOW + 2_000);
    bybit.publicGet.mockRejectedValueOnce(new Error('down'));
    expect((await market.markPrices()).get('BTCUSDT')).toBe(60_010);

    // только что упало — к бирже не идём, отдаём прошлое
    market.setNow(NOW + 3_000);
    await market.markPrices();
    expect(tickers()).toBe(2);

    market.setNow(NOW + 31_000);
    bybit.publicGet.mockRejectedValueOnce(new Error('down'));
    expect((await market.markPrices()).size).toBe(0);
  });
});
