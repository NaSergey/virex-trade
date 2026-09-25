import { Card } from '../games/cards';
import { bestHand, Category } from './hand-rank';

/**
 * Безлимитный холдем одной раздачей — чистые функции без БД и таймеров.
 * Рантайм стола (`PokerService`) держит состояние, сохраняет вклады и
 * рассылает вид; правила живут только здесь.
 *
 * Упрощение правил (записано в спеке): неполный олл-ин-рейз снова открывает
 * торговлю тем, кто уже действовал.
 */

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'done';

export interface HPlayer {
  userId: string;
  seatIndex: number;
  /** Фишки за спиной — ещё не в банке. */
  stack: number;
  /** Поставлено на текущей улице. */
  bet: number;
  /** Вложено в банк за всю раздачу, включая текущую улицу. */
  committed: number;
  folded: boolean;
  allIn: boolean;
  /** Действовал после последнего рейза — иначе торговля до него ещё не дошла. */
  acted: boolean;
  cards: Card[];
}

export interface HandWinner {
  userId: string;
  amount: number;
  category: Category | null;
}

export interface HandResult {
  /** Сколько каждый получает из банка — сверх уже списанного со стека. */
  payouts: Record<string, number>;
  winners: HandWinner[];
  /** Открытые руки на вскрытии; пусто, если все, кроме одного, сбросили. */
  shown: Record<string, Card[]>;
}

export interface HandState {
  players: HPlayer[];
  /** Индекс кнопки в `players`. */
  button: number;
  sb: number;
  bb: number;
  deck: Card[];
  board: Card[];
  street: Street;
  toAct: number | null;
  currentBet: number;
  /** Размер последнего полного рейза — меньше него перебить нельзя. */
  minRaise: number;
  result: HandResult | null;
}

export type Action =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  /** `to` — итоговая ставка на улице, а не добавка к ней. */
  | { type: 'raise'; to: number };

export class HoldemError extends Error {
  constructor(readonly code: 'NOT_YOUR_TURN' | 'BAD_ACTION' | 'HAND_OVER') {
    super(code);
  }
}

export interface Legal {
  toCall: number;
  canCheck: boolean;
  /** Нельзя рейзить вовсе (стека хватает только на колл) — `null`. */
  minRaiseTo: number | null;
  maxRaiseTo: number;
}

const canAct = (p: HPlayer) => !p.folded && !p.allIn;

function next(state: HandState, from: number, ok: (p: HPlayer) => boolean): number | null {
  const n = state.players.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (ok(state.players[i])) return i;
  }
  return null;
}

function put(p: HPlayer, amount: number) {
  const n = Math.min(amount, p.stack);
  p.stack -= n;
  p.bet += n;
  p.committed += n;
  if (p.stack === 0) p.allIn = true;
}

export interface StartSeat {
  userId: string;
  seatIndex: number;
  stack: number;
}

/**
 * Новая раздача. `prevButtonSeat` — номер места прошлой кнопки (или -1):
 * кнопка переходит к следующему занятому месту по кругу.
 */
export function startHand(seats: StartSeat[], prevButtonSeat: number, sb: number, bb: number, deck: Card[]): HandState {
  if (seats.length < 2) throw new Error('startHand: нужно минимум двое');
  const players: HPlayer[] = [...seats]
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((s) => ({ ...s, bet: 0, committed: 0, folded: false, allIn: false, acted: false, cards: [] }));
  let button = players.findIndex((p) => p.seatIndex > prevButtonSeat);
  if (button === -1) button = 0;

  const state: HandState = {
    players,
    button,
    sb,
    bb,
    deck: [...deck],
    board: [],
    street: 'preflop',
    toAct: null,
    currentBet: 0,
    minRaise: bb,
    result: null,
  };

  const n = players.length;
  // Хедз-ап: малый блайнд ставит сама кнопка.
  const sbIdx = n === 2 ? button : (button + 1) % n;
  const bbIdx = (sbIdx + 1) % n;
  put(players[sbIdx], sb);
  put(players[bbIdx], bb);
  for (let round = 0; round < 2; round++) {
    for (let k = 0; k < n; k++) players[(sbIdx + k) % n].cards.push(state.deck.shift()!);
  }
  state.currentBet = Math.max(players[sbIdx].bet, players[bbIdx].bet);
  state.toAct = next(state, bbIdx, canAct);
  progress(state, bbIdx);
  return state;
}

