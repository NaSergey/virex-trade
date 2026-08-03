import * as crypto from 'crypto';
import { KucoinAdapter } from './kucoin.adapter';
import { ExchangeCredentials } from '../exchange.types';

/**
 * KuCoin is unreachable from CI. The signed-passphrase header is the piece most
 * likely to be wrong in a blind implementation, so it is pinned explicitly
 * alongside the response mappings.
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

function stubFetch(pages: unknown[], code = '200000', msg = '') {
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

const b64Hmac = (msg: string) =>
  crypto.createHmac('sha256', CREDS.apiSecret).update(msg).digest('base64');

describe('KucoinAdapter', () => {
  const realFetch = globalThis.fetch;
  let adapter: KucoinAdapter;

  beforeEach(() => {
    adapter = new KucoinAdapter();
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  describe('request signing', () => {
    it('signs timestamp + METHOD + endpoint-with-query', async () => {
      const calls = stubFetch([null]);
      await adapter.getBalance(CREDS);

      const { url, headers } = calls[0];
      const endpoint = url.replace('https://api-futures.kucoin.com', '');
      expect(endpoint).toBe('/api/v1/account-overview?currency=USDT');
      expect(headers['KC-API-SIGN']).toBe(b64Hmac(`${headers['KC-API-TIMESTAMP']}GET${endpoint}`));
    });

    it('signs the passphrase rather than sending it in clear', async () => {
      const calls = stubFetch([null]);
      await adapter.getBalance(CREDS);

      // This is the whole point of key version 2 — a clear passphrase is 400004.
      expect(calls[0].headers['KC-API-PASSPHRASE']).toBe(b64Hmac('test-pass'));
      expect(calls[0].headers['KC-API-PASSPHRASE']).not.toBe('test-pass');
      expect(calls[0].headers['KC-API-KEY-VERSION']).toBe('2');
    });

    it('surfaces the error envelope rather than treating HTTP 200 as success', async () => {
      stubFetch([null], '400004', 'Invalid KC-API-PASSPHRASE');
      const res = await adapter.getBalance(CREDS);

      expect(res).toMatchObject({ success: false, error: 'Invalid KC-API-PASSPHRASE' });
    });
  });

  describe('getBalance', () => {
    it('reads the futures account overview', async () => {
      stubFetch([{ accountEquity: '3000.5', availableBalance: '2500.25' }]);
      const res = await adapter.getBalance(CREDS);

      expect(res).toMatchObject({ success: true, balance: 3000.5, availableToWithdraw: 2500.25 });
    });
  });

  describe('getOpenPositions', () => {
    it('takes direction from the sign of currentQty', async () => {
      stubFetch([[
        { symbol: 'XBTUSDTM', currentQty: -3, avgEntryPrice: '60000', markPrice: '59000', unrealisedPnl: '30', realLeverage: '5', liquidationPrice: '70000' },
        { symbol: 'ETHUSDTM', currentQty: 7, avgEntryPrice: '3000' },
      ]]);
      const res = await adapter.getOpenPositions(CREDS);

      expect(res.positions.map((p) => [p.symbol, p.direction, p.size])).toEqual([
        ['XBTUSDTM', 'short', '3'],
        ['ETHUSDTM', 'long', '7'],
      ]);
    });

    it('drops flat rows KuCoin keeps around after a position closes', async () => {
      stubFetch([[{ symbol: 'XBTUSDTM', currentQty: 0 }]]);
      const res = await adapter.getOpenPositions(CREDS);

      expect(res.positions).toEqual([]);
    });
  });

  describe('fetchClosedTrades', () => {
    const row = {
      closeId: 'c-1',
      symbol: 'XBTUSDTM',
      side: 'long',
      openPrice: '60000',
      closePrice: '62000',
      pnl: '120.5',
      realisedGrossCost: '-120000',
      tradeFee: '-1.2',
      fundingFee: '-0.3',
      leverage: '5',
      closeTime: 1735689600000,
    };

    it('normalizes a closed position and derives size from cost / open price', async () => {
      stubFetch([{ items: [row], currentPage: 1, totalPage: 1 }]);
      const res = await adapter.fetchClosedTrades(CREDS, { startMs: 0, endMs: 1735689600001 });

      expect(res.items[0]).toMatchObject({
        symbol: 'XBTUSDTM',
        direction: 'long',
        side: 'Sell',
        // |−120000| / 60000 — history-positions never reports the size itself.
        qty: 2,
        avgEntryPrice: 60000,
        avgExitPrice: 62000,
        closedPnl: 120.5,
        // Funding is not a trading fee and must not land in either column.
        openFee: 0,
        closeFee: 1.2,
        leverage: 5,
        orderId: 'c-1',
      });
    });

    it('leaves size at 0 rather than inventing one when a liquidation reports no open price', async () => {
      stubFetch([{ items: [{ ...row, openPrice: null }], currentPage: 1, totalPage: 1 }]);
      const res = await adapter.fetchClosedTrades(CREDS, { startMs: 0, endMs: 1735689600001 });

      expect(res.items[0].qty).toBe(0);
    });

    it('reports a partial range instead of passing a truncated window off as complete', async () => {
      stubFetch([null], '429000', 'Too Many Requests');
      const res = await adapter.fetchClosedTrades(CREDS, { startMs: 0, endMs: 1 });

      expect(res).toMatchObject({ success: false, partial: true, error: 'Too Many Requests' });
    });
  });

  describe('fetchFills', () => {
    it('converts the nanosecond tradeTime KuCoin reports into a date', async () => {
      const ms = 1735689600000;
      stubFetch([{ items: [{
        tradeId: 't1', orderId: 'o1', symbol: 'XBTUSDTM',
        side: 'sell', size: 3, price: '61000', tradeTime: String(ms * 1e6),
      }], currentPage: 1, totalPage: 1 }]);
      const res = await adapter.fetchFills(CREDS, { startMs: 0, endMs: ms + 1 });

      expect(res.items[0].execTime.getTime()).toBe(ms);
      expect(res.items[0]).toMatchObject({ side: 'Sell', qty: 3, price: 61000 });
    });

    it('leaves closedSize at 0 — KuCoin fills carry no open/close marker', async () => {
      const ms = 1735689600000;
      stubFetch([{ items: [{
        tradeId: 't1', orderId: 'o1', symbol: 'XBTUSDTM',
        side: 'sell', size: 3, price: '61000', tradeTime: String(ms * 1e6),
      }], currentPage: 1, totalPage: 1 }]);
      const res = await adapter.fetchFills(CREDS, { startMs: 0, endMs: ms + 1 });

      expect(res.items[0].closedSize).toBe(0);
    });
  });
});
