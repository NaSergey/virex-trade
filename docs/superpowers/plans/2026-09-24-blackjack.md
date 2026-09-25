# Блэкджек Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Блэкджек против крупье-казино поверх общих столов игр и общий стол карточных игр, из которого собраны и покер, и блэкджек.

**Architecture:** Бэкенд — модуль `backend/src/blackjack` по образцу `poker`: правила чистыми функциями (`blackjack.ts`), вид стола (`blackjack-view.ts`), рантайм раунда в памяти `api` с очередью на стол (`BlackjackService` как `TableEngine`), деньги — транзакциями в `GameSeat`/`GameHand`. Фронтенд — стол покера выносится в `widgets/card-table` (сцена, оболочка страницы, карты, фишки, крупье, летящие предметы по точкам стола, сокет, лобби), покер пересобирается на нём, блэкджек — `views/blackjack-lobby` и `views/blackjack-table`.

**Tech Stack:** NestJS + Prisma + socket.io (jest), Next.js App Router + FSD + React Query + next-intl (vitest).

Спека: `docs/superpowers/specs/2026-09-24-blackjack-design.md`.

## Global Constraints

- Против крупье-казино; 6 колод, тасовка на каждый раунд; крупье стоит на всех 17; закрытая карта с проверкой блэкджека; блэкджек 3:2 с округлением вниз; дабл на любые две (и после сплита, кроме тузов); сплит одинакового достоинства до 4 рук, тузы — по одной карте; 21 после сплита — 1:1. Без страховки и сдачи.
- `minBet ≥ 2`, `maxBet ≥ minBet`, `minBuyIn ≥ minBet`; мест 1–7.
- Окно ставок 15 с, ход 20 с, пауза после раунда 6 с.
- Ставка окна в памяти, со стека не списана; сдача — одна транзакция; дабл/сплит — транзакция; расчёт — в транзакции последнего хода. Ушедшему выигрыш — `GAME_PAYOUT`, `refId = <GameHand.id>:<userId>`.
- Возврат прерванных раздач — в `GamesService`, а не в `PokerService`.
- Общие классы стола — `ct-`, покерные — `pk-`, блэкджека — `bj-`.
- Коммиты — только по просьбе пользователя (на ветке лежит незакоммиченный покер); шаги «Commit» в этом плане заменены проверками.
- Никаких браузерных проверок (Playwright): tsc, eslint, vitest, jest, `next build`, сквозной прогон API скриптом.

---

### Task 1: Общий слой столов — карты, лимиты ставок, возврат раздач

**Files:**
- Move: `backend/src/poker/cards.ts` → `backend/src/games/cards.ts`; импорты в `poker/holdem.ts`, `poker/hand-rank.ts`, `poker/poker-view.ts`, `poker/poker.service.ts`, спеках покера
- Modify: `backend/prisma/schema.prisma` (GameTable: `minBet`, `maxBet`; комментарии GameHand и CoinTransaction.refId)
- Modify: `backend/src/games/games.config.ts`, `dto/game-table.dto.ts`, `game-errors.ts`, `games.service.ts`, `games.service.spec.ts`
- Modify: `backend/src/coins/coins.service.ts` (`GAME_PAYOUT`)
- Modify: `backend/src/poker/poker.service.ts` (убрать `onApplicationBootstrap`/`voidHand`)

**Interfaces:**
- Produces: `import { Card, freshDeck, shuffled, rankOf, suitOf } from '../games/cards'`; `BLACKJACK_MIN_BET = 2`; `gameBadBets()` (`GAME_BAD_BETS`); `CoinTxKind` + `'GAME_PAYOUT'`; `GameTable.minBet/maxBet: number | null`; `GamesService.onApplicationBootstrap()` возвращает вклады открытых `GameHand`.

- [ ] **Step 1:** `mv backend/src/poker/cards.ts backend/src/games/cards.ts`, заменить `from './cards'` → `from '../games/cards'` во всех файлах `backend/src/poker/`.
- [ ] **Step 2: Тесты создания стола блэкджека (падают).** В `games.service.spec.ts` к `TABLE` добавить `minBet: 10, maxBet: 100`, и в `describe('GamesService.create')`:

```ts
  it('блэкджек без лимитов ставки отклоняется', async () => {
    const h = makeService();
    const { minBet: _a, maxBet: _b, ...noBets } = TABLE;
    await expect(h.service.create('u1', noBets)).rejects.toMatchObject({ response: { code: 'GAME_BAD_BETS' } });
  });

  it.each([
    ['минимальная ставка меньше двух', { minBet: 1 }],
    ['«до» меньше «от»', { minBet: 50, maxBet: 20 }],
    ['минимальный buy-in меньше минимальной ставки', { minBet: 200, maxBet: 300 }],
  ])('%s — GAME_BAD_BETS', async (_name, over) => {
    const h = makeService();
    await expect(h.service.create('u1', { ...TABLE, ...over })).rejects.toMatchObject({
      response: { code: 'GAME_BAD_BETS' },
    });
  });

  it('лимиты ставки сохраняются на столе блэкджека', async () => {
    const h = makeService();
    const table = await h.service.create('u1', TABLE);
    expect(table).toMatchObject({ minBet: 10, maxBet: 100, bigBlind: null });
  });
```

- [ ] **Step 3:** `cd backend && npx jest src/games/games.service.spec.ts` — новые тесты FAIL.
- [ ] **Step 4: Реализация.**
  - `games.config.ts`: `export const BLACKJACK_MIN_BET = 2;` с комментарием «меньше двух 3:2 вырождается в 1:1».
  - `game-errors.ts`: `gameBadBets = () => new BadRequestException({ message: 'Ставка — от 2 монет, «до» не меньше «от», минимальный buy-in — не меньше минимальной ставки', code: 'GAME_BAD_BETS' })`.
  - DTO: `@IsOptional() @IsInt() @Min(1) @Max(MAX_COINS_AMOUNT) minBet?: number;` и так же `maxBet?` («Только блэкджек, и там обязательны — проверяет `GamesService.create`»).
  - `GamesService.create`: после проверки блайндов

```ts
    const bets = dto.gameType === 'blackjack' ? { minBet: dto.minBet, maxBet: dto.maxBet } : null;
    if (
      bets &&
      (!bets.minBet || !bets.maxBet || bets.minBet < BLACKJACK_MIN_BET || bets.maxBet < bets.minBet || dto.minBuyIn < bets.minBet)
    ) {
      throw gameBadBets();
    }
```
    и в `data`: `minBet: bets?.minBet ?? null, maxBet: bets?.maxBet ?? null`.
  - schema: в `GameTable` после `bigBlind` — `/// Лимиты ставки блэкджека на руку; у покера пусто.` `minBet Int?` `maxBet Int?`; комментарий `GameHand` — «Раздача карточной игры (покер, раунд блэкджека) — страховка денег…»; `contributions` — `{ userId: вложено (в банк покера, на руки блэкджека) }`; в комментарий `refId` журнала — строка `<GameHand.id>:<userId>` — `GAME_PAYOUT` выигрыша блэкджека тому, кто встал посреди раунда.
  - `coins.service.ts`: `| 'GAME_PAYOUT'` после `'GAME_REFUND'`.
  - Возврат раздач: перенести `onApplicationBootstrap` и `voidHand` из `PokerService` в `GamesService` дословно (`implements OnApplicationBootstrap`, `Logger`, `runsApiJobs` из `../role`), комментарий — «`GameHand` общий у покера и блэкджека: вклады прерванной перезапуском раздачи возвращаются одинаково». Из `PokerService` убрать `OnApplicationBootstrap`, `voidHand`, импорт `runsApiJobs`.
- [ ] **Step 5:** `npx prisma db push` (если `nest watch` держит движок — EPERM на generate: остановить backend, `npx prisma generate`, поднять), затем `npx jest src/games src/poker` — PASS, `npx tsc --noEmit -p tsconfig.json` — чисто.

---

### Task 2: Правила блэкджека чистыми функциями  ⚠ важная — ревью субагентом

**Files:**
- Create: `backend/src/blackjack/blackjack.ts`
- Test: `backend/src/blackjack/blackjack.spec.ts`

**Interfaces:**
- Consumes: `Card, freshDeck, shuffled` из `../games/cards`.
- Produces:
```ts
export type Outcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';
export type BjActionType = 'hit' | 'stand' | 'double' | 'split';
export interface BjHand { cards: Card[]; bet: number; doubled: boolean; split: boolean; done: boolean; outcome: Outcome | null; payout: number }
export interface BjPlayer { userId: string; seatIndex: number; stack: number; hands: BjHand[] }
export interface RoundState { phase: 'playing' | 'done'; players: BjPlayer[]; dealer: Card[]; shoe: Card[]; turn: { p: number; h: number } | null; payouts: Record<string, number> | null }
export interface BjLegal { hit: boolean; stand: boolean; double: boolean; split: boolean }
export class BlackjackError extends Error { code: 'NOT_YOUR_TURN' | 'ILLEGAL' }
export function newShoe(rand?: (n: number) => number): Card[];
export function cardPoints(c: Card): number;
export function handValue(cards: Card[]): { total: number; soft: boolean };
export function isNatural(h: { cards: Card[]; split: boolean }): boolean;
export function startRound(entries: { userId: string; seatIndex: number; stack: number; bet: number }[], shoe: Card[]): RoundState;
export function legal(s: RoundState, userId: string): BjLegal | null;
export function act(s: RoundState, userId: string, type: BjActionType): RoundState;
export function standAll(s: RoundState, userId: string): RoundState;
export function wagered(s: RoundState): Record<string, number>;
```

Порядок сдачи в тестах: одному игроку — `[p1, dUp, p2, dHole, ...добор]`; двоим — `[a1, b1, dUp, a2, b2, dHole, ...]`.

- [ ] **Step 1: Тесты.**

