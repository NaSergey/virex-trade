import type { Level, Marker } from '../components/ReplayChart';
import type { BacktestCloseOrder, BacktestEntryOrder, BacktestTrade } from '../api/types';
import { fromScreen, levelMove, liquidationPrice, openPnl, pendingEntryQty, toScreen } from './money';
import { takeOdds } from './odds';

/** Что нужно, чтобы нарисовать позиции и ордера одной монеты. */
export interface PositionLevelsInput {
  /** Открытые сделки монеты графика. */
  trades: readonly BacktestTrade[];
  closeOrders: readonly BacktestCloseOrder[];
  entryOrders: readonly BacktestEntryOrder[];
  symbol: string;
  scale: number;
  /** Настоящая цена монеты — PnL на плашке входа. */
  livePrice: number | null;
  /** Та же цена в экранном масштабе — шанс тейка. */
  screenPrice: number | null;
  balance: number;
  qtyStepOf: (symbol: string) => number;
  /** false — неактивный график сетки: уровни видны, но не тянутся. */
  draggable: boolean;
  /** Эксперимент «Шанс тейка». */
  oddsOn: boolean;
  /** Подпись подводящего стопа («подв. стоп»). */
  trailName: string;
  /** Уровень, который сейчас тянут (до ответа сервера), — рисуется на новой цене. */
  pendingLevel?: { tradeId: string; kind: 'stop' | 'take'; price: number } | null;
  /** Висящий ордер, который сейчас тянут. */
  pendingOrder?: { id: string; price: number } | null;
}

/**
 * Уровни открытых позиций монеты (вход, ликвидация, стоп, тейк, лимиты
 * закрытия) и висящие лимиты на вход — без черновика ордера и сетки фиксации:
 * их добавляет экран терминала. Один расчёт на активный график и неактивные
 * графики сетки, у тех — без перетаскивания.
 */
export function positionLevels(input: PositionLevelsInput): Level[] {
  const { trades, closeOrders, entryOrders, symbol, scale, livePrice, screenPrice, balance, qtyStepOf, draggable, oddsOn, trailName } =
    input;
  const pendingLevel = input.pendingLevel ?? null;
  const pendingOrder = input.pendingOrder ?? null;
  const list: Level[] = [];

  // Уровни уже открытых сделок монеты графика — от их собственных
  // stopLoss/takeProfit, не от черновика панели: с хеджем сделок может быть
  // две, у каждой свои уровни.
  for (const trade of trades) {
    if (trade.symbol !== symbol) continue;
    const remaining = trade.qty - trade.closedQty;
    const impactAt = (qty: number) => (p: number) => levelMove(trade.direction, trade.entryPrice, fromScreen(p, scale), qty);
    const pending = pendingLevel?.tradeId === trade.id ? pendingLevel : null;
    list.push({
      id: `entry-${trade.id}`,
      kind: 'entry',
      tradeId: trade.id,
      price: toScreen(trade.entryPrice, scale),
      draggable: false,
      qty: remaining,
      direction: trade.direction,
      pnl: openPnl(trade, livePrice),
    });
    // Биржа называет цену ликвидации сама (или не называет вовсе — null); у сделки сессии она считается.
    const liq = trade.liqPrice !== undefined ? trade.liqPrice : liquidationPrice(trade.direction, trade.entryPrice, trade.leverage);
    if (liq != null) {
      list.push({ id: `liq-${trade.id}`, kind: 'liq', tradeId: trade.id, price: toScreen(liq, scale), draggable: false });
    }
    // Тейк позиции (или тот, что тянут) — нужен и линии стопа: шанс стопа — зеркало шанса тейка.
    const takeNow = pending?.kind === 'take' ? pending.price : trade.takeProfit != null ? toScreen(trade.takeProfit, scale) : null;
    // Стопа у позиции биржи может не быть (0): линии тогда нет, пока её не потянут от плашки.
    if (trade.stopLoss > 0 || pending?.kind === 'stop') {
      list.push({
        id: `stop-${trade.id}`,
        kind: 'stop',
        tradeId: trade.id,
        price: pending?.kind === 'stop' ? pending.price : toScreen(trade.stopLoss, scale),
        draggable,
        qty: remaining,
        impactAt: impactAt(remaining),
        name: trade.trailDist != null ? trailName : undefined,
        // Шанс стопа — 100 % минус шанс тейка: исходов два. Пока стоп тянут, число считается на цене под курсором.
        oddsAt:
          oddsOn && takeNow != null && screenPrice != null
            ? (p) => {
                const take = takeOdds(screenPrice, p, takeNow);
                return take != null ? 100 - take : null;
              }
            : undefined,
      });
    }
    const take = pending?.kind === 'take' ? pending.price : trade.takeProfit != null ? toScreen(trade.takeProfit, scale) : null;
    if (take != null) {
      // Шанс — от текущей цены и стопа, каким он стоит (или его тянут): меняется вместе с ценой.
      const stopNow = pending?.kind === 'stop' ? pending.price : trade.stopLoss > 0 ? toScreen(trade.stopLoss, scale) : null;
      list.push({
        id: `take-${trade.id}`,
        kind: 'take',
        tradeId: trade.id,
        price: take,
        draggable,
        qty: remaining,
        impactAt: impactAt(remaining),
        oddsAt: oddsOn && stopNow != null && screenPrice != null ? (p) => takeOdds(screenPrice, stopNow, p) : undefined,
      });
    }
    for (const o of closeOrders) {
      if (o.tradeId !== trade.id) continue;
      list.push({
        id: o.id,
        kind: 'limitClose',
        tradeId: o.tradeId,
        price: pendingOrder?.id === o.id ? pendingOrder.price : toScreen(o.price, scale),
        draggable,
        qty: o.qty,
        impactAt: impactAt(o.qty),
      });
    }
  }
  // Ещё не сработавшие лимиты на вход — независимо от того, есть ли уже
  // сделка этого направления: до срабатывания это не её уровень. Объём — тот,
  // что сервер посчитает на срабатывании (`pendingEntryQty`), тот же, что в
  // таблице ордеров. Депозит к срабатыванию может смениться, поэтому число — на сейчас.
  for (const o of entryOrders) {
    if (o.symbol !== symbol) continue;
    const posStop = trades.find((x) => x.symbol === symbol && x.direction === o.direction)?.stopLoss;
    const qty = pendingEntryQty(o, posStop, balance, qtyStepOf(o.symbol)) ?? undefined;
    const price = pendingOrder?.id === o.id ? pendingOrder.price : toScreen(o.price, scale);
    list.push({ id: o.id, kind: 'pendingEntry', price, draggable, qty });
  }
  return list;
}

