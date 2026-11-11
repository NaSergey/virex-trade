# Подводящий стоп — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: гибрид (CLAUDE.md владельца): код инлайн, TDD на каждой задаче,
> ревью свежим Sonnet в контрольных точках. Шаги — чекбоксы (`- [ ]`).

**Goal:** подводящий стоп (трейлинг до безубытка) во всех четырёх исполнителях терминала — галочка в панели ордера
(«Маркет», «Лимит», «Сетка») и в окне «Изменить уровни».

**Architecture:** свойство позиции `trailDist` (расстояние в цене). Одна чистая формула `trailStop` (копия во
фронте и бэке, как `fills.ts`), её зовут: прокрутка браузера (минутки), движок эфира (отрезки), `worker` биржи
(маркировка раз в 2 с), демо-счёт главной (цена опроса). Спека — `docs/superpowers/specs/2026-11-11-trailing-stop-design.md`.

**Tech Stack:** NestJS + Prisma (Postgres), Next.js + react-query, vitest (фронт), jest (бэк).

## Global Constraints

- Стоп только подтягивается и не дальше безубытка (средний вход позиции); стоп в безубытке или дальше — не двигается.
- Новый стоп действует со следующего шага: сначала проверка выхода, потом подтяжка.
- `trailDist` — цена, > 0; `null` — выключен. `undefined` в правке — «не трогать».
- Ордер, доливший позицию, её `trailDist` не меняет.
- Float из базы в WHERE — только неравенства (`lt`/`gt`), не равенство.
- Схема — только добавленные столбцы и таблица (`db push` без `--accept-data-loss`).
- Тексты интерфейса — ключи i18n в `ru.json`/`en.json` (вставкой, без переформатирования файла).
- Bybit — только через `bybitFetch`/`BybitTerminalClient` (шлюз).

## Разметка риска и контрольные точки

| Задачи | Класс | Точка ревью |
|---|---|---|
| 1–5 (правило, прокрутка, сервер сессий, движок, фронт сессий) | A | **КТ-1** после задачи 5 |
| 6 (панель, окно, график), 7–9 (биржа: сервер, worker, фронт), 10 (демо) | A + стык фронт↔исполнители | **КТ-2** после задачи 10 |
| 11 (CLAUDE.md, сборка) | C | без ревью |

Точек две, стык фронт↔исполнители входит в КТ-2 — финальный Opus не нужен.

---

### Task 1: Формула `trailStop` (обе копии `fills.ts`)

**Files:** `frontend/src/widgets/backtest-session/lib/fills.ts`, `fills.test.ts`;
`backend/src/backtest/fills.ts`, `fills.spec.ts`.

**Produces:** `trailStop(direction: Direction, stop: number, dist: number | null | undefined, entry: number, extreme: number): number`
— новый стоп (тот же, если не двигается). `extreme` — максимум шага у лонга, минимум у шорта.

- [ ] Тесты (одинаковые в обеих копиях):

```ts
describe('trailStop', () => {
  it('лонг: стоп идёт за максимумом на расстоянии', () => expect(trailStop('long', 98, 2, 105, 101)).toBe(99));
  it('лонг: цена не выше прежнего — стоп стоит', () => expect(trailStop('long', 98, 2, 105, 99.5)).toBe(98));
  it('лонг: не дальше безубытка', () => expect(trailStop('long', 98, 2, 100, 110)).toBe(100));
  it('лонг: стоп в безубытке и дальше — не двигается', () => {
    expect(trailStop('long', 100, 2, 100, 110)).toBe(100);
    expect(trailStop('long', 101, 2, 100, 110)).toBe(101);
  });
  it('шорт — зеркально', () => {
    expect(trailStop('short', 102, 2, 95, 99)).toBe(101);
    expect(trailStop('short', 102, 2, 100, 90)).toBe(100);
    expect(trailStop('short', 99, 2, 100, 90)).toBe(99);
  });
  it('без расстояния — стоп как есть', () => {
    expect(trailStop('long', 98, null, 105, 120)).toBe(98);
    expect(trailStop('long', 98, 0, 105, 120)).toBe(98);
  });
});
```

