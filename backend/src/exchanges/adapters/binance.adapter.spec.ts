import * as crypto from 'crypto';
import { BinanceAdapter } from './binance.adapter';
import { ExchangeCredentials } from '../exchange.types';

/**
 * Binance is unreachable from CI, and it is the first adapter that
 * RECONSTRUCTS realized PnL rather than reading it, so the arithmetic that
 * produces money numbers is pinned here alongside the signing.
 */

const CREDS: ExchangeCredentials = { apiKey: 'test-key', apiSecret: 'test-secret' };

interface Call {
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
}

/**
 * Stubs fetch, routing by path so the income → symbols → userTrades flow can be
 * driven realistically. `trades` is keyed by symbol.
 */
function stubApi(opts: {
  income?: unknown[];
  trades?: Record<string, unknown[]>;
  balance?: unknown;
  positions?: unknown[];
  fail?: { status: number; body: unknown };
}) {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init: any) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, query: u.searchParams, headers: init.headers });
    if (opts.fail) {
      return { ok: false, status: opts.fail.status, json: async () => opts.fail!.body };
    }
    let body: unknown = [];
    if (u.pathname === '/fapi/v1/income') body = opts.income ?? [];
    else if (u.pathname === '/fapi/v1/userTrades') {
      body = opts.trades?.[u.searchParams.get('symbol') ?? ''] ?? [];
    } else if (u.pathname === '/fapi/v2/balance') body = opts.balance ?? [];
    else if (u.pathname === '/fapi/v2/positionRisk') body = opts.positions ?? [];
    return { ok: true, status: 200, json: async () => body };
  }) as unknown as typeof fetch;
  return calls;
}

const NOW = 1735689600000;
const RANGE = { startMs: NOW - 60_000, endMs: NOW + 60_000 };