/**
 * Отметки сделок монеты на графике: где вошли и где вышли. Из всех сделок, не
 * только открытых: разбор в том и состоит, чтобы видеть свои прошлые входы на
 * тех же свечах, а не только в таблице.
 */
export function tradeMarkers(trades: readonly BacktestTrade[], symbol: string, scale: number): Marker[] {
  const list: Marker[] = [];
  for (const trade of trades) {
    if (trade.symbol !== symbol) continue;
    // Одна стрелка на каждое исполнение (открытие + каждый добор сеткой), а
    // не одна на entryPrice/entryTime сделки — те усреднены по всем входам и
    // держат только время самого первого. У сделок, заведённых до этой
    // истории, entries пуст — тогда синтезируем одну запись из самой сделки,
    // иначе старые сессии остались бы вовсе без стрелки входа.
    const entries = trade.entries.length > 0 ? trade.entries : [{ id: trade.id, qty: trade.qty, price: trade.entryPrice, time: trade.entryTime }];
    for (const entry of entries) {
      // Время открытия позиции биржи бывает неизвестно — стрелку ставить некуда.
      if (!Number.isFinite(Date.parse(entry.time))) continue;
      list.push({
        id: `m-entry-${trade.id}-${entry.id}`,
        kind: 'entry',
        time: Date.parse(entry.time),
        price: toScreen(entry.price, scale),
        direction: trade.direction,
      });
    }
    if (trade.exitTime != null && trade.exitPrice != null) {
      list.push({
        id: `m-exit-${trade.id}`,
        kind: 'exit',
        time: Date.parse(trade.exitTime),
        price: toScreen(trade.exitPrice, scale),
        direction: trade.direction,
        // Ноль — не прибыль и не убыток: у такой сделки нейтральный цвет.
        tone: trade.pnl == null || trade.pnl === 0 ? null : trade.pnl > 0 ? 'profit' : 'loss',
      });
    }
  }
  return list;
}