- [ ] Падают → реализация (обе копии):

```ts
/**
 * Подводящий стоп: стоп идёт за ценой на расстоянии `dist`, только подтягиваясь и
 * не дальше безубытка (`entry`, средний вход позиции); стоп в безубытке или дальше
 * не двигается. `extreme` — максимум шага у лонга, минимум у шорта.
 */
export function trailStop(direction: Direction, stop: number, dist: number | null | undefined, entry: number, extreme: number): number {
  if (dist == null || !(dist > 0) || !(stop > 0)) return stop;
  if (direction === 'long') {
    if (stop >= entry) return stop;
    const target = Math.min(extreme - dist, entry);
    return target > stop ? target : stop;
  }
  if (stop <= entry) return stop;
  const target = Math.max(extreme + dist, entry);
  return target < stop ? target : stop;
}
```

- [ ] Тесты проходят (`npx vitest run …/fills.test.ts`, `npx jest src/backtest/fills.spec.ts`), коммит.

### Task 2: Прокрутка браузера — стоп по минуткам

**Files:** `frontend/src/widgets/backtest-session/lib/fills.ts`, `lib/advance.ts`, `fills.test.ts`, `advance.test.ts`.

**Produces:** `Position.trailDist?: number | null`, `Position.entryPrice?: number`; `findExit` двигает стоп между
минутками; `trailedStop(p, minutes, from, to): number`; `OpenPosition` несёт `trailDist`, `entryPrice`;
`AdvanceResult.trails: { tradeId: string; stopLoss: number }[]` — стопы позиций без выхода, сдвинутые к `reach`.

- [ ] Тесты: `findExit` — лонг 100, стоп 98, d 2; минутки h 101/l 100, затем l 98.5 → выход `stop` по 99 во второй
  минутке (без трейлинга выхода нет); в одной минутке h 103 и l 99 → выхода нет (стоп пришёл 98), следующая l 100.5 →
  стоп 101 → выход по 101. `trailedStop` — стоп на конец отрезка. `advanceTo` — `trails` у позиции без выхода, нет у
  закрытой, обрезаны по `reach` при раннем входе ордера.
- [ ] Реализация: в `findExit` держать `let s = p.stopLoss`, проверять `checkMinute({ ...p, stopLoss: s }, m, …)`, после —
  `s = trailStop(p.direction, s, p.trailDist, p.entryPrice ?? 0, long ? m.h : m.l)` (при `entryPrice` undefined —
  `trailDist` игнорируется). `trailedStop` — тот же проход без проверки выхода. `advanceTo` — после вычисления
  `reach`: для позиций с `trailDist` и без выхода `trailedStop(position, minutes, max(entryTime, from), reach)`, в
  `trails`, если стоп изменился.
- [ ] Тесты проходят, коммит.

### Task 3: Сервер сессий — поля, открытие, правка, `trail`

**Files:** `backend/prisma/schema.prisma`; `backend/src/backtest/backtest.service.ts`, `dto/backtest.dto.ts`,
`backtest.controller.ts`, `backtest.service.spec.ts`.

**Produces:**
- `BacktestTrade.trailDist Float?`, `BacktestEntryOrder.trail Boolean @default(false)`.
- `OpenTradeInput.trail?: boolean`, `CreateEntryOrdersInput.trail?: boolean`, `ModifyTradeInput.trailDist?: number | null`.
- `BacktestService.trailTrade(userId, tradeId, stopLoss): Promise<{ trade }>`, `systemTrail(tradeId, stopLoss): Promise<boolean>`.
- `POST /api/backtest/trades/:id/trail { stopLoss }`.

