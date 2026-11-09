'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';
import type { SlotsConfig, SlotsSpin } from './types';

export const useSlotsConfig = () =>
  useQuery({
    queryKey: ['slots', 'config'],
    queryFn: () => apiJson<SlotsConfig>('/api/games/slots'),
    staleTime: Infinity,
  });

/**
 * Спин двигает монеты — повтора нет (`retry` мутаций и так выключен): второй
 * POST после оборванного ответа был бы вторым спином. Баланс в шапке
 * перечитывает страница, когда барабаны доиграли: иначе выигрыш появлялся бы
 * в шапке раньше, чем на барабанах.
 */
export const useSlotsSpin = () =>
  useMutation({
    mutationFn: (bet: number) =>
      apiJson<SlotsSpin>('/api/games/slots/spin', { method: 'POST', body: JSON.stringify({ bet }) }),
  });