export function legal(state: HandState, userId: string): Legal | null {
  if (state.street === 'done' || state.toAct === null) return null;
  const p = state.players[state.toAct];
  if (p.userId !== userId) return null;
  const toCall = Math.max(0, state.currentBet - p.bet);
  const maxRaiseTo = p.bet + p.stack;
  const fullMin = state.currentBet + state.minRaise;
  const minRaiseTo = maxRaiseTo > state.currentBet ? Math.min(fullMin, maxRaiseTo) : null;
  return { toCall, canCheck: toCall === 0, minRaiseTo, maxRaiseTo };
}

/** Ход игрока. Возвращает новое состояние; прежнее не трогает. */
export function act(prev: HandState, userId: string, action: Action): HandState {
  if (prev.street === 'done') throw new HoldemError('HAND_OVER');
  const state = structuredClone(prev);
  const idx = state.toAct;
  if (idx === null || state.players[idx].userId !== userId) throw new HoldemError('NOT_YOUR_TURN');
  const p = state.players[idx];
  const lg = legal(state, userId)!;

  switch (action.type) {
    case 'fold':
      p.folded = true;
      break;
    case 'check':
      if (!lg.canCheck) throw new HoldemError('BAD_ACTION');
      break;
    case 'call':
      if (lg.toCall === 0) throw new HoldemError('BAD_ACTION');
      put(p, lg.toCall);
      break;
    case 'raise': {
      const to = Math.floor(action.to);
      if (lg.minRaiseTo === null || !Number.isFinite(to) || to < lg.minRaiseTo || to > lg.maxRaiseTo) {
        throw new HoldemError('BAD_ACTION');
      }
      const increment = to - state.currentBet;
      put(p, to - p.bet);
      if (increment >= state.minRaise) state.minRaise = increment;
      state.currentBet = to;
      for (const o of state.players) if (o !== p && canAct(o)) o.acted = false;
      break;
    }
  }
  p.acted = true;
  progress(state, idx);
  return state;
}

/**
 * Игрок уходит из-за стола посреди раздачи: это фолд вне очереди. Если ход
 * как раз его — обычный фолд, торговля идёт дальше.
 */
export function forceFold(prev: HandState, userId: string): HandState {
  if (prev.street === 'done') return prev;
  const idx = prev.players.findIndex((p) => p.userId === userId);
  if (idx === -1 || prev.players[idx].folded) return prev;
  if (prev.toAct === idx) return act(prev, userId, { type: 'fold' });
  const state = structuredClone(prev);
  state.players[idx].folded = true;
  // Поиск следующего идёт «после lastIdx», поэтому шаг назад: ход остаётся у
  // того, чей он был, если торговля ещё ждёт его.
  const n = state.players.length;
  progress(state, ((state.toAct ?? idx) - 1 + n) % n);
  return state;
}