- [ ] Тесты (`backtest.service.spec.ts`, по образцу соседних): рынок с `trail` → `trailDist = |вход − стоп|`; ордер с
  `trail`, открывший позицию → то же от цены ордера; ордер с `trail`, доливший позицию → `trailDist` позиции прежний;
  `createEntryOrders` пишет `trail`, `moveEntryOrder` переносит; `modifyTrade({ trailDist })` ставит/снимает;
  `trailTrade` подтягивает, не ослабляет, режет до безубытка, без `trailDist` — не трогает, закрытая — без ошибки, эфир —
  409 `BACKTEST_TRAIL_LIVE`.
- [ ] Схема, `npx prisma generate` (если EPERM — остановить nest, см. память).
- [ ] Реализация:
  - `openInTx`: в `create` — `trailDist: input.trail ? Math.abs(input.entryPrice - input.stopLoss) : null`.
  - `openChecked`/`systemEnter`: `trail: order?.trail` — у ордера из строки (`systemEnter` передаёт `order.trail`,
    браузерный путь читает строку в `takeEntryOrder` и подставляет `trail: input.trail || order?.trail`).
  - `createEntryOrders`/`moveEntryOrder`: `trail: input.trail ?? false` / `trail: order.trail`.
  - `modifyTrade`: `if (input.trailDist !== undefined) data.trailDist = input.trailDist`.
  - `applyTrail(tx|prisma, trade, stopLoss)` — общий у `trailTrade` и `systemTrail`:

```ts
/**
 * Подводящий стоп (`trailDist`) на новый уровень: только теснее и не дальше
 * безубытка. Условным `updateMany` — неравенство float, а не равенство: гонка с
 * правкой или закрытием просто не находит строку. `false` — стоп не сдвинулся.
 */
protected async applyTrail(trade: { id: string; direction: string; entryPrice: number; stopLoss: number; trailDist: number | null }, stopLoss: number): Promise<boolean> {
  if (trade.trailDist == null) return false;
  const long = trade.direction === 'long';
  const target = long ? Math.min(stopLoss, trade.entryPrice) : Math.max(stopLoss, trade.entryPrice);
  if (long ? !(target > trade.stopLoss) : !(target < trade.stopLoss)) return false;
  const { count } = await this.prisma.backtestTrade.updateMany({
    where: { id: trade.id, exitTime: null, trailDist: { not: null }, stopLoss: long ? { lt: target } : { gt: target } },
    data: { stopLoss: target },
  });
  return count > 0;
}
```

  - `trailTrade`: `ownedTrade`; эфир (`isLive(trade.session)`) — `ConflictException({ code: 'BACKTEST_TRAIL_LIVE' })`;
    закрыта — вернуть как есть; иначе `applyTrail` и отдать свежую `tradeView`.
  - `systemTrail(tradeId, stopLoss)`: свежее чтение, `applyTrail`.
  - DTO: `OpenTradeDto.trail?` (`@IsOptional() @IsBoolean()`), `CreateEntryOrdersDto.trail?`,
    `ModifyTradeDto.trailDist?` (`@IsOptional() @IsPositive()`), `TrailTradeDto { @IsPositive() stopLoss }`; маршрут.
- [ ] Тесты проходят, коммит.

### Task 4: Движок эфира

**Files:** `backend/src/backtest/live-engine.service.ts`, `live-engine.service.spec.ts`.

- [ ] Тест: лонг с `trailDist` 2, вход 100, стоп 98 → отрезок h 101 l 100 без выхода → `systemTrail(id, 99)`; отрезок с
  выходом — `systemTrail` не зовётся; без `trailDist` — не зовётся.
- [ ] `applySegment`: сделка несёт `trailDist`; `if (!exit) { const next = trailStop(direction, stop, trade.trailDist, trade.entryPrice, long ? bar.h : bar.l); if (next !== stop) await this.backtest.systemTrail(trade.id, next); return; }`.
  Стоп в проходах после частичного лимита — тот же (лимит стоп не двигает, кроме `followStop` — его увидит следующий отрезок).
