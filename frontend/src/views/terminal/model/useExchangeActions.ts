'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { apiJson, qs } from '@/shared/api/http';
import { DEFAULT_SYMBOL, type TerminalAction, type TerminalActions } from '@/widgets/backtest-session';
import { STATE_KEY } from '../api/hooks';
import type { TerminalState } from '../api/types';
import { parsePositionKey } from '../lib/adapt';

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

/**
 * Завершать на бирже нечего — счёт не сессия. Действие есть только потому, что
 * терминал один: кнопки «Завершить» у него нет и у сессии, а сам он зовёт его
 * лишь на конце истории, которого у живого рынка не бывает.
 */
const NOTHING: TerminalAction<void> = {
  mutate: () => undefined,
  mutateAsync: async () => undefined,
  isPending: false,
  isError: false,
  error: null,
  variables: undefined,
};

/**
 * Действие терминала — запросом к бирже через наш сервер.
 *
 * Перечитку счёта дожидаемся — и после отказа тоже: биржа могла отказать
 * потому, что состояние уже другое, и экран обязан показать то, что есть на
 * самом деле. Пока перечитка идёт, действие остаётся «в полёте», и отпущенная
 * на графике линия стоит на месте до прихода новой цены.
 *
 * Повторов нет намеренно (у закрытия сделки сессии их три): повтор рыночного
 * ордера после оборванного ответа — это второй ордер на настоящие деньги.
 */
function useAction<V>(fn: (vars: V) => Promise<unknown>): TerminalAction<V> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    retry: false,
    onSettled: () => qc.invalidateQueries({ queryKey: STATE_KEY }),
  });
}

/**
 * Действия терминала на бирже — тот же набор, что у сессии (`useSessionActions`),
 * только исполняет его Bybit.
 *
 * Экран думает сессией и шлёт время и цену исполнения, id сделки и id ордера;
 * бирже время и цена не нужны (их ставит она), а id переводятся: сделка — это
 * позиция «монета:сторона», ордеру для запроса нужна его монета.
 */
export function useExchangeActions(): TerminalActions {
  const qc = useQueryClient();
  const tt = useTranslations('terminal');

  const position = (tradeId: string) => {
    const p = parsePositionKey(tradeId);
    if (!p) throw new Error(tt('positionGone'));
    return p;
  };
  // Монета ордера — из последнего снимка счёта: экран знает только id.
  const symbolOf = (orderId: string) => {
    const order = qc.getQueryData<TerminalState>(STATE_KEY)?.orders.find((o) => o.id === orderId);
    if (!order) throw new Error(tt('orderGone'));
    return order.symbol;
  };

  const cancel = async (orderId: string) =>
    apiJson(`/api/terminal/orders/${orderId}${qs({ symbol: symbolOf(orderId) })}`, json('DELETE'));
  const move = async ({ orderId, price }: { orderId: string; price: number }) =>
    apiJson(`/api/terminal/orders/${orderId}`, json('PATCH', { symbol: symbolOf(orderId), price }));

  return {
    open: useAction((v) =>
      apiJson(
        '/api/terminal/orders',
        json('POST', {
          symbol: v.symbol ?? DEFAULT_SYMBOL,
          direction: v.direction,
          kind: 'market',
          riskPct: v.riskPct,
          stopLoss: v.stopLoss,
          takeProfit: v.takeProfit,
          leverage: v.leverage,
        }),
      ),
    ),
    // Долив позиции: объём сервер считает от её стопа, уровни позиции не трогаются.
    addToTrade: useAction(async (v) =>
      apiJson('/api/terminal/orders', json('POST', { ...position(v.tradeId), kind: 'market', riskPct: v.riskPct })),
    ),
    modify: useAction(async (v) =>
      apiJson(
        '/api/terminal/positions/levels',
        json('PATCH', {
          ...position(v.tradeId),
          // Ноль — «стопа нет»: на биржу он не уходит, стоп позиции остаётся как был.
          stopLoss: v.stopLoss != null && v.stopLoss > 0 ? v.stopLoss : undefined,
          takeProfit: v.takeProfit ?? null,
        }),
      ),
    ),
    close: useAction(async (v) =>
      apiJson('/api/terminal/positions/close', json('POST', { ...position(v.tradeId), kind: 'market', qty: v.qty })),
    ),
    createCloseOrder: useAction(async (v) =>
      apiJson(
        '/api/terminal/positions/close',
        json('POST', { ...position(v.tradeId), kind: 'limit', price: v.price, qty: v.qty }),
      ),
    ),
    cancelCloseOrder: useAction(cancel),
    createEntryOrders: useAction((v) =>
      apiJson(
        '/api/terminal/orders',
        json('POST', {
          symbol: v.symbol ?? DEFAULT_SYMBOL,
          direction: v.direction,
          kind: 'limit',
          prices: v.prices,
          riskPct: v.riskPct,
          stopLoss: v.stopLoss,
          takeProfit: v.takeProfit,
          leverage: v.leverage,
        }),
      ),
    ),
    cancelEntryOrder: useAction(cancel),
    moveEntryOrder: useAction(move),
    moveCloseOrder: useAction(move),
    // «Стоп за тейками» на биржу не уходит: двигать его там некому (окно его и не предлагает).
    closeGrid: useAction(async (v) =>
      apiJson('/api/terminal/positions/close-grid', json('POST', { ...position(v.tradeId), prices: v.prices })),
    ),
    finish: NOTHING,
    // Теги открытой позиции — те же, что на обзоре: синк перенесёт их на закрытую сделку.
    tags: useAction(async (v) => {
      const p = position(v.tradeId);
      await apiJson('/api/tags/position', json('PUT', { ...p, tagIds: v.tagIds }));
      await qc.invalidateQueries({ queryKey: ['positionTags', p.symbol, p.direction] });
    }),
  };
}