```ts
import { act, handValue, legal, standAll, startRound, wagered } from './blackjack';

const one = (bet: number, cards: string[], stack = 1000) =>
  startRound([{ userId: 'a', seatIndex: 0, stack, bet }], cards);

describe('handValue', () => {
  it.each([
    [['As', '6d'], 17, true],
    [['As', '6d', 'Kc'], 17, false],
    [['As', 'Ad'], 12, true],
    [['Kd', 'Qs', '2c'], 22, false],
    [['As', 'Kd'], 21, true],
  ])('%j → %i', (cards, total, soft) => {
    expect(handValue(cards)).toEqual({ total, soft });
  });
});

describe('startRound', () => {
  it('натуральный блэкджек платит 3:2 с округлением вниз, крупье не добирает', () => {
    const s = one(5, ['As', '9c', 'Kd', '7h', '5s']);
    expect(s.phase).toBe('done');
    expect(s.dealer).toEqual(['9c', '7h']);
    expect(s.players[0].hands[0]).toMatchObject({ outcome: 'blackjack', payout: 12 });
    expect(s.payouts).toEqual({ a: 12 });
  });

  it('блэкджек крупье кончает раунд до первого хода', () => {
    const s = one(10, ['Td', 'As', '9s', 'Kh']);
    expect(s.phase).toBe('done');
    expect(s.players[0].hands[0]).toMatchObject({ outcome: 'lose', payout: 0 });
  });

  it('блэкджек против блэкджека крупье — ничья', () => {
    const s = one(10, ['Ad', 'As', 'Kd', 'Kh']);
    expect(s.players[0].hands[0]).toMatchObject({ outcome: 'push', payout: 10 });
  });

  it('ход начинается с первого по порядку мест', () => {
    const s = startRound(
      [
        { userId: 'b', seatIndex: 3, stack: 100, bet: 10 },
        { userId: 'a', seatIndex: 1, stack: 100, bet: 10 },
      ],
      ['Td', '9d', '6c', '7d', '8d', 'Kc'],
    );
    expect(s.players.map((p) => p.userId)).toEqual(['a', 'b']);
    expect(s.turn).toEqual({ p: 0, h: 0 });
    expect(legal(s, 'b')).toBeNull();
    expect(legal(s, 'a')).toMatchObject({ hit: true, stand: true });
  });
});

describe('act', () => {
  it('крупье стоит на мягких 17', () => {
    const s = act(one(10, ['Td', 'As', '9s', '6d', '5c']), 'a', 'stand');
    expect(s.dealer).toEqual(['As', '6d']);
    expect(s.players[0].hands[0]).toMatchObject({ outcome: 'win', payout: 20 });
  });

  it('крупье добирает до 17', () => {
    const s = act(one(10, ['Td', 'Kc', '9s', '6d', '5h']), 'a', 'stand');
    expect(s.dealer).toEqual(['Kc', '6d', '5h']);
    expect(s.players[0].hands[0]).toMatchObject({ outcome: 'lose', payout: 0 });
  });

  it('равный счёт — ничья', () => {
    const s = act(one(10, ['Td', 'Kc', '8s', '8d']), 'a', 'stand');
    expect(s.players[0].hands[0]).toMatchObject({ outcome: 'push', payout: 10 });
  });

  it('дабл: ставка вдвое, ровно одна карта, стек уменьшается', () => {
    const s = act(one(10, ['5d', '9s', '6c', '7h', 'Kd', '2c'], 100), 'a', 'double');
    const h = s.players[0].hands[0];
    expect(h).toMatchObject({ cards: ['5d', '6c', 'Kd'], bet: 20, doubled: true, outcome: 'win', payout: 40 });
    expect(s.players[0].stack).toBe(90);
    expect(wagered(s)).toEqual({ a: 20 });
  });

  it('дабл без стека недоступен', () => {
    const s = one(10, ['5d', '9s', '6c', '7h'], 5);
    expect(legal(s, 'a')!.double).toBe(false);
    expect(() => act(s, 'a', 'double')).toThrow('ILLEGAL');
  });

  it('перебор кончает руку, крупье при одних переборах не добирает', () => {
    const s = act(one(10, ['Td', '9s', '6c', '6d', 'Kh', '2c']), 'a', 'hit');
    expect(s.phase).toBe('done');
    expect(s.dealer).toEqual(['9s', '6d']);
    expect(s.players[0].hands[0]).toMatchObject({ outcome: 'bust', payout: 0 });
  });

  it('21 заканчивает руку сама', () => {
    const s = act(one(10, ['5d', '9s', '6c', '7h', 'Td', '2c']), 'a', 'hit');
    expect(s.players[0].hands[0].done).toBe(true);
    expect(s.phase).toBe('done');
  });

  it('сплит: две руки со своей ставкой, вторые карты сразу, ход на первой', () => {
    const s = act(one(10, ['8d', '9s', '8s', '7h', '3c', '2h'], 100), 'a', 'split');
    const [h1, h2] = s.players[0].hands;
    expect(h1).toMatchObject({ cards: ['8d', '3c'], bet: 10, split: true, done: false });
    expect(h2).toMatchObject({ cards: ['8s', '2h'], bet: 10, split: true, done: false });
    expect(s.players[0].stack).toBe(90);
    expect(s.turn).toEqual({ p: 0, h: 0 });
    expect(wagered(s)).toEqual({ a: 20 });
  });

  it('любые две десятки делятся', () => {
    expect(legal(one(10, ['Kd', '9s', 'Js', '7h']), 'a')!.split).toBe(true);
  });

  it('тузы делятся один раз, по одной карте, и 21 на них платит 1:1', () => {
    const s = act(one(10, ['Ad', '9s', 'As', '8h', 'Kc', '5h'], 100), 'a', 'split');
    const [h1, h2] = s.players[0].hands;
    expect(s.phase).toBe('done');
    expect(h1).toMatchObject({ cards: ['Ad', 'Kc'], outcome: 'win', payout: 20 });
    expect(h2).toMatchObject({ cards: ['As', '5h'], outcome: 'lose', payout: 0 });
  });

  it('не больше четырёх рук', () => {
    let s = one(10, ['8d', '9s', '8s', '7h', '8c', '8h', '8d', '2c', '3c', '4c', '5c'], 100);
    s = act(s, 'a', 'split');
    s = act(s, 'a', 'split');
    s = act(s, 'a', 'split');
    expect(s.players[0].hands).toHaveLength(4);
    expect(legal(s, 'a')!.split).toBe(false);
  });

  it('чужой ход — NOT_YOUR_TURN', () => {
    expect(() => act(one(10, ['Td', '9s', '6c', '7h']), 'b', 'hit')).toThrow('NOT_YOUR_TURN');
  });

  it('исходное состояние не меняется', () => {
    const s = one(10, ['Td', '9s', '6c', '7h', '5d']);
    const copy = structuredClone(s);
    act(s, 'a', 'hit');
    expect(s).toEqual(copy);
  });
});

describe('standAll', () => {
  it('все руки игрока стоят, ход уходит дальше', () => {
    const s = startRound(
      [
        { userId: 'a', seatIndex: 0, stack: 100, bet: 10 },
        { userId: 'b', seatIndex: 1, stack: 100, bet: 10 },
      ],
      ['Td', '9d', '6c', '7d', '8d', 'Kc'],
    );
    const next = standAll(s, 'a');
    expect(next.players[0].hands[0].done).toBe(true);
    expect(next.turn).toEqual({ p: 1, h: 0 });
  });
});
```

Проверка «не больше четырёх рук»: после первого сплита рука 1 = `8d`+`8c`, рука 2 = `8s`+`8h`; второй сплит руки 1 → `8d`+`8d`, `8c`+`2c`; третий → `8d`+`3c`, `8d`+`4c`. Если колода в тесте кончится раньше, поправить порядок карт, а не правило.

- [ ] **Step 2:** `npx jest src/blackjack/blackjack.spec.ts` — FAIL (модуля нет).
- [ ] **Step 3: Реализация `blackjack.ts`.**

```ts
import { Card, freshDeck, shuffled } from '../games/cards';

/**
 * Правила блэкджека — чистые функции, без БД и таймеров, как `poker/holdem.ts`.
 * Каждая функция возвращает новое состояние; рантайм стола (`BlackjackService`)
 * только хранит его, пишет деньги и рассылает вид.
 *
 * Правила (спека `2026-09-24-blackjack-design.md`): 6 колод, крупье стоит на
 * всех 17, закрытая карта с проверкой блэкджека, блэкджек 3:2 с округлением
 * вниз, дабл на любые две, сплит до четырёх рук, тузы — по одной карте.
 */

export const DECKS = 6;
export const MAX_HANDS = 4;

export type Outcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';
export type BjActionType = 'hit' | 'stand' | 'double' | 'split';

export interface BjHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  /** Рука из сплита: 21 на ней — не блэкджек. */
  split: boolean;
  done: boolean;
  outcome: Outcome | null;
  /** Возвращено на руку при расчёте: ставка + выигрыш. */
  payout: number;
}

export interface BjPlayer {
  userId: string;
  seatIndex: number;
  /** Фишки за спиной: всё поставленное в этом раунде уже вычтено. */
  stack: number;
  hands: BjHand[];
}

export interface RoundState {
  phase: 'playing' | 'done';
  /** По порядку мест — в нём же сдача и ходы. */
  players: BjPlayer[];
  /** Вторая карта — закрытая, пока раунд идёт. */
  dealer: Card[];
  shoe: Card[];
  turn: { p: number; h: number } | null;
  /** userId → возвращено всего; есть только после расчёта. */
  payouts: Record<string, number> | null;
}

export interface BjLegal {
  hit: boolean;
  stand: boolean;
  double: boolean;
  split: boolean;
}

export class BlackjackError extends Error {
  constructor(public readonly code: 'NOT_YOUR_TURN' | 'ILLEGAL') {
    super(code);
  }
}

/** Башмак на раунд: шесть колод, перетасованных заново каждый раз. */
export function newShoe(rand?: (n: number) => number): Card[] {
  const cards: Card[] = [];
  for (let i = 0; i < DECKS; i++) cards.push(...freshDeck());
  return shuffled(cards, rand);
}

/** Очки карты: туз — 11 (мягкость считает `handValue`), картинки — 10. */
export function cardPoints(c: Card): number {
  const r = c[0];
  if (r === 'A') return 11;
  if ('TJQK'.includes(r)) return 10;
  return Number(r);
}

/** Сумма руки. Мягкая — если туз ещё считается за 11. */
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardPoints(c);
    if (c[0] === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export const isNatural = (h: { cards: Card[]; split: boolean }) =>
  !h.split && h.cards.length === 2 && handValue(h.cards).total === 21;

function draw(s: RoundState): Card {
  const c = s.shoe.shift();
  if (!c) throw new Error('shoe is empty');
  return c;
}

const newHand = (bet: number, cards: Card[] = [], split = false): BjHand => ({
  cards,
  bet,
  doubled: false,
  split,
  done: false,
  outcome: null,
  payout: 0,
});

/**
 * Сдача: по кругу по порядку мест — первая карта каждому, крупье, вторая
 * каждому, закрытая крупье. Блэкджек крупье проверяется сразу и кончает
 * раунд до первого хода (с закрытой картой он возможен, только когда открыт
 * туз или десятка).
 */
export function startRound(
  entries: { userId: string; seatIndex: number; stack: number; bet: number }[],
  shoe: Card[],
): RoundState {
  const s: RoundState = {
    phase: 'playing',
    players: [...entries]
      .sort((a, b) => a.seatIndex - b.seatIndex)
      .map((e) => ({ userId: e.userId, seatIndex: e.seatIndex, stack: e.stack, hands: [newHand(e.bet)] })),
    dealer: [],
    shoe: [...shoe],
    turn: null,
    payouts: null,
  };
  for (let round = 0; round < 2; round++) {
    for (const p of s.players) p.hands[0].cards.push(draw(s));
    s.dealer.push(draw(s));
  }
  for (const p of s.players) if (handValue(p.hands[0].cards).total === 21) p.hands[0].done = true;
  if (isNatural({ cards: s.dealer, split: false })) return finish(s, false);
  return advance(s);
}

/** Что может игрок, чей сейчас ход. Не его ход — `null`. */
export function legal(s: RoundState, userId: string): BjLegal | null {
  if (s.phase !== 'playing' || !s.turn) return null;
  const p = s.players[s.turn.p];
  if (p.userId !== userId) return null;
  const h = p.hands[s.turn.h];
  const two = h.cards.length === 2;
  const splitAces = h.split && h.cards[0][0] === 'A';
  return {
    hit: true,
    stand: true,
    double: two && !splitAces && p.stack >= h.bet,
    split:
      two &&
      !splitAces &&
      cardPoints(h.cards[0]) === cardPoints(h.cards[1]) &&
      p.hands.length < MAX_HANDS &&
      p.stack >= h.bet,
  };
}

export function act(state: RoundState, userId: string, type: BjActionType): RoundState {
  const ok = legal(state, userId);
  if (!ok) throw new BlackjackError('NOT_YOUR_TURN');
  if (!ok[type]) throw new BlackjackError('ILLEGAL');
  const s = structuredClone(state);
  const { p: pi, h: hi } = s.turn!;
  const p = s.players[pi];
  const h = p.hands[hi];
  switch (type) {
    case 'hit':
      h.cards.push(draw(s));
      if (handValue(h.cards).total >= 21) h.done = true;
      break;
    case 'stand':
      h.done = true;
      break;
    case 'double':
      p.stack -= h.bet;
      h.bet *= 2;
      h.doubled = true;
      h.cards.push(draw(s));
      h.done = true;
      break;
    case 'split': {
      // Вторые карты обеим рукам — сразу: исходы от этого не меняются, а
      // стол не ждёт, пока доиграна первая рука.
      p.stack -= h.bet;
      const aces = h.cards[0][0] === 'A';
      const first = newHand(h.bet, [h.cards[0], draw(s)], true);
      const second = newHand(h.bet, [h.cards[1], draw(s)], true);
      for (const x of [first, second]) if (aces || handValue(x.cards).total === 21) x.done = true;
      p.hands.splice(hi, 1, first, second);
      break;
    }
  }
  return advance(s);
}

/** Все оставшиеся руки игрока стоят: истёк ход или игрок встал из-за стола. */
export function standAll(state: RoundState, userId: string): RoundState {
  if (state.phase !== 'playing') return state;
  const s = structuredClone(state);
  const p = s.players.find((x) => x.userId === userId);
  if (!p) return state;
  for (const h of p.hands) h.done = true;
  return advance(s);
}

/** Сколько каждый поставил на свои руки — это и есть вклад раунда в `GameHand`. */
export function wagered(s: RoundState): Record<string, number> {
  return Object.fromEntries(s.players.map((p) => [p.userId, p.hands.reduce((a, h) => a + h.bet, 0)]));
}

/** Следующая несыгранная рука по порядку мест; таких нет — ходит крупье. */
function advance(s: RoundState): RoundState {
  for (let p = 0; p < s.players.length; p++) {
    const h = s.players[p].hands.findIndex((x) => !x.done);
    if (h !== -1) {
      s.turn = { p, h };
      return s;
    }
  }
  return finish(s, true);
}

/**
 * Крупье вскрывается и добирает до 17 — только если есть кому проигрывать:
 * при одних переборах и натуральных блэкджеках добор ничего не решает.
 */
function finish(s: RoundState, dealerPlays: boolean): RoundState {
  s.turn = null;
  const live = s.players.some((p) => p.hands.some((h) => handValue(h.cards).total <= 21 && !isNatural(h)));
  if (dealerPlays && live) {
    while (handValue(s.dealer).total < 17) s.dealer.push(draw(s));
  }
  const dealerBj = isNatural({ cards: s.dealer, split: false });
  const dealerTotal = handValue(s.dealer).total;
  const payouts: Record<string, number> = {};
  for (const p of s.players) {
    let back = 0;
    for (const h of p.hands) {
      const r = settleHand(h, dealerTotal, dealerBj);
      h.done = true;
      h.outcome = r.outcome;
      h.payout = r.payout;
      back += r.payout;
    }
    payouts[p.userId] = back;
  }
  s.payouts = payouts;
  s.phase = 'done';
  return s;
}

function settleHand(h: BjHand, dealerTotal: number, dealerBj: boolean): { outcome: Outcome; payout: number } {
  const total = handValue(h.cards).total;
  if (isNatural(h)) {
    return dealerBj ? { outcome: 'push', payout: h.bet } : { outcome: 'blackjack', payout: h.bet + Math.floor((h.bet * 3) / 2) };
  }
  if (total > 21) return { outcome: 'bust', payout: 0 };
  if (dealerBj) return { outcome: 'lose', payout: 0 };
  if (dealerTotal > 21 || total > dealerTotal) return { outcome: 'win', payout: h.bet * 2 };
  if (total === dealerTotal) return { outcome: 'push', payout: h.bet };
  return { outcome: 'lose', payout: 0 };
}
```