- [ ] Коммит.

### Task 5: Фронт сессий — типы, запросы, прокрутка

**Files:** `widgets/backtest-session/api/types.ts`, `api/hooks.ts`, `model/actions.ts`, `model/useReplay.ts`,
`components/SessionScreen.tsx`.

**Produces:** `BacktestTrade.trailDist: number | null`; `BacktestEntryOrder.trail?: boolean`; `OpenTradeVars.trail?`,
`EntryOrdersVars.trail?`, `modify` vars `trailDist?: number | null`; `trailTrade(sessionId, tradeId, stopLoss)` в `api/hooks.ts`;
`useReplay(..., onTrail)`.

- [ ] Типы, хуки (`useOpenTrade`, `useCreateEntryOrders`, `useModifyTrade` — поля проходят как есть), функция
  `trailTrade` (POST + `invalidateQueries(sessionKey)`).
- [ ] `useReplay`: параметр `onTrail: (trade: BacktestTrade, stopLoss: number) => Promise<unknown>`; карта
  `trailed: Map<tradeId, { dist: number; stop: number }>` в ref; стоп позиции для проверки — теснее серверного и своего,
  если `trade.trailDist === own.dist`; после `advanceTo` — `trails` в карту; для каждой сделки, где свой теснее
  серверного и запроса в полёте нет (`createInFlight`), — `onTrail`. Закрытые/пропавшие сделки — из карты вон.
- [ ] `SessionScreen`: `onTrail` = `trailTrade(detail.session.id, …)`; `open`/`openLimit`/`openScaled` шлют `trail` из
  панели; `applyLevels(trade, price, stop, take, trailOn?)` — `trailDist`: включено и стоп сдвинут (или включают
  впервые) → `|fromScreen(price) − fromScreen(stop)|`; выключено при включённом → `null`; иначе не слать.
- [ ] `npx tsc --noEmit`, vitest, коммит.

**КТ-1:** ревью задач 1–5 (Sonnet): правило, порядок «выход → подтяжка», гонки `applyTrail`, локальный стоп прокрутки.

### Task 6: Интерфейс — панель, окно, график

**Files:** `components/OrderPanel.tsx`, `ChangeLevelsModal.tsx`, `SessionScreen.tsx`, `ReplayChart.tsx` (`Level.trail?`),
`model/useTrailSetting.ts` (новый), `globals.css`, `ru.json`/`en.json`.

- [ ] `useTrailSetting()` — `[on, setOn]`, `localStorage` `virex.terminal.trail` в try/catch (приём `useDefaultLeverage`).
- [ ] `OrderPanel`: пропсы `trail`, `onTrail`; в `fld-head` стопа «Маркета», «Лимита», «Сетки» — `<label className="trail-chk">`
  с checkbox и `t('trail')`, `title={t('trailHint')}`.
- [ ] `ChangeLevelsModal`: `useState(trade.trailDist != null)`, checkbox `t('trailStop')` под полем стопа, `onApply(stop, take, trail)`.
- [ ] График: `Level.trail?: boolean`, подпись стопа — `t('trailStopLabel')` вместо `levelLabel('stop')`.
- [ ] i18n `backtest.trail` «Подводящий»/«Trailing», `trailHint`, `trailStop` «Подводящий стоп»/«Trailing stop»,
  `trailStopLabel` «Подв. стоп»/«Trail stop».
- [ ] tsc, eslint, коммит.

### Task 7: Биржа — план, `placeOrders`, `setLevels`, состояние

**Files:** `backend/prisma/schema.prisma` (`TerminalTrailStop`), `backend/src/terminal/stream/trail-stop.store.ts` (новый),
`terminal.service.ts`, `dto/terminal.dto.ts`, `terminal-math.ts` (`TerminalPosition.trail?`), `terminal.module.ts`,
`terminal.service.spec.ts`.

