import * as crypto from 'crypto';
import { GateAdapter } from './gate.adapter';
import { ExchangeCredentials } from '../exchange.types';

/**
 * Gate is unreachable from CI. Its signature is the odd one out — five
 * newline-separated parts, SHA-512 throughout, a body hash even on GET, and a
 * timestamp in seconds — so it is pinned byte for byte.
 */

const CREDS: ExchangeCredentials = { apiKey: 'test-key', apiSecret: 'test-secret' };

interface Call {
  url: string;
  headers: Record<string, string>;
}

function stubFetch(pages: unknown[], ok = true, status = 200) {
  const calls: Call[] = [];
  let i = 0;
  globalThis.fetch = (async (url: string, init: any) => {
    calls.push({ url, headers: init.headers });
    const body = pages[i] ?? null;
    i++;
    return { ok, status, json: async () => body };
  }) as unknown as typeof fetch;
  return calls;
}

describe('GateAdapter', () => {
  const realFetch = globalThis.fetch;
  let adapter: GateAdapter;

  beforeEach(() => {
    adapter = new GateAdapter();
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  describe('request signing', () => {
    it('signs METHOD\\npath\\nquery\\nSHA512(body)\\ntimestamp with HMAC-SHA512 hex', async () => {
      const calls = stubFetch([{}]);
      await adapter.getOpenPositions(CREDS);

      const { headers } = calls[0];
      const emptyBodyHash = crypto.createHash('sha512').update('').digest('hex');
      const expected = crypto
        .createHmac('sha512', CREDS.apiSecret)
        .update(`GET\n/api/v4/futures/usdt/positions\n\n${emptyBodyHash}\n${headers.Timestamp}`)
        .digest('hex');

      expect(headers.SIGN).toBe(expected);
      expect(headers.KEY).toBe('test-key');
    });

    it('includes the query string as its own line, not glued to the path', async () => {
      const calls = stubFetch([[]]);
      await adapter.fetchClosedTrades(CREDS, { startMs: 0, endMs: 1_000_000 });

      const { url, headers } = calls[0];
      const query = url.split('?')[1];
      const emptyBodyHash = crypto.createHash('sha512').update('').digest('hex');
      const expected = crypto
        .createHmac('sha512', CREDS.apiSecret)
        .update(`GET\n/api/v4/futures/usdt/position_close\n${query}\n${emptyBodyHash}\n${headers.Timestamp}`)
        .digest('hex');

      expect(headers.SIGN).toBe(expected);
    });

    it('timestamps in seconds, not milliseconds', async () => {
      const calls = stubFetch([{}]);
      await adapter.getBalance(CREDS);

      const ts = Number(calls[0].headers.Timestamp);
      expect(String(ts)).toMatch(/^\d{10}$/);
      expect(Math.abs(ts - Math.floor(Date.now() / 1000))).toBeLessThan(60);
    });

    it('sends no passphrase — Gate does not use one', async () => {
      const calls = stubFetch([{}]);
      await adapter.getBalance(CREDS);

      expect(Object.keys(calls[0].headers)).toEqual(
        expect.not.arrayContaining(['ACCESS-PASSPHRASE', 'KC-API-PASSPHRASE']),
      );
    });

    it('reports the label and message Gate returns on a non-2xx', async () => {
      stubFetch([{ label: 'INVALID_SIGNATURE', message: 'signature mismatch' }], false, 401);
      const res = await adapter.getBalance(CREDS);

      expect(res).toMatchObject({
        success: false,
        error: 'INVALID_SIGNATURE: signature mismatch',
      });
    });
  });

  describe('getBalance', () => {
    it('reads the futures account payload directly — Gate has no envelope', async () => {
      stubFetch([{ total: '8000.5', available: '7000.25' }]);
      const res = await adapter.getBalance(CREDS);

      expect(res).toMatchObject({ success: true, balance: 8000.5, availableToWithdraw: 7000.25 });
    });
  });

  describe('getOpenPositions', () => {
    it('takes direction from the sign of size and drops flat rows', async () => {
      stubFetch([[
        { contract: 'BTC_USDT', size: -4, entry_price: '60000', mark_price: '59000', unrealised_pnl: '40', leverage: '10', liq_price: '70000', value: '236000' },
        { contract: 'ETH_USDT', size: 6, entry_price: '3000' },
        { contract: 'SOL_USDT', size: 0 },
      ]]);
      const res = await adapter.getOpenPositions(CREDS);

      expect(res.positions.map((p) => [p.symbol, p.direction, p.size])).toEqual([
        ['BTC_USDT', 'short', '4'],
        ['ETH_USDT', 'long', '6'],
      ]);
    });
  });

  describe('fetchClosedTrades', () => {
    it('normalizes a closed position off second-resolution timestamps', async () => {
      stubFetch([[{
        contract: 'BTC_USDT',
        side: 'long',
        max_size: '3',
        first_open_price: '60000',
        last_close_price: '61500',
        pnl: '450',
        pnl_fee: '-3.5',
        pnl_fund: '-0.8',
        time: 1735689600,
      }]]);
      const res = await adapter.fetchClosedTrades(CREDS, { startMs: 0, endMs: 1735689601000 });

      expect(res.items[0]).toMatchObject({
        symbol: 'BTC_USDT',
        direction: 'long',
        side: 'Sell',
        qty: 3,
        avgEntryPrice: 60000,
        avgExitPrice: 61500,
        closedPnl: 450,
        // Funding (pnl_fund) is not a trading fee and stays out of both columns.
        openFee: 0,
        closeFee: 3.5,
        // Gate gives no position id; contract + close time identifies the row
        // and stays stable across re-syncs.
        orderId: 'BTC_USDT:1735689600',
      });
      expect(res.items[0].closedAt.getTime()).toBe(1735689600000);
    });

    it('reports a partial range instead of passing a truncated window off as complete', async () => {
      stubFetch([{ label: 'TOO_MANY_REQUESTS', message: 'slow down' }], false, 429);
      const res = await adapter.fetchClosedTrades(CREDS, { startMs: 0, endMs: 1000 });

      expect(res).toMatchObject({ success: false, partial: true });
    });
  });

  describe('fetchFills', () => {
    it('reads side off the sign of a signed size', async () => {
      stubFetch([[
        { id: 1, order_id: 'o1', contract: 'BTC_USDT', size: 5, price: '60000', create_time: 1735689600 },
        { id: 2, order_id: 'o2', contract: 'BTC_USDT', size: -5, price: '61000', create_time: 1735689660 },
      ]]);
      const res = await adapter.fetchFills(CREDS, { startMs: 0, endMs: 1735689700000 });

      expect(res.items.map((f) => [f.execId, f.side, f.qty])).toEqual([
        ['1', 'Buy', 5],
        ['2', 'Sell', 5],
      ]);
      expect(res.items[0].execTime.getTime()).toBe(1735689600000);
    });
  });
});
