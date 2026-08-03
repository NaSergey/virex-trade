'use client';

import { useQuery } from '@tanstack/react-query';
import { apiJson, qs } from '@/shared/api/http';
import type { ExchangePosition, OpenPositionContext } from './types';

/**
 * Открытые позиции и снимок рынка на их входе — всё, что продукт спрашивает у
 * биржи в реальном времени.
 *
 * Раньше здесь же лежали торговые мутации (плечо, TP/SL, закрытие, сетка
 * ордеров) и запросы баланса с тикерами. Ни одно из этого не вызывалось ни из
 * одного компонента: журналу нечего отправлять на биржу, он её только читает.
 * Всё это снято — история в git, если торговля вернётся.
 */

export const useOpenPositions = () =>
  useQuery({
    queryKey: ['openPositions'],
    queryFn: () =>
      apiJson<{ success: boolean; positions: ExchangePosition[] }>('/api/exchange/positions'),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

export const useOpenPositionContext = (symbol: string, direction: 'long' | 'short') =>
  useQuery({
    queryKey: ['openPositionContext', symbol, direction],
    queryFn: () =>
      apiJson<{ success: boolean; context: OpenPositionContext | null }>(
        `/api/trades/open-context${qs({ symbol, direction })}`,
      ),
    enabled: !!symbol,
    // Снимок неизменен, пока позиция открыта — но пока ok === null его ещё
    // считают, поэтому перепроверяем раз в минуту, как и сам список позиций.
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