/** После хода: следующий игрок, следующая улица или конец раздачи. */
function progress(state: HandState, lastIdx: number) {
  const live = state.players.filter((p) => !p.folded);
  if (live.length === 1) {
    finish(state);
    return;
  }
  const needs = (p: HPlayer) => canAct(p) && (!p.acted || p.bet < state.currentBet);
  // Торговать не с кем: действовать может один, и ему уже нечего уравнивать.
  const actors = state.players.filter(canAct);
  const roundOpen = actors.some(needs) && !(actors.length === 1 && actors[0].bet >= state.currentBet);
  if (roundOpen) {
    state.toAct = next(state, lastIdx, needs);
    return;
  }

  for (;;) {
    for (const p of state.players) {
      p.bet = 0;
      p.acted = false;
    }
    state.currentBet = 0;
    state.minRaise = state.bb;
    if (state.street === 'river') {
      finish(state);
      return;
    }
    state.deck.shift(); // сжечь
    if (state.street === 'preflop') {
      state.board.push(state.deck.shift()!, state.deck.shift()!, state.deck.shift()!);
      state.street = 'flop';
    } else {
      state.board.push(state.deck.shift()!);
      state.street = state.street === 'flop' ? 'turn' : 'river';
    }
    // Двое и больше могут торговать — улица играется; иначе карты докладываются
    // до ривера без остановок: все, кроме одного, уже в олл-ине.
    if (state.players.filter(canAct).length >= 2) {
      state.toAct = next(state, state.button, canAct);
      return;
    }
  }
}

interface Pot {
  amount: number;
  eligible: number[];
}

/** Банки по уровням вкладов: игрок в олл-ине претендует только на то, что сам покрыл. */
export function buildPots(players: HPlayer[]): Pot[] {
  const remaining = players.map((p) => p.committed);
  const pots: Pot[] = [];
  for (;;) {
    const live = players.map((_, i) => i).filter((i) => !players[i].folded && remaining[i] > 0);
    if (live.length === 0) break;
    const level = Math.min(...live.map((i) => remaining[i]));
    let amount = 0;
    for (let i = 0; i < players.length; i++) {
      const take = Math.min(remaining[i], level);
      remaining[i] -= take;
      amount += take;
    }
    const last = pots[pots.length - 1];
    // Соседние уровни с тем же составом — один банк, а не два одинаковых.
    if (last && last.eligible.join() === live.join()) last.amount += amount;
    else pots.push({ amount, eligible: live });
  }
  // Вложенное сброшенными сверх всех живых уровней — последнему банку.
  const leftover = remaining.reduce((a, b) => a + b, 0);
  if (leftover > 0 && pots.length) pots[pots.length - 1].amount += leftover;
  return pots;
}

function finish(state: HandState) {
  state.street = 'done';
  state.toAct = null;
  const payouts: Record<string, number> = {};
  const categories: Record<string, Category | null> = {};
  const shown: Record<string, Card[]> = {};
  const live = state.players.map((_, i) => i).filter((i) => !state.players[i].folded);

  if (live.length === 1) {
    const total = state.players.reduce((a, p) => a + p.committed, 0);
    const w = state.players[live[0]];
    payouts[w.userId] = total;
    categories[w.userId] = null;
  } else {
    const values = new Map<number, ReturnType<typeof bestHand>>();
    for (const i of live) {
      const p = state.players[i];
      values.set(i, bestHand([...p.cards, ...state.board]));
      shown[p.userId] = p.cards;
    }
    const n = state.players.length;
    // Порядок «слева от кнопки» — кому идёт нечётная фишка.
    const order = (i: number) => (i - state.button - 1 + n) % n;
    for (const pot of buildPots(state.players)) {
      const top = Math.max(...pot.eligible.map((i) => values.get(i)!.score));
      const winners = pot.eligible.filter((i) => values.get(i)!.score === top).sort((a, b) => order(a) - order(b));
      const share = Math.floor(pot.amount / winners.length);
      let odd = pot.amount - share * winners.length;
      for (const i of winners) {
        const id = state.players[i].userId;
        payouts[id] = (payouts[id] ?? 0) + share + (odd > 0 ? 1 : 0);
        if (odd > 0) odd--;
      }
    }
    for (const i of live) categories[state.players[i].userId] = values.get(i)!.category;
  }

  state.result = {
    payouts,
    shown,
    winners: Object.entries(payouts)
      .filter(([, amount]) => amount > 0)
      .map(([userId, amount]) => ({ userId, amount, category: categories[userId] ?? null })),
  };
}

export const potTotal = (state: HandState) => state.players.reduce((a, p) => a + p.committed, 0);
