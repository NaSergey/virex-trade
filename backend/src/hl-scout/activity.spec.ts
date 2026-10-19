import { ordersOf } from './activity';

describe('ordersOf', () => {
  it('сторона по букве, новые первыми, триггерная цена только у триггерных', () => {
    const out = ordersOf([
      {
        coin: 'SUI',
        side: 'A',
        limitPx: '1.5',
        sz: '10',
        origSz: '12',
        timestamp: 100,
        orderType: 'Limit',
        reduceOnly: false,
        isTrigger: false,
        triggerPx: '0.0',
      },
      {
        coin: 'BTC',
        side: 'B',
        limitPx: '60000',
        sz: '1',
        origSz: '1',
        timestamp: 200,
        orderType: 'Stop Market',
        reduceOnly: true,
        isTrigger: true,
        triggerPx: '59000',
      },
    ]);
    expect(out.map((o) => o.coin)).toEqual(['BTC', 'SUI']);
    expect(out[0]).toMatchObject({
      side: 'buy',
      reduceOnly: true,
      triggerPx: 59000,
    });
    expect(out[1]).toMatchObject({
      side: 'sell',
      size: 10,
      origSize: 12,
      triggerPx: null,
    });
  });
});
