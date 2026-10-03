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
 * Фоновая вкладка опрашивает реже. Каждый опрос — запросы к Bybit, а лимит у
 * биржи на IP сервера, общий для всех пользователей и для синка сделок: его
 * превышение банит IP на десять минут для всех сразу. Звук о сработавшем
 * стопе в фоновой вкладке опоздает на эти секунды, но не пропадёт.
 */
const BACKGROUND_POLL_MS = 10_000;

/**
 * Снимок счёта. Опрашивается и у фоновой вкладки: о сработавшем стопе говорит
 * звук терминала, и нужен он как раз тому, кто смотрит в другую вкладку.
 * Вернулся на вкладку — перечитывается сразу (фокус окна), и опрос снова
 * идёт раз в три секунды.
 */
export const useTerminalState = () =>
  useQuery({
    queryKey: STATE_KEY,
    queryFn: () => apiJson<TerminalState>('/api/terminal/state'),
    refetchInterval: () =>
      typeof document !== 'undefined' && document.visibilityState === 'hidden' ? BACKGROUND_POLL_MS : STATE_POLL_MS,
    refetchIntervalInBackground: true,
    // Глобально перечитывание по фокусу выключено, а `staleTime` приложения —
    // минута: `true` здесь ничего бы не сделал, данные из фона «не устарели».
    // `always` — потому что вернувшийся не должен ждать до десяти секунд.
    refetchOnWindowFocus: 'always',
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
