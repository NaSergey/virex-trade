'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';

export type ExchangeId = string;

/** One exchange as the settings page sees it: catalog entry + connection state. */
export interface ExchangeInfo {
  id: ExchangeId;
  label: string;
  /** OKX/Bitget/KuCoin issue a third secret; the form shows the field only then. */
  needsPassphrase: boolean;
  permissionsHint: string;
  connected: boolean;
  apiKeyMasked: string | null;
  connectedAt: string | null;
  /**
   * Ключи сохранены, но сервер не может их расшифровать (сменился его мастер-
   * ключ, база восстановлена из другого окружения). Подключение числится, но
   * работать по нему нельзя — форма ключей показывается снова.
   */
  needsReconnect: boolean;
}

export interface ExchangesStatus {
  success: boolean;
  /** Which connected exchange drives sync and positions; null if none yet. */
  activeExchange: ExchangeId | null;
  exchanges: ExchangeInfo[];
}

export interface ConnectVars {
  exchange: ExchangeId;
  apiKey: string;
  apiSecret: string;
  passphrase?: string;
}

const SETTINGS_KEY = ['settings', 'exchanges'];

// Connecting or switching changes whose account the whole app is reading, so
// every exchange-derived query has to be refetched, not just the settings page.
const ACCOUNT_KEYS = [SETTINGS_KEY, ['usdtBalance'], ['openPositions'], ['trades']];

const useAccountMutation = <TVars>(fn: (vars: TVars) => Promise<unknown>) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of ACCOUNT_KEYS) void qc.invalidateQueries({ queryKey: key });
    },
  });
};

export const useExchanges = () =>
  useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => apiJson<ExchangesStatus>('/api/settings/exchanges'),
    staleTime: 30000,
    // Три повтора с нарастающей паузой — это ещё пятнадцать секунд пустой
    // страницы поверх уже случившейся ошибки. Настройки открывают, чтобы
    // что-то починить: лучше сразу сказать, что не вышло, и дать «Повторить».
    retry: 1,
  });

export const useConnectExchange = () =>
  useAccountMutation(({ exchange, ...body }: ConnectVars) =>
    apiJson<{ success: boolean; apiKeyMasked: string }>(`/api/settings/exchanges/${exchange}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  );

export const useDisconnectExchange = () =>
  useAccountMutation((exchange: ExchangeId) =>
    apiJson(`/api/settings/exchanges/${exchange}`, { method: 'DELETE' }),
  );

export const useSetActiveExchange = () =>
  useAccountMutation((exchange: ExchangeId) =>
    apiJson(`/api/settings/active-exchange/${exchange}`, { method: 'PUT' }),
  );
