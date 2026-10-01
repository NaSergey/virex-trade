'use client';

import { useQuery } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';
import { setClientTerminalHint } from '../lib/access-hint';

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
 * Живёт в `entities`, а не на странице терминала: по этому ответу шапка
 * решает, показывать ли пункт меню, а шапка — виджет и в страницы не ходит.
 * Ответ стоит обращения к бирже, поэтому держится пять минут; подключение и
 * смена ключей сбрасывают его сами (`ACCOUNT_KEYS` в настройках).
 *
 * Каждый ответ запоминается кукой (`setClientTerminalHint`): по ней сервер
 * рисует пункт в шапке уже в присланной разметке следующей загрузки, не
 * дожидаясь этого запроса. Сбой запроса куку не трогает — «не узнали» не
 * значит «нет».
 */
export const useTerminalAccess = () =>
  useQuery({
    queryKey: [...TERMINAL_KEY, 'access'],
    queryFn: async () => {
      const access = await apiJson<TerminalAccess>('/api/terminal/access');
      setClientTerminalHint(access.available);
      return access;
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
