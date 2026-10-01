'use client';

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiJson, qs } from '@/shared/api/http';
import { candlesPath, fromApi, type ApiCandle, type Candle } from '../lib/candles';
import type {
  BacktestCloseOrder,
  BacktestEntryOrder,
  BacktestSession,
  BacktestStats,
  BacktestTrade,
  DataSource,
  Direction,
  ExitReason,
  LiveSymbol,
  SessionDetail,
  SessionListItem,
  StatsSource,
} from './types';

const sessionKey = (id: string) => ['backtest', 'session', id] as const;

export const useBacktestSessions = () =>
  useQuery({
    queryKey: ['backtest', 'sessions'],
    queryFn: () => apiJson<{ sessions: SessionListItem[] }>('/api/backtest/sessions'),
  });

export const useBacktestStats = (source: StatsSource) =>
  useQuery({
    queryKey: ['backtest', 'stats', source],
    queryFn: () => apiJson<BacktestStats>(`/api/backtest/stats${qs({ source })}`),
  });

/**
 * Сессия целиком. Эфирная (своя или турнирная) перечитывается сама раз в три
 * секунды: её позиции закрывает серверный движок, и без опроса человек не
 * узнал бы, что стоп уже сработал. И у фоновой вкладки тоже: о сработавшем
 * стопе говорит звук терминала, и нужен он как раз тому, кто смотрит в другую
 * вкладку.
 */
export const useBacktestSession = (id: string) =>
  useQuery({
    queryKey: sessionKey(id),
    queryFn: () => apiJson<SessionDetail>(`/api/backtest/sessions/${id}`),
    refetchInterval: (q) => (q.state.data && isLiveSession(q.state.data) ? LIVE_POLL_MS : false),
    refetchIntervalInBackground: true,
  });

/**
 * Сессия в эфире: своя (`dataSource = 'live'`) или турнирная. Цену, время и
 * срабатывания у неё ведёт сервер, браузер только показывает.
 */
export const isLiveSession = (d: SessionDetail) =>
  d.session.dataSource === 'live' || d.tournament?.mode === 'live';

/** Как часто перечитывать эфирную сессию: позиции закрывает сервер. */
const LIVE_POLL_MS = 3000;

/** Живой хвост минуток монеты и время сервера — источник свечей эфира. */
export const fetchLiveTail = (symbol: string) =>
  apiJson<{ serverTime: string; minutes: ApiCandle[] }>(`/api/market-data/live${qs({ symbol })}`);

/** Монеты эфира. Список меняется только с выкладкой сервера — перечитывать незачем. */
export const useLiveSymbols = (enabled = true) =>
  useQuery({
    queryKey: ['market', 'liveSymbols'],
    queryFn: () => apiJson<{ symbols: LiveSymbol[] }>('/api/market-data/live/symbols'),
    staleTime: Infinity,
    enabled,
  });

/**
 * Знаков цены у монеты эфира. Не эфир или список ещё не пришёл — undefined:
 * формат цены берёт общее правило, как у истории BTC.
 */
export function useDecimalsOf(enabled: boolean): (symbol: string) => number | undefined {
  const { data } = useLiveSymbols(enabled);
  return useCallback(
    (symbol: string) => (enabled ? data?.symbols.find((s) => s.symbol === symbol)?.decimals : undefined),
    [data, enabled],
  );
}

/** Как часто обновлять цены монет, которых нет на графике: столько же, сколько хвост графика. */
const PRICES_MS = 2000;

/**
 * Последние цены монет — отметка позиций по монетам, которых нет на графике.
 * Монета, по которой биржа не ответила, в ответе отсутствует.
 */
export const useLivePrices = (symbols: string[], enabled: boolean) => {
  const key = [...symbols].sort().join(',');
  return useQuery({
    queryKey: ['market', 'livePrices', key],
    queryFn: () =>
      apiJson<{ serverTime: string; prices: Record<string, number> }>(`/api/market-data/live/prices${qs({ symbols: key })}`),
    enabled: enabled && key.length > 0,
    refetchInterval: PRICES_MS,
  });
};