- [ ] **Step 4:** `npx jest src/blackjack` — PASS.
- [ ] **Step 5:** Ревью субагентом (Sonnet): правила против спеки, пограничные случаи денег (3:2, дабл/сплит без стека, чужой ход).

---

### Task 3: Вид стола блэкджека

**Files:**
- Create: `backend/src/blackjack/blackjack.config.ts`, `backend/src/blackjack/blackjack-view.ts`
- Test: `backend/src/blackjack/blackjack-view.spec.ts`

**Interfaces:**
- Produces: `BET_MS = 15_000`, `TURN_MS = 20_000`, `NEXT_ROUND_MS = 6_000`, `FIRST_ROUND_MS = 1_500`;
```ts
export type Phase = 'idle' | 'betting' | 'playing' | 'done';
export interface SeatRow { userId: string; seatIndex: number; stack: number; name: string | null }
export interface Snapshot { phase: Phase; bets: Map<string, number>; round: RoundState | null; roundId: string | null; deadline: number | null; sitOut: Set<string> }
export function buildView(table: GameTable, seats: SeatRow[], snap: Snapshot | null, viewerId: string): BlackjackView;
export type BlackjackView = ReturnType<typeof buildView>;
```

- [ ] **Step 1: Тесты.**

```ts
import { startRound } from './blackjack';
import { buildView, Snapshot } from './blackjack-view';

const TABLE = {
  id: 't', gameType: 'blackjack', name: 'T', visibility: 'private', status: 'open', minBuyIn: 100, maxBuyIn: 1000,
  maxSeats: 7, bigBlind: null, minBet: 10, maxBet: 100, creatorId: 'a', createdAt: new Date(), closedAt: null,
} as never;
const SEATS = [
  { userId: 'a', seatIndex: 0, stack: 500, name: 'A' },
  { userId: 'b', seatIndex: 2, stack: 5, name: null },
];
const snap = (over: Partial<Snapshot>): Snapshot => ({
  phase: 'idle', bets: new Map(), round: null, roundId: null, deadline: null, sitOut: new Set(), ...over,
});

describe('buildView', () => {
  it('в окно ставок стек показан уже без ставки', () => {
    const v = buildView(TABLE, SEATS, snap({ phase: 'betting', bets: new Map([['a', 50]]), deadline: 1 }), 'a');
    expect(v.seats[0]).toMatchObject({ stack: 450, bet: 50 });
    expect(v.me).toMatchObject({ seatIndex: 0, bet: 50, canBet: true });
  });

  it('ставить нельзя тому, у кого стек меньше минимальной ставки', () => {
    const v = buildView(TABLE, SEATS, snap({ phase: 'betting', deadline: 1 }), 'b');
    expect(v.me.canBet).toBe(false);
  });

  it('закрытой карты крупье в виде нет, пока раунд идёт', () => {
    const round = startRound([{ userId: 'a', seatIndex: 0, stack: 450, bet: 50 }], ['Td', '9s', '6c', '7h', '5d']);
    const v = buildView(TABLE, SEATS, snap({ phase: 'playing', round, roundId: 'r1', deadline: 1 }), 'b');
    expect(v.dealer).toEqual({ cards: ['9s', null], total: 9 });
    expect(JSON.stringify(v)).not.toContain('7h');
    expect(v.seats[0].hands[0]).toMatchObject({ cards: ['Td', '6c'], total: 16, bet: 50 });
    expect(v.seats[0].isTurn).toBe(true);
    expect(v.me.legal).toBeNull();
  });

  it('после расчёта крупье вскрыт и у рук есть исход', () => {
    const round = startRound([{ userId: 'a', seatIndex: 0, stack: 450, bet: 50 }], ['As', '9s', 'Kd', '7h']);
    const v = buildView(TABLE, SEATS, snap({ phase: 'done', round, roundId: 'r1' }), 'a');
    expect(v.dealer).toEqual({ cards: ['9s', '7h'], total: 16 });
    expect(v.seats[0].hands[0]).toMatchObject({ outcome: 'blackjack', payout: 125 });
    expect(v.deadline).toBeNull();
  });
});
```

- [ ] **Step 2:** `npx jest src/blackjack/blackjack-view.spec.ts` — FAIL.
- [ ] **Step 3: Реализация.** `blackjack.config.ts`:

```ts
/** Окно ставок. Не поставивший в окно встаёт в «пропускает раунды». */
export const BET_MS = 15_000;
/** Время на решение. Истекло — оставшиеся руки стоят, игрок пропускает раунды. */
export const TURN_MS = 20_000;
/** Пауза после расчёта: добор крупье и итог должны успеть доиграть и прочитаться. */
export const NEXT_ROUND_MS = 6_000;
/** Сел первый — окно не мгновенно: второй успевает сесть к тому же раунду. */
export const FIRST_ROUND_MS = 1_500;
```

`blackjack-view.ts`:

```ts
import type { GameTable } from '@prisma/client';
import { cardPoints, handValue, legal, RoundState } from './blackjack';
import { BET_MS, TURN_MS } from './blackjack.config';

export type Phase = 'idle' | 'betting' | 'playing' | 'done';

export interface SeatRow {
  userId: string;
  seatIndex: number;
  /** Фишки на месте по БД — поставленное в раунд уже списано. */
  stack: number;
  name: string | null;
}

export interface Snapshot {
  phase: Phase;
  /** Ставки открытого окна — в памяти, со стеков ещё не списаны. */
  bets: Map<string, number>;
  round: RoundState | null;
  roundId: string | null;
  deadline: number | null;
  sitOut: Set<string>;
}

/**
 * Стол блэкджека глазами одного пользователя. Карты игроков открыты всем, как
 * за настоящим столом; скрыта только закрытая карта крупье — пока раунд идёт,
 * её нет в виде вовсе, а не «есть, но спрятана».
 */
export function buildView(table: GameTable, seats: SeatRow[], snap: Snapshot | null, viewerId: string) {
  const phase = snap?.phase ?? 'idle';
  const round = snap?.round ?? null;
  const playing = round?.phase === 'playing';
  const turn = playing ? round!.turn : null;
  const turnUser = turn ? round!.players[turn.p].userId : null;
  const minBet = table.minBet ?? 0;
  const pendingOf = (userId: string) => (phase === 'betting' ? (snap!.bets.get(userId) ?? 0) : 0);

  const outSeats = [...seats]
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((s) => {
      const p = round?.players.find((x) => x.userId === s.userId) ?? null;
      return {
        seatIndex: s.seatIndex,
        userId: s.userId,
        name: s.name,
        // В окно ставок стек показан уже без ставки: иначе число прыгало бы
        // в момент сдачи, когда ставка уходит со стека по-настоящему.
        stack: s.stack - pendingOf(s.userId),
        sitOut: snap?.sitOut.has(s.userId) ?? false,
        bet: pendingOf(s.userId),
        hands: (p?.hands ?? []).map((h) => {
          const v = handValue(h.cards);
          return {
            cards: h.cards,
            bet: h.bet,
            total: v.total,
            soft: v.soft && v.total < 21,
            doubled: h.doubled,
            outcome: h.outcome,
            payout: h.payout,
          };
        }),
        activeHand: turnUser === s.userId ? turn!.h : null,
        isTurn: turnUser === s.userId,
      };
    });

  const dealer = !round
    ? null
    : playing
      ? { cards: [round.dealer[0], null] as (string | null)[], total: cardPoints(round.dealer[0]) }
      : { cards: round.dealer as (string | null)[], total: handValue(round.dealer).total };

  const mine = seats.find((s) => s.userId === viewerId) ?? null;
  const timed = phase === 'betting' || playing;

  return {
    table: {
      id: table.id,
      name: table.name,
      visibility: table.visibility,
      status: table.status,
      minBuyIn: table.minBuyIn,
      maxBuyIn: table.maxBuyIn,
      maxSeats: table.maxSeats,
      minBet,
      maxBet: table.maxBet ?? 0,
      isCreator: table.creatorId === viewerId,
    },
    phase,
    roundId: round ? (snap?.roundId ?? null) : null,
    deadline: timed ? (snap?.deadline ?? null) : null,
    /** Длина окна ставок или хода целиком — полоса и дуга таймера рисуются от неё. */
    timerMs: phase === 'betting' ? BET_MS : TURN_MS,
    dealer,
    seats: outSeats,
    me: {
      seatIndex: mine?.seatIndex ?? null,
      sitOut: snap?.sitOut.has(viewerId) ?? false,
      bet: mine && phase === 'betting' ? (snap!.bets.get(viewerId) ?? null) : null,
      canBet: phase === 'betting' && !!mine && mine.stack >= minBet,
      legal: round && playing ? legal(round, viewerId) : null,
    },
  };
}

export type BlackjackView = ReturnType<typeof buildView>;
```

- [ ] **Step 4:** `npx jest src/blackjack` — PASS.

---

### Task 4: Рантайм стола, API и модуль  ⚠ важная (деньги) — ревью субагентом

