'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';

/**
 * Кошельки Hyperliquid в отборе бота (backend/src/hl-scout). Спека —
 * docs/superpowers/specs/2026-10-19-hyperliquid-wallet-scout-design.md.
 */

/** Код причины отказа — тот же, что `RejectReason` в backend/src/hl-scout/stability.ts. */
export type RejectReason =
  | 'noData'
  | 'history'
  | 'trading'
  | 'pnlAllTime'
  | 'pnlHorizon'
  | 'pnl90'
  | 'pnlMonth'
  | 'weeksUp'
  | 'oneSpike'
  | 'drawdown';

/** Числа — `null`, пока бот кошелёк не разобрал. */
export interface HlWalletRow {
  address: string;
  accountValue: number | null;
  pnlWeek: number | null;
  pnlMonth: number | null;
  pnl90: number | null;
  pnlAllTime: number | null;
  roiMonth: number | null;
  weeks: number | null;
  weeksMoving: number | null;
  weeksUp: number | null;
  bestWeekShare: number | null;
  maxDrawdown: number | null;
  volumeWeek: number;
  openPositions: number | null;
  analyzedAt: string | null;
  qualified: boolean;
  rejectReason: RejectReason | null;
  alive: boolean;
  savedAt: string | null;
  note: string | null;
  /** Профиль открывали — строка таблицы гаснет. */
  viewedAt: string | null;
}

export interface HlWalletsResponse {
  status: { discoveredAt: string | null; candidates: number; analyzed: number; qualified: number };
  rows: HlWalletRow[];
}

export interface HlPosition {
  address: string;
  coin: string;
  side: 'long' | 'short';
  size: number;
  notional: number;
  entryPx: number | null;
  markPx: number | null;
  unrealizedPnl: number;
  leverage: number;
  liquidationPx: number | null;
}

export interface HlPositionsResponse {
  asOf: string;
  positions: HlPosition[];
  /** Кошельки, чьи позиции не загрузились: без них таблица — не «позиций нет». */
  failed: string[];
}

export interface HlOrder {
  coin: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  /** Объём при выставлении: размер меньше него — ордер исполнен частично. */
  origSize: number;
  type: string;
  reduceOnly: boolean;
  triggerPx: number | null;
  time: number;
}

export interface HlFill {
  coin: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  time: number;
  /** Подпись Hyperliquid: «Open Long», «Close Short», «Long > Short». */
  dir: string;
  closedPnl: number;
  fee: number;
  taker: boolean;
}

const BASE = '/api/admin/hl';
/** Бот пересчитывает кошелёк раз в ~2 часа — чаще минуты таблицу перечитывать незачем. */
const STALE_MS = 60_000;

export const useHlWallets = (enabled: boolean) =>
  useQuery({
    queryKey: ['hlWallets'],
    queryFn: () => apiJson<HlWalletsResponse>(`${BASE}/wallets`),
    enabled,
    staleTime: STALE_MS,
  });

export const useHlSaved = (enabled: boolean) =>
  useQuery({
    queryKey: ['hlSaved'],
    queryFn: () => apiJson<{ rows: HlWalletRow[] }>(`${BASE}/saved`),
    enabled,
    staleTime: STALE_MS,
    // Только что добавленный кошелёк бот разберёт в течение минуты — пока есть
    // непроверенные, список перечитывается, и статистика появляется сама.
    refetchInterval: (q) => (q.state.data?.rows.some((r) => !r.analyzedAt) ? 10_000 : false),
  });

export const useHlPositions = (enabled: boolean) =>
  useQuery({
    queryKey: ['hlPositions'],
    queryFn: () => apiJson<HlPositionsResponse>(`${BASE}/saved/positions`),
    enabled,
    // Позиции — то, ради чего кошелёк сохранён: перечитываются, пока страница открыта.
    refetchInterval: 30_000,
  });

/** Ордера и сделки — только когда открыта их вкладка; сервер держит ответ минуту. */
export const useHlOrders = (address: string, enabled: boolean) =>
  useQuery({
    queryKey: ['hlOrders', address],
    queryFn: () => apiJson<{ asOf: string; orders: HlOrder[] }>(`${BASE}/saved/${address}/orders`),
    enabled,
    staleTime: STALE_MS,
  });

export const useHlFills = (address: string, enabled: boolean) =>
  useQuery({
    queryKey: ['hlFills', address],
    queryFn: () => apiJson<{ asOf: string; fills: HlFill[] }>(`${BASE}/saved/${address}/fills`),
    enabled,
    staleTime: STALE_MS,
  });

/**
 * Профиль открыт: строка гаснет сразу (кэш правится до ответа — ссылка уводит
 * в другую вкладку, ждать некогда), сервер запоминает метку для всех устройств.
 */
export function useViewWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (address: string) => apiJson<{ ok: true }>(`${BASE}/wallets/${address}/viewed`, { method: 'POST' }),
    onMutate: (address) => {
      const now = new Date().toISOString();
      const mark = (r: HlWalletRow) => (r.address === address && !r.viewedAt ? { ...r, viewedAt: now } : r);
      qc.setQueryData<HlWalletsResponse>(['hlWallets'], (d) => d && { ...d, rows: d.rows.map(mark) });
      qc.setQueryData<{ rows: HlWalletRow[] }>(['hlSaved'], (d) => d && { ...d, rows: d.rows.map(mark) });
    },
  });
}

/** Удалить кошелёк из таблицы насовсем (метка на сервере, бот его больше не вернёт). */
export function useHideWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (address: string) => apiJson<{ ok: true }>(`${BASE}/wallets/${address}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['hlWallets'] }),
  });
}

/** Добавить свой кошелёк по адресу — в сохранённые, минуя отбор бота. */
export function useAddWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (address: string) =>
      apiJson<HlWalletRow>(`${BASE}/saved`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.trim() }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hlSaved'] });
      void qc.invalidateQueries({ queryKey: ['hlWallets'] });
      void qc.invalidateQueries({ queryKey: ['hlPositions'] });
    },
  });
}

/** Сохранить, сменить заметку, убрать — и перечитать всё, где кошелёк виден. */
export function useSaveWallet() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['hlWallets'] });
    void qc.invalidateQueries({ queryKey: ['hlSaved'] });
    void qc.invalidateQueries({ queryKey: ['hlPositions'] });
  };
  const save = useMutation({
    mutationFn: ({ address, note }: { address: string; note?: string }) =>
      apiJson<HlWalletRow>(`${BASE}/saved/${address}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note === undefined ? {} : { note }),
      }),
    onSuccess: refresh,
  });
  const unsave = useMutation({
    mutationFn: (address: string) => apiJson<{ ok: true }>(`${BASE}/saved/${address}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });
  return { save, unsave };
}
