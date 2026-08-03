import * as crypto from 'crypto';
import { OkxAdapter } from './okx.adapter';
import { ExchangeCredentials } from '../exchange.types';

/**
 * The OKX API is unreachable from CI, so these tests pin the two things that
 * would otherwise only fail against a live account: the exact bytes we sign,
 * and how each documented response shape maps onto our normalized types.
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

/** Stubs global fetch, recording calls and replaying queued OKX envelopes. */
function stubFetch(pages: unknown[][], code = '0', msg = '') {
  const calls: Call[] = [];
  let i = 0;
  globalThis.fetch = (async (url: string, init: any) => {
    calls.push({ url, headers: init.headers });
    const data = pages[i] ?? [];
    i++;
    return {
      ok: true,
      status: 200,
      json: async () => ({ code, msg, data }),
    };
  }) as unknown as typeof fetch;
  return calls;
}

const expectedSign = (timestamp: string, requestPath: string) =>
  crypto
    .createHmac('sha256', CREDS.apiSecret)
    .update(`${timestamp}GET${requestPath}`)
    .digest('base64');

describe('OkxAdapter', () => {
  const realFetch = globalThis.fetch;
  let adapter: OkxAdapter;

  beforeEach(() => {
    adapter = new OkxAdapter();
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  describe('request signing', () => {
    it('signs timestamp + METHOD + path-with-query, base64 HMAC-SHA256', async () => {
      const calls = stubFetch([[]]);
      await adapter.getBalance(CREDS);

      const { url, headers } = calls[0];
      const requestPath = url.replace('https://www.okx.com', '');
      expect(requestPath).toBe('/api/v5/account/balance?ccy=USDT');
      expect(headers['OK-ACCESS-SIGN']).toBe(
        expectedSign(headers['OK-ACCESS-TIMESTAMP'], requestPath),
      );
    });

    it('sends the key and the passphrase OKX requires', async () => {
      const calls = stubFetch([[]]);
      await adapter.getBalance(CREDS);

      expect(calls[0].headers['OK-ACCESS-KEY']).toBe('test-key');
      expect(calls[0].headers['OK-ACCESS-PASSPHRASE']).toBe('test-pass');
    });

    it('timestamps in ISO-8601 with milliseconds', async () => {
      const calls = stubFetch([[]]);
      await adapter.getBalance(CREDS);

      expect(calls[0].headers['OK-ACCESS-TIMESTAMP']).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    it('surfaces the error envelope rather than treating HTTP 200 as success', async () => {
      stubFetch([[]], '50113', 'Invalid Sign');
      const res = await adapter.getBalance(CREDS);

      expect(res.success).toBe(false);
      expect(res.error).toBe('Invalid Sign');
    });
  });

  describe('getBalance', () => {
    it('picks the USDT leg out of the account envelope', async () => {
      stubFetch([[{ details: [{ ccy: 'BTC', eq: '1' }, { ccy: 'USDT', eq: '1234.5', availBal: '1000.25' }] }]]);
      const res = await adapter.getBalance(CREDS);

      expect(res).toMatchObject({ success: true, balance: 1234.5, availableToWithdraw: 1000.25 });
    });
  });

  describe('getOpenPositions', () => {
    it('maps hedge-mode positions straight off posSide', async () => {
      stubFetch([
        [{ instId: 'BTC-USDT-SWAP', posSide: 'short', pos: '3', avgPx: '60000', markPx: '59500', upl: '15', lever: '10', liqPx: '70000', notionalUsd: '1785' }],
      ]);
      const res = await adapter.getOpenPositions(CREDS);

      expect(res.positions[0]).toEqual({
        symbol: 'BTC-USDT-SWAP',
        direction: 'short',
        size: '3',
        avgPrice: '60000',
        markPrice: '59500',
        positionValue: '1785',
        unrealisedPnl: '15',
        leverage: '10',
        liqPrice: '70000',
      });
    });

    it('reads direction off the sign of pos in one-way mode', async () => {
      stubFetch([
        [
          { instId: 'ETH-USDT-SWAP', posSide: 'net', pos: '-5' },
          { instId: 'SOL-USDT-SWAP', posSide: 'net', pos: '2' },
        ],
      ]);
      const res = await adapter.getOpenPositions(CREDS);

      // A negative net position is a short, and size is reported unsigned.
      expect(res.positions.map((p) => [p.direction, p.size])).toEqual([
        ['short', '5'],
        ['long', '2'],
      ]);
    });
  });

  describe('fetchClosedTrades', () => {
    const closedRow = {
      posId: 'pos-1',
      instId: 'BTC-USDT-SWAP',
      direction: 'long',
      closeTotalPos: '2',
      openAvgPx: '60000',
      closeAvgPx: '61000',
      realizedPnl: '200',
      fee: '-1.5',
      fundingFee: '-0.4',
      lever: '10',
      uTime: '1735689600000',
    };

    it('normalizes a closed position, inverting side against direction', async () => {
      stubFetch([[closedRow]]);
      const res = await adapter.fetchClosedTrades(CREDS, { startMs: 0, endMs: 1735689600001 });

      expect(res.success).toBe(true);
      expect(res.items[0]).toMatchObject({
        symbol: 'BTC-USDT-SWAP',
        direction: 'long',
        // A long is closed by a Sell — the app stores the closing order's side.
        side: 'Sell',
        qty: 2,
        avgEntryPrice: 60000,
        avgExitPrice: 61000,
        closedPnl: 200,
        // OKX signs fees negative and does not split entry from exit; funding
        // is not a trading fee and must not leak into either.
        openFee: 0,
        closeFee: 1.5,
        leverage: 10,
        orderId: 'pos-1',
      });
      expect(res.items[0].closedAt.getTime()).toBe(1735689600000);
    });

    it('drops rows with no position id or no close time', async () => {
      stubFetch([[{ ...closedRow, posId: undefined }, { ...closedRow, uTime: '' }]]);
      const res = await adapter.fetchClosedTrades(CREDS, { startMs: 0, endMs: 1735689600001 });

      expect(res.items).toEqual([]);
    });

    it('reports a partial range instead of passing a truncated window off as complete', async () => {
      stubFetch([[]], '50011', 'Rate limit');
      const res = await adapter.fetchClosedTrades(CREDS, { startMs: 0, endMs: 1 });

      expect(res).toMatchObject({ success: false, partial: true, error: 'Rate limit' });
    });
  });

  describe('fetchFills', () => {
    const fill = (over: Record<string, unknown>) => ({
      tradeId: 't1', ordId: 'o1', instId: 'BTC-USDT-SWAP',
      side: 'buy', posSide: 'long', fillSz: '2', fillPx: '60000', ts: '1735689600000',
      ...over,
    });

    it('treats a fill against the opposite side as a close', async () => {
      stubFetch([[
        fill({ tradeId: 'open', side: 'buy', posSide: 'long' }),
        fill({ tradeId: 'close', side: 'sell', posSide: 'long' }),
        fill({ tradeId: 'short-open', side: 'sell', posSide: 'short' }),
        fill({ tradeId: 'short-close', side: 'buy', posSide: 'short' }),
      ]]);
      const res = await adapter.fetchFills(CREDS, { startMs: 0, endMs: 1735689600001 });

      expect(res.items.map((f) => [f.execId, f.side, f.closedSize])).toEqual([
        ['open', 'Buy', 0],
        ['close', 'Sell', 2],
        ['short-open', 'Sell', 0],
        ['short-close', 'Buy', 2],
      ]);
    });

    it('leaves closedSize at 0 in one-way mode, where the exchange gives no marker', async () => {
      stubFetch([[fill({ posSide: 'net', side: 'sell' })]]);
      const res = await adapter.fetchFills(CREDS, { startMs: 0, endMs: 1735689600001 });

      expect(res.items[0].closedSize).toBe(0);
    });
  });

  describe('fetchExecutionMarkers', () => {
    it('collapses a symbol\'s fills to one marker per order', async () => {
      // Markers look back a fixed number of days from now, so the fixture has
      // to sit inside that window rather than at a fixed past date.
      const ts = String(Date.now() - 60_000);
      const base = { instId: 'BTC-USDT-SWAP', side: 'buy', posSide: 'long', ts };
      stubFetch([[
        { ...base, tradeId: 'a', ordId: 'order-1', fillSz: '1', fillPx: '100' },
        { ...base, tradeId: 'b', ordId: 'order-1', fillSz: '3', fillPx: '200' },
        { ...base, tradeId: 'c', ordId: 'order-2', fillSz: '1', fillPx: '999', instId: 'ETH-USDT-SWAP' },
      ]]);
      const markers = await adapter.fetchExecutionMarkers(CREDS, { symbol: 'BTC-USDT-SWAP' });

      expect(markers).toHaveLength(1);
      // Value-weighted: (1*100 + 3*200) / 4 = 175.
      expect(markers[0]).toMatchObject({ orderId: 'order-1', price: 175, qty: 4, side: 'Buy' });
    });
  });
});