**Files:**
- Create: `backend/src/blackjack/blackjack-errors.ts`, `dto/blackjack.dto.ts`, `blackjack.service.ts`, `blackjack.controller.ts`, `blackjack.module.ts`
- Modify: `backend/src/app.module.ts` (`BlackjackModule` после `PokerModule`)

**Interfaces:**
- Consumes: всё из Task 2–3; `GamesService.registerEngine`, `TableEngine`, `GamesGateway.emitPersonal`, `CoinsService.credit`.
- Produces: REST `GET /api/games/tables/:id/blackjack`, `POST …/bet { amount }`, `POST …/action { type }`, `POST …/flags { sitOut }`; сокет-событие `blackjack_state` с `BlackjackView`. Коды ошибок: `BJ_NOT_BLACKJACK`, `BJ_NOT_BETTING`, `BJ_BAD_BET`, `BJ_NO_ROUND`, `BJ_NOT_YOUR_TURN`, `BJ_BAD_ACTION`.

- [ ] **Step 1: Ошибки и DTO.**

```ts
// blackjack-errors.ts
import { BadRequestException, ConflictException } from '@nestjs/common';

/** Отказы раунда блэкджека — коды видит фронт и переводит по ключу. */
export const bjNotBlackjack = () =>
  new BadRequestException({ message: 'Это не стол блэкджека', code: 'BJ_NOT_BLACKJACK' });
export const bjNotBetting = () =>
  new ConflictException({ message: 'Ставки сейчас не принимаются', code: 'BJ_NOT_BETTING' });
export const bjBadBet = () =>
  new BadRequestException({ message: 'Ставка вне лимитов стола или больше стека', code: 'BJ_BAD_BET' });
export const bjNoRound = () => new ConflictException({ message: 'Раунд сейчас не идёт', code: 'BJ_NO_ROUND' });
export const bjNotYourTurn = () => new ConflictException({ message: 'Сейчас не ваш ход', code: 'BJ_NOT_YOUR_TURN' });
export const bjBadAction = () =>
  new BadRequestException({ message: 'Такое действие сейчас недоступно', code: 'BJ_BAD_ACTION' });
```

```ts
// dto/blackjack.dto.ts
import { IsBoolean, IsIn, IsInt, Max, Min } from 'class-validator';
import { MAX_COINS_AMOUNT } from '../../coins/coins.config';
import type { BjActionType } from '../blackjack';

export class BlackjackBetDto {
  @IsInt()
  @Min(1)
  @Max(MAX_COINS_AMOUNT)
  amount: number;
}

export class BlackjackActionDto {
  @IsIn(['hit', 'stand', 'double', 'split'])
  type: BjActionType;
}

export class BlackjackFlagsDto {
  @IsBoolean()
  sitOut: boolean;
}
```

- [ ] **Step 2: Сервис.**

```ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CoinsService } from '../coins/coins.service';
import { gameNotSeated, gameTableNotFound } from '../games/game-errors';
import { GamesGateway } from '../games/games.gateway';
import { GamesService, TableEngine } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { act, BjActionType, BlackjackError, newShoe, RoundState, standAll, startRound, wagered } from './blackjack';
import { BET_MS, FIRST_ROUND_MS, NEXT_ROUND_MS, TURN_MS } from './blackjack.config';
import { bjBadAction, bjBadBet, bjNoRound, bjNotBetting, bjNotBlackjack, bjNotYourTurn } from './blackjack-errors';
import { buildView, Phase, SeatRow } from './blackjack-view';

interface Runtime {
  phase: Phase;
  /** Ставки открытого окна: в памяти, со стеков не списаны. */
  bets: Map<string, number>;
  round: RoundState | null;
  roundId: string | null;
  sitOut: Set<string>;
  queue: Promise<unknown>;
  /** Растёт на каждом изменении: таймер, заведённый до него, устарел. */
  seq: number;
  deadline: number | null;
  /** Окно ставок или ход — одновременно их не бывает. */
  timer: NodeJS.Timeout | null;
  /** Пауза перед следующим окном ставок. */
  nextTimer: NodeJS.Timeout | null;
}

type TableWithSeats = Prisma.GameTableGetPayload<{ include: { seats: true } }>;

/**
 * Рантайм столов блэкджека: раунд в памяти процесса `api`, деньги — в БД.
 * Всё — через одну очередь на стол (`exclusive`): ставка, ход, таймеры, уход.
 *
 * Ставка окна живёт в памяти и со стека не списывается — до сдачи деньги не
 * движутся. Сдача — одна транзакция (строка `GameHand` с вкладами и списание
 * ставок); дабл и сплит — свои транзакции; расчёт — в транзакции последнего
 * хода. Прерванный перезапуском раунд возвращает вклады в `GamesService`.
 * Спека — `docs/superpowers/specs/2026-09-24-blackjack-design.md`.
 */
@Injectable()
export class BlackjackService implements TableEngine, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BlackjackService.name);
  private readonly tables = new Map<string, Runtime>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly coins: CoinsService,
    private readonly games: GamesService,
    private readonly gateway: GamesGateway,
  ) {}

  onModuleInit() {
    this.games.registerEngine('blackjack', this);
  }

  onModuleDestroy() {
    for (const rt of this.tables.values()) {
      if (rt.timer) clearTimeout(rt.timer);
      if (rt.nextTimer) clearTimeout(rt.nextTimer);
    }
  }

  private rt(tableId: string): Runtime {
    let rt = this.tables.get(tableId);
    if (!rt) {
      rt = {
        phase: 'idle',
        bets: new Map(),
        round: null,
        roundId: null,
        sitOut: new Set(),
        queue: Promise.resolve(),
        seq: 0,
        deadline: null,
        timer: null,
        nextTimer: null,
      };
      this.tables.set(tableId, rt);
    }
    return rt;
  }

  exclusive<T>(tableId: string, fn: () => Promise<T>): Promise<T> {
    const rt = this.rt(tableId);
    const run = rt.queue.then(fn);
    rt.queue = run.catch(() => undefined);
    return run;
  }

  private log(what: string) {
    return (e: Error) => this.logger.error(`${what}: ${e.message}`);
  }

  // ── TableEngine ───────────────────────────────────────────────

  /**
   * Встающий посреди раунда не теряет ставку: его оставшиеся руки стоят, а
   * выигрыш после хода крупье придёт монетами (`settle`). До сдачи ставка
   * лежит только в памяти — её просто нет.
   */
  async onLeaving(tableId: string, userId: string) {
    const rt = this.rt(tableId);
    rt.sitOut.delete(userId);
    rt.bets.delete(userId);
    const round = rt.round;
    if (rt.phase !== 'playing' || !round) return;
    const p = round.players.find((x) => x.userId === userId);
    if (!p || p.hands.every((h) => h.done)) return;
    await this.commit(tableId, rt, standAll(round, userId));
  }

  onSeatsChanged(tableId: string) {
    const rt = this.rt(tableId);
    if (rt.phase === 'idle') this.scheduleNext(tableId, rt, FIRST_ROUND_MS);
    // Встал последний, кого ждало окно, — сдавать можно сразу.
    if (rt.phase === 'betting') void this.exclusive(tableId, () => this.dealIfAllBet(tableId)).catch(this.log('deal'));
    void this.broadcast(tableId);
  }

  // ── Действия игрока ───────────────────────────────────────────

  async view(userId: string, tableId: string) {
    const base = await this.loadBase(tableId);
    if (!base) throw gameTableNotFound();
    if (base.table.gameType !== 'blackjack') throw bjNotBlackjack();
    // После перезапуска `api` рантайм пуст: открытие стола — тоже повод
    // открыть окно ставок, иначе сидящие ждали бы чужой посадки.
    if (base.table.status === 'open' && base.seats.length > 0) {
      const rt = this.rt(tableId);
      if (rt.phase === 'idle') this.scheduleNext(tableId, rt, FIRST_ROUND_MS);
    }
    return buildView(base.table, base.seats, this.snapshot(tableId), userId);
  }

  /** Ставка в открытое окно; повторная — переставляет. Поставивший возвращается из «пропускает». */
  bet(userId: string, tableId: string, amount: number) {
    return this.exclusive(tableId, async () => {
      const rt = this.rt(tableId);
      if (rt.phase !== 'betting') throw bjNotBetting();
      const table = await this.loadTable(tableId);
      if (!table) throw gameTableNotFound();
      const seat = table.seats.find((s) => s.userId === userId);
      if (!seat) throw gameNotSeated();
      if (amount < (table.minBet ?? 0) || amount > (table.maxBet ?? 0) || amount > seat.stack) throw bjBadBet();
      rt.sitOut.delete(userId);
      rt.bets.set(userId, amount);
      if (!(await this.dealIfAllBet(tableId, table))) void this.broadcast(tableId);
      return { success: true as const };
    });
  }

  act(userId: string, tableId: string, type: BjActionType) {
    return this.exclusive(tableId, async () => {
      const rt = this.rt(tableId);
      if (rt.phase !== 'playing' || !rt.round) throw bjNoRound();
      let next: RoundState;
      try {
        next = act(rt.round, userId, type);
      } catch (e) {
        if (e instanceof BlackjackError) throw e.code === 'NOT_YOUR_TURN' ? bjNotYourTurn() : bjBadAction();
        throw e;
      }
      await this.commit(tableId, rt, next);
      return { success: true as const };
    });
  }

  async setFlags(userId: string, tableId: string, flags: { sitOut: boolean }) {
    await this.exclusive(tableId, async () => {
      const rt = this.rt(tableId);
      if (flags.sitOut) rt.sitOut.add(userId);
      else rt.sitOut.delete(userId);
      if (rt.phase === 'idle') this.scheduleNext(tableId, rt, FIRST_ROUND_MS);
      if (rt.phase === 'betting') await this.dealIfAllBet(tableId);
    });
    void this.broadcast(tableId);
    return { success: true as const };
  }

  // ── Раунд ─────────────────────────────────────────────────────

  private scheduleNext(tableId: string, rt: Runtime, delay: number) {
    if (rt.nextTimer) return;
    rt.nextTimer = setTimeout(() => {
      rt.nextTimer = null;
      void this.exclusive(tableId, () => this.openBetting(tableId)).catch(this.log(`open betting ${tableId}`));
    }, delay);
  }

  private clearTimer(rt: Runtime) {
    if (rt.timer) clearTimeout(rt.timer);
    rt.timer = null;
    rt.deadline = null;
  }

  /**
   * Окно ставок. Играть некому — стол ждёт, и итог прошлого раунда с него
   * убирается: оставленный, он выглядел бы идущим раундом.
   */
  private async openBetting(tableId: string) {
    const rt = this.rt(tableId);
    if (rt.phase === 'betting' || rt.phase === 'playing') return;
    const table = await this.loadTable(tableId);
    if (!table || table.status !== 'open' || table.gameType !== 'blackjack') return;
    const minBet = table.minBet ?? 0;
    const players = table.seats.filter((s) => s.stack >= minBet && !rt.sitOut.has(s.userId));
    rt.round = null;
    rt.roundId = null;
    rt.bets.clear();
    rt.seq++;
    this.clearTimer(rt);
    if (!players.length) {
      rt.phase = 'idle';
      void this.broadcast(tableId);
      return;
    }
    rt.phase = 'betting';
    rt.deadline = Date.now() + BET_MS;
    const seq = rt.seq;
    rt.timer = setTimeout(
      () => void this.exclusive(tableId, () => this.closeBetting(tableId, seq)).catch(this.log(`close betting ${tableId}`)),
      BET_MS,
    );
    void this.broadcast(tableId);
  }

  /** Окно истекло. Не поставивший — отошёл: иначе каждое следующее окно ждало бы его до конца. */
  private async closeBetting(tableId: string, seq: number) {
    const rt = this.rt(tableId);
    if (rt.phase !== 'betting' || rt.seq !== seq) return;
    const table = await this.loadTable(tableId);
    if (!table) return;
    for (const s of table.seats) if (!rt.bets.has(s.userId)) rt.sitOut.add(s.userId);
    await this.deal(tableId, rt, table);
  }

  /** Поставили все, кого ждало окно, — сдавать, не дожидаясь таймера. */
  private async dealIfAllBet(tableId: string, loaded?: TableWithSeats): Promise<boolean> {
    const rt = this.rt(tableId);
    if (rt.phase !== 'betting' || rt.bets.size === 0) return false;
    const table = loaded ?? (await this.loadTable(tableId));
    if (!table) return false;
    const minBet = table.minBet ?? 0;
    const waiting = table.seats.some((s) => s.stack >= minBet && !rt.sitOut.has(s.userId) && !rt.bets.has(s.userId));
    if (waiting) return false;
    await this.deal(tableId, rt, table);
    return true;
  }

  /** Сдача: строка раунда с вкладами и списание ставок — одной транзакцией. */
  private async deal(tableId: string, rt: Runtime, table: TableWithSeats) {
    this.clearTimer(rt);
    const entries = table.seats
      .filter((s) => {
        const bet = rt.bets.get(s.userId) ?? 0;
        return bet > 0 && bet <= s.stack;
      })
      .map((s) => {
        const bet = rt.bets.get(s.userId)!;
        return { userId: s.userId, seatIndex: s.seatIndex, stack: s.stack - bet, bet };
      });
    rt.bets.clear();
    rt.seq++;
    if (!entries.length) {
      rt.phase = 'idle';
      void this.broadcast(tableId);
      return;
    }
    const round = startRound(entries, newShoe());
    let row: { id: string };
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.gameHand.create({ data: { tableId, contributions: wagered(round) } });
        for (const e of entries) {
          await tx.gameSeat.update({
            where: { tableId_userId: { tableId, userId: e.userId } },
            data: { stack: { decrement: e.bet } },
          });
        }
        if (round.phase === 'done') await this.settle(tx, tableId, created.id, round);
        return created;
      });
    } catch (e) {
      // Деньги не сдвинулись — стол просто ждёт следующего повода открыть окно.
      rt.phase = 'idle';
      void this.broadcast(tableId);
      throw e;
    }
    rt.round = round;
    rt.roundId = row.id;
    this.afterChange(tableId, rt);
  }

  /** Новое состояние раунда — в БД и в память: добавленное к ставкам списывается, конец — расчёт. */
  private async commit(tableId: string, rt: Runtime, next: RoundState) {
    const handId = rt.roundId!;
    const before = wagered(rt.round!);
    const after = wagered(next);
    await this.prisma.$transaction(async (tx) => {
      for (const [userId, amount] of Object.entries(after)) {
        const extra = amount - (before[userId] ?? 0);
        if (extra > 0) {
          await tx.gameSeat.update({
            where: { tableId_userId: { tableId, userId } },
            data: { stack: { decrement: extra } },
          });
        }
      }
      await tx.gameHand.update({ where: { id: handId }, data: { contributions: after } });
      if (next.phase === 'done') await this.settle(tx, tableId, handId, next);
    });
    rt.round = next;
    this.afterChange(tableId, rt);
  }

  /**
   * Расчёт. Сидящему — на место; вставшему посреди раунда — монетами: его
   * руки доиграны за него, и сгоревшая ставка была бы штрафом за уход.
   */
  private async settle(tx: Prisma.TransactionClient, tableId: string, handId: string, round: RoundState) {
    for (const [userId, amount] of Object.entries(round.payouts ?? {})) {
      if (!(amount > 0)) continue;
      const paid = await tx.gameSeat.updateMany({ where: { tableId, userId }, data: { stack: { increment: amount } } });
      if (paid.count === 0) await this.coins.credit(tx, userId, amount, 'GAME_PAYOUT', `${handId}:${userId}`);
    }
    await tx.gameHand.update({ where: { id: handId }, data: { finishedAt: new Date() } });
  }

  private afterChange(tableId: string, rt: Runtime) {
    rt.seq++;
    this.clearTimer(rt);
    if (rt.round?.phase === 'playing') {
      rt.phase = 'playing';
      this.armTurn(tableId, rt);
    } else {
      rt.phase = 'done';
      this.scheduleNext(tableId, rt, NEXT_ROUND_MS);
    }
    void this.broadcast(tableId);
  }

  /** Таймер хода. Истёк — оставшиеся руки стоят, игрок пропускает следующие раунды. */
  private armTurn(tableId: string, rt: Runtime) {
    const round = rt.round;
    if (!round || round.phase !== 'playing' || !round.turn) return;
    const userId = round.players[round.turn.p].userId;
    const seq = rt.seq;
    rt.deadline = Date.now() + TURN_MS;
    rt.timer = setTimeout(() => {
      void this.exclusive(tableId, async () => {
        const cur = rt.round;
        if (rt.seq !== seq || !cur || cur.phase !== 'playing' || !cur.turn) return;
        if (cur.players[cur.turn.p].userId !== userId) return;
        rt.sitOut.add(userId);
        await this.commit(tableId, rt, standAll(cur, userId));
      }).catch(this.log(`turn timeout ${tableId}`));
    }, TURN_MS);
  }

  // ── Вид ───────────────────────────────────────────────────────

  private snapshot(tableId: string) {
    const rt = this.tables.get(tableId);
    if (!rt) return null;
    return { phase: rt.phase, bets: rt.bets, round: rt.round, roundId: rt.roundId, deadline: rt.deadline, sitOut: rt.sitOut };
  }

  private loadTable(tableId: string) {
    return this.prisma.gameTable.findUnique({ where: { id: tableId }, include: { seats: true } });
  }

  private async loadBase(tableId: string) {
    const table = await this.prisma.gameTable.findUnique({
      where: { id: tableId },
      include: { seats: { include: { user: { select: { name: true } } } } },
    });
    if (!table) return null;
    const { seats, ...rest } = table;
    const rows: SeatRow[] = seats.map((s) => ({
      userId: s.userId,
      seatIndex: s.seatIndex,
      stack: s.stack,
      // Почту чужим не показываем даже куском: без имени место подписывает фронт.
      name: s.user?.name || null,
    }));
    return { table: rest, seats: rows };
  }

  private async broadcast(tableId: string) {
    try {
      const base = await this.loadBase(tableId);
      if (!base) return;
      const snap = this.snapshot(tableId);
      await this.gateway.emitPersonal(tableId, 'blackjack_state', (userId) =>
        buildView(base.table, base.seats, snap, userId),
      );
    } catch (e) {
      this.logger.error(`broadcast ${tableId}: ${(e as Error).message}`);
    }
  }
}
```

