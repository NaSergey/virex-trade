import * as crypto from 'crypto';
import { MexcAdapter } from './mexc.adapter';
import { ExchangeCredentials } from '../exchange.types';

/**
 * MEXC is unreachable from CI. Its signature covers the key, the timestamp and
 * the sorted parameters but NOT the path, and its fill side encodes direction
 * and intent in one number — both are easy to get subtly wrong, so both are
 * pinned here.
 */

const CREDS: ExchangeCredentials = { apiKey: 'test-key', apiSecret: 'test-secret' };

interface Call {
  path: string;
  query: string;
  headers: Record<string, string>;
}

function stubApi(pages: unknown[], opts: { success?: boolean; message?: string; code?: number } = {}) {
  const calls: Call[] = [];
  let i = 0;
  globalThis.fetch = (async (url: string, init: any) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, query: u.search.replace(/^\?/, ''), headers: init.headers });
    const data = pages[i] ?? [];
    i++;
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: opts.success ?? true, code: opts.code ?? 0, message: opts.message, data }),
    };
  }) as unknown as typeof fetch;
  return calls;
}

const NOW = 1735689600000;
const RANGE = { startMs: NOW - 60_000, endMs: NOW + 60_000 };

describe('MexcAdapter', () => {
  const realFetch = globalThis.fetch;
  let adapter: MexcAdapter;

  beforeEach(() => {
    adapter = new MexcAdapter();
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  describe('request signing', () => {
    it('signs accessKey + timestamp + paramString, not the path', async () => {
      const calls = stubApi([[]]);
      await adapter.fetchFills(CREDS, RANGE);

      const { query, headers } = calls[0];
      const expected = crypto
        .createHmac('sha256', CREDS.apiSecret)
        .update(`test-key${headers['Request-Time']}${query}`)
        .digest('hex');
      expect(headers.Signature).toBe(expected);
    });

    it('sorts parameters by key so the signed string is deterministic', async () => {
      const calls = stubApi([[]]);
      await adapter.fetchFills(CREDS, RANGE);

      const keys = calls[0].query.split('&').map((p) => p.split('=')[0]);
      expect(keys).toEqual([...keys].sort());
    });

    it('sends key, timestamp and signature as headers', async () => {
      const calls = stubApi([[]]);
      await adapter.getBalance(CREDS);

      expect(calls[0].headers.ApiKey).toBe('test-key');
      expect(calls[0].headers['Request-Time']).toMatch(/^\d{13}$/);
      expect(calls[0].headers.Signature).toMatch(/^[0-9a-f]{64}$/);
    });

    it('surfaces the error envelope rather than treating HTTP 200 as success', async () => {
      stubApi([null], { success: false, message: 'Contract API not enabled', code: 602 });
      const res = await adapter.getBalance(CREDS);

      expect(res).toMatchObject({ success: false, error: 'Contract API not enabled' });
    });
  });

  describe('getBalance', () => {
    it('reads the USDT contract asset', async () => {
      stubApi([{ currency: 'USDT', equity: '2500.5', availableBalance: '2000.25' }]);
      const res = await adapter.getBalance(CREDS);

      expect(res).toMatchObject({ success: true, balance: 2500.5, availableToWithdraw: 2000.25 });
    });
  });

  describe('getOpenPositions', () => {
    it('maps positionType 1 to long and 2 to short, dropping flat rows', async () => {
      stubApi([[
        { symbol: 'BTC_USDT', positionType: 1, holdVol: '3', holdAvgPrice: '60000', leverage: '10', liquidatePrice: '50000' },
        { symbol: 'ETH_USDT', positionType: 2, holdVol: '5', holdAvgPrice: '3000' },
        { symbol: 'SOL_USDT', positionType: 1, holdVol: '0' },
      ]]);
      const res = await adapter.getOpenPositions(CREDS);

      expect(res.positions.map((p) => [p.symbol, p.direction, p.size])).toEqual([
        ['BTC_USDT', 'long', '3'],
        ['ETH_USDT', 'short', '5'],
      ]);
    });
  });

  describe('fetchClosedTrades', () => {
    const row = {
      positionId: 'p-1',
      symbol: 'BTC_USDT',
      positionType: 1,
      closeVol: '2',
      openAvgPrice: '60000',
      closeAvgPrice: '62000',
      realised: '4000',
      fee: '-3',
      leverage: '10',
      updateTime: NOW,
    };

    it('normalizes a closed position, inverting side against direction', async () => {
      stubApi([[row]]);
      const res = await adapter.fetchClosedTrades(CREDS, RANGE);

      expect(res.items[0]).toMatchObject({
        symbol: 'BTC_USDT',
        direction: 'long',
        side: 'Sell',
        qty: 2,
        avgEntryPrice: 60000,
        avgExitPrice: 62000,
        closedPnl: 4000,
        openFee: 0,
        closeFee: 3,
        leverage: 10,
        orderId: 'p-1',
      });
    });

    it('re-applies the window locally, since page_num paging can overshoot it', async () => {
      stubApi([[
        { ...row, positionId: 'in', updateTime: NOW },
        { ...row, positionId: 'too-old', updateTime: RANGE.startMs - 1 },
        { ...row, positionId: 'too-new', updateTime: RANGE.endMs + 1 },
      ]]);
      const res = await adapter.fetchClosedTrades(CREDS, RANGE);

      expect(res.items.map((t) => t.orderId)).toEqual(['in']);
    });

    it('reports a partial range instead of passing a truncated window off as complete', async () => {
      stubApi([null], { success: false, message: 'rate limited', code: 510 });
      const res = await adapter.fetchClosedTrades(CREDS, RANGE);

      expect(res).toMatchObject({ success: false, partial: true, error: 'rate limited' });
    });
  });

  describe('fetchFills', () => {
    const deal = (over: Record<string, unknown>) => ({
      id: 'd1', orderId: 'o1', symbol: 'BTC_USDT',
      vol: '2', price: '60000', timestamp: NOW,
      ...over,
    });

    it('decodes all four deal sides exactly — no inference needed', async () => {
      stubApi([[
        deal({ id: 'open-long', side: 1 }),
        deal({ id: 'close-short', side: 2 }),
        deal({ id: 'open-short', side: 3 }),
        deal({ id: 'close-long', side: 4 }),
      ]]);
      const res = await adapter.fetchFills(CREDS, RANGE);

      // 1 opens a long and 2 closes a short — both buy; 3 and 4 both sell.
      // Only 2 and 4 reduce an existing position.
      expect(res.items.map((f) => [f.execId, f.side, f.closedSize])).toEqual([
        ['open-long', 'Buy', 0],
        ['close-short', 'Buy', 2],
        ['open-short', 'Sell', 0],
        ['close-long', 'Sell', 2],
      ]);
    });

    it('drops rows with no id or no volume', async () => {
      stubApi([[deal({ id: undefined, side: 1 }), deal({ vol: '0', side: 1 })]]);
      const res = await adapter.fetchFills(CREDS, RANGE);

      expect(res.items).toEqual([]);
    });
  });
});
