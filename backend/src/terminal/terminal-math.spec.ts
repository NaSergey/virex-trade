import {
  bybitInterval,
  floorToStep,
  levelsError,
  modeOf,
  positionIdxOf,
  qtyByRisk,
  roundToTick,
  stepDecimals,
  toInstrument,
  toOrder,
  toPosition,
} from './terminal-math';

/**
 * Эти функции решают, сколько монет уйдёт в настоящий ордер и на какую
 * позицию он ляжет, — ошибка здесь стоит денег, а не строки в логе.
 */
describe('terminal-math', () => {
  describe('stepDecimals', () => {
    it('counts decimals of an exchange step', () => {
      expect(stepDecimals('0.001')).toBe(3);
      expect(stepDecimals('1')).toBe(0);
      expect(stepDecimals('0.10')).toBe(2);
      expect(stepDecimals('1e-7')).toBe(7);
    });
  });

  describe('floorToStep', () => {
    it('rounds down, never up', () => {
      // Вверх — значит поставить на кон больше выбранного риска.
      expect(floorToStep(0.0199, '0.001')).toBe('0.019');
      expect(floorToStep(12.9, '1')).toBe('12');
    });

    it('keeps a whole number of steps whole despite binary fractions', () => {
      // 0.3 / 0.1 в double — 2.9999999999999996.
      expect(floorToStep(0.3, '0.1')).toBe('0.3');
      expect(floorToStep(0.07, '0.01')).toBe('0.07');
    });

    it('gives zero for less than one step and for junk', () => {
      expect(floorToStep(0.0004, '0.001')).toBe('0.000');
      expect(floorToStep(-1, '0.001')).toBe('0.000');
      expect(floorToStep(NaN, '0.001')).toBe('0.000');
    });
  });

  describe('roundToTick', () => {
    it('aligns a price to the tick', () => {
      expect(roundToTick(64123.4567, '0.10')).toBe('64123.50');
      expect(roundToTick(0.123456, '0.0001')).toBe('0.1235');
      expect(roundToTick(101.4, '1')).toBe('101');
    });
  });

  describe('qtyByRisk', () => {
    it('sizes the position so the stop costs the chosen risk', () => {
      // 1 % от 10 000 = 100 USDT; до стопа 500 → 0.2 монеты.
      expect(qtyByRisk(10_000, 1, 60_000, 59_500)).toBeCloseTo(0.2, 10);
      // Шорт: стоп выше входа, размер тот же.
      expect(qtyByRisk(10_000, 1, 60_000, 60_500)).toBeCloseTo(0.2, 10);
    });

    it('refuses to size without a distance, a balance or a risk', () => {
      expect(qtyByRisk(10_000, 1, 60_000, 60_000)).toBeNull();
      expect(qtyByRisk(0, 1, 60_000, 59_000)).toBeNull();
      expect(qtyByRisk(10_000, 0, 60_000, 59_000)).toBeNull();
    });
  });

  describe('levelsError', () => {
    it('accepts a stop below and a take above a long entry', () => {
      expect(levelsError('long', 100, 95, 110)).toBeNull();
      expect(levelsError('long', 100, 95, null)).toBeNull();
    });

    it('rejects levels on the wrong side', () => {
      expect(levelsError('long', 100, 105, null)).toBe('stopSide');
      expect(levelsError('long', 100, 100, null)).toBe('stopSide');
      expect(levelsError('long', 100, 95, 99)).toBe('takeSide');
      expect(levelsError('short', 100, 95, null)).toBe('stopSide');
      expect(levelsError('short', 100, 105, 101)).toBe('takeSide');
      expect(levelsError('short', 100, 105, 90)).toBeNull();
    });
  });

  describe('position mode', () => {
    it('reads one-way from a single row with index 0', () => {
      expect(modeOf([{ positionIdx: 0 }])).toBe('oneWay');
      expect(modeOf([])).toBe('oneWay');
    });

    it('reads hedge from rows with indexes 1 and 2', () => {
      expect(modeOf([{ positionIdx: 1 }, { positionIdx: 2 }])).toBe('hedge');
      expect(modeOf([{ positionIdx: '2' }])).toBe('hedge');
    });

    it('picks the order index by mode and side', () => {
      // Индекс чужого режима биржа отклоняет: «position idx not match position mode».
      expect(positionIdxOf('oneWay', 'long')).toBe(0);
      expect(positionIdxOf('oneWay', 'short')).toBe(0);
      expect(positionIdxOf('hedge', 'long')).toBe(1);
      expect(positionIdxOf('hedge', 'short')).toBe(2);
    });
  });

  it('maps timeframes to Bybit intervals', () => {
    expect(bybitInterval(1)).toBe('1');
    expect(bybitInterval(240)).toBe('240');
    expect(bybitInterval(1440)).toBe('D');
    expect(bybitInterval(7)).toBeNull();
  });

  describe('toPosition', () => {
    const row = {
      symbol: 'BTCUSDT',
      side: 'Sell',
      size: '0.05',
      avgPrice: '64000',
      markPrice: '63900.5',
      positionValue: '3200',
      unrealisedPnl: '4.97',
      leverage: '10',
      liqPrice: '',
      stopLoss: '65000',
      takeProfit: '0',
      positionIdx: 2,
    };

    it('reads an open position, treating "" and "0" levels as absent', () => {
      expect(toPosition(row)).toEqual({
        symbol: 'BTCUSDT',
        direction: 'short',
        size: 0.05,
        entryPrice: 64000,
        markPrice: 63900.5,
        positionValue: 3200,
        unrealisedPnl: 4.97,
        leverage: 10,
        liqPrice: null,
        stopLoss: 65000,
        takeProfit: null,
      });
    });

    it('drops the empty rows Bybit returns for a symbol without a position', () => {
      expect(toPosition({ ...row, size: '0', side: '' })).toBeNull();
    });
  });

  describe('toOrder', () => {
    const row = {
      orderId: 'o-1',
      symbol: 'ETHUSDT',
      side: 'Buy',
      orderType: 'Limit',
      orderStatus: 'New',
      price: '3000',
      qty: '1.5',
      leavesQty: '1.2',
      reduceOnly: false,
      stopOrderType: '',
      stopLoss: '2900',
      takeProfit: '',
      createdTime: '1790000000000',
    };

    it('reads a resting entry limit with its unfilled remainder', () => {
      expect(toOrder(row)).toEqual({
        id: 'o-1',
        symbol: 'ETHUSDT',
        direction: 'long',
        kind: 'entry',
        price: 3000,
        qty: 1.2,
        stopLoss: 2900,
        takeProfit: null,
        createdAt: new Date(1790000000000).toISOString(),
      });
    });

    it('attributes a reduce-only order to the position it closes', () => {
      // Покупка reduce-only закрывает шорт, а не открывает лонг.
      expect(toOrder({ ...row, reduceOnly: true })).toMatchObject({ kind: 'close', direction: 'short' });
      expect(toOrder({ ...row, side: 'Sell', reduceOnly: true })).toMatchObject({ kind: 'close', direction: 'long' });
    });

    it('skips the stop and take orders of a position, market and finished orders', () => {
      expect(toOrder({ ...row, stopOrderType: 'StopLoss' })).toBeNull();
      expect(toOrder({ ...row, orderType: 'Market' })).toBeNull();
      expect(toOrder({ ...row, orderStatus: 'Filled' })).toBeNull();
    });
  });

  describe('toInstrument', () => {
    const row = {
      symbol: 'SOLUSDT',
      baseCoin: 'SOL',
      quoteCoin: 'USDT',
      status: 'Trading',
      contractType: 'LinearPerpetual',
      priceFilter: { tickSize: '0.010' },
      lotSizeFilter: {
        qtyStep: '0.1',
        minOrderQty: '0.1',
        maxOrderQty: '79770',
        maxMktOrderQty: '12000',
        minNotionalValue: '5',
      },
      leverageFilter: { minLeverage: '1', maxLeverage: '100.00' },
    };

    it('reads a tradable USDT perpetual', () => {
      expect(toInstrument(row)).toEqual({
        symbol: 'SOLUSDT',
        base: 'SOL',
        tickSize: '0.010',
        qtyStep: '0.1',
        minQty: 0.1,
        maxQty: 79770,
        maxMarketQty: 12000,
        minNotional: 5,
        minLeverage: 1,
        maxLeverage: 100,
      });
    });

    it('skips what the terminal does not trade', () => {
      expect(toInstrument({ ...row, status: 'Closed' })).toBeNull();
      expect(toInstrument({ ...row, quoteCoin: 'USDC' })).toBeNull();
      expect(toInstrument({ ...row, contractType: 'LinearFutures' })).toBeNull();
    });
  });
});
