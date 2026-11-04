'use client';

import { useSyncExternalStore } from 'react';
import type { RunRow } from '../api/hooks';
import { applyEffects, type EffectDeps } from './model/effects';
import { startRun, step, toRunRow, type Action, type RunState, type StartInput } from './model/engine';

/**
 * Забег страницы. Состояние — в localStorage после каждого действия: вкладку на
 * телефоне убивает система, и забег продолжается с того же хода. Стор внешний
 * (`useSyncExternalStore`): на сервере забега нет, в браузере он читается один
 * раз и дальше живёт в памяти.
 */
const RUN_KEY = 'virex.english.game.run';
const PENDING_KEY = 'virex.english.game.pending';

let current: RunState | null | undefined;
const listeners = new Set<() => void>();

function read(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    const parsed = raw ? (JSON.parse(raw) as RunState) : null;
    return parsed?.v === 1 && Array.isArray(parsed.map) ? parsed : null;
  } catch {
    return null;
  }
}

function snapshot(): RunState | null {
  if (current === undefined) current = read();
  return current;
}

function write(next: RunState | null) {
  current = next;
  try {
    if (next) localStorage.setItem(RUN_KEY, JSON.stringify(next));
    else localStorage.removeItem(RUN_KEY);
  } catch {
    // Хранилище закрыто — забег живёт до перезагрузки.
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Забеги, не ушедшие на сервер, — досылаются при следующем открытии игры. */
export function pendingRuns(): RunRow[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]') as RunRow[];
  } catch {
    return [];
  }
}

export function setPendingRuns(rows: RunRow[]): void {
  try {
    if (rows.length > 0) localStorage.setItem(PENDING_KEY, JSON.stringify(rows));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // Не записалось — забег потерян для меты, но не для учёбы: карточки уже сохранены.
  }
}

export interface RunDeps {
  effects: Omit<EffectDeps, 'now'>;
  /** Задания дня, выполненные к концу этого забега, — уходят в его статистику. */
  questsDone: (s: RunState) => string[];
  save: (row: RunRow) => void;
}

export function useRun(deps: RunDeps) {
  const run = useSyncExternalStore(subscribe, snapshot, () => null);

  const dispatch = (a: Action) => {
    const prev = snapshot();
    if (!prev) return;
    const out = step(prev, a);
    if (out.state === prev) return;
    let next = out.state;
    const now = Date.now();
    if (next.outcome && !prev.outcome) {
      next = { ...next, stats: { ...next.stats, quests: deps.questsDone(next) } };
    }
    write(next);
    applyEffects(out.effects, { ...deps.effects, now });
    if (next.outcome && !prev.outcome) deps.save(toRunRow(next, now));
  };

  return {
    run,
    dispatch,
    start: (input: StartInput) => write(startRun(input)),
    discard: () => write(null),
  };
}