**Produces:** `TrailStopStore`: `upsert(userId, { symbol, direction, distance, orderIds, seen })`,
`dropUnseen(userId, symbol, direction)`, `remove(userId, symbol, direction)`, `activeUsers()`, `activeOf(userId)`,
`update(id, data)`, `activeDistances(userId): Map<'SYM:dir', number>`.

```prisma
/// Подводящий стоп позиции на бирже (спека 2026-11-11-trailing-stop-design.md): api заводит, worker ведёт.
model TerminalTrailStop {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  symbol    String
  /// long | short
  direction String
  /// Расстояние от цены до стопа, в цене.
  distance  Float
  /// Ордера, которые откроют позицию (неувиденный план ждёт их).
  orderIds  String[]
  /// Позицию уже видели: её нет — план кончился.
  seen      Boolean  @default(false)
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, symbol, direction])
  @@index([active, userId])
  @@map("terminal_trail_stops")
}
```

- [ ] Тесты `terminal.service.spec.ts`: рынок с `trail` без позиции → `upsert` с `|last − stop|` и id ордера; лимиты
  лонга → расстояние от верхнего уровня; ордер без `trail` на свободную сторону → `dropUnseen`; позиция есть → план не
  трогается; `setLevels({ trailDist: 3 })` → `upsert(seen: true)`, `null` → `remove`; `state` — `trail` у позиции.
- [ ] Реализация, коммит.

### Task 8: Биржа — `TrailStopService` (worker)

**Files:** `backend/src/terminal/stream/trail-stop.service.ts` (новый), `.spec.ts`, `terminal.module.ts`.

- [ ] Тесты: позиция лонг вход 100 стоп 98, план d 2, маркировка 101 → `trading-stop` `stopLoss 99` и нынешний тейк;
  маркировка 100.02 (меньше шага 0,05 %) → нет; стоп ≥ входа → нет; свежая позиция со стопом теснее → нет; меньше 3 с
  с прошлой записи → нет; позиции нет после `seen` → `active: false`; неувиденный: ордер висит — ждёт, нет ордеров и
  > 30 с → `active: false`; позиция появилась → `seen: true`.
- [ ] Реализация по образцу `StopFollowService` (очередь на пользователя, `pinned`, `onIdle`), регистрация третьим в
  `StreamListeners`.
- [ ] Коммит.

### Task 9: Биржа — фронт

**Files:** `views/terminal/model/useExchangeActions.ts`, `views/terminal/api/types.ts`, `views/terminal/lib/adapt.ts`, `adapt.test.ts`.

- [ ] `open`/`createEntryOrders` — `trail: v.trail`; `modify` — `trailDist: v.trailDist`; `TerminalPosition.trail?: number | null`;
  `toDetail` → `trailDist: p.trail ?? null`, ордера → `trail: false`. Тест адаптера. Коммит.

### Task 10: Демо-счёт главной

**Files:** `views/landing/lib/demoAccount.ts`, `demoAccount.test.ts`, `views/landing/model/useDemoTerminal.ts`.

- [ ] Тесты: открытие с `trail`; ордер с `trail` открыл/долил; `modifyTrade` с `trailDist`; `tick` — стоп по цене опроса
  после проверки выхода, до безубытка.
- [ ] Реализация (`trailStop` из `widgets/backtest-session` через его `index.ts`), коммит.

**КТ-2:** ревью задач 6–10 (Sonnet): worker и гонки стопа на бирже, жизнь плана, стык панели/окна с тремя исполнителями.

### Task 11: Документация и сборка

- [ ] Раздел в `CLAUDE.md` («Терминал: подводящий стоп»), запись в памяти.
- [ ] `npx next build` (фронт), `npx tsc --noEmit` и `npx jest` (бэк), `npx vitest run` (фронт).
- [ ] Коммит.
