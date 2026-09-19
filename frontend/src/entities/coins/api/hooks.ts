'use client';

import { useQuery } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';

/**
 * Баланс монет обновляется сам раз в полминуты: приз приходит, когда турнир
 * завершает фоновый движок, а человек в этот момент может быть на любой
 * странице. Точки, где баланс меняется по его собственному действию (взнос,
 * выход, оплата доната), сбрасывают этот запрос сразу — см. `['coins']`.
 */
const POLL_MS = 30_000;

export const useCoinBalance = () =>
  useQuery({
    queryKey: ['coins'],
    queryFn: () => apiJson<{ balance: number }>('/api/coins'),
    refetchInterval: POLL_MS,
  });
