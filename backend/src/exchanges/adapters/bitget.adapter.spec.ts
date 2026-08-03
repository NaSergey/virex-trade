import * as crypto from 'crypto';
import { BitgetAdapter } from './bitget.adapter';
import { ExchangeCredentials } from '../exchange.types';

/**
 * Bitget is unreachable from CI, so these pin the signed bytes and the mapping
 * of each documented response shape — the parts that would otherwise only fail
 * against a live account.
 */

const CREDS: ExchangeCredentials = {
  apiKey: 'test-key',
  apiSecret: 'test-secret',
  passphrase: 'test-pass',
};

interface Call {
  url: string;
  headers: Record<string, string>;
}

/** Stubs global fetch, recording calls and replaying queued Bitget envelopes. */
function stubFetch(pages: unknown[], code = '00000', msg = '') {
  const calls: Call[] = [];
  let i = 0;
  globalThis.fetch = (async (url: string, init: any) => {
    calls.push({ url, headers: init.headers });
    const data = pages[i] ?? null;
    i++;
    return { ok: true, status: 200, json: async () => ({ code, msg, data }) };
  }) as unknown as typeof fetch;
  return calls;
}

const expectedSign = (timestamp: string, signedPath: string) =>
  crypto
    .createHmac('sha256', CREDS.apiSecret)
    .update(`${timestamp}GET${signedPath}`)
    .digest('base64');