/**
 * После любой правки: сама сессия, список и общая статистика. И после отказа
 * тоже — сервер мог отказать потому, что состояние уже другое (вторая вкладка),
 * и экран обязан показать то, что есть на самом деле.
 */
function refresh(qc: QueryClient, id?: string) {
  if (id) void qc.invalidateQueries({ queryKey: sessionKey(id) });
  void qc.invalidateQueries({ queryKey: ['backtest', 'sessions'] });
  void qc.invalidateQueries({ queryKey: ['backtest', 'stats'] });
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const useCreateSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { startBalance: number; hideDate: boolean; hidePrice: boolean; dataSource: DataSource }) =>
      apiJson<{ session: BacktestSession }>('/api/backtest/sessions', json('POST', input)),
    onSettled: () => refresh(qc),
  });
};

export const useFinishSession = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiJson<{ session: BacktestSession }>(`/api/backtest/sessions/${id}/finish`, json('POST')),
    onSettled: () => refresh(qc, id),
  });
};

export const useDeleteSession = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiJson<void>(`/api/backtest/sessions/${id}`, json('DELETE')),
    onSettled: () => refresh(qc),
  });
};

export const useOpenTrade = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      /** Не задана — BTC. */
      symbol?: string;
      direction: Direction;
      entryTime: string;
      entryPrice: number;
      stopLoss: number;
      takeProfit?: number;
      riskPct: number;
      leverage: number;
      entryOrderId?: string;
    }) => apiJson<{ trade: BacktestTrade }>(`/api/backtest/sessions/${id}/trades`, json('POST', input)),
    onSettled: () => refresh(qc, id),
  });
};

export const useModifyTrade = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tradeId, ...body }: { tradeId: string; stopLoss?: number; takeProfit?: number | null }) =>
      apiJson<{ trade: BacktestTrade }>(`/api/backtest/trades/${tradeId}`, json('PATCH', body)),
    // Перечитку сессии — дожидаемся: колбэки конкретного mutate() срабатывают только
    // после неё, и экран держит отпущенную по графику линию на месте ровно до прихода
    // новых уровней, без кадра со старыми (см. pendingLevel в SessionScreen).
    onSettled: async () => {
      refresh(qc);
      await qc.invalidateQueries({ queryKey: sessionKey(id) });
    },
  });
};

export const useAddToTrade = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tradeId,
      ...body
    }: {
      tradeId: string;
      entryTime: string;
      entryPrice: number;
      riskPct: number;
      entryOrderId?: string;
    }) => apiJson<{ trade: BacktestTrade }>(`/api/backtest/trades/${tradeId}/add`, json('POST', body)),
    onSettled: () => refresh(qc, id),
  });
};

export const useSetLeverage = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (leverage: number) =>
      apiJson<{ trades: BacktestTrade[] }>(`/api/backtest/sessions/${id}/leverage`, json('PATCH', { leverage })),
    onSettled: () => refresh(qc, id),
  });
};

export const useCloseTrade = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      tradeId,
      ...body
    }: {
      tradeId: string;
      exitTime: string;
      exitPrice: number;
      reason: ExitReason;
      qty?: number;
      closeOrderId?: string;
    }) => apiJson<{ trade: BacktestTrade; balance: number }>(`/api/backtest/trades/${tradeId}/close`, json('POST', body)),
    // Закрытие нельзя терять: повторы с паузой. Сервер принимает повтор того же
    // закрытия как успех, так что потерянный ответ не превращается в ошибку.
    retry: 3,
    retryDelay: (attempt) => 1000 * 2 ** attempt,
    // Перечитку сессии — дожидаемся: пока закрытие в полёте, прокрутка стоит
    // (`pending` у useReplay), и следующий её шаг обязан видеть уже новый
    // остаток и стоп — сервер двигает его за исполненным тейком (стоп за тейками).
    onSettled: async () => {
      refresh(qc);
      await qc.invalidateQueries({ queryKey: sessionKey(id) });
    },
  });
};