- [ ] **Step 3: Контроллер и модуль.**

```ts
// blackjack.controller.ts
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BlackjackActionDto, BlackjackBetDto, BlackjackFlagsDto } from './dto/blackjack.dto';
import { BlackjackService } from './blackjack.service';

/**
 * Раунд блэкджека поверх стола из `games`. Ставки и ходы — REST: они двигают
 * фишки, а деньги в продукте ходят только транзакцией. Сокет приносит вид.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/games/tables/:id/blackjack')
export class BlackjackController {
  constructor(private readonly blackjack: BlackjackService) {}

  @Get()
  view(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.blackjack.view(userId, id);
  }

  @Post('bet')
  bet(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: BlackjackBetDto) {
    return this.blackjack.bet(userId, id, dto.amount);
  }

  @Post('action')
  act(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: BlackjackActionDto) {
    return this.blackjack.act(userId, id, dto.type);
  }

  @Post('flags')
  flags(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: BlackjackFlagsDto) {
    return this.blackjack.setFlags(userId, id, dto);
  }
}
```

`blackjack.module.ts` — как `poker.module.ts` (`imports: [CoinsModule, GamesModule]`, контроллер, сервис; комментарий: «раунд живёт в памяти `api`, поэтому `api` — один процесс»). В `app.module.ts` — импорт и строка `BlackjackModule,` после `PokerModule,`.

- [ ] **Step 4:** `npx tsc --noEmit -p tsconfig.json`, `npx jest src/blackjack src/games src/poker` — чисто/PASS.
- [ ] **Step 5:** Ревью субагентом (Sonnet): движение денег (сдача, дабл/сплит, расчёт, уход посреди раунда, таймауты, перезапуск), очередь и устаревшие таймеры.

---

### Task 5: Сквозной прогон API двумя клиентами

**Files:** скрипт в scratchpad (не в репозитории).

- [ ] **Step 1:** Скрипт на Node (`socket.io-client` и `jsonwebtoken` из `backend/node_modules`): два тестовых пользователя из БД, JWT, подписанный локальным `JWT_ACCESS_SECRET`; создать стол (`gameType: 'blackjack'`, `minBet: 10`, `maxBet: 200`, `minBuyIn: 100`, `maxBuyIn: 1000`, `maxSeats: 7`), оба садятся по 500, подписка сокетом на `blackjack_state` через `:8090`/`/api/games/socket.io` (`addTrailingSlash: false`).
- [ ] **Step 2:** Сценарий: окно ставок открылось → оба ставят → раунд сдан (стеки уменьшились на ставку, закрытой карты крупье в событии нет) → ходят по `me.legal` (stand/hit) до `phase: 'done'` → стек = старый стек + выплата; второй раунд — один не ставит → после 15 с он `sitOut`, раунд идёт с одним; третий — первый уходит посреди своего хода → его `GAME_PAYOUT`/кэшаут в журнале монет, сумма = стек + выигрыш. Проверить `coin_transactions` и `game_hands` (`finishedAt` у всех).
- [ ] **Step 3:** Прибрать: закрыть стол, удалить тестовые строки, если заводились.

---

### Task 6: Общий стол `widgets/card-table` и покер на нём

**Files:**
- Move (обычным `mv` — файлы покера не в git): из `frontend/src/views/poker-table/` в `frontend/src/widgets/card-table/`:
  `components/{PlayingCard,ChipStack,AnimatedNumber,TableDefs,Dealer,Effects,BuyInDialog,TableMenu}.tsx` → `ui/`;
  `lib/{chips.ts,chips.test.ts}` → `lib/`; `model/{useLeaveOnExit.ts,useLeaveOnExit.test.ts,useStageAspect.ts}` → `model/`;
  `model/usePokerSocket.ts` → `model/useTableSocket.ts`; `frontend/src/views/poker-lobby/components/TablesList.tsx` → `ui/TablesList.tsx`.
- Split: `views/poker-table/lib/layout.ts` → общая часть в `widgets/card-table/lib/layout.ts` (`SeatPoint`, `STAGE_*`, `seatPoint`, `slotOf`, `betPoint`, `initials`) + `views/poker-table/lib/raise.ts` (`RAISE_PRESETS`, `presetRaiseTo`); тесты делятся так же. `views/poker-table/lib/motion.ts` → общая часть в `widgets/card-table/lib/motion.ts` (`DEALER`, `CENTER`, `DEAL_STEP`, `DEAL_FLY`, `FLIP`, `COLLECT`, `WIN_FLY`, `offsetFrom`), у покера остаются `POT = CENTER`, `BOARD_BASE`, `BOARD_STEP`, `boardPoint`.
- Create: `widgets/card-table/ui/{CardTable,TableShell,SeatPlate,Toggle}.tsx`, `widgets/card-table/model/useSeatPoints.ts`, `widgets/card-table/index.ts`.
- Modify: `views/poker-table/{Page.tsx,components/Seat.tsx,components/ActionBar.tsx,components/HandRankings.tsx,lib/events.ts,lib/events.test.ts}`, `views/poker-lobby/{Page.tsx,components/CreateTableDialog.tsx}`, `app/globals.css`, `shared/i18n/messages/{ru,en}.json`.

