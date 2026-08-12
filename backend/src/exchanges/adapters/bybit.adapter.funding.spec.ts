import { BybitAdapter } from './bybit.adapter';
import { ExchangeCredentials } from '../exchange.types';

/**
 * Funding shares execution history with fills, and the two must not be
 * confused in either direction: a funding row replayed as a fill drifts the
 * running position size and splits positions at random points, while a funding
 * row silently dropped hides what holding the position actually cost.
 *
 * The adapter is driven through a stubbed BybitTradeService — this is about
 * which rows land where, not about HTTP.
 */

const CREDS: ExchangeCredentials = { apiKey: 'k', apiSecret: 's' };
const RANGE = { startMs: 1_700_000_000_000, endMs: 1_700_000_100_000 };

const tradeRow = (over: Record<string, unknown> = {}) => ({
  symbol: 'BTCUSDT',
  side: 'Buy',
  execQty: '0.5',
  execPrice: '42000',
  closedSize: '0',
  execType: 'Trade',
  execFee: '0.42',
  orderId: 'order-1',
  execId: 'exec-1',
  execTime: '1700000010000',
  ...over,
});

const fundingRow = (over: Record<string, unknown> = {}) => ({
  symbol: 'BTCUSDT',
  side: 'Sell',
  // Bybit sends a qty on funding rows too — the exact trap this split exists
  // to avoid.
  execQty: '0.5',
  execPrice: '42010',
  closedSize: '0',
  execType: 'Funding',
  execFee: '0.0135',
  orderId: '',
  execId: 'funding-1',
  execTime: '1700000020000',
  ...over,
});

/** An adapter whose only live dependency is a one-page execution history. */
function adapterWith(list: unknown[]) {
  const trades = {
    fetchExecutionsPage: async () => ({ success: true, list, nextPageCursor: undefined }),
  };
  return new BybitAdapter({} as any, {} as any, trades as any, {} as any);
}

describe('BybitAdapter fetchFills', () => {
  it('keeps funding out of the fills that rebuild positions', async () => {
    const res = await adapterWith([tradeRow(), fundingRow()]).fetchFills(CREDS, RANGE);

    expect(res.items).toHaveLength(1);
    expect(res.items[0].execId).toBe('exec-1');
    expect(res.items.some((f) => f.execType === 'Funding')).toBe(false);
  });

  it('returns funding alongside the fills instead of discarding it', async () => {
    const res = await adapterWith([tradeRow(), fundingRow()]).fetchFills(CREDS, RANGE);

    expect(res.funding).toEqual([
      { symbol: 'BTCUSDT', amount: 0.0135, at: new Date(1700000020000), execId: 'funding-1' },
    ]);
  });

  it('keeps the exchange sign, so a funding credit stays negative', async () => {
    // Being paid funding is real money too; forcing it positive would turn a
    // credit into a cost.
    const res = await adapterWith([fundingRow({ execFee: '-0.02' })]).fetchFills(CREDS, RANGE);

    expect(res.funding?.[0].amount).toBe(-0.02);
  });

  it('keeps a zero-cost funding window rather than dropping it', async () => {
    // Dropping it would make "no funding recorded" mean both free and unknown.
    const res = await adapterWith([fundingRow({ execFee: '0' })]).fetchFills(CREDS, RANGE);

    expect(res.funding).toHaveLength(1);
    expect(res.funding?.[0].amount).toBe(0);
  });

  it('reports an empty funding list, not an absent one, when there was none', async () => {
    const res = await adapterWith([tradeRow()]).fetchFills(CREDS, RANGE);

    expect(res.funding).toEqual([]);
  });

  it('still keeps liquidation fills, which do move position size', async () => {
    const res = await adapterWith([
      tradeRow({ execType: 'BustTrade', execId: 'exec-bust' }),
      fundingRow(),
    ]).fetchFills(CREDS, RANGE);

    expect(res.items.map((f) => f.execType)).toEqual(['BustTrade']);
  });
});
