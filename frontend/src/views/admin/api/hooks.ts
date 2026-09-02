'use client';

import { useQuery } from '@tanstack/react-query';
import { apiJson, qs } from '@/shared/api/http';

/**
 * Владельческая аналитика. Времени на сайте в этих ответах нет намеренно:
 * приложение опрашивает API и с фоновой вкладки, поэтому «минуты на сайте»
 * означали бы время с открытой вкладкой, а не время человека за экраном.
 * Меряется посещение — визиты, дни с активностью, обращения и действия.
 */

/** Визит — цепочка обращений с паузой меньше 30 минут (граница живёт на бэке). */
export interface AdminOverview {
  period: { from: string; to: string; days: number; tzOffsetMinutes: number; visitGapMin: number };
  totals: {
    users: number;
    newUsers: number;
    activeUsers: number;
    visits: number;
    requests: number;
    actions: number;
    avgVisitsPerActiveUser: number;
    avgDaysActivePerUser: number;
  };
  audience: {
    dau: number;
    wau: number;
    mau: number;
    stickiness: number;
    avgDailyActiveUsers: number;
  };
  /** Путь аккаунта за всё время, а не за окно отчёта. */
  funnel: {
    registered: number;
    connectedExchange: number;
    syncedTrades: number;
    createdTag: number;
    taggedSomething: number;
    readStats: number;
    returnedAnotherDay: number;
  };
  daily: {
    date: string;
    activeUsers: number;
    newUsers: number;
    visits: number;
    requests: number;
    actions: number;
  }[];
  sections: { section: string; users: number; requests: number; actions: number }[];
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  registeredAt: string;
  /** Никогда не заходил — null, а не нулевая дата. */
  lastSeenAt: string | null;
  visits: number;
  daysActive: number;
  requests: number;
  actions: number;
  trades: number;
  tags: number;
  exchanges: string[];
  activeExchange: string | null;
  telegramLinked: boolean;
}

export interface AdminUsersPage {
  total: number;
  limit: number;
  offset: number;
  rows: AdminUserRow[];
}

export interface AdminUserDetail {
  user: {
    id: string;
    email: string;
    name: string | null;
    registeredAt: string;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
    activeExchange: string | null;
    exchanges: { exchange: string; connectedAt: string }[];
    telegramLinked: boolean;
    trades: number;
    tags: number;
    taggedTrades: number;
    positionTags: number;
  };
  totals: { visits: number; daysActive: number; requests: number; actions: number };
  visits: { startedAt: string; requests: number; actions: number }[];
  sections: { section: string; requests: number; actions: number }[];
}

export interface AdminRetention {
  anchor: string;
  weeks: number;
  currentWeek: number;
  cohorts: {
    cohortStart: string;
    size: number;
    weeks: { offset: number; users: number; pct: number }[];
  }[];
}

export type UserSort =
  | 'lastSeenAt'
  | 'visits'
  | 'daysActive'
  | 'requests'
  | 'actions'
  | 'trades'
  | 'tags'
  | 'createdAt';

/**
 * Сутки отчёта нарезаются по часовому поясу читателя, а не по UTC: иначе
 * вечерняя активность уезжает в следующий день и «вчера» выглядит пустым.
 * getTimezoneOffset возвращает величину с обратным знаком — отсюда минус.
 */
export function tzOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

const BASE = '/api/admin/analytics';

// Раздел смотрят раз в несколько дней, а не держат открытым: автообновления
// нет, свежесть — минута, дальше данные перечитываются при возврате на вкладку.
const STALE_MS = 60_000;

export const useAdminOverview = (days: number, enabled: boolean) =>
  useQuery({
    queryKey: ['adminOverview', days],
    queryFn: () =>
      apiJson<AdminOverview>(`${BASE}/overview${qs({ days, tzOffsetMinutes: tzOffsetMinutes() })}`),
    enabled,
    staleTime: STALE_MS,
  });

export const useAdminUsers = (
  params: { days: number; sort: UserSort; order: 'asc' | 'desc'; limit: number; offset: number; q?: string },
  enabled: boolean,
) =>
  useQuery({
    queryKey: ['adminUsers', params],
    queryFn: () =>
      apiJson<AdminUsersPage>(
        `${BASE}/users${qs({ ...params, tzOffsetMinutes: tzOffsetMinutes() })}`,
      ),
    enabled,
    staleTime: STALE_MS,
    // Строки прежней страницы остаются на месте, пока едет следующая: иначе
    // таблица схлопывается в заглушки на каждый клик по сортировке.
    placeholderData: (prev) => prev,
  });

export const useAdminUser = (userId: string | null, days: number) =>
  useQuery({
    queryKey: ['adminUser', userId, days],
    queryFn: () =>
      apiJson<AdminUserDetail>(
        `${BASE}/users/${userId}${qs({ days, tzOffsetMinutes: tzOffsetMinutes() })}`,
      ),
    enabled: !!userId,
    staleTime: STALE_MS,
  });

export const useAdminRetention = (weeks: number, enabled: boolean) =>
  useQuery({
    queryKey: ['adminRetention', weeks],
    queryFn: () =>
      apiJson<AdminRetention>(
        `${BASE}/retention${qs({ weeks, tzOffsetMinutes: tzOffsetMinutes() })}`,
      ),
    enabled,
    staleTime: STALE_MS,
  });
