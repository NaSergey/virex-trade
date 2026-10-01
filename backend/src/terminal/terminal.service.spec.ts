import { BadRequestException } from '@nestjs/common';
import { TerminalService } from './terminal.service';
import { exchangeRejected } from './terminal-errors';
import type { Instrument } from './terminal-math';

/**
 * Сервис отправляет настоящие ордера, поэтому тесты держат то, что уходит на
 * биржу: объём, сторону, индекс позиции и то, прикладываются ли уровни. Биржа
 * подменена — проверяется тело запроса, а не её ответ.
 */

const BTC: Instrument = {
  symbol: 'BTCUSDT',
  base: 'BTC',
  tickSize: '0.10',
  qtyStep: '0.001',
  minQty: 0.001,
  maxQty: 1000,
  maxMarketQty: 100,
  minNotional: 5,
  minLeverage: 1,
  maxLeverage: 100,
};

const CREDS = { apiKey: 'k', apiSecret: 's' };

/** Пустые строки one-way и hedge — их биржа отдаёт и без открытой позиции. */
const emptyRow = (positionIdx: number) => ({ symbol: 'BTCUSDT', side: '', size: '0', positionIdx, leverage: '10' });
const openRow = (side: 'Buy' | 'Sell', positionIdx: number, extra: Record<string, string> = {}) => ({
  symbol: 'BTCUSDT',
  side,
  size: '0.05',
  avgPrice: '60000',
  positionIdx,
  leverage: '10',
  stopLoss: '',
  takeProfit: '',
  ...extra,
});

interface Setup {
  rows?: unknown[];
  /** Открытые ордера символа, как их отдаёт `order/realtime`. */
  orders?: unknown[];
  /** Кошелёк USDT без нереализованного результата — так его отдают простые тесты. */
  balance?: number;
  /** Строка USDT из `wallet-balance` целиком, когда важны equity и нереализованный результат. */
  usdt?: Record<string, string>;
  last?: number;
  /** Ответ или отказ на каждый POST по порядку; по умолчанию — успех. */
  post?: (path: string, body: Record<string, unknown>, n: number) => unknown;
  active?: string | null;
  keyInfo?: { success: boolean; canPlaceOrders: boolean };
}

function setup(s: Setup = {}) {
  const posts: { path: string; body: Record<string, any> }[] = [];
  const bybit = {
    privateGet: jest.fn(async (_creds: unknown, path: string) => {
      if (path === '/account/wallet-balance') {
        const usdt = s.usdt ?? { coin: 'USDT', walletBalance: String(s.balance ?? 10_000) };
        return { list: [{ totalAvailableBalance: '900', coin: [usdt] }] };
      }
      if (path === '/position/list') return { list: s.rows ?? [emptyRow(0)] };
      if (path === '/order/realtime') return { list: s.orders ?? [] };
      throw new Error(`unexpected GET ${path}`);
    }),
    privatePost: jest.fn(async (_creds: unknown, path: string, body: Record<string, any>) => {
      posts.push({ path, body });
      const custom = s.post?.(path, body, posts.length);
      return custom === undefined ? { orderId: `o-${posts.length}` } : custom;
    }),
  };
  const market = {
    requireInstrument: jest.fn(async () => BTC),
    lastPrice: jest.fn(async () => s.last ?? 60_000),
  };
  const credentials = {
    require: jest.fn(async () => CREDS),
    get: jest.fn(async () => CREDS),
    activeExchange: jest.fn(async () => (s.active === undefined ? 'bybit' : s.active)),
  };
  const apiKeys = { getApiKeyInfo: jest.fn(async () => s.keyInfo ?? { success: true, canPlaceOrders: true }) };
  const service = new TerminalService(credentials as any, bybit as any, market as any, apiKeys as any);
  const orders = () => posts.filter((p) => p.path === '/order/create').map((p) => p.body);
  return { service, posts, orders, bybit };
}

const market = (extra: Record<string, unknown> = {}) => ({
  symbol: 'BTCUSDT',
  direction: 'long' as const,
  kind: 'market' as const,
  riskPct: 1,
  stopLoss: 59_500,
  ...extra,
});