describe('BitgetAdapter', () => {
  const realFetch = globalThis.fetch;
  let adapter: BitgetAdapter;

  beforeEach(() => {
    adapter = new BitgetAdapter();
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  describe('request signing', () => {
    it('signs timestamp + METHOD + path?query, base64 HMAC-SHA256', async () => {
      const calls = stubFetch([[]]);
      await adapter.getBalance(CREDS);

      const { url, headers } = calls[0];
      const signedPath = url.replace('https://api.bitget.com', '');
      expect(signedPath).toBe('/api/v2/mix/account/accounts?productType=USDT-FUTURES');
      expect(headers['ACCESS-SIGN']).toBe(expectedSign(headers['ACCESS-TIMESTAMP'], signedPath));
    });

    it('timestamps in epoch milliseconds, not ISO-8601', async () => {
      const calls = stubFetch([[]]);
      await adapter.getBalance(CREDS);

      const ts = calls[0].headers['ACCESS-TIMESTAMP'];
      expect(ts).toMatch(/^\d{13}$/);
      expect(Math.abs(Number(ts) - Date.now())).toBeLessThan(60_000);
    });

    it('sends the key and the passphrase Bitget requires', async () => {
      const calls = stubFetch([[]]);
      await adapter.getBalance(CREDS);

      expect(calls[0].headers['ACCESS-KEY']).toBe('test-key');
      expect(calls[0].headers['ACCESS-PASSPHRASE']).toBe('test-pass');
    });

    it('surfaces the error envelope rather than treating HTTP 200 as success', async () => {
      stubFetch([null], '40009', 'sign signature error');
      const res = await adapter.getBalance(CREDS);

      expect(res).toMatchObject({ success: false, error: 'sign signature error' });
    });
  });

  describe('getBalance', () => {
    it('picks the USDT margin account', async () => {
      stubFetch([[
        { marginCoin: 'BTC', accountEquity: '9' },
        { marginCoin: 'USDT', accountEquity: '5000.5', available: '4200.25' },
      ]]);
      const res = await adapter.getBalance(CREDS);

      expect(res).toMatchObject({ success: true, balance: 5000.5, availableToWithdraw: 4200.25 });
    });
  });

  describe('getOpenPositions', () => {
    it('maps holdSide to direction', async () => {
      stubFetch([[
        { symbol: 'BTCUSDT', holdSide: 'short', total: '0.5', openPriceAvg: '60000', markPrice: '59000', unrealizedPL: '500', leverage: '20', liquidationPrice: '70000', marginSize: '1500' },
      ]]);
      const res = await adapter.getOpenPositions(CREDS);

      expect(res.positions[0]).toMatchObject({
        symbol: 'BTCUSDT',
        direction: 'short',
        size: '0.5',
        avgPrice: '60000',
        markPrice: '59000',
        unrealisedPnl: '500',
        leverage: '20',
        liqPrice: '70000',
      });
    });
  });

  describe('fetchClosedTrades', () => {
    const row = {
      positionId: 'p-1',
      symbol: 'BTCUSDT',
      holdSide: 'long',
      closeTotalPos: '1.5',
      openAvgPrice: '60000',
      closeAvgPrice: '62000',
      pnl: '3000',
      netProfit: '2980',
      openFee: '-10',
      closeFee: '-10',
      leverage: '20',
      utime: '1735689600000',
    };

    it('normalizes a closed position, keeping entry and exit fees apart', async () => {
      stubFetch([{ list: [row], endId: 'p-1' }]);
      const res = await adapter.fetchClosedTrades(CREDS, { startMs: 0, endMs: 1735689600001 });

      expect(res.success).toBe(true);
      expect(res.items[0]).toMatchObject({
        symbol: 'BTCUSDT',
        direction: 'long',
        side: 'Sell',
        qty: 1.5,
        avgEntryPrice: 60000,
        avgExitPrice: 62000,
        // `pnl` is realized PnL before fees, which is the figure the journal
        // stores; fees are kept separately rather than folded in via netProfit.
        closedPnl: 3000,
        openFee: 10,
        closeFee: 10,
        leverage: 20,
        orderId: 'p-1',
      });
    });

    it('reads rows out of the list envelope and stops when a page is short', async () => {
      stubFetch([{ list: [row], endId: 'p-1' }, { list: [], endId: null }]);
      const res = await adapter.fetchClosedTrades(CREDS, { startMs: 0, endMs: 1735689600001 });

      expect(res.items).toHaveLength(1);
    });

    it('reports a partial range instead of passing a truncated window off as complete', async () => {
      stubFetch([null], '40001', 'server busy');
      const res = await adapter.fetchClosedTrades(CREDS, { startMs: 0, endMs: 1 });

      expect(res).toMatchObject({ success: false, partial: true, error: 'server busy' });
    });
  });

  describe('fetchFills', () => {
    const fill = (over: Record<string, unknown>) => ({
      tradeId: 't1', orderId: 'o1', symbol: 'BTCUSDT',
      side: 'buy', tradeSide: 'open', baseVolume: '2', price: '60000',
      cTime: '1735689600000',
      ...over,
    });

    it('derives closedSize from tradeSide in hedge mode', async () => {
      stubFetch([{ fillList: [
        fill({ tradeId: 'a', tradeSide: 'open' }),
        fill({ tradeId: 'b', tradeSide: 'close', side: 'sell' }),
      ], endId: 'b' }]);
      const res = await adapter.fetchFills(CREDS, { startMs: 0, endMs: 1735689600001 });

      expect(res.items.map((f) => [f.execId, f.side, f.closedSize])).toEqual([
        ['a', 'Buy', 0],
        ['b', 'Sell', 2],
      ]);
    });

    it('leaves closedSize at 0 in one-way mode, where tradeSide names direction not intent', async () => {
      stubFetch([{ fillList: [fill({ tradeSide: 'sell_single', side: 'sell' })], endId: 't1' }]);
      const res = await adapter.fetchFills(CREDS, { startMs: 0, endMs: 1735689600001 });

      expect(res.items[0].closedSize).toBe(0);
    });

    it('drops rows with no trade id or no volume', async () => {
      stubFetch([{ fillList: [fill({ tradeId: undefined }), fill({ baseVolume: '0' })], endId: null }]);
      const res = await adapter.fetchFills(CREDS, { startMs: 0, endMs: 1735689600001 });

      expect(res.items).toEqual([]);
    });
  });
});
