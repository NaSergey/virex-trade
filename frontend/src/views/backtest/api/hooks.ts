'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { apiJson, qs } from '@/shared/api/http';
import { fromApi, type ApiCandle, type Candle } from '../lib/candles';
import type {
  BacktestCloseOrder,
  BacktestEntryOrder,
  BacktestSession,
  BacktestStats,
  BacktestTrade,
  Direction,
  ExitReason,
  SessionDetail,
  SessionListItem,
} from './types';

const sessionKey = (id: string) => ['backtest', 'session', id] as const;

export const useBacktestSessions = () =>
  useQuery({
    queryKey: ['backtest', 'sessions'],
    queryFn: () => apiJson<{ sessions: SessionListItem[] }>('/api/backtest/sessions'),
  });

export const useBacktestStats = () =>
  useQuery({
    queryKey: ['backtest', 'stats'],
    queryFn: () => apiJson<BacktestStats>('/api/backtest/stats'),
  });

export const useBacktestSession = (id: string) =>
  useQuery({
    queryKey: sessionKey(id),
    queryFn: () => apiJson<SessionDetail>(`/api/backtest/sessions/${id}`),
  });

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
    mutationFn: (input: { startBalance: number; hideDate: boolean; hidePrice: boolean }) =>
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

export const useCreateEntryOrders = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
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

/** Свечи хранилища. Без from и с limit — последние limit свечей до to, по возрастанию. */
export async function fetchCandles(tf: number, range: { from?: number; to?: number; limit: number }): Promise<Candle[]> {
  const rows = await apiJson<ApiCandle[]>(
    `/api/market-data/candles${qs({ tf, from: range.from, to: range.to, limit: range.limit })}`,
  );
  return rows.map(fromApi);
}
