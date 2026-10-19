import { describe, expect, it } from 'vitest';
import type { HlPosition } from '../api/hooks';
import { groupByCoin } from './coins';

const pos = (address: string, coin: string, side: 'long' | 'short', notional: number, pnl = 0): HlPosition => ({
  address,
  coin,
  side,
  size: 1,
  notional,
  entryPx: 1,
  markPx: 1,
  unrealizedPnl: pnl,
  leverage: 5,
  liquidationPx: null,
});

describe('groupByCoin', () => {
  it('монета одного кошелька в список не попадает', () => {
    const out = groupByCoin([pos('a', 'BTC', 'long', 100), pos('b', 'BTC', 'long', 50), pos('a', 'SOL', 'short', 10)]);
    expect(out.map((g) => g.coin)).toEqual(['BTC']);
  });

  it('все в одну сторону — это направление; суммы и P&L складываются', () => {
    const [g] = groupByCoin([pos('a', 'BTC', 'short', 100, -5), pos('b', 'BTC', 'short', 50, 2)]);
    expect(g).toMatchObject({ direction: 'short', wallets: 2, longs: 0, shorts: 2, shortNotional: 150, netNotional: -150, unrealizedPnl: -3 });
  });

  it('разные стороны — разнонаправленно, нетто по объёму', () => {
    const [g] = groupByCoin([pos('a', 'ETH', 'long', 300), pos('b', 'ETH', 'short', 100), pos('c', 'ETH', 'long', 50)]);
    expect(g).toMatchObject({ direction: 'mixed', longs: 2, shorts: 1, netNotional: 250 });
  });

  it('сначала монеты с большим числом кошельков, затем с большим объёмом', () => {
    const out = groupByCoin([
      pos('a', 'AAA', 'long', 10),
      pos('b', 'AAA', 'long', 10),
      pos('a', 'BBB', 'long', 1000),
      pos('b', 'BBB', 'long', 1000),
      pos('c', 'BBB', 'long', 1),
    ]);
    expect(out.map((g) => g.coin)).toEqual(['BBB', 'AAA']);
  });

  it('minWallets настраивается', () => {
    expect(groupByCoin([pos('a', 'BTC', 'long', 1)], 1)).toHaveLength(1);
  });
});
