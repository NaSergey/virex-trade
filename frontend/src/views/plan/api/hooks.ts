'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';

/**
 * План дня владельца (`backend/src/plan`). Исходы и отчёт считает сервер —
 * одна копия правил на страницу, вечерний отчёт и недельный итог в Telegram.
 * Ответы приходят и из чата, поэтому день перечитывается раз в полминуты и при
 * возврате на вкладку.
 */

const BASE = '/api/admin/plan';
const ROOT = ['plan'] as const;

export type Status = 'planned' | 'started' | 'done' | 'partial' | 'skipped' | 'walk';
export type Outcome = 'upcoming' | 'now' | 'started' | 'open' | 'done' | 'partial' | 'skipped' | 'walk' | 'missed';

export interface Category {
  id: string;
  label: string;
  emoji: string;
}

export interface Settings {
  tz: string;
  morningMin: number | null;
  eveningMin: number | null;
  leadMin: number;
}

export interface PlanState {
  settings: Settings;
  today: string;
  nowMin: number;
  categories: Category[];
  /** У владельца привязан бот — без этого напоминаний нет. */
  telegram: boolean;
}

export interface Task {
  text: string;
  done: boolean;
}

/** Поля блока, общие у шаблона и дня. */
export interface BlockFields {
  startMin: number;
  endMin: number;
  title: string;
  category: string;
  track: boolean;
}

export interface Item extends BlockFields {
  id: string;
  blockId: string | null;
  day: string;
  tasks: Task[];
  status: Status;
  outcome: Outcome;
  /** Когда сел, `ЧЧ:ММ`. */
  startedAt: string | null;
  lateMin: number | null;
  note: string | null;
}

export interface DayView {
  day: string;
  today: string;
  nowMin: number;
  edited: boolean;
  items: Item[];
  summary: Summary;
}

export interface Block extends BlockFields {
  id: string;
  /** Дни недели битами, пн = 1 … вс = 64. */
  days: number;
  tasks: string[];
}

export interface Summary {
  counted: number;
  done: number;
  partial: number;
  open: number;
  skipped: number;
  walk: number;
  missed: number;
  score: number | null;
  plannedMin: number;
  workedMin: number;
  lateAvg: number | null;
}

export interface Report extends Summary {
  today: string;
  nowMin: number;
  byDay: ({ day: string } & Summary)[];
  byCategory: ({ category: string } & Summary)[];
  streak: number;
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export function usePlanState() {
  return useQuery({
    queryKey: [...ROOT, 'state'],
    queryFn: () => apiJson<PlanState>(`${BASE}/state`),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

const dayKey = (day: string) => [...ROOT, 'day', day];

export function useDay(day: string | null) {
  return useQuery({
    queryKey: dayKey(day ?? ''),
    queryFn: () => apiJson<DayView>(`${BASE}/days/${day}`),
    enabled: day != null,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useTemplate() {
  return useQuery({
    queryKey: [...ROOT, 'template'],
    queryFn: () => apiJson<Block[]>(`${BASE}/template`),
  });
}

export function useStats(days: number) {
  return useQuery({
    queryKey: [...ROOT, 'stats', days],
    queryFn: () => apiJson<Report>(`${BASE}/stats?days=${days}`),
    refetchOnWindowFocus: true,
  });
}

/** Любая правка плана перечитывает всё: день, шаблон и отчёт связаны. */
function usePlanMutation<V, R = unknown>(request: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSettled: () => qc.invalidateQueries({ queryKey: ROOT }),
  });
}

/** Исход сразу после ответа — до перечитки, чтобы кнопки не мигали прежними. */
const OPTIMISTIC: Partial<Record<Status, Outcome>> = {
  started: 'started',
  done: 'done',
  partial: 'partial',
  skipped: 'skipped',
  walk: 'walk',
};

export interface ItemPatch extends Partial<BlockFields> {
  tasks?: Task[];
  status?: Status;
  note?: string;
}

/** Правка блока дня: ответ, отметка пункта, время или название. */
export function usePatchItem(day: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ItemPatch }) => apiJson(`${BASE}/items/${id}`, send('PATCH', patch)),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: dayKey(day) });
      qc.setQueryData<DayView>(dayKey(day), (d) =>
        d
          ? {
              ...d,
              items: d.items.map((i) =>
                i.id === id
                  ? { ...i, ...patch, outcome: (patch.status && OPTIMISTIC[patch.status]) || i.outcome }
                  : i,
              ),
            }
          : d,
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ROOT }),
  });
}

export function useAddItem(day: string) {
  return usePlanMutation((item: BlockFields & { tasks: Task[] }) =>
    apiJson(`${BASE}/days/${day}/items`, send('POST', item)),
  );
}

export function useDeleteItem() {
  return usePlanMutation((id: string) => apiJson(`${BASE}/items/${id}`, send('DELETE')));
}

export function useRebuildDay() {
  return usePlanMutation((day: string) => apiJson(`${BASE}/days/${day}/rebuild`, send('POST')));
}

export function useSaveBlock() {
  return usePlanMutation(({ id, block }: { id: string | null; block: Omit<Block, 'id'> }) =>
    id ? apiJson(`${BASE}/template/${id}`, send('PUT', block)) : apiJson(`${BASE}/template`, send('POST', block)),
  );
}

export function useDeleteBlock() {
  return usePlanMutation((id: string) => apiJson(`${BASE}/template/${id}`, send('DELETE')));
}

export function useSaveSettings() {
  return usePlanMutation((s: Settings) => apiJson(`${BASE}/settings`, send('PUT', s)));
}

export function useTestMessage() {
  return useMutation({ mutationFn: () => apiJson(`${BASE}/test`, send('POST')) });
}
