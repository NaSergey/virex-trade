'use client';

import { useQuery } from '@tanstack/react-query';
import { TERMINAL_KEY } from '@/entities/terminal';
import { apiJson, qs } from '@/shared/api/http';
import { fromApi, type ApiCandle, type LiveSource } from '@/widgets/backtest-session';
import type { TerminalState, TerminalSymbol } from './types';

export const STATE_KEY = [...TERMINAL_KEY, 'state'] as const;

/** Как часто перечитывать счёт: ордера исполняет биржа, и узнать об этом можно только спросив. */
const STATE_POLL_MS = 3000;

/**
 * Снимок счёта. Опрашивается и у фоновой вкладки: о сработавшем стопе говорит
 * звук терминала, и нужен он как раз тому, кто смотрит в другую вкладку.
 */
export const useTerminalState = () =>
  useQuery({
    queryKey: STATE_KEY,
    queryFn: () => apiJson<TerminalState>('/api/terminal/state'),
    refetchInterval: STATE_POLL_MS,
    refetchIntervalInBackground: true,
  });

/** Монеты терминала. Порядок по обороту меняется медленно — перечитывать незачем. */
export const useTerminalSymbols = () =>
  useQuery({
    queryKey: [...TERMINAL_KEY, 'symbols'],
    queryFn: () => apiJson<{ symbols: TerminalSymbol[] }>('/api/terminal/symbols'),
    staleTime: Infinity,
  });

/**
 * Рынок Bybit для ленты графика. Константа модуля: лента перезапрашивает свечи
 * при смене ссылки на источник.
 */
export const EXCHANGE_SOURCE: LiveSource = {
  tail: (symbol) => apiJson<{ serverTime: string; minutes: ApiCandle[] }>(`/api/terminal/live${qs({ symbol })}`),
  candles: async (tf, range, symbol) => {
    const rows = await apiJson<ApiCandle[]>(
      `/api/terminal/candles${qs({ symbol, tf, from: range.from, to: range.to, limit: range.limit })}`,
    );
    return rows.map(fromApi);
  },
};