**Interfaces (Produces, `@/widgets/card-table`):**
```ts
CardTable(props: { maxSeats: number; pointOf: (i: number) => SeatPoint; center: ReactNode; shuffleKey: string | null; renderSeat: (i: number, at: SeatPoint) => ReactNode; overlay?: ReactNode })
TableFrame(props: { loading: boolean; error: unknown; className?: string; children: ReactNode })   // .games-bg + .ct-page, загрузка/ошибка
TableShell(props: { backHref: string; menu: ReactNode; side?: ReactNode; stage: ReactNode; bottom: ReactNode })
SeatPlate(props: { label: string; name: string | null; stack: number; stackDelay?: number; turn: { deadline: number; turnMs: number } | null; children?: ReactNode })
EmptySeat(props: { at: SeatPoint; canSit: boolean; onSit: () => void })
Toggle(props: { on: boolean; label: string; onClick: () => void })
PlayingCard, CardBack, CardSlot, type CardMotion, ChipStack, AnimatedNumber, TableDefs, CHIP_COLORS
Dealer(props: { shuffleKey: string | null })
DealerSay<L extends { id: number }>(props: { lines: L[]; onShift: (id: number) => void; render: (line: L) => string })
type Anchor = { seat: number } | { bet: number } | 'center' | 'dealer'
interface Ghost { id: number; what: 'chips' | 'cards'; from: Anchor; to: Anchor; delay: number; amount?: number; ms?: number }
Effects(props: { ghosts: Ghost[]; pointOf: (i: number) => SeatPoint; onDone: (id: number) => void })
TableMenu(props: { toggles?: { label: string; on: boolean; onToggle: () => void }[] })
BuyInDialog(props: { tableId: string; min: number; max: number; onClose: () => void })
TablesList(props: { gameType: GameType; kind: 'mine' | 'public'; onOpen: (id: string) => void; stakes: { header: string; render: (row: GameTableRow) => string } })
useTableSocket(tableId: string, event: string, viewKey: (id: string) => readonly unknown[])
useLeaveOnExit(tableId: string, seated: boolean, viewKey: (id: string) => readonly unknown[]); standUp(qc, tableId, viewKey)
useSeatPoints(maxSeats: number, mySeat: number | null): (i: number) => SeatPoint
lib: SeatPoint, seatPoint, slotOf, betPoint, initials, STAGE_WIDE, STAGE_TALL, DEALER, CENTER, DEAL_STEP, DEAL_FLY, FLIP, COLLECT, WIN_FLY, offsetFrom, DENOMS, chipsFor
```

- [ ] **Step 1: Перенос файлов** (команды выше), затем исправить относительные импорты внутри перенесённых файлов (`../lib/…` остаются верными внутри виджета; `@/entities/game-table` — без изменений).
- [ ] **Step 2: Обобщение.**
  - `useTableSocket`: тело `usePokerSocket`, где `'poker_state'` → `event`, `pokerViewKey` → `viewKey`; обработчик — `(view: { table?: { id?: string } }) => { if (view?.table?.id === tableId) qc.setQueryData(viewKey(tableId), view) }`; зависимости эффекта `[qc, tableId, event, viewKey]`.
  - `useLeaveOnExit`/`standUp`: третий параметр `viewKey`, вместо `pokerViewKey(tableId)` — `viewKey(tableId)`; тест передаёт `pokerViewKey`.
  - `Effects`: призраки по точкам — `resolve(a) = a === 'center' ? CENTER : a === 'dealer' ? DEALER : 'seat' in a ? pointOf(a.seat) : betPoint(pointOf(a.bet))`; `what === 'cards'` → две рубашки с классом `ct-muck`; фишки → `ct-g-chips`, стиль `'--go-ms': \`${g.ms ?? COLLECT}ms\``, ширина стопки `g.ms && g.ms >= WIN_FLY ? 30 : 22`.
  - `Dealer`: подпись — `useTranslations('cardTable')('dealer')`. `DealerSay` — дженерик с `render`; покерная функция `say` переезжает в `views/poker-table/components/PokerSay.ts` как хук `usePokerSay(): (l: DealerLine) => string`.
  - `TableMenu`: вместо `ranksOn/onToggleRanks` — `toggles`; пункт на каждый toggle (тот же `menuitemcheckbox` с `ct-dot`); тексты — `cardTable`.
  - `BuyInDialog`, `TablesList`: тексты — `cardTable`; `TablesList` фильтрует `x.gameType === gameType`, колонка ставок — из `stakes` (ключ `stakes`, `align: 'right'`, `cellClassName: 'n'`).
  - `SeatPlate`: плашка из покерного `Seat` (`ct-plate` → аватар с `TurnTimer` при `turn`, инициалы, `ct-info` с именем и `AnimatedNumber` стека с задержкой `stackDelay`, `children` — справа, для кнопки дилера). `EmptySeat` и `TurnTimer` — из покерного `Seat` дословно, тексты — `cardTable`.
  - `CardTable`:

```tsx
export function CardTable({ maxSeats, pointOf, center, shuffleKey, renderSeat, overlay }: Props) {
  return (
    <div className="ct-stage">
      <div className="ct-felt">
        <div className="ct-felt-line" />
        <div className="ct-center">
          {center}
          <VirexLogo className="ct-logo" aria-hidden />
        </div>
      </div>
      <Dealer shuffleKey={shuffleKey} />
      {Array.from({ length: maxSeats }, (_, i) => (
        <Fragment key={i}>{renderSeat(i, pointOf(i))}</Fragment>
      ))}
      {overlay}
    </div>
  );
}
```

  - `TableShell`/`TableFrame`: разметка из покерной `Page` (`TableDefs`, шапка `ct-top` со ссылкой «← Столы» и `menu`, `ct-body` → `side` + `ct-main` → `ct-stage-box` со `stage` и `ct-bottom` с `bottom`); `TableFrame` — `.games-bg` + `div.ct-page` (+`className`), до данных — `ct-wait` «Загружаем стол…» или `ErrorNote`.
  - `useSeatPoints`: `useStageAspect()` + `useCallback((i) => seatPoint(i, maxSeats, mySeat, aspect), [...])`.
- [ ] **Step 3: Покер на общем столе.** `Page.tsx` — `TableFrame` + `TableShell` + `CardTable` (center: `DealerSay` с `usePokerSay`, заметка «ждём второго», банк, борд); `Seat.tsx` — обёртка `ct-seat` + `pk-hole` + `SeatPlate` (кнопка дилера `pk-dealer` — `children`) + `ct-status`/`pk-hand` + `ct-bet`; `ActionBar` — импорт `presetRaiseTo, RAISE_PRESETS` из `../lib/raise`; `HandRankings` — `PlayingCard` из виджета; `events.ts` — призраки точками: сброс `{ what: 'cards', from: { seat }, to: 'dealer' }`, сбор `{ what: 'chips', from: { bet: seat }, to: 'center', amount }`, банк `{ what: 'chips', from: 'center', to: { seat }, amount, ms: WIN_FLY }`; `events.test.ts` — ожидания `kind` переписать на `what/from/to`; лобби — `TablesList` из виджета с `stakes = { header: t('colBlinds'), render: (x) => x.bigBlind ? \`${Math.floor(x.bigBlind / 2)}/${x.bigBlind}\` : '—' }`; `CreateTableDialog` — общие подписи из `cardTable`.
- [ ] **Step 4: Переименование классов.** Скрипт `scratchpad/rename-ct.mjs`:

```js
import fs from 'node:fs';
import path from 'node:path';

const SHARED = `page wait body main top backlink menu more menu-list menu-item note stage-box stage aspect felt felt-line
center center-note logo card rank sm md lg defs slot dim seat empty me plate avatar initials info name stack status
turn win win-glow timer bet stack-svg sit sit-off bottom controls toggles toggle dot fly flip face-back flip-fly
flip-only fly-flip bet-in pop-in dealer-spot deck shuffle shuffle-a shuffle-b dealer-label say say-line effects ghost
muck go-away go back p rail green act`.split(/\s+/);
const re = new RegExp(`(?<![\\w])pk-(${SHARED.map((s) => s.replace(/-/g, '\\-')).join('|')})(?![\\w-])`, 'g');

const root = process.argv[2];
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
// Виджет общий целиком — там любое pk- становится ct- (включая id определений SVG: pk-card-*, pk-chip-*, pk-suit-*).
for (const f of walk(path.join(root, 'widgets/card-table'))) {
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/pk-/g, 'ct-'));
}
// У покера и в стилях — только общие имена; покерные (борд, банк, рейз, справка) остаются pk-.
for (const f of [...walk(path.join(root, 'views/poker-table')), path.join(root, 'app/globals.css')]) {
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(re, 'ct-$1'));
}
```
  Запуск: `node <scratchpad>/rename-ct.mjs frontend/src`. Затем руками в `globals.css`: заголовки блоков «ПОКЕРНЫЙ СТОЛ» → «СТОЛ КАРТОЧНЫХ ИГР (покер, блэкджек)»; правило `.ct-controls > .pk-actions` → `.ct-controls > :not(.ct-toggles)` (и в `@container`); `.pk-g-collect`/`.pk-g-win` → одно `.ct-g-chips { animation: ct-go var(--go-ms, 360ms) cubic-bezier(0.4, 0, 0.2, 1) both; }`; ссылки на `views/poker-table/lib/motion.ts` в комментариях → `widgets/card-table/lib/motion.ts`.
- [ ] **Step 5: Переводы.** Скрипт переносит ключи из `poker` в новый `cardTable` (ru и en): `mineTitle mineEmptyTitle mineEmptyBody publicTitle publicEmptyTitle publicEmptyBody colName colBuyIn colPlayers colVisibility colCreator colAction public private closed visibilityLabel createTitle nameLabel seatsLabel minBuyInLabel maxBuyInLabel create creating createFailed loading loadFailed backToLobby invite copied closeTable closeBusyHint closeFailed menu player sit sitting emptySeat sitOut spectatorHint tableClosed buyInTitle buyInLead buyInLabel balance notEnoughCoins joinFailed`, плюс `dealer.label` → `cardTable.dealer`. В `poker` остаются игровые ключи.
- [ ] **Step 6: Проверка.** Скрипт-сверка: каждый класс `ct-*`/`pk-*`, встречающийся строкой в `widgets/card-table` и `views/poker-table`, определён в `globals.css` (кроме заведомо «маркерных» без стилей — перечислить глазами); `grep -rn "pk-" frontend/src/widgets/card-table` — пусто. `npx tsc --noEmit`, `npx eslint src/widgets/card-table src/views/poker-table src/views/poker-lobby`, `npx vitest run` — зелёные.

---

### Task 7: Клиент блэкджека и лобби

**Files:**
- Modify: `frontend/src/entities/game-table/api/{types.ts,hooks.ts}`, `index.ts`
- Create: `frontend/src/views/blackjack-lobby/{Page.tsx,components/CreateTableDialog.tsx}`, `frontend/src/app/(app)/games/blackjack/page.tsx`
- Modify: `frontend/src/views/games/model/games.ts` (`available: true` у блэкджека), `shared/i18n/messages/{ru,en}.json` (`blackjack.*`, `errors.GAME_BAD_BETS`, `errors.BJ_*`)

**Interfaces (Produces):**
```ts
export type BjPhase = 'idle' | 'betting' | 'playing' | 'done';
export type BjOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';
export type BjActionType = 'hit' | 'stand' | 'double' | 'split';
export interface BjHand { cards: Card[]; bet: number; total: number; soft: boolean; doubled: boolean; outcome: BjOutcome | null; payout: number }
export interface BjSeat { seatIndex: number; userId: string; name: string | null; stack: number; sitOut: boolean; bet: number; hands: BjHand[]; activeHand: number | null; isTurn: boolean }
export interface BjLegal { hit: boolean; stand: boolean; double: boolean; split: boolean }
export interface BlackjackView {
  table: { id: string; name: string; visibility: TableVisibility; status: 'open' | 'closed'; minBuyIn: number; maxBuyIn: number; maxSeats: number; minBet: number; maxBet: number; isCreator: boolean };
  phase: BjPhase; roundId: string | null; deadline: number | null; timerMs: number;
  dealer: { cards: (Card | null)[]; total: number } | null;
  seats: BjSeat[];
  me: { seatIndex: number | null; sitOut: boolean; bet: number | null; canBet: boolean; legal: BjLegal | null };
}
blackjackViewKey(id), useBlackjackView(id), useBlackjackBet(id) (mutate(amount)), useBlackjackAction(id) (mutate(type)), useBlackjackFlags(id) (mutate({ sitOut }))
GameTableRow + minBet: number | null; maxBet: number | null;  CreateTableInput + minBet?: number; maxBet?: number
```