describe('BinanceAdapter', () => {
  const realFetch = globalThis.fetch;
  let adapter: BinanceAdapter;

  beforeEach(() => {
    adapter = new BinanceAdapter();
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  describe('request signing', () => {
    it('signs the query string and appends the signature after it', async () => {
      const calls = stubApi({ balance: [] });
      await adapter.getBalance(CREDS);

      const raw = calls[0].query.toString();
      // The signature covers everything before it; re-signing the query minus
      // the signature parameter must reproduce it.
      const signed = raw.replace(/&signature=[^&]*$/, '');
      const expected = crypto
        .createHmac('sha256', CREDS.apiSecret)
        .update(signed)
        .digest('hex');
      expect(calls[0].query.get('signature')).toBe(expected);
    });

    it('sends the key in X-MBX-APIKEY and a fresh timestamp', async () => {
      const calls = stubApi({ balance: [] });
      await adapter.getBalance(CREDS);

      expect(calls[0].headers['X-MBX-APIKEY']).toBe('test-key');
      expect(Math.abs(Number(calls[0].query.get('timestamp')) - Date.now())).toBeLessThan(60_000);
    });

    it('reports the code and message Binance returns on a non-2xx', async () => {
      stubApi({ fail: { status: 401, body: { code: -1022, msg: 'Signature for this request is not valid.' } } });
      const res = await adapter.getBalance(CREDS);

      expect(res).toMatchObject({
        success: false,
        error: 'Signature for this request is not valid. (-1022)',
      });
    });
  });

  describe('getBalance', () => {
    it('picks the USDT wallet', async () => {
      stubApi({ balance: [
        { asset: 'BNB', balance: '1' },
        { asset: 'USDT', balance: '7000.5', availableBalance: '6500.25' },
      ] });
      const res = await adapter.getBalance(CREDS);

      expect(res).toMatchObject({ success: true, balance: 7000.5, availableToWithdraw: 6500.25 });
    });
  });

  describe('getOpenPositions', () => {
    it('drops the flat rows positionRisk returns for every tradable symbol', async () => {
      stubApi({ positions: [
        { symbol: 'BTCUSDT', positionAmt: '0', positionSide: 'BOTH' },
        { symbol: 'ETHUSDT', positionAmt: '-2.5', positionSide: 'BOTH', entryPrice: '3000', markPrice: '2950', unRealizedProfit: '125', leverage: '10', liquidationPrice: '3500' },
      ] });
      const res = await adapter.getOpenPositions(CREDS);

      expect(res.positions).toHaveLength(1);
      expect(res.positions[0]).toMatchObject({
        symbol: 'ETHUSDT',
        // One-way mode reports BOTH; direction comes from the sign of the amount.
        direction: 'short',
        size: '2.5',
        avgPrice: '3000',
        unrealisedPnl: '125',
      });
    });

    it('prefers positionSide when the account is in hedge mode', async () => {
      stubApi({ positions: [{ symbol: 'BTCUSDT', positionAmt: '1', positionSide: 'SHORT' }] });
      const res = await adapter.getOpenPositions(CREDS);

      expect(res.positions[0].direction).toBe('short');
    });
  });

  describe('symbol discovery', () => {
    it('learns symbols from income, then asks userTrades for each one', async () => {
      const calls = stubApi({
        income: [
          { symbol: 'BTCUSDT', incomeType: 'REALIZED_PNL', time: NOW },
          { symbol: 'ETHUSDT', incomeType: 'COMMISSION', time: NOW },
          { symbol: 'BTCUSDT', incomeType: 'REALIZED_PNL', time: NOW },
          { symbol: 'XRPUSDT', incomeType: 'FUNDING_FEE', time: NOW },
        ],
        trades: {},
      });
      await adapter.fetchFills(CREDS, RANGE);

      const asked = calls.filter((c) => c.path === '/fapi/v1/userTrades').map((c) => c.query.get('symbol'));
      // BTCUSDT deduped; XRPUSDT excluded — funding alone is not trading.
      expect(asked.sort()).toEqual(['BTCUSDT', 'ETHUSDT']);
    });

    it('never calls userTrades without a symbol, which Binance rejects', async () => {
      const calls = stubApi({ income: [{ symbol: 'BTCUSDT', incomeType: 'REALIZED_PNL', time: NOW }], trades: {} });
      await adapter.fetchFills(CREDS, RANGE);

      for (const c of calls.filter((x) => x.path === '/fapi/v1/userTrades')) {
        expect(c.query.get('symbol')).toBeTruthy();
      }
    });

    it('skips userTrades entirely when the account had no activity', async () => {
      const calls = stubApi({ income: [] });
      const res = await adapter.fetchFills(CREDS, RANGE);

      expect(calls.some((c) => c.path === '/fapi/v1/userTrades')).toBe(false);
      expect(res.items).toEqual([]);
    });

    it('reports partial when income itself fails, rather than claiming no trades', async () => {
      stubApi({ fail: { status: 429, body: { code: -1003, msg: 'Too many requests' } } });
      const res = await adapter.fetchClosedTrades(CREDS, RANGE);

      expect(res).toMatchObject({ success: false, partial: true });
      expect(res.items).toEqual([]);
    });
  });

  describe('fetchClosedTrades', () => {
    const income = [{ symbol: 'BTCUSDT', incomeType: 'REALIZED_PNL', time: NOW }];

    it('derives the entry price of a closed long from its realized PnL', async () => {
      stubApi({
        income,
        trades: { BTCUSDT: [{
          id: 1, orderId: 'o-1', symbol: 'BTCUSDT', side: 'SELL', positionSide: 'BOTH',
          price: '61000', qty: '2', realizedPnl: '2000', commission: '1.5', time: NOW,
        }] },
      });
      const res = await adapter.fetchClosedTrades(CREDS, RANGE);

      expect(res.items[0]).toMatchObject({
        symbol: 'BTCUSDT',
        // A SELL closes a long.
        side: 'Sell',
        direction: 'long',
        qty: 2,
        avgExitPrice: 61000,
        // pnl = (exit − entry) · qty  →  entry = 61000 − 2000/2 = 60000
        avgEntryPrice: 60000,
        closedPnl: 2000,
        openFee: 0,
        closeFee: 1.5,
        orderId: 'o-1',
      });
    });

    it('flips the sign of the derivation for a closed short', async () => {
      stubApi({
        income,
        trades: { BTCUSDT: [{
          id: 2, orderId: 'o-2', symbol: 'BTCUSDT', side: 'BUY', positionSide: 'BOTH',
          price: '59000', qty: '2', realizedPnl: '2000', commission: '1', time: NOW,
        }] },
      });
      const res = await adapter.fetchClosedTrades(CREDS, RANGE);

      expect(res.items[0]).toMatchObject({
        side: 'Buy',
        direction: 'short',
        // pnl = (entry − exit) · qty  →  entry = 59000 + 2000/2 = 60000
        avgEntryPrice: 60000,
        avgExitPrice: 59000,
      });
    });

    it('derives an entry price consistent with a losing close', async () => {
      stubApi({
        income,
        trades: { BTCUSDT: [{
          id: 3, orderId: 'o-3', symbol: 'BTCUSDT', side: 'SELL', positionSide: 'BOTH',
          price: '59000', qty: '4', realizedPnl: '-4000', commission: '2', time: NOW,
        }] },
      });
      const res = await adapter.fetchClosedTrades(CREDS, RANGE);

      // A long that lost must have been entered above its exit.
      expect(res.items[0].avgEntryPrice).toBe(60000);
      expect(res.items[0].closedPnl).toBe(-4000);
    });

    it('ignores pure entries — a fill that realized nothing closed nothing', async () => {
      stubApi({
        income,
        trades: { BTCUSDT: [
          { id: 4, orderId: 'o-4', symbol: 'BTCUSDT', side: 'BUY', positionSide: 'BOTH', price: '60000', qty: '2', realizedPnl: '0', commission: '1', time: NOW },
          { id: 5, orderId: 'o-5', symbol: 'BTCUSDT', side: 'SELL', positionSide: 'BOTH', price: '61000', qty: '2', realizedPnl: '2000', commission: '1', time: NOW },
        ] },
      });
      const res = await adapter.fetchClosedTrades(CREDS, RANGE);

      expect(res.items).toHaveLength(1);
      expect(res.items[0].orderId).toBe('o-5');
    });
  });

  describe('fetchFills', () => {
    const income = [{ symbol: 'BTCUSDT', incomeType: 'REALIZED_PNL', time: NOW }];
    const trade = (over: Record<string, unknown>) => ({
      id: 1, orderId: 'o-1', symbol: 'BTCUSDT', side: 'BUY', positionSide: 'BOTH',
      price: '60000', qty: '2', realizedPnl: '0', commission: '1', time: NOW,
      ...over,
    });

    it('keeps entries as well as closes — fills are the full record', async () => {
      stubApi({ income, trades: { BTCUSDT: [
        trade({ id: 1, realizedPnl: '0' }),
        trade({ id: 2, side: 'SELL', realizedPnl: '500' }),
      ] } });
      const res = await adapter.fetchFills(CREDS, RANGE);

      expect(res.items.map((f) => [f.execId, f.side])).toEqual([['1', 'Buy'], ['2', 'Sell']]);
    });

    it('reads closedSize off positionSide in hedge mode', async () => {
      stubApi({ income, trades: { BTCUSDT: [
        trade({ id: 1, side: 'BUY', positionSide: 'LONG' }),
        trade({ id: 2, side: 'SELL', positionSide: 'LONG' }),
        trade({ id: 3, side: 'SELL', positionSide: 'SHORT' }),
        trade({ id: 4, side: 'BUY', positionSide: 'SHORT' }),
      ] } });
      const res = await adapter.fetchFills(CREDS, RANGE);

      expect(res.items.map((f) => [f.execId, f.closedSize])).toEqual([
        ['1', 0], ['2', 2], ['3', 0], ['4', 2],
      ]);
    });

    it('falls back to realized PnL as the close marker in one-way mode', async () => {
      stubApi({ income, trades: { BTCUSDT: [
        trade({ id: 1, positionSide: 'BOTH', realizedPnl: '0' }),
        trade({ id: 2, positionSide: 'BOTH', realizedPnl: '-30' }),
      ] } });
      const res = await adapter.fetchFills(CREDS, RANGE);

      expect(res.items.map((f) => [f.execId, f.closedSize])).toEqual([['1', 0], ['2', 2]]);
    });
  });

  describe('fetchExecutionMarkers', () => {
    it('goes straight to userTrades — the symbol is already known', async () => {
      const calls = stubApi({ trades: { BTCUSDT: [
        { id: 1, orderId: 'o-1', symbol: 'BTCUSDT', side: 'BUY', positionSide: 'BOTH', price: '100', qty: '1', realizedPnl: '0', time: Date.now() - 60_000 },
        { id: 2, orderId: 'o-1', symbol: 'BTCUSDT', side: 'BUY', positionSide: 'BOTH', price: '200', qty: '3', realizedPnl: '0', time: Date.now() - 30_000 },
      ] } });
      const markers = await adapter.fetchExecutionMarkers(CREDS, { symbol: 'BTCUSDT', days: 1 });

      expect(calls.some((c) => c.path === '/fapi/v1/income')).toBe(false);
      expect(markers).toHaveLength(1);
      // Value-weighted: (1*100 + 3*200) / 4 = 175.
      expect(markers[0]).toMatchObject({ orderId: 'o-1', price: 175, qty: 4 });
    });
  });
});
