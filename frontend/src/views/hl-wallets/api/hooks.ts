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
  });

export const useHlPositions = (enabled: boolean) =>
  useQuery({
    queryKey: ['hlPositions'],
    queryFn: () => apiJson<HlPositionsResponse>(`${BASE}/saved/positions`),
    enabled,
    // Позиции — то, ради чего кошелёк сохранён: перечитываются, пока страница открыта.
    refetchInterval: 30_000,
  });

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
