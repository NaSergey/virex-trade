'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { SessionDetail, TerminalAction, TerminalActions } from '@/widgets/backtest-session';
import {
  DemoError,
  addToTrade,
  cancelCloseOrder,
  cancelEntryOrder,
  closeGrid,
  closeTrade,
  createCloseOrder,
  createEntryOrders,
  emptyDemo,
  loadDemo,
  modifyTrade,
  moveCloseOrder,
  moveEntryOrder,
  openTrade,
  saveDemo,
  tick,
  toDetail,
  watchedSymbols,
  type DemoState,
} from '../lib/demoAccount';
import { fetchDemoPrices } from '../lib/demoMarket';

/** Как часто спрашивать цены для исполнения — столько же, сколько хвост графика. */
const PRICES_MS = 2000;

type Op<V> = (s: DemoState, vars: V, now: number) => DemoState;
type Exec = <V>(op: Op<V>, vars: V) => void;

/**
 * Действие терминала над демо-счётом — в форме мутации react-query, которой
 * терминал и думает. Исполняется сразу и синхронно, поэтому «в полёте» оно не
 * бывает; отказ — ошибка с текстом на языке страницы.
 */
function useLocalAction<V>(op: Op<V>, exec: Exec, fail: (e: unknown) => Error): TerminalAction<V> {
  const [last, setLast] = useState<{ error: Error | null; variables: V | undefined }>({ error: null, variables: undefined });

  const mutateAsync = useCallback(
    async (vars: V) => {
      try {
        exec(op, vars);
        setLast({ error: null, variables: vars });
      } catch (e) {
        const error = fail(e);
        setLast({ error, variables: vars });
        throw error;
      }
    },
    [op, exec, fail],
  );

  const mutate = useCallback(
    (vars: V, options?: { onSuccess?: () => void; onSettled?: () => void }) => {
      void mutateAsync(vars)
        .then(() => options?.onSuccess?.(), () => undefined)
        .finally(() => options?.onSettled?.());
    },
    [mutateAsync],
  );

  return { mutate, mutateAsync, isPending: false, isError: last.error != null, error: last.error, variables: last.variables };
}

// Обёртки — константы модуля: ссылка на операцию входит в зависимости действия.
const opOpen: Op<Parameters<typeof openTrade>[1]> = (s, v) => openTrade(s, v);
const opAdd: Op<Parameters<typeof addToTrade>[1]> = (s, v) => addToTrade(s, v);
const opModify: Op<Parameters<typeof modifyTrade>[1]> = (s, v) => modifyTrade(s, v);
const opClose: Op<Parameters<typeof closeTrade>[1]> = (s, v) => closeTrade(s, v);
const opCancelClose: Op<string> = (s, id) => cancelCloseOrder(s, id);
const opCancelEntry: Op<string> = (s, id) => cancelEntryOrder(s, id);
const opMoveClose: Op<Parameters<typeof moveCloseOrder>[1]> = (s, v) => moveCloseOrder(s, v);
const opNothing: Op<unknown> = (s) => s;

/**
 * Демо-счёт терминала на главной: снимок для `Terminal`, его действия и цены
 * монет вне графика. Счёт лежит в localStorage этого браузера и переживает
 * перезагрузку; на сервер не уходит ничего.
 *
 * Монтируется только в браузере (см. `TerminalDemo`): счёт читается из
 * хранилища прямо в начальном состоянии, без второго кадра.
 */
export function useDemoTerminal(): {
  detail: SessionDetail;
  actions: TerminalActions;
  priceOf: (symbol: string) => number | null;
} {
  const t = useTranslations('landing.term');
  const [state, setState] = useState<DemoState>(() => loadDemo(localStorage) ?? emptyDemo(Date.now()));
  // Действие считает следующий снимок от последнего, а не от отрисованного:
  // два действия подряд в одном обработчике иначе потеряли бы первое.
  const ref = useRef(state);
  const commit = useCallback((next: DemoState) => {
    ref.current = next;
    setState(next);
  }, []);

  useEffect(() => saveDemo(localStorage, state), [state]);

  const exec = useCallback<Exec>((op, vars) => commit(op(ref.current, vars, Date.now())), [commit]);
  const fail = useCallback(
    (e: unknown) => (e instanceof DemoError ? new Error(t(`errors.${e.code}`)) : e instanceof Error ? e : new Error(String(e))),
    [t],
  );

  const actions: TerminalActions = {
    open: useLocalAction(opOpen, exec, fail),
    addToTrade: useLocalAction(opAdd, exec, fail),
    modify: useLocalAction(opModify, exec, fail),
    close: useLocalAction(opClose, exec, fail),
    createCloseOrder: useLocalAction(createCloseOrder, exec, fail),
    cancelCloseOrder: useLocalAction(opCancelClose, exec, fail),
    createEntryOrders: useLocalAction(createEntryOrders, exec, fail),
    cancelEntryOrder: useLocalAction(opCancelEntry, exec, fail),
    moveEntryOrder: useLocalAction(moveEntryOrder, exec, fail),
    moveCloseOrder: useLocalAction(opMoveClose, exec, fail),
    closeGrid: useLocalAction(closeGrid, exec, fail),
    // Завершать демо-счёт нечего, теги у гостя выключены.
    finish: useLocalAction<void>(opNothing, exec, fail),
    tags: useLocalAction<{ tradeId: string; tagIds: string[] }>(opNothing, exec, fail),
  };

  // Исполнение: раз в две секунды цены монет, по которым есть позиции и лимиты, —
  // и стопы, тейки и лимиты, которых они достали. Нет ни того ни другого — молчит.
  const watched = useMemo(() => watchedSymbols(state).join(','), [state]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!watched) return;
    let alive = true;
    const symbols = watched.split(',');
    const pull = async () => {
      try {
        const fresh = await fetchDemoPrices(symbols);
        if (!alive) return;
        const now = Date.now();
        let next = ref.current;
        for (const [symbol, price] of Object.entries(fresh)) next = tick(next, symbol, price, now);
        if (next !== ref.current) commit(next);
        setPrices((prev) => ({ ...prev, ...fresh }));
      } catch {
        // Рынок не ответил — следующий опрос через две секунды.
      }
    };
    void pull();
    const timer = setInterval(() => void pull(), PRICES_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [watched, commit]);

  const detail = useMemo(() => toDetail(state), [state]);
  const priceOf = useCallback((symbol: string) => prices[symbol] ?? null, [prices]);

  return { detail, actions, priceOf };
}