- [ ] **Step 1:** Типы и хуки (по образцу покерных: `blackjackViewKey = (id) => ['game-tables', 'blackjack', id] as const`, запросы к `/api/games/tables/${id}/blackjack[/bet|/action|/flags]`).
- [ ] **Step 2:** Лобби: `BlackjackLobbyPage` — копия `PokerLobbyPage` с `t = useTranslations('blackjack')`, `TablesList gameType="blackjack"`, `stakes = { header: t('colBets'), render: (x) => \`${x.minBet ?? 0}–${x.maxBet ?? 0}\` }`, переход на `/games/blackjack/<id>`. `CreateTableDialog`: поля — название, доступ, мест 1–7 (по умолчанию 7), «Ставка от» (10), «Ставка до» (500), buy-in от/до — подставляются как 20× и 100× минимальной ставки, пока не тронуты; валидность — `minBet ≥ 2`, `maxBet ≥ minBet`, `minBuyIn ≥ minBet`, `maxBuyIn ≥ minBuyIn`; подсказка — `betsHint`/`betsInvalid`/`buyInInvalid`; `create.mutate({ gameType: 'blackjack', …, minBet, maxBet })`.
- [ ] **Step 3:** Роут `app/(app)/games/blackjack/page.tsx` — `export { BlackjackLobbyPage as default } from '@/views/blackjack-lobby/Page';` с комментарием в стиле покерного. `games.ts` — `available: true`.
- [ ] **Step 4: Переводы** (ru; en — те же ключи по-английски):

```json
"blackjack": {
  "title": "Блэкджек",
  "createAction": "Создать стол",
  "createLead": "Игра против крупье: блэкджек платит 3 к 2, крупье стоит на 17.",
  "colBets": "Ставка",
  "minBetLabel": "Ставка от",
  "maxBetLabel": "Ставка до",
  "betsHint": "Ставка на руку — от {min} до {max}.",
  "betsInvalid": "Ставка — целое число от 2, и «до» не меньше «от».",
  "buyInInvalid": "Buy-in — от {n} (минимальная ставка), и «до» не меньше «от».",
  "rules": "Блэкджек платит 3 к 2 · Крупье стоит на 17",
  "sitOutToggle": "Пропускать раунды",
  "placeBet": "Поставить",
  "rebet": "Переставить",
  "clear": "Очистить",
  "betPlaced": "Ставка {n} принята — ждём остальных",
  "hit": "Ещё",
  "stand": "Хватит",
  "double": "Дабл",
  "split": "Сплит",
  "actionFailed": "Действие не прошло",
  "status": {
    "waiting": "Ждём игроков",
    "sittingOut": "Вы пропускаете раунды — снимите переключатель, чтобы играть",
    "broke": "Фишек меньше минимальной ставки — встаньте из-за стола и сядьте снова",
    "turnOf": "Ходит {name}",
    "roundOver": "Раунд окончен"
  },
  "outcome": { "blackjack": "Блэкджек", "win": "Выигрыш", "push": "Ничья", "lose": "Проигрыш", "bust": "Перебор" },
  "dealer": {
    "placeBets": "Делайте ставки",
    "noMoreBets": "Ставок больше нет",
    "dealerBlackjack": "У крупье блэкджек",
    "dealerBust": "Перебор у крупье",
    "dealerHas": "У крупье {n}",
    "blackjack": "{name} — блэкджек!",
    "left": "{name} встаёт из-за стола"
  }
}
```
  `errors`: `GAME_BAD_BETS`, `BJ_NOT_BLACKJACK`, `BJ_NOT_BETTING`, `BJ_BAD_BET`, `BJ_NO_ROUND`, `BJ_NOT_YOUR_TURN`, `BJ_BAD_ACTION` — тексты из `blackjack-errors.ts`.
- [ ] **Step 5:** `npx tsc --noEmit`, `npx vitest run src/views/games` — зелёные.

---

### Task 8: Стол блэкджека

**Files:**
- Create: `frontend/src/views/blackjack-table/Page.tsx`, `components/{BjSeat,DealerHand,BetPanel,ActionBar}.tsx`, `lib/events.ts`, `lib/events.test.ts`, `lib/motion.ts`, `frontend/src/app/(app)/games/blackjack/[id]/page.tsx`
- Modify: `frontend/src/app/globals.css` (блок `bj-`)

**Interfaces:**
- Consumes: `@/widgets/card-table` (Task 6), типы и хуки (Task 7).
- Produces (`lib/events.ts`):
```ts
export type BjLineKey = 'placeBets' | 'noMoreBets' | 'dealerBlackjack' | 'dealerBust' | 'dealerHas' | 'blackjack' | 'left';
export interface BjLine { id: number; key: BjLineKey; name?: string | null; seat?: number; n?: number }
export interface CardMove { kind: 'fly' | 'flyFlip' | 'flip'; delay: number }
export interface Track { view: BlackjackView; dealtRound: string | null; settledRound: string | null; cards: Record<string, CardMove>; payAt: number; ghosts: Ghost[]; lines: BjLine[]; seq: number }
export const cardKey = (seat: number, hand: number, i: number, card: string) => `${seat}:${hand}:${i}:${card}`;
export const dealerKey = (i: number, card: string | null) => `d:${i}:${card ?? 'hole'}`;
export function initTrack(view: BlackjackView): Track;
export function advance(track: Track, next: BlackjackView): Track;
```
`lib/motion.ts`: `DEALER_HAND = { x: 50, y: 42 }`, `DEALER_DRAW = 520` (шаг добора крупье).

- [ ] **Step 1: Тесты `events.test.ts`** — вид строится хелпером (как в покерном тесте):
  1. `initTrack` загруженного раунда — движений нет (`cards` пуст, `ghosts` пуст).
  2. Новый `roundId`: карты мест `flyFlip` по кругу — первая карта места 0 раньше первой карты места 2, открытая карта крупье после первых карт всех, вторые карты после неё, закрытая (`dealerKey(1, null)`) — `fly` и последняя; `dealtRound` = id; реплика `noMoreBets`, если прошлый вид был в окне ставок.
  3. Тот же раунд, у места прибавилась карта (hit) — движение только у новой карты, `flyFlip` с задержкой 0; старые движения сохранены.
  4. Сплит `[8d, 8s]` → `[[8d, 3c], [8s, 2h]]` — движутся только `3c` и `2h`, `8s` на новом месте без движения.
  5. Переход в `done`: закрытая карта — `flip`, добор крупье — `flyFlip` позже переворота с шагом `DEALER_DRAW`; проигравшее место — призрак `{ from: { bet: s }, to: 'dealer' }`; выигравшее — `{ from: 'dealer', to: { bet: s } }` и затем `{ from: { bet: s }, to: { seat: s } }` на `payAt + WIN_FLY`; `settledRound` = id; реплика `dealerBust`/`dealerHas`.
  6. Место исчезло — реплика `left` с именем.
- [ ] **Step 2:** `npx vitest run src/views/blackjack-table` — FAIL.
- [ ] **Step 3: `events.ts`.**

```ts
import type { BlackjackView, BjSeat } from '@/entities/game-table';
import { COLLECT, DEAL_FLY, DEAL_STEP, FLIP, WIN_FLY, type Ghost } from '@/widgets/card-table';
import { DEALER_DRAW } from './motion';

/**
 * Что произошло между двумя снимками стола — глазами крупье, как у покера:
 * сервер присылает состояние, движение выводится здесь одной чистой функцией.
 */
export type BjLineKey = 'placeBets' | 'noMoreBets' | 'dealerBlackjack' | 'dealerBust' | 'dealerHas' | 'blackjack' | 'left';

export interface BjLine {
  id: number;
  key: BjLineKey;
  name?: string | null;
  seat?: number;
  n?: number;
}

export interface CardMove {
  kind: 'fly' | 'flyFlip' | 'flip';
  delay: number;
}

export interface Track {
  view: BlackjackView;
  /** Раунд, чью сдачу видели вживую: колода тасуется, карты летят. */
  dealtRound: string | null;
  /** Раунд, чей расчёт видели вживую: фишки едут, ставки уходят со стола в свой момент. */
  settledRound: string | null;
  /** Карта (`cardKey`/`dealerKey`) → её движение. Копится весь раунд. */
  cards: Record<string, CardMove>;
  /** Когда крупье закончил и деньги поехали. */
  payAt: number;
  ghosts: Ghost[];
  lines: BjLine[];
  seq: number;
}

const MAX_LINES = 3;
/** Полёт с переворотом — `ct-fly-flip` в globals.css. */
const LAND = DEAL_FLY + FLIP;

export const cardKey = (seat: number, hand: number, i: number, card: string) => `${seat}:${hand}:${i}:${card}`;
export const dealerKey = (i: number, card: string | null) => `d:${i}:${card ?? 'hole'}`;

export function initTrack(view: BlackjackView): Track {
  return { view, dealtRound: null, settledRound: null, cards: {}, payAt: 0, ghosts: [], lines: [], seq: 0 };
}

const inRound = (v: BlackjackView) => v.seats.filter((s) => s.hands.length > 0);

export function advance(track: Track, next: BlackjackView): Track {
  const prev = track.view;
  const out: Track = { ...track, view: next };
  let seq = track.seq;
  const ghosts: Ghost[] = [];
  const lines: BjLine[] = [];
  const say = (l: Omit<BjLine, 'id'>) => lines.push({ ...l, id: ++seq });
  const ghost = (g: Omit<Ghost, 'id'>) => ghosts.push({ ...g, id: ++seq });

  const nextBySeat = new Map(next.seats.map((s) => [s.seatIndex, s]));
  for (const p of prev.seats) {
    const n = nextBySeat.get(p.seatIndex);
    if (!n || n.userId !== p.userId) say({ key: 'left', name: p.name, seat: p.seatIndex });
  }
  if (next.phase === 'betting' && prev.phase !== 'betting') say({ key: 'placeBets' });

  const newRound = !!next.roundId && next.roundId !== prev.roundId;
  let cards: Record<string, CardMove> = next.roundId && !newRound ? { ...track.cards } : {};
  let landed = 0; // когда долетит последняя карта игроков из этого снимка

  if (newRound) {
    if (prev.phase === 'betting') say({ key: 'noMoreBets' });
    out.dealtRound = next.roundId;
    const players = inRound(next);
    const n = players.length;
    players.forEach((s, i) => {
      s.hands[0].cards.slice(0, 2).forEach((c, r) => {
        cards[cardKey(s.seatIndex, 0, r, c)] = { kind: 'flyFlip', delay: (r * (n + 1) + i) * DEAL_STEP };
      });
    });
    const d = next.dealer?.cards ?? [];
    if (d[0]) cards[dealerKey(0, d[0])] = { kind: 'flyFlip', delay: n * DEAL_STEP };
    const holeDelay = (2 * n + 1) * DEAL_STEP;
    cards[dealerKey(1, d[1] ?? null)] = { kind: d[1] ? 'flyFlip' : 'fly', delay: holeDelay };
    landed = holeDelay + LAND;
  } else if (next.roundId) {
    const prevBySeat = new Map(prev.seats.map((s) => [s.seatIndex, s]));
    for (const s of inRound(next)) {
      // Новые — карты, которых у места не было: при сплите старая карта
      // переезжает во вторую руку и летать не должна.
      const had = new Map<string, number>();
      for (const c of (prevBySeat.get(s.seatIndex)?.hands ?? []).flatMap((h) => h.cards)) had.set(c, (had.get(c) ?? 0) + 1);
      let k = 0;
      s.hands.forEach((h, hi) =>
        h.cards.forEach((c, ci) => {
          const left = had.get(c) ?? 0;
          if (left > 0) {
            had.set(c, left - 1);
            return;
          }
          const delay = k++ * DEAL_STEP;
          cards[cardKey(s.seatIndex, hi, ci, c)] = { kind: 'flyFlip', delay };
          landed = Math.max(landed, delay + LAND);
        }),
      );
    }
  }

  if (next.phase === 'done' && next.roundId && (newRound || prev.phase !== 'done')) {
    const d = next.dealer?.cards ?? [];
    const reveal = landed;
    if (!newRound && d[1]) cards[dealerKey(1, d[1])] = { kind: 'flip', delay: reveal };
    let end = reveal + FLIP;
    d.slice(2).forEach((c, i) => {
      const delay = reveal + FLIP + i * DEALER_DRAW;
      if (c) cards[dealerKey(i + 2, c)] = { kind: 'flyFlip', delay };
      end = delay + LAND;
    });
    out.settledRound = next.roundId;
    out.payAt = end;

    const total = next.dealer?.total ?? 0;
    if (d.length === 2 && total === 21) say({ key: 'dealerBlackjack' });
    else if (total > 21) say({ key: 'dealerBust' });
    else if (d.length > 2 || inRound(next).some((s) => s.hands.some((h) => h.outcome !== 'bust' && h.outcome !== 'blackjack'))) {
      say({ key: 'dealerHas', n: total });
    }

    for (const s of inRound(next)) {
      if (s.hands.some((h) => h.outcome === 'blackjack')) say({ key: 'blackjack', name: s.name, seat: s.seatIndex });
      const lost = s.hands.filter((h) => h.payout === 0).reduce((a, h) => a + h.bet, 0);
      const won = s.hands.reduce((a, h) => a + Math.max(0, h.payout - h.bet), 0);
      const back = s.hands.reduce((a, h) => a + h.payout, 0);
      if (lost > 0) ghost({ what: 'chips', from: { bet: s.seatIndex }, to: 'dealer', delay: end, amount: lost });
      if (won > 0) ghost({ what: 'chips', from: 'dealer', to: { bet: s.seatIndex }, delay: end, amount: won, ms: WIN_FLY });
      if (back > 0) ghost({ what: 'chips', from: { bet: s.seatIndex }, to: { seat: s.seatIndex }, delay: end + WIN_FLY, amount: back, ms: COLLECT });
    }
  }

  if (!next.roundId) {
    cards = {};
    out.settledRound = null;
  }
  out.cards = cards;
  out.ghosts = ghosts.length ? [...track.ghosts, ...ghosts] : track.ghosts;
  out.lines = lines.length ? [...track.lines, ...lines].slice(-MAX_LINES) : track.lines;
  out.seq = seq;
  return out;
}
```

