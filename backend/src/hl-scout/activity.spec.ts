import { fillsOf, MAX_FILLS, ordersOf } from './activity';

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

describe('fillsOf', () => {
  const fill = (time: number) => ({
    coin: 'ETH',
    px: '2400',
    sz: '1',
    side: 'B' as const,
    time,
    dir: 'Open Long',
    closedPnl: '0.5',
    fee: '0.1',
    crossed: true,
  });

  it('числа из строк, новые первыми, мейкер и тейкер', () => {
    const out = fillsOf([fill(1), fill(3), { ...fill(2), crossed: false }]);
    expect(out.map((f) => f.time)).toEqual([3, 2, 1]);
    expect(out[0]).toMatchObject({
      price: 2400,
      closedPnl: 0.5,
      taker: true,
      side: 'buy',
    });
    expect(out[1].taker).toBe(false);
  });

  it('отдаёт не больше MAX_FILLS самых свежих', () => {
    const out = fillsOf(
      Array.from({ length: MAX_FILLS + 50 }, (_, i) => fill(i)),
    );
    expect(out).toHaveLength(MAX_FILLS);
    expect(out[0].time).toBe(MAX_FILLS + 49);
  });

  it('пустой ответ — пусто', () => {
    expect(fillsOf(undefined as never)).toEqual([]);
  });
});