/** Сетка фиксации: лимиты закрытия позиции и «стоп за тейками». */
export const useCreateCloseGrid = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tradeId, ...body }: { tradeId: string; prices: number[]; stopFollow: boolean }) =>
      apiJson<{ closeOrders: BacktestCloseOrder[] }>(`/api/backtest/trades/${tradeId}/close-grid`, json('POST', body)),
    onSettled: () => refresh(qc, id),
  });
};

export const useCreateCloseOrder = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tradeId, ...body }: { tradeId: string; price: number; qty: number }) =>
      apiJson<{ closeOrder: BacktestCloseOrder }>(`/api/backtest/trades/${tradeId}/close-orders`, json('POST', body)),
    onSettled: () => refresh(qc, id),
  });
};

export const useCancelCloseOrder = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => apiJson<{ success: boolean }>(`/api/backtest/close-orders/${orderId}`, json('DELETE')),
    onSettled: () => refresh(qc, id),
  });
};

/**
 * Перенос висящего ордера жестом на графике. Перечитку сессии дожидаемся, как у
 * useModifyTrade: экран держит отпущенную линию на месте ровно до прихода новой
 * цены, без кадра со старой.
 */
const useMoveOrder = (id: string, path: 'close-orders' | 'entry-orders') => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, price }: { orderId: string; price: number }) =>
      apiJson<unknown>(`/api/backtest/${path}/${orderId}`, json('PATCH', { price })),
    onSettled: async () => {
      refresh(qc);
      await qc.invalidateQueries({ queryKey: sessionKey(id) });
    },
  });
};

export const useMoveCloseOrder = (id: string) => useMoveOrder(id, 'close-orders');

/** Лимит на вход сервер снимает и выставляет заново — у него будет новый id. */
export const useMoveEntryOrder = (id: string) => useMoveOrder(id, 'entry-orders');

export const useCreateEntryOrders = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      symbol?: string;
      direction: Direction;
      stopLoss: number;
      takeProfit?: number;
      riskPct: number;
      leverage: number;
      prices: number[];
    }) => apiJson<{ entryOrders: BacktestEntryOrder[] }>(`/api/backtest/sessions/${id}/entry-orders`, json('POST', input)),
    onSettled: () => refresh(qc, id),
  });
};

export const useCancelEntryOrder = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => apiJson<{ success: boolean }>(`/api/backtest/entry-orders/${orderId}`, json('DELETE')),
    onSettled: () => refresh(qc, id),
  });
};

export const useSetBacktestTags = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tradeId, tagIds }: { tradeId: string; tagIds: string[] }) =>
      apiJson<{ success: boolean }>(`/api/backtest/trades/${tradeId}/tags`, json('PUT', { tagIds })),
    onSettled: () => refresh(qc, id),
  });
};

/**
 * Сохранить момент сессии. keepalive — для ухода со страницы: такой запрос
 * браузер доводит до конца, даже когда вкладку уже закрывают.
 */
export const saveCursor = (id: string, cursor: number, keepalive = false) =>
  apiJson<{ cursorTime: string }>(`/api/backtest/sessions/${id}`, {
    ...json('PATCH', { cursorTime: new Date(cursor).toISOString() }),
    keepalive,
  });

/**
 * Свечи сессии. Без from и с limit — последние limit свечей до to, по возрастанию.
 * `symbol` — монета эфира; без неё — BTC.
 */
export async function fetchCandles(
  session: { id: string; dataSource: DataSource },
  tf: number,
  range: { from?: number; to?: number; limit: number },
  symbol?: string,
): Promise<Candle[]> {
  const rows = await apiJson<ApiCandle[]>(
    `${candlesPath(session)}${qs({ tf, symbol, from: range.from, to: range.to, limit: range.limit })}`,
  );
  return rows.map(fromApi);
}
