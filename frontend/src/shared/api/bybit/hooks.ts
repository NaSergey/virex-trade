'use client';

import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { apiFetch } from '@/shared/api/http';

// Get USDT balance
async function getUSDTBalance() {
  try {
    const response = await apiFetch('/api/bybit/balance', {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    return { balance: 0, availableToWithdraw: 0, success: false, error: error instanceof Error ? error.message : 'Ошибка' };
  }
}

// Get open positions
async function getOpenPositions() {
  try {
    const response = await apiFetch('/api/bybit/positions', {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    return { positions: [], success: false, error: error instanceof Error ? error.message : 'Ошибка' };
  }
}

// Get list of all coins with prices
async function getTickers() {
  try {
    const response = await apiFetch('/api/bybit/tickers', {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    return { tickers: [], success: false, error: error instanceof Error ? error.message : 'Ошибка' };
  }
}

export const useUSDTBalance = () => {
  return useQuery({
    queryKey: ['usdtBalance'],
    queryFn: async () => {
      const data = await getUSDTBalance();
      if (!data.success) {
        throw new Error(data.error || 'Ошибка загрузки баланса');
      }
      return data;
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });
};

// Открытая позиция из Bybit v5 /position/list, как её отдаёт биржа — все
// числа строками. `createdTime` НЕ сбрасывается на каждую новую позицию по
// символу, поэтому «сколько времени в позиции» считается не отсюда, а по
// нашим часам (OpenPositionSeen, см. usePositionTags → openedAt).
export interface BybitPosition {
  symbol: string;
  side: 'Buy' | 'Sell' | '';
  size: string;
  avgPrice: string;
  markPrice: string;
  positionValue: string;
  unrealisedPnl: string;
  leverage: string;
  liqPrice: string;
  takeProfit: string;
  stopLoss: string;
  createdTime: string;
  updatedTime: string;
}

export const useOpenPositions = () => {
  return useQuery({
    queryKey: ['openPositions'],
    queryFn: async () => {
      const data = (await getOpenPositions()) as {
        positions: BybitPosition[];
        success: boolean;
        error?: string;
      };
      if (!data.success) {
        throw new Error(data.error || 'Ошибка загрузки позиций');
      }
      return data;
    },
    staleTime: 15000,
    refetchInterval: 30000,
  });
};

export const useTickers = () => {
  return useQuery({
    queryKey: ['tickers'],
    queryFn: async () => {
      const data = await getTickers();
      if (!data.success) {
        throw new Error(data.error || 'Ошибка загрузки тикеров');
      }
      return data;
    },
    staleTime: 30000, // Data is fresh for 30 seconds
    refetchInterval: 10000, // Update every 10 seconds
  });
};

// Get open orders
async function getOpenOrders() {
  try {
    const response = await apiFetch('/api/bybit/orders', {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    return { orders: [], success: false, error: error instanceof Error ? error.message : 'Ошибка' };
  }
}

export const useOpenOrders = () => {
  return useQuery({
    queryKey: ['openOrders'],
    queryFn: async () => {
      const data = await getOpenOrders();
      if (!data.success) {
        throw new Error(data.error || 'Ошибка загрузки ордеров');
      }
      return data;
    },
    staleTime: 10000, // Data is fresh for 10 seconds
    refetchInterval: 15000, // Update every 15 seconds
  });
};

// ── Closed trades (synced from Bybit closed-pnl) + statistics ──
export interface Trade {
  id: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  direction: 'long' | 'short';
  qty: number;
  avgEntryPrice: number;
  avgExitPrice: number;
  closedPnl: number;
  openFee: number;
  closeFee: number;
  leverage: number | null;
  orderId: string;
  closedAt: string;
  openedAt: string | null; // approximate entry time (null for pre-feature trades)
  createdAt: string;
  // Из скольких закрывающих ордеров собрана позиция (1 = закрыта разом).
  parts: number;
  tags?: Array<{ id: string; name: string; color: string }>;
  // Снимок рынка на входе: null — контекст этой сделки ещё не посчитан
  // (у старых сделок его может не быть вовсе), ok === false — у символа не
  // хватило истории свечей.
  context?: TradeContext | null;
}

/** Каким был рынок в момент входа — то, что показывает раскрытая запись журнала. */
export interface TradeContext {
  ok: boolean;
  // basis и rsi отдаёт только /api/trades: Лаборатория присылает тот же снимок,
  // но без служебной привязки к моменту и без RSI — их там нечем показывать.
  basis?: 'opened' | 'closed';
  rsi?: number | null;
  atrPct: number | null;
  volRel: number | null;
  ema200Above: boolean | null;
  trend4h: string | null;
  rangePos1h: number | null;
  rangePos4h: number | null;
  rangePos1d: number | null;
}

// Один ордер раскрытой сделки: филлы биржи, сгруппированные по orderId.
export interface TradeOrder {
  orderId: string;
  side: 'Buy' | 'Sell';
  kind: 'entry' | 'exit';
  qty: number;
  avgPrice: number;
  value: number; // объём в USDT (qty * avgPrice)
  fills: number; // сколько исполнений биржа сделала по этому ордеру
  time: string;
  execTypes: string[]; // 'Trade' | 'BustTrade' (ликвидация) | 'AdlTrade' | ...
  pnl: number | null; // только у закрывающих
  fee: number | null; // комиссия закрытия
}

// Ордера подгружаются лениво — только когда строку реально раскрыли.
export const useTradeOrders = (tradeId: string | null) =>
  useQuery({
    queryKey: ['tradeOrders', tradeId],
    queryFn: async () => {
      const res = await apiFetch(`/api/trades/${tradeId}/orders`, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json() as Promise<{ success: boolean; positionId: string | null; orders: TradeOrder[]; error?: string }>;
    },
    enabled: !!tradeId,
    staleTime: 5 * 60 * 1000,
  });

// ── Entry context of an open position (snapshot taken when it opened) ──
export interface OpenPositionContext {
  // null = снимок ещё не сделан (следующий тик синка посчитает),
  // false = у символа не хватило истории свечей.
  ok: boolean | null;
  computedAt: string | null;
  entryPrice: number | null;
  atrPct: number | null;
  rsi: number | null;
  volRel: number | null;
  ema200Above: boolean | null;
  trend4h: string | null;
  rangePos1h: number | null;
  rangePos4h: number | null;
  rangePos1d: number | null;
}

export const useOpenPositionContext = (symbol: string, direction: 'long' | 'short') =>
  useQuery({
    queryKey: ['openPositionContext', symbol, direction],
    queryFn: async () => {
      const res = await apiFetch(
        `/api/trades/open-context?symbol=${encodeURIComponent(symbol)}&direction=${direction}`,
        { method: 'GET' },
      );
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json() as Promise<{ success: boolean; context: OpenPositionContext | null }>;
    },
    enabled: !!symbol,
    // Снимок неизменен, пока позиция открыта — но пока ok === null его ещё
    // считают, поэтому перепроверяем раз в минуту, как и сам список позиций.
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

// ── Range-check: всё, чтобы проверить «диапазон входа» глазами на графике ──
export interface RangeCheckCandle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface RangeCheckResponse {
  success: boolean;
  symbol: string;
  direction: 'long' | 'short';
  timeframe: '1h' | '4h' | '1d';
  candles: RangeCheckCandle[];
  window: {
    candles: number; // сколько свечей реально попало в окно
    expected: number; // сколько должно было
    low: number | null;
    high: number | null;
    fromTime: number | null;
    toTime: number;
  };
  // barTime — время свечи, содержащей момент: маркер на «межсвечном» времени
  // на «межсвечном» времени маркер поставить некуда.
  entry: { price: number; time: number; barTime: number | null; basis: 'opened' | 'closed' };
  exit: { price: number; time: number; barTime: number | null };
  closedPnl: number;
  stored: number | null; // что лежит в базе
  recomputed: number | null; // что даёт та же формула по нарисованным свечам
}

export const useRangeCheck = (tradeId: string | null, tf: '1h' | '4h' | '1d') =>
  useQuery({
    queryKey: ['rangeCheck', tradeId, tf],
    queryFn: async () => {
      const res = await apiFetch(`/api/trades/${tradeId}/range-check?tf=${tf}`, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json() as Promise<RangeCheckResponse>;
    },
    enabled: !!tradeId,
    staleTime: 5 * 60 * 1000,
  });

export interface TradeStats {
  totalTrades: number;
  totalPnl: number;
  totalFees: number;
  wins: number;
  losses: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  avgPnl: number;
  bestPnl: number;
  worstPnl: number;
}

export interface EquityPoint {
  time: number; // unix seconds
  value: number; // cumulative realized PnL
}

export interface TradesPage {
  success: boolean;
  trades: Trade[];
  total: number;
  page: number;
  pageSize: number;
}

// `tagId` narrows to trades carrying that tag; the literal 'untagged' narrows
// to trades with no tags (tag drill-down / разметка неразмеченных).
// `combo` narrows to trades whose tag set is EXACTLY these ids (combo card);
// `hasTags` narrows to trades CONTAINING all these ids (saved combo card).
export const useTrades = (params?: {
  symbol?: string;
  days?: number;
  page?: number;
  pageSize?: number;
  tagId?: string;
  combo?: string[];
  hasTags?: string[];
}) =>
  useQuery({
    queryKey: [
      'trades',
      params?.symbol ?? 'all',
      params?.days ?? 0,
      params?.page ?? 1,
      params?.pageSize ?? 20,
      params?.tagId ?? 'any',
      params?.combo?.join(',') ?? 'any',
      params?.hasTags?.join(',') ?? 'any',
    ],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (params?.symbol) q.set('symbol', params.symbol);
      if (params?.days) q.set('days', String(params.days));
      if (params?.page) q.set('page', String(params.page));
      if (params?.pageSize) q.set('pageSize', String(params.pageSize));
      if (params?.tagId) q.set('tagId', params.tagId);
      if (params?.combo && params.combo.length > 0) q.set('combo', params.combo.join(','));
      if (params?.hasTags && params.hasTags.length > 0) q.set('hasTags', params.hasTags.join(','));
      const qs = q.toString();
      const res = await apiFetch(`/api/trades${qs ? `?${qs}` : ''}`, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json() as Promise<TradesPage>;
    },
    placeholderData: keepPreviousData,
    staleTime: 30000,
    refetchInterval: 60000,
  });

export const useTradeStats = (params?: { symbol?: string; days?: number; tagId?: string }) =>
  useQuery({
    queryKey: ['tradeStats', params?.symbol ?? 'all', params?.days ?? 0, params?.tagId ?? 'any'],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (params?.symbol) q.set('symbol', params.symbol);
      if (params?.days) q.set('days', String(params.days));
      if (params?.tagId) q.set('tagId', params.tagId);
      const qs = q.toString();
      const res = await apiFetch(`/api/trades/stats${qs ? `?${qs}` : ''}`, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json() as Promise<{ success: boolean; stats: TradeStats; equity: EquityPoint[] }>;
    },
    // Без этого смена периода роняет метрики и график в undefined до ответа:
    // мастхед схлопывается, страница прыгает, потом отрисовывается заново.
    placeholderData: keepPreviousData,
    staleTime: 30000,
    refetchInterval: 60000,
  });

// ── Time-of-day / weekday / hold-duration statistics ──
export interface TimeBucket {
  trades: number;
  wins: number;
  losses: number;
  totalPnl: number;
  winRate: number; // 0..100
}

export interface TimeStatsResponse {
  success: boolean;
  totalTrades: number;
  byWeekday: TimeBucket[]; // index = JS getDay(): 0 = воскресенье
  byHour: TimeBucket[]; // 24 buckets, user-local clock
  duration: {
    withOpenedAt: number; // trades that actually carry an entry time
    avgHoldMin: number;
    avgWinHoldMin: number;
    avgLossHoldMin: number;
  };
}

export const useTimeStats = (params?: { days?: number; tagId?: string }) =>
  useQuery({
    queryKey: ['timeStats', params?.days ?? 0, params?.tagId ?? 'any'],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (params?.days) q.set('days', String(params.days));
      if (params?.tagId) q.set('tagId', params.tagId);
      // Bucket by the user's local clock, not the server's.
      q.set('tz', String(new Date().getTimezoneOffset()));
      const res = await apiFetch(`/api/trades/stats-by-time?${q.toString()}`, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json() as Promise<TimeStatsResponse>;
    },
    // Как и в useTradeStats — держим предыдущие столбцы/тепловую карту, пока
    // грузятся новые, иначе блок схлопывается в пустоту на каждую смену периода.
    placeholderData: keepPreviousData,
    staleTime: 30000,
    refetchInterval: 60000,
  });

// Entry/exit fill marker for the candlestick chart (one per order).
export interface ExecMarker {
  orderId: string;
  time: number; // unix seconds
  price: number;
  side: 'Buy' | 'Sell';
  qty: number;
  isClose: boolean; // exit (closed part of a position) vs entry
}

export const useExecutions = (symbol: string, days = 30) =>
  useQuery({
    queryKey: ['executions', symbol, days],
    queryFn: async () => {
      const res = await apiFetch(`/api/trades/executions?symbol=${symbol}&days=${days}`, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.json() as Promise<{ success: boolean; executions: ExecMarker[] }>;
    },
    enabled: !!symbol,
    staleTime: 30000,
    refetchInterval: 60000,
  });

// ── Instrument info (lot size, price tick, leverage range) ──
export interface InstrumentInfo {
  success: boolean;
  symbol: string;
  leverageFilter?: { minLeverage: string; maxLeverage: string; leverageStep: string };
  lotSizeFilter?: { minOrderQty: string; maxOrderQty: string; qtyStep: string; minNotionalValue?: string };
  priceFilter?: { minPrice: string; maxPrice: string; tickSize: string };
  error?: string;
}

export const useInstrumentInfo = (symbol: string) =>
  useQuery<InstrumentInfo>({
    queryKey: ['instrument', symbol],
    queryFn: async () => {
      const res = await apiFetch(`/api/bybit/instrument?symbol=${symbol}`, { method: 'GET' });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Не удалось загрузить инструмент');
      return data;
    },
    enabled: !!symbol,
    staleTime: 5 * 60 * 1000,
  });

// ── Mutations: leverage / amend order / trading stop ──
async function postJson(path: string, body: unknown, fallback: string) {
  const res = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || fallback);
  }
  return data;
}

export const useSetLeverage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { symbol: string; leverage: number | string }) =>
      postJson('/api/bybit/leverage', { symbol: vars.symbol, leverage: String(vars.leverage) }, 'Не удалось установить плечо'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['openPositions'] }),
  });
};

export const useAmendOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { symbol: string; orderId: string; price?: string; qty?: string }) =>
      postJson('/api/bybit/order/amend', vars, 'Не удалось изменить ордер'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['openOrders'] }),
  });
};

export const useSetTradingStop = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { symbol: string; positionType: 'long' | 'short'; takeProfit?: string; stopLoss?: string }) =>
      postJson('/api/bybit/position/tpsl', vars, 'Не удалось обновить TP/SL'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['openPositions'] }),
  });
};

export const useClosePosition = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { symbol: string; positionType: 'long' | 'short'; orderType: 'Market' | 'Limit'; price?: string; quantity?: string }) =>
      postJson('/api/bybit/position/close', vars, 'Не удалось закрыть позицию'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['openPositions'] });
      qc.invalidateQueries({ queryKey: ['openOrders'] });
    },
  });
};

// Create grid orders
async function createGridOrders(gridData: {
  symbol: string;
  positionType: 'long' | 'short';
  orders: Array<{ price: string; quantity: string }>;
  takeProfit?: string;
  stopLoss?: string;
}) {
  try {
    const response = await apiFetch('/api/bybit/orders/grid', {
      method: 'POST',
      body: JSON.stringify(gridData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Ошибка' };
  }
}

export { createGridOrders };
