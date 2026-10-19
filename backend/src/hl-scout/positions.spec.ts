import { positionsOf } from './positions';

describe('positionsOf', () => {
  it('сторона по знаку размера, цена — стоимость позиции на размер; нулевые пропускаются', () => {
    const out = positionsOf('0xa', {
      assetPositions: [
        {
          position: {
            coin: 'BTC',
            szi: '-0.5',
            entryPx: '60000',
            positionValue: '31000',
            unrealizedPnl: '-1000',
            leverage: { type: 'cross', value: 10 },
            liquidationPx: '80000',
          },
        },
        {
          position: {
            coin: 'ETH',
            szi: '0',
            entryPx: null,
            positionValue: '0',
            unrealizedPnl: '0',
            leverage: { type: 'cross', value: 5 },
            liquidationPx: null,
          },
        },
      ],
    });
    expect(out).toEqual([
      {
        address: '0xa',
        coin: 'BTC',
        side: 'short',
        size: 0.5,
        notional: 31000,
        entryPx: 60000,
        markPx: 62000,
        unrealizedPnl: -1000,
        leverage: 10,
        liquidationPx: 80000,
      },
    ]);
  });
});