- [ ] **Step 4:** `npx vitest run src/views/blackjack-table` — PASS.
- [ ] **Step 5: Компоненты.**
  - `DealerHand({ dealer, roundId, moves })`: `div.bj-dealer` (высота постоянная и без раунда), `div.bj-cards` с `PlayingCard size="md"` по `dealer.cards` (`null` → рубашка), ключ `${roundId}:${dealerKey(i, c)}`, движение `moves[dealerKey(i, c)]` + смещение `offsetFrom(DEALER, DEALER_HAND)`; счёт `bj-total` с ключом по счёту, `animationDelay` — когда легла последняя карта.
  - `BjSeat({ seat, at, me, phase, roundId, moves, payAt, settled, timerMs, deadline })`: обёртка `ct-seat` (`ct-me`, `ct-turn`, `ct-win` при чистом плюсе, `--win-delay: payAt + WIN_FLY + COLLECT`); `div.bj-hands` — руки: `div.bj-hand` (+`bj-active` у играемой, `bj-o-<outcome>`) с веером `div.bj-cards` (`PlayingCard size={me ? 'md' : 'sm'}`, ключ `${roundId}:${cardKey(...)}`, движение с `offsetFrom(DEALER, at)`), `bj-total` («7/17» у мягкой), `bj-outcome` с задержкой `payAt`; `SeatPlate` (`turn` при `seat.isTurn && deadline`, `stackDelay` = `payAt + WIN_FLY + COLLECT` в раунде, чей расчёт виден вживую); статус `ct-status`: «Отошёл» при `sitOut` без рук, «+N» (`pos`) при чистом плюсе с задержкой; ставка `ct-bet` у `betPoint(at)` — сумма (в окне — `seat.bet`, в раунде — ставки рук), ключ по месту и сумме; в `done` — только если `settled`, с классом `bj-bet-out` и `--out` = `payAt` (всё проиграно) или `payAt + WIN_FLY`.
  - `BetPanel({ min, max, stack, placed, deadline, timerMs, initial, pending, onBet })`: полоса `bj-countdown` (как `TurnTimer`: время читается один раз при монтаже, отрицательная задержка); фишки `DENOMS` не выше `min(max, stack)` по возрастанию — `Button variant="none" className="bj-chip"` с `ChipStack amount={d} max={1} width={34}` и номиналом; ряд: «Очистить» (`ct-act`), сумма `bj-draft n`, «Поставить»/«Переставить» (`ct-act`, неактивна вне `[min, cap]` и в `pending`); при `placed` — `fhint` «Ставка {n} принята — ждём остальных». Черновик стартует с `initial` (прошлая ставка), зажатой в `[min, cap]`.
  - `ActionBar({ legal, pending, onAct })`: `div.bj-buttons` — «Ещё», «Хватит», «Дабл», «Сплит» (`ct-act`, `disabled={!legal[x] || pending}`).
  - `Page.tsx`: `BlackjackTablePage({ id })` — `useBlackjackView`, `useTableSocket(id, 'blackjack_state', blackjackViewKey)`, `TableFrame className="bj-page"`; внутренний `Table` — трек как у покера (`if (track.view !== view) setTrack(advance(track, view))`), `useSeatPoints`, `useLeaveOnExit(id, seated, blackjackViewKey)`, `TableShell backHref="/games/blackjack" menu={<TableMenu />}`; `CardTable` с `shuffleKey={track.dealtRound === view.roundId ? view.roundId : null}`, центр: `DealerSay` (render по `blackjack.dealer.*`, имя — `name ?? cardTable.player`), `DealerHand`, `p.bj-rules`; места — `BjSeat` или `EmptySeat` (`canSit` зрителю открытого стола, `BuyInDialog` с лимитами buy-in); `overlay` — `Effects`. Низ сидящего: `div.ct-controls` → панель (окно ставок и `me.canBet` → `BetPanel key={view.deadline}`; `me.legal` → `ActionBar`; иначе `p.ct-wait` со статусом: `sittingOut` / `broke` (стек < `minBet`) / `turnOf` / `roundOver` / `waiting`) и `div.ct-toggles` с `Toggle` «Пропускать раунды»; под ним `ErrorNote` ошибки ставки или хода. Зритель — `ct-wait` `spectatorHint`/`tableClosed`. Прошлая ставка — `useRef`, пишется в `onSuccess` ставки.
  - Роут `app/(app)/games/blackjack/[id]/page.tsx` — как покерный.
- [ ] **Step 6: Стили** — в конец блока стола в `globals.css`:

```css
/* ── СТОЛ БЛЭКДЖЕКА (/games/blackjack/<id>) ─────────────────────────────────
   Тот же стол, что у покера (`widgets/card-table`); здесь только своё: рука
   крупье в центре сукна, руки мест веером, панель ставок. */
@layer base {
  .ct-page :is(.bj-total, .bj-outcome) { border-radius: 999px !important; }
}
@layer components {
  .bj-page .ct-bottom { min-height: 132px; }
  .bj-dealer { display: flex; align-items: center; gap: 8px; min-height: calc(46px * 1.4); }
  .bj-cards { display: flex; perspective: 500px; }
  /* Веер: каждая следующая карта ложится на предыдущую, угол с рангом виден. */
  .bj-cards > * + * { margin-left: calc(var(--w) * -0.58); }
  .bj-hands { display: flex; gap: 10px; margin-bottom: -8px; position: relative; z-index: 0; }
  .bj-hand { position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .bj-total {
    padding: 1px 7px;
    font-size: 11px;
    font-weight: 700;
    color: var(--g-ink);
    background: rgb(0 0 0 / 0.65);
    animation: ct-pop-in 260ms cubic-bezier(0.3, 1.6, 0.5, 1) both;
  }
  .bj-active .bj-total { background: var(--ct-green); color: #06140b; }
  .bj-outcome {
    position: absolute;
    top: -10px;
    padding: 1px 8px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    background: rgb(0 0 0 / 0.72);
    color: var(--g-ink-2);
    animation: ct-pop-in 260ms cubic-bezier(0.3, 1.6, 0.5, 1) both;
  }
  .bj-o-win .bj-outcome,
  .bj-o-blackjack .bj-outcome { color: var(--ct-green); }
  .bj-o-lose .bj-outcome,
  .bj-o-bust .bj-outcome { color: #ff6b5a; }
  .bj-rules {
    margin: 0;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--g-ink-3);
    text-align: center;
  }
  .bj-bet-out { animation: ct-bet-in 320ms cubic-bezier(0.2, 0.7, 0.2, 1) both, bj-fade 200ms ease var(--out, 0ms) forwards; }
  @keyframes bj-fade { to { opacity: 0; } }

  .bj-bet { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%; }
  .bj-countdown { width: 100%; max-width: 420px; height: 3px; background: rgb(255 255 255 / 0.08); overflow: hidden; }
  .bj-countdown > span {
    display: block;
    height: 100%;
    background: var(--ct-green);
    transform-origin: left;
    animation: bj-count var(--bj-ms, 15s) linear forwards;
  }
  @keyframes bj-count { from { scale: 1 1; } to { scale: 0 1; } }
  .bj-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
  .bj-chip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 2px 4px;
    background: transparent;
    border: 0;
    color: var(--g-ink-2);
    font-size: 11px;
    cursor: pointer;
    transition: scale 120ms, color 150ms;
  }
  .bj-chip:hover { color: var(--g-ink); }
  .bj-chip:active { scale: 0.94; }
  .bj-bet-row { display: flex; align-items: center; gap: 12px; }
  .bj-bet-row .ct-act { min-width: 120px; padding: 0 14px; }
  .bj-draft { min-width: 72px; text-align: center; font-size: 18px; font-weight: 700; }
  .bj-buttons { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; width: 100%; max-width: 600px; }
  @media (max-width: 720px) {
    .bj-page .ct-bottom { min-height: 200px; }
    .bj-buttons { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
}
```

- [ ] **Step 7:** `npx tsc --noEmit`, `npx eslint src/views/blackjack-table src/views/blackjack-lobby src/widgets/card-table`, `npx vitest run` — зелёные; затем `npx next build` (новые роуты и рефактор на 5+ файлов — по правилам проекта билд обязателен).

---

### Task 9: Документация и память

**Files:** `CLAUDE.md`, память проекта.

- [ ] **Step 1:** `CLAUDE.md`: раздел «Блэкджек» после «Покер» — решения из спеки (казино, ставка окна в памяти, `GAME_PAYOUT` ушедшему, окно 15 с и «пропускает раунды», перетасовка на раунд, закрытая карта не попадает в вид, стол из `widgets/card-table`); в «Столы карточных игр» — блэкджек написан, возврат прерванных раздач в `GamesService`; в «Покер» — `.pk-page` → `.ct-page`, общий стол вынесен в `widgets/card-table` (сцена, оболочка, летящие предметы по точкам стола), классы `ct-`/`pk-`/`bj-`; строку про `Dealer`/`Effects` — пути виджета.
- [ ] **Step 2:** Память: `virex_blackjack_done.md` (что сделано, где спека, как проверять — сквозным прогоном) + строка в `MEMORY.md`.
- [ ] **Step 3:** Финальная проверка: `backend` — `npx tsc --noEmit`, `npx jest`; `frontend` — `npx tsc --noEmit`, `npx vitest run`, `npx next build`.