describe('TerminalService', () => {
  describe('placeOrders', () => {
    it('sizes a market order from risk and the stop, and attaches the levels', async () => {
      const { service, orders } = setup();

      await service.placeOrders('u1', market({ takeProfit: 61_000 }));

      // 1 % от 10 000 = 100 USDT; до стопа 500 → 0.2 BTC.
      expect(orders()).toEqual([
        {
          category: 'linear',
          symbol: 'BTCUSDT',
          side: 'Buy',
          orderType: 'Market',
          qty: '0.200',
          positionIdx: 0,
          stopLoss: '59500.00',
          takeProfit: '61000.00',
        },
      ]);
    });

    it('sizes from the deposit as it is now, not from the bare wallet', async () => {
      // Кошелёк 10 000, но позиции в минусе на 5 000: 1 % — это 50 USDT, до стопа 500 → 0.1.
      const { service, orders } = setup({
        usdt: { coin: 'USDT', walletBalance: '10000', unrealisedPnl: '-5000', equity: '5000' },
      });

      await service.placeOrders('u1', market());

      expect(orders()[0].qty).toBe('0.100');
    });

    it('rounds the size down to the lot step', async () => {
      // 100 USDT / 333.5 = 0.29985… → 0.299: до ближайшего шага вышло бы 0.300,
      // и на кону стояло бы больше выбранного риска.
      const { service, orders } = setup();

      await service.placeOrders('u1', market({ stopLoss: 59_666.5 }));

      expect(orders()[0].qty).toBe('0.299');
    });

    it('uses the hedge index of the side in hedge mode', async () => {
      const { service, orders } = setup({ rows: [emptyRow(1), emptyRow(2)] });

      await service.placeOrders('u1', market({ direction: 'short', stopLoss: 60_500 }));

      expect(orders()[0]).toMatchObject({ side: 'Sell', positionIdx: 2 });
    });

    it('adds to a position by its own stop and leaves its levels alone', async () => {
      // Стоп позиции — 59 000: до него 1000, и 100 USDT риска дают 0.1 BTC.
      // Стоп и тейк панели при этом не читаются и на биржу не уходят.
      const { service, orders } = setup({ rows: [openRow('Buy', 0, { stopLoss: '59000' })] });

      await service.placeOrders('u1', market({ stopLoss: 59_900, takeProfit: 65_000 }));

      expect(orders()).toHaveLength(1);
      expect(orders()[0].qty).toBe('0.100');
      expect(orders()[0]).not.toHaveProperty('stopLoss');
      expect(orders()[0]).not.toHaveProperty('takeProfit');
    });

    it('gives a position without a stop the stop of the order', async () => {
      const { service, orders } = setup({ rows: [openRow('Buy', 0)] });

      await service.placeOrders('u1', market());

      expect(orders()[0]).toMatchObject({ qty: '0.200', stopLoss: '59500.00' });
    });

    it('refuses an order against an open position in one-way mode', async () => {
      const { service, posts } = setup({ rows: [openRow('Buy', 0)] });

      await expect(service.placeOrders('u1', market({ direction: 'short', stopLoss: 60_500 }))).rejects.toMatchObject({
        response: { code: 'TERMINAL_OPPOSITE_POSITION' },
      });
      expect(posts).toHaveLength(0);
    });

    it('opens the other side next to an open position in hedge mode', async () => {
      const { service, orders } = setup({ rows: [openRow('Buy', 1), emptyRow(2)] });

      await service.placeOrders('u1', market({ direction: 'short', stopLoss: 60_500 }));

      expect(orders()[0]).toMatchObject({ side: 'Sell', positionIdx: 2 });
    });

    it('refuses without a stop', async () => {
      const { service, posts } = setup();

      await expect(service.placeOrders('u1', market({ stopLoss: undefined }))).rejects.toMatchObject({
        response: { code: 'TERMINAL_STOP_REQUIRED' },
      });
      expect(posts).toHaveLength(0);
    });

    it('refuses a stop on the wrong side of the entry', async () => {
      const { service, posts } = setup();

      await expect(service.placeOrders('u1', market({ stopLoss: 60_500 }))).rejects.toMatchObject({
        response: { code: 'TERMINAL_STOP_SIDE' },
      });
      expect(posts).toHaveLength(0);
    });

    it('refuses a size below the minimum order instead of rounding it up', async () => {
      // 0.01 % от 100 USDT = 0.01 USDT; до стопа 500 → 0.00002 BTC, меньше шага.
      const { service, posts } = setup({ balance: 100 });

      await expect(service.placeOrders('u1', market({ riskPct: 0.01 }))).rejects.toMatchObject({
        response: { code: 'TERMINAL_QTY_TOO_SMALL' },
      });
      expect(posts).toHaveLength(0);
    });

    it('places a grid of limits, each sized from its own price', async () => {
      const { service, orders } = setup();

      await service.placeOrders('u1', {
        symbol: 'BTCUSDT',
        direction: 'long',
        kind: 'limit',
        prices: [59_900, 59_700],
        riskPct: 0.5,
        stopLoss: 59_500,
      });

      // 50 USDT на уровень: до стопа 400 → 0.125, до стопа 200 → 0.25.
      expect(orders().map((o) => [o.orderType, o.price, o.qty, o.timeInForce])).toEqual([
        ['Limit', '59900.00', '0.125', 'GTC'],
        ['Limit', '59700.00', '0.250', 'GTC'],
      ]);
    });

    it('sends nothing when one level of a grid does not pass', async () => {
      // Второй уровень — по ту сторону стопа: сетка не должна оставить на бирже первый.
      const { service, posts } = setup();

      await expect(
        service.placeOrders('u1', {
          symbol: 'BTCUSDT',
          direction: 'long',
          kind: 'limit',
          prices: [59_900, 59_400],
          riskPct: 0.5,
          stopLoss: 59_500,
        }),
      ).rejects.toMatchObject({ response: { code: 'TERMINAL_STOP_SIDE' } });
      expect(posts).toHaveLength(0);
    });

    it('says how many orders of a grid stand when the exchange refuses the rest', async () => {
      const { service } = setup({
        post: (path, _body, n) => {
          if (path === '/order/create' && n === 2) throw exchangeRejected(110007, 'ab not enough for new order');
          return undefined;
        },
      });

      await expect(
        service.placeOrders('u1', {
          symbol: 'BTCUSDT',
          direction: 'long',
          kind: 'limit',
          prices: [59_900, 59_700],
          riskPct: 0.5,
          stopLoss: 59_500,
        }),
      ).rejects.toMatchObject({ response: { code: 'TERMINAL_GRID_PARTIAL', params: { placed: '1', total: '2' } } });
    });

    it('sets the leverage within the instrument range before the order', async () => {
      const { service, posts } = setup();

      await service.placeOrders('u1', market({ leverage: 200 }));

      expect(posts.map((p) => p.path)).toEqual(['/position/set-leverage', '/order/create']);
      expect(posts[0].body).toMatchObject({ buyLeverage: '100', sellLeverage: '100' });
    });

    it('still places the order when the leverage cannot be set', async () => {
      const { service, orders } = setup({
        post: (path) => {
          if (path === '/position/set-leverage') throw exchangeRejected(110013, 'cannot set leverage');
          return undefined;
        },
      });

      await service.placeOrders('u1', market({ leverage: 20 }));

      expect(orders()).toHaveLength(1);
    });

    it('requires a price for a limit order', async () => {
      const { service } = setup();

      await expect(
        service.placeOrders('u1', { symbol: 'BTCUSDT', direction: 'long', kind: 'limit', riskPct: 1, stopLoss: 59_500 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('closePosition', () => {
    it('closes the whole position with the size the exchange reported', async () => {
      const { service, orders } = setup({ rows: [emptyRow(1), openRow('Sell', 2)] });

      await service.closePosition('u1', { symbol: 'BTCUSDT', direction: 'short', kind: 'market' });

      expect(orders()).toEqual([
        { category: 'linear', symbol: 'BTCUSDT', side: 'Buy', orderType: 'Market', qty: '0.05', positionIdx: 2, reduceOnly: true },
      ]);
    });

    it('closes a part with a reduce-only limit, floored to the lot step', async () => {
      const { service, orders } = setup({ rows: [openRow('Buy', 0)] });

      await service.closePosition('u1', { symbol: 'BTCUSDT', direction: 'long', kind: 'limit', price: 61_234.56, qty: 0.0259 });

      expect(orders()[0]).toEqual({
        category: 'linear',
        symbol: 'BTCUSDT',
        side: 'Sell',
        orderType: 'Limit',
        qty: '0.025',
        positionIdx: 0,
        reduceOnly: true,
        price: '61234.60',
        timeInForce: 'GTC',
      });
    });

    it('never asks for more than the position holds', async () => {
      const { service, orders } = setup({ rows: [openRow('Buy', 0)] });

      await service.closePosition('u1', { symbol: 'BTCUSDT', direction: 'long', kind: 'market', qty: 5 });

      expect(orders()[0].qty).toBe('0.05');
    });

    it('answers "not found" when the position is gone', async () => {
      const { service, posts } = setup();

      await expect(
        service.closePosition('u1', { symbol: 'BTCUSDT', direction: 'long', kind: 'market' }),
      ).rejects.toMatchObject({ response: { code: 'TERMINAL_POSITION_NOT_FOUND' } });
      expect(posts).toHaveLength(0);
    });
  });

  describe('closeGrid', () => {
    const limit = (orderId: string, side: 'Buy' | 'Sell', reduceOnly: boolean) => ({
      orderId,
      symbol: 'BTCUSDT',
      side,
      orderType: 'Limit',
      orderStatus: 'New',
      price: '61000',
      qty: '0.01',
      leavesQty: '0.01',
      reduceOnly,
      stopOrderType: '',
    });

    it('splits the position into equal reduce-only limits, the last taking the remainder', async () => {
      // 0.05 на три части при шаге 0.001: 0.016 + 0.016 + 0.018 — ровно вся позиция.
      const { service, orders } = setup({ rows: [openRow('Buy', 1), emptyRow(2)] });

      await service.closeGrid('u1', { symbol: 'BTCUSDT', direction: 'long', prices: [61_000, 62_000, 63_000.04] });

      expect(orders().map((o) => [o.side, o.price, o.qty, o.reduceOnly, o.positionIdx])).toEqual([
        ['Sell', '61000.00', '0.016', true, 1],
        ['Sell', '62000.00', '0.016', true, 1],
        ['Sell', '63000.00', '0.018', true, 1],
      ]);
      const total = orders().reduce((s, o) => s + Number(o.qty), 0);
      expect(total).toBeCloseTo(0.05, 10);
    });

    it('replaces the close limits of this position and touches nothing else', async () => {
      // Лимит на вход и лимит закрытия другой стороны остаются: сетка заменяет только свои.
      const { service, posts } = setup({
        rows: [openRow('Buy', 0)],
        orders: [limit('own-close', 'Sell', true), limit('entry', 'Buy', false), limit('other-close', 'Buy', true)],
      });

      await service.closeGrid('u1', { symbol: 'BTCUSDT', direction: 'long', prices: [61_000] });

      const cancelled = posts.filter((p) => p.path === '/order/cancel').map((p) => p.body.orderId);
      expect(cancelled).toEqual(['own-close']);
      // Снятие — раньше выставления: иначе сумма лимитов превысила бы позицию.
      expect(posts.map((p) => p.path)).toEqual(['/order/cancel', '/order/create']);
    });

    it('cancels nothing when a part would be below the minimum order', async () => {
      // 0.05 на десять частей при шаге 0.001 — 0.005, а минимум инструмента здесь 0.01.
      const { service, posts } = setup({ rows: [openRow('Buy', 0)], orders: [limit('own-close', 'Sell', true)] });
      const small = { ...BTC, minQty: 0.01 };
      (service as any).market.requireInstrument = async () => small;

      await expect(
        service.closeGrid('u1', {
          symbol: 'BTCUSDT',
          direction: 'long',
          prices: Array.from({ length: 10 }, (_, i) => 61_000 + i * 100),
        }),
      ).rejects.toMatchObject({ response: { code: 'TERMINAL_QTY_TOO_SMALL' } });
      expect(posts).toHaveLength(0);
    });
  });

  describe('setLevels', () => {
    it('moves the stop and clears the take with the index of the position itself', async () => {
      const { service, posts } = setup({ rows: [openRow('Buy', 1), emptyRow(2)] });

      await service.setLevels('u1', { symbol: 'BTCUSDT', direction: 'long', stopLoss: 59_123.456, takeProfit: null });

      expect(posts).toEqual([
        {
          path: '/position/trading-stop',
          body: {
            category: 'linear',
            symbol: 'BTCUSDT',
            positionIdx: 1,
            tpslMode: 'Full',
            takeProfit: '0',
            stopLoss: '59123.50',
          },
        },
      ]);
    });

    it('leaves the stop of the position alone when only the take is set', async () => {
      // У позиции, открытой мимо терминала, стопа может не быть — тейк ей всё равно можно поставить.
      const { service, posts } = setup({ rows: [openRow('Sell', 0)] });

      await service.setLevels('u1', { symbol: 'BTCUSDT', direction: 'short', takeProfit: 58_000 });

      expect(posts[0].body).toEqual({
        category: 'linear',
        symbol: 'BTCUSDT',
        positionIdx: 0,
        tpslMode: 'Full',
        takeProfit: '58000.00',
      });
    });
  });

  describe('state', () => {
    it('shows the deposit as it is now, with the open result, not the bare wallet', async () => {
      // Кошелёк 1417.60, открытые позиции в минусе на 914.69: депозит сейчас — 502.91.
      const { service } = setup({
        usdt: { coin: 'USDT', walletBalance: '1417.60', unrealisedPnl: '-914.69', equity: '502.91' },
      });

      expect((await service.state('u1')).balance).toBeCloseTo(502.91, 10);
    });

    it('adds the open result to the wallet itself when the exchange gives no equity', async () => {
      const { service } = setup({ usdt: { coin: 'USDT', walletBalance: '1417.60', unrealisedPnl: '-914.69' } });

      expect((await service.state('u1')).balance).toBeCloseTo(502.91, 10);
    });

    it('gives the balance, open positions and resting limits in one snapshot', async () => {
      const { service } = setup({ rows: [openRow('Buy', 0, { stopLoss: '59000' }), emptyRow(0)] });

      const state = await service.state('u1');

      expect(state).toMatchObject({ balance: 10_000, available: 900, orders: [] });
      expect(state.positions).toEqual([expect.objectContaining({ symbol: 'BTCUSDT', direction: 'long', size: 0.05, stopLoss: 59_000 })]);
    });
  });

  describe('access', () => {
    it('opens the terminal to an active Bybit key that may place orders', async () => {
      expect(await setup().service.access('u1')).toEqual({ available: true, reason: null, exchange: 'bybit' });
    });

    it('keeps it closed for a read-only key', async () => {
      const { service } = setup({ keyInfo: { success: true, canPlaceOrders: false } });

      expect(await service.access('u1')).toMatchObject({ available: false, reason: 'READ_ONLY' });
    });

    it('keeps it closed when the exchange did not say', async () => {
      const { service } = setup({ keyInfo: { success: false, canPlaceOrders: false } });

      expect(await service.access('u1')).toMatchObject({ available: false, reason: 'UNKNOWN' });
    });

    it('keeps it closed for another exchange and for no exchange at all', async () => {
      expect(await setup({ active: 'okx' }).service.access('u1')).toMatchObject({ available: false, reason: 'NOT_BYBIT' });
      expect(await setup({ active: null }).service.access('u1')).toMatchObject({ available: false, reason: 'NO_EXCHANGE' });
    });
  });
});
