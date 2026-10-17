'use client';

import { queryOptions, useQuery } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';

/** Почему терминала нет: причину называет сервер, страница переводит её по ключу. */
export type TerminalAccessReason = 'NO_EXCHANGE' | 'NOT_BYBIT' | 'READ_ONLY' | 'UNKNOWN';

export interface TerminalAccess {
  available: boolean;
  reason: TerminalAccessReason | null;
  exchange: string | null;
}

/** Всё, что терминал знает о бирже. Смена ключей или активной биржи сбрасывает ветку целиком. */
export const TERMINAL_KEY = ['terminal'] as const;

/**
 * Есть ли у человека биржевой терминал: активная биржа — Bybit, и её ключ
 * умеет ставить ордера.
 *
 * Живёт в `entities`, а не на странице терминала: его читают и страница
 * терминала, и настройки. Ответ стоит обращения к бирже, поэтому держится пять
 * минут; подключение и смена ключей сбрасывают его сами (`ACCOUNT_KEYS` в
 * настройках). Из кэша не выпадает до перезагрузки вкладки (`gcTime`):
 * терминал — главная страница, и вернувшийся на него не должен ждать ответа
 * за заглушкой.
 */
export const terminalAccessQuery = queryOptions({
  queryKey: [...TERMINAL_KEY, 'access'],
  queryFn: () => apiJson<TerminalAccess>('/api/terminal/access'),
  staleTime: 5 * 60_000,
  gcTime: Infinity,
  retry: 1,
});

export const useTerminalAccess = () => useQuery(terminalAccessQuery);
