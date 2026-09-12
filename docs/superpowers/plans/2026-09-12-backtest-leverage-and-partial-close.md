# Бектест: плечо, добор позиции, частичное закрытие лимитками и по рынку — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать бектесту плечо, добор позиции той же стороны, частичное закрытие лимит-ордерами (ждут цену в реплее) и по рынку (сразу), с таблицей открытой позиции и вкладками под графиком.

**Architecture:** `BacktestTrade` остаётся одной строкой на позицию (плечо, средневзвешенный вход после добора, `closedQty` — сколько уже закрыто частями). Каждое закрытие (частичное или финальное) пишет строку в новую `BacktestTradeExit`; агрегаты (`exitTime`/`exitPrice`/`pnl`/`r`) на `BacktestTrade` заполняются только когда `closedQty` достигает `qty`. Висящие лимит-ордера на закрытие — новая `BacktestCloseOrder`, проверяются в реплее той же цепочкой, что стоп/тейк. `OrderPanel` перестаёт знать, открыта ли сделка; открытая позиция и её закрытие живут в новом `OpenPositionsPanel` под графиком, во вкладке рядом с историей сделок сессии.

**Tech Stack:** NestJS + Prisma (backend/src/backtest), Next.js App Router + React (frontend/src/views/backtest), Jest (backend), Vitest (frontend lib-тесты).

## Global Constraints

- Отвечать пользователю и писать код-комментарии по-русски (как весь остальной код проекта); имена файлов/функций/переменных — на английском, как принято в проекте.
- Мелкая правка (1–2 файла, без миграции и зависимостей) не требует `npx next build`; здесь схема и бэкенд меняются — обязателен полный прогон бэкенд-тестов и `npx next build` перед финальным коммитом (см. Task 17).
- Прежде чем запускать `npx prisma migrate dev`, остановить `nest watch` — иначе генератор падает `EPERM` (движок держит процесс).
- Порты БД/API не публикуются на `0.0.0.0` — не относится к этой задаче, упомянуто как общее правило проекта, ничего здесь не меняет.
- Существующий инвариант «одна открытая сделка на сессию» (`BacktestTrade.exitTime == null`) не меняется никаким тасом ниже.
- **Вне рамок этого плана** (были помечены необязательными в исходных спеках, не блокируют остальное): маркеры входа/выхода на графике для закрытых сделок сессии; разбивка частичных закрытий на отдельные строки в истории (вкладка показывает готовый агрегат `BacktestTrade`); перетаскивание лимит-ордера по графику; хедж (лонг и шорт одновременно).

---

## Task 1: Схема — плечо, частичное закрытие, лимит-ордера

**Files:**
- Modify: `backend/prisma/schema.prisma` (модель `BacktestTrade`, ~строка 284–309)
- Create: миграция через `npx prisma migrate dev --name backtest_leverage_partial_close`

**Interfaces:**
- Produces: поля `BacktestTrade.leverage: number`, `BacktestTrade.closedQty: number`; модели `BacktestTradeExit`, `BacktestCloseOrder` — все следующие бэкенд-таски читают/пишут их через Prisma Client.

- [ ] **Step 1: Остановить dev-процессы, которые держат Prisma engine**

Остановить `npm run start:dev` / `nest watch`, если запущен (см. память `prisma_generate_eperm_windows`).

- [ ] **Step 2: Изменить `BacktestTrade` и добавить новые модели**

В `backend/prisma/schema.prisma` заменить блок `model BacktestTrade { ... }` (строки ~284–309) на:

```prisma
/// Сделка бектеста. Открытая — это сделка с пустым exitTime; отдельной
/// «позиции» нет. Цены настоящие, без масштаба показа.
///
/// closedQty растёт с каждым частичным закрытием (BacktestTradeExit); когда
/// доходит до qty, сделка закрыта и exitTime/exitPrice/exitReason/fee/pnl/r
/// становятся агрегатом по всем строкам BacktestTradeExit, а не одним событием.
model BacktestTrade {
  id         String          @id @default(uuid())
  sessionId  String
  session    BacktestSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  direction  String // 'long' | 'short'
  entryTime  DateTime
  entryPrice Float
  stopLoss   Float
  takeProfit Float?
  riskPct    Float
  riskUsdt   Float
  qty        Float
  /// Плечо, с которым сделка открыта; 1–100. Не меняется добором или правкой
  /// стопа/тейка — как на бирже, плечо позиции нельзя перевыставить, пока она
  /// открыта. @default(1) — только чтобы существующие строки могли мигрировать
  /// без ошибки NOT NULL; новые сделки всегда получают явное значение из DTO.
  leverage   Float           @default(1)
  /// Сколько уже закрыто частями (BacktestTradeExit.qty). qty - closedQty = остаток.
  closedQty  Float           @default(0)
  exitTime   DateTime?
  exitPrice  Float?
  exitReason String? // 'stop' | 'take' | 'manual' | 'finish' | 'limit'
  fee        Float?
  pnl        Float?
  r          Float?

  tags        BacktestTradeTag[]
  exits       BacktestTradeExit[]
  closeOrders BacktestCloseOrder[]

  @@index([sessionId])
  @@map("backtest_trades")
}

/// Одно частичное или финальное закрытие открытой сделки.
model BacktestTradeExit {
  id        String        @id @default(uuid())
  tradeId   String
  trade     BacktestTrade @relation(fields: [tradeId], references: [id], onDelete: Cascade)
  qty       Float
  price     Float
  time      DateTime
  reason    String // 'stop' | 'take' | 'manual' | 'finish' | 'limit'
  fee       Float
  pnl       Float
  /// Порядок вставки — по нему находим «последнее» закрытие при разборе
  /// повтора запроса (time — симулированное время в бектесте, не для этого).
  createdAt DateTime      @default(now())

  @@index([tradeId])
  @@map("backtest_trade_exits")
}

/// Висящий лимитный ордер на (частичное) закрытие. Живёт до срабатывания цены
/// в реплее или ручной отмены; на одну сделку может висеть несколько сразу.
model BacktestCloseOrder {
  id        String        @id @default(uuid())
  tradeId   String
  trade     BacktestTrade @relation(fields: [tradeId], references: [id], onDelete: Cascade)
  price     Float
  qty       Float
  createdAt DateTime      @default(now())

  @@index([tradeId])
  @@map("backtest_close_orders")
}
```

- [ ] **Step 3: Сгенерировать миграцию**

Run (из `backend/`): `npx prisma migrate dev --name backtest_leverage_partial_close`
Expected: миграция создаётся и применяется к dev-базе без ошибок; `npx prisma generate` отрабатывает как часть той же команды.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(backtest): схема — плечо, closedQty, BacktestTradeExit, BacktestCloseOrder

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `averageIn` в `backtest-math.ts`

**Files:**
- Modify: `backend/src/backtest/backtest-math.ts`
- Test: `backend/src/backtest/backtest-math.spec.ts` (создать, если не существует — проверить `Glob backend/src/backtest/*.spec.ts` перед стартом)

**Interfaces:**
- Produces: `averageIn(qtyA: number, entryA: number, qtyB: number, entryB: number): number` — использует Task 4 (`addToTrade`).

- [ ] **Step 1: Написать падающий тест**

Если файла `backend/src/backtest/backtest-math.spec.ts` нет — создать его с этим содержимым (если есть — добавить `describe` блок в конец):

```ts
import { averageIn } from './backtest-math';

describe('averageIn', () => {
  it('средневзвешенная цена по объёму', () => {
    expect(averageIn(10, 100, 10, 120)).toBeCloseTo(110, 9);
  });

  it('разные объёмы — вес больше у большего', () => {
    expect(averageIn(30, 100, 10, 140)).toBeCloseTo(110, 9);
  });
});
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd backend && npx jest backtest-math.spec.ts`
Expected: FAIL — `averageIn is not a function` / TS-ошибка импорта.

- [ ] **Step 3: Добавить функцию**

В `backend/src/backtest/backtest-math.ts` добавить в конец файла:

```ts
/** Средневзвешенная цена входа после добора тем же qty*entry-весом с обеих сторон. */
export function averageIn(qtyA: number, entryA: number, qtyB: number, entryB: number): number {
  return (qtyA * entryA + qtyB * entryB) / (qtyA + qtyB);
}
```

- [ ] **Step 4: Прогнать тест**

Run: `cd backend && npx jest backtest-math.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/backtest/backtest-math.ts backend/src/backtest/backtest-math.spec.ts
git commit -m "feat(backtest): averageIn — средневзвешенный вход после добора

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Плечо и проверка маржи при открытии сделки

**Files:**
- Modify: `backend/src/backtest/dto/backtest.dto.ts` (`OpenTradeDto`)
- Modify: `backend/src/backtest/backtest.service.ts` (`OpenTradeInput`, `openTrade`)
- Test: `backend/src/backtest/backtest.service.spec.ts`

**Interfaces:**
- Consumes: ничего нового.
- Produces: `OpenTradeInput.leverage: number`; сделка сохраняет `leverage`; отказ `BACKTEST_MARGIN_EXCEEDS_BALANCE`, когда `notional / leverage > balance`.

- [ ] **Step 1: Написать падающие тесты**

В `backend/src/backtest/backtest.service.spec.ts`, в `describe('BacktestService — сделки')`, добавить к константе `OPEN` плечо и два новых теста рядом с существующими про открытие:

```ts
  const OPEN = {
    direction: 'long' as const,
    entryTime: new Date(T0 + DAY),
    entryPrice: 100,
    stopLoss: 98,
    riskPct: 1,
    leverage: 10,
  };
```

```ts
  it('открывает сделку: сохраняет плечо', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);

    await service.openTrade('u1', 's1', OPEN);

    expect(prisma.backtestTrade.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ leverage: 10 }) }),
    );
  });

  it('маржа больше депозита — отказ, сделку не создаёт', async () => {
    const { service, prisma } = makeService();
    // SESSION.balance=10000, entry=100, stop=98 (dist=2). При leverage=1 margin = notional =
    // riskUsdt/dist*entry = (balance*riskPct/100)/2*100 = balance*riskPct/2 — при riskPct=1
    // это 0.5*balance, всегда МЕНЬШЕ баланса (риск считается не в вакууме, а от него же),
    // поэтому обычный riskPct margin никогда не превысит. Берём riskPct=5:
    // riskUsdt=500, qty=250, notional=25000, margin@1x=25000 > 10000.
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);

    const err = await rejection(service.openTrade('u1', 's1', { ...OPEN, leverage: 1, riskPct: 5 }));

    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_MARGIN_EXCEEDS_BALANCE' });
    expect(prisma.backtestTrade.create).not.toHaveBeenCalled();
  });
```

Также обновить `TRADE` фикстуру (используется закрытием ниже) — добавить `leverage: 10, closedQty: 0`:

```ts
  const TRADE = {
    id: 't1',
    sessionId: 's1',
    direction: 'long',
    entryTime: new Date(T0),
    entryPrice: 100,
    stopLoss: 98,
    takeProfit: null,
    qty: 50,
    riskUsdt: 100,
    leverage: 10,
    closedQty: 0,
    exitTime: null,
    exitPrice: null,
    session: SESSION,
  };
```

- [ ] **Step 2: Убедиться, что новые тесты падают**

Run: `cd backend && npx jest backtest.service.spec.ts -t "плечо|Маржа|маржа"`
Expected: FAIL — `leverage` не сохраняется, отказа по марже нет.

- [ ] **Step 3: DTO — добавить поле**

В `backend/src/backtest/dto/backtest.dto.ts`, в `OpenTradeDto` (после `riskPct`):

```ts
  @IsNumber()
  @Min(1)
  @Max(100)
  leverage: number;
```

- [ ] **Step 4: Сервис — принять плечо, проверить маржу, сохранить**

В `backend/src/backtest/backtest.service.ts`:

`OpenTradeInput` (строка ~26–33) — добавить поле:

```ts
export interface OpenTradeInput {
  direction: Direction;
  entryTime: Date;
  entryPrice: number;
  stopLoss: number;
  takeProfit?: number;
  riskPct: number;
  leverage: number;
}
```

В `openTrade`, внутри транзакции, после строки `const { riskUsdt, qty } = positionSize(...)` (строка ~205) и до `tx.backtestTrade.create`, вставить проверку маржи и добавить `leverage` в `data`:

```ts
      const { riskUsdt, qty } = positionSize(fresh!.balance, input.riskPct, input.entryPrice, input.stopLoss);
      const notional = qty * input.entryPrice;
      const margin = notional / input.leverage;
      if (margin > fresh!.balance) {
        throw new BadRequestException({ message: 'Маржа больше депозита', code: 'BACKTEST_MARGIN_EXCEEDS_BALANCE' });
      }
      const trade = await tx.backtestTrade.create({
        data: {
          sessionId,
          direction: input.direction,
          entryTime: input.entryTime,
          entryPrice: input.entryPrice,
          stopLoss: input.stopLoss,
          takeProfit: input.takeProfit ?? null,
          riskPct: input.riskPct,
          riskUsdt,
          qty,
          leverage: input.leverage,
        },
        include: TAGS,
      });
```

- [ ] **Step 5: Прогнать тесты**

Run: `cd backend && npx jest backtest.service.spec.ts`
Expected: PASS — все, включая уже существовавшие (фикстуры не ломают старые ожидания, т.к. `toHaveBeenCalledWith(expect.objectContaining(...))` не проверяет отсутствие лишних полей).

- [ ] **Step 6: Commit**

```bash
git add backend/src/backtest
git commit -m "feat(backtest): плечо при открытии сделки, отказ при марже больше депозита

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Добор позиции той же стороны (`addToTrade`)

**Files:**
- Modify: `backend/src/backtest/dto/backtest.dto.ts` (новый `AddToTradeDto`)
- Modify: `backend/src/backtest/backtest.service.ts` (новый метод `addToTrade`)
- Modify: `backend/src/backtest/backtest.controller.ts` (новый роут)
- Test: `backend/src/backtest/backtest.service.spec.ts`

**Interfaces:**
- Consumes: `averageIn` (Task 2), `positionSize`/`stopOnRightSide`/`takeOnRightSide` (существуют).
- Produces: `BacktestService.addToTrade(userId, tradeId, { entryPrice, riskPct })`; эндпоинт `POST /api/backtest/trades/:id/add`. Использует Task 9 (фронт).

- [ ] **Step 1: Написать падающие тесты**

В `backend/src/backtest/backtest.service.spec.ts`, в конец `describe('BacktestService — сделки')`:

```ts
  describe('добор позиции', () => {
    it('усредняет вход и суммирует риск', async () => {
      const { service, prisma } = makeService();
      // TRADE: qty=50 @100, riskUsdt=100, leverage=10. Добор: riskPct=1 на balance=10000 → riskUsdt=100,
      // dist=|110-98|=12, addQty=100/12=25/3≈8.333. newQty=175/3≈58.333,
      // newEntry=(50*100+25/3*110)/(175/3)=17750/175≈101.4286.
      prisma.backtestTrade.findUnique.mockResolvedValueOnce(TRADE).mockResolvedValueOnce({
        ...TRADE,
        qty: TRADE.qty + 100 / 12,
        entryPrice: (50 * 100 + (100 / 12) * 110) / (50 + 100 / 12),
        riskUsdt: 200,
        tags: [],
      });
      prisma.backtestSession.findUnique.mockResolvedValue({ balance: 10_000 });

      await service.addToTrade('u1', 't1', { entryPrice: 110, riskPct: 1 });

      const call = prisma.backtestTrade.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: 't1', exitTime: null });
      expect(call.data.qty).toBeCloseTo(58.333, 3);
      expect(call.data.entryPrice).toBeCloseTo(101.4286, 3);
      expect(call.data.riskUsdt).toBeCloseTo(200, 6);
    });

    it('без открытой сделки — отказ', async () => {
      const { service, prisma } = makeService();
      prisma.backtestTrade.findUnique.mockResolvedValue({ ...TRADE, exitTime: new Date(T0 + DAY) });

      const err = await rejection(service.addToTrade('u1', 't1', { entryPrice: 110, riskPct: 1 }));

      expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TRADE_CLOSED' });
    });

    it('добор, загоняющий средний вход за стоп — отказ', async () => {
      const { service, prisma } = makeService();
      // Шорт: стоп 105 выше входа 100 (правильная сторона). Средневзвешенный вход —
      // всегда между старой ценой входа (100) и ценой добора: чтобы он мог перейти
      // за 105, цена самого добора обязана быть НЕ ниже 105 — иначе среднее двух
      // чисел меньше 105 в принципе не может стать больше 105 ни при каком весе.
      // Добор по 110 большим риском (вес добора большой) тянет среднее выше стопа.
      const SHORT_TRADE = { ...TRADE, direction: 'short', entryPrice: 100, stopLoss: 105, riskUsdt: 100, qty: 20 };
      prisma.backtestTrade.findUnique.mockResolvedValue(SHORT_TRADE);
      prisma.backtestSession.findUnique.mockResolvedValue({ balance: 10_000 });

      // riskUsdt_add = 10000*50/100 = 5000, dist = |110-105| = 5, addQty = 1000.
      // newQty = 1020, newEntry = (20*100 + 1000*110)/1020 ≈ 109.8 — выше стопа 105.
      const err = await rejection(service.addToTrade('u1', 't1', { entryPrice: 110, riskPct: 50 }));

      expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_STOP_SIDE' });
    });

    it('маржа добора больше депозита — отказ', async () => {
      const { service, prisma } = makeService();
      prisma.backtestTrade.findUnique.mockResolvedValue(TRADE);
      prisma.backtestSession.findUnique.mockResolvedValue({ balance: 10 });

      const err = await rejection(service.addToTrade('u1', 't1', { entryPrice: 110, riskPct: 1 }));

      expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_MARGIN_EXCEEDS_BALANCE' });
    });
  });
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd backend && npx jest backtest.service.spec.ts -t "добор"`
Expected: FAIL — `service.addToTrade is not a function`.

- [ ] **Step 3: DTO**

В `backend/src/backtest/dto/backtest.dto.ts`, после `ModifyTradeDto`:

```ts
export class AddToTradeDto {
  @IsPositive()
  entryPrice: number;

  @IsNumber()
  @Min(0.01)
  @Max(100)
  riskPct: number;
}
```

- [ ] **Step 4: Сервис — метод `addToTrade`**

В `backend/src/backtest/backtest.service.ts`, импортировать `averageIn` из `./backtest-math` (добавить в существующий импорт-блок), добавить интерфейс и метод после `modifyTrade`:

```ts
export interface AddToTradeInput {
  entryPrice: number;
  riskPct: number;
}
```

```ts
  async addToTrade(userId: string, tradeId: string, input: AddToTradeInput) {
    const trade = await this.ownedTrade(userId, tradeId);
    if (trade.exitTime) throw tradeClosed();
    if (trade.session.status !== 'active') throw sessionFinished();

    return this.prisma.$transaction(async (tx) => {
      const bumped = await this.bumpCursor(tx, trade.sessionId, trade.session.cursorTime);
      if (bumped === 0) throw sessionFinished();
      const fresh = await tx.backtestSession.findUnique({ where: { id: trade.sessionId }, select: { balance: true } });

      const { riskUsdt: addRiskUsdt, qty: addQty } = positionSize(
        fresh!.balance,
        input.riskPct,
        input.entryPrice,
        trade.stopLoss,
      );
      const newQty = trade.qty + addQty;
      const newEntry = averageIn(trade.qty, trade.entryPrice, addQty, input.entryPrice);
      const newRiskUsdt = trade.riskUsdt + addRiskUsdt;
      const newRiskPct = (newRiskUsdt / fresh!.balance) * 100;
      const direction = trade.direction as Direction;

      if (!stopOnRightSide(direction, newEntry, trade.stopLoss)) {
        throw new BadRequestException({ message: 'Добор загоняет средний вход за стоп', code: 'BACKTEST_STOP_SIDE' });
      }
      if (trade.takeProfit != null && !takeOnRightSide(direction, newEntry, trade.takeProfit)) {
        throw new BadRequestException({ message: 'Добор загоняет средний вход за тейк', code: 'BACKTEST_TAKE_SIDE' });
      }
      const margin = (newQty * newEntry) / trade.leverage;
      if (margin > fresh!.balance) {
        throw new BadRequestException({ message: 'Маржа добора больше депозита', code: 'BACKTEST_MARGIN_EXCEEDS_BALANCE' });
      }

      const result = await tx.backtestTrade.updateMany({
        where: { id: tradeId, exitTime: null },
        data: { qty: newQty, entryPrice: newEntry, riskUsdt: newRiskUsdt, riskPct: newRiskPct },
      });
      if (result.count === 0) throw tradeClosed();
      const updated = await tx.backtestTrade.findUnique({ where: { id: tradeId }, include: TAGS });
      return { trade: tradeView(updated!) };
    });
  }
```

- [ ] **Step 5: Контроллер — роут**

В `backend/src/backtest/backtest.controller.ts`: добавить `AddToTradeDto` в импорт из `./dto/backtest.dto`, добавить метод после `modify`:

```ts
  @Post('trades/:id/add')
  add(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: AddToTradeDto) {
    return this.backtest.addToTrade(userId, id, dto);
  }
```

- [ ] **Step 6: Прогнать тесты**

Run: `cd backend && npx jest backtest.service.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/backtest
git commit -m "feat(backtest): добор позиции той же стороны — усреднение входа и риска

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Частичное закрытие в `closeTrade`

**Files:**
- Modify: `backend/src/backtest/dto/backtest.dto.ts` (`CloseTradeDto`)
- Modify: `backend/src/backtest/backtest.service.ts` (`CloseTradeInput`, `closeTrade`)
- Test: `backend/src/backtest/backtest.service.spec.ts`

**Interfaces:**
- Consumes: `tradeResult` (не меняется).
- Produces: `closeTrade` принимает необязательные `qty`, `closeOrderId`; отдаёт `{ trade, balance }`, где `trade.closedQty` растёт, а `exitTime` появляется только при полном закрытии. Использует Task 6 (лимит-ордера), Task 8 (фронт).

- [ ] **Step 1: Обновить мок-обвязку теста под новые модели**

В `backend/src/backtest/backtest.service.spec.ts`, в `makeService()`, добавить в объект `prisma`:

```ts
    backtestTradeExit: {
      create: jest.fn(({ data }) => ({ id: 'e1', createdAt: new Date(), ...data })),
      findMany: jest.fn().mockResolvedValue([]),
    },
    backtestCloseOrder: { deleteMany: jest.fn() },
```

(рядом с уже существующими `backtestTrade`, `backtestTradeTag`).

- [ ] **Step 2: Заменить существующие тесты закрытия на тесты нового поведения (падающие)**

Заменить тест `'закрывает: PnL, R и комиссию считает сервер, депозит растёт на PnL'` и три теста про гонки/повтор (`'повтор того же закрытия...'`, `'закрыть уже закрытую другими данными...'`, `'гонка при закрытии...'` — оба) на:

```ts
  it('закрывает целиком: пишет exit, агрегирует pnl/fee/r на сделке, депозит растёт', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique
      .mockResolvedValueOnce(TRADE) // ownedTrade
      .mockResolvedValueOnce({ ...TRADE, exitTime: new Date(T0 + DAY), exitPrice: 104, exitReason: 'take', tags: [] }); // финальный findUnique
    prisma.backtestTradeExit.findMany.mockResolvedValue([
      { id: 'e1', tradeId: 't1', qty: 50, price: 104, fee: 5.61, pnl: 194.39 },
    ]);

    const res = await service.closeTrade('u1', 't1', { exitTime: new Date(T0 + DAY), exitPrice: 104, reason: 'take' });

    const casCall = prisma.backtestTrade.updateMany.mock.calls[0][0];
    expect(casCall.where).toEqual({ id: 't1', closedQty: 0 });
    expect(casCall.data).toEqual({ closedQty: { increment: 50 } });
    expect(prisma.backtestTradeExit.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tradeId: 't1', qty: 50, price: 104, reason: 'take' }),
    });
    const finalUpdate = prisma.backtestTrade.update.mock.calls[0][0];
    expect(finalUpdate.data.pnl).toBeCloseTo(194.39, 6);
    expect(finalUpdate.data.r).toBeCloseTo(1.9439, 6);
    expect(finalUpdate.data.exitReason).toBe('take');
    const inc = prisma.backtestSession.update.mock.calls[0][0].data.balance.increment;
    expect(inc).toBeCloseTo(194.39, 6);
    expect(res.trade.exitReason).toBe('take');
  });

  it('закрывает частично: closedQty растёт, exitTime не проставляется, депозит растёт на часть PnL', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique
      .mockResolvedValueOnce(TRADE)
      .mockResolvedValueOnce({ ...TRADE, closedQty: 20, tags: [] });

    await service.closeTrade('u1', 't1', { exitTime: new Date(T0 + DAY), exitPrice: 104, reason: 'manual', qty: 20 });

    const casCall = prisma.backtestTrade.updateMany.mock.calls[0][0];
    expect(casCall.where).toEqual({ id: 't1', closedQty: 0 });
    expect(casCall.data).toEqual({ closedQty: { increment: 20 } });
    expect(prisma.backtestTrade.update).not.toHaveBeenCalled(); // 20 < 50 остатка — не финал
    const inc = prisma.backtestSession.update.mock.calls[0][0].data.balance.increment;
    // pnl на 20 монет вместо 50: (104-100)*20 - (100+104)*20*0.00055
    expect(inc).toBeCloseTo(77.756, 3);
  });

  it('закрытие больше остатка — отказ, ничего не пишет', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue(TRADE);

    const err = await rejection(
      service.closeTrade('u1', 't1', { exitTime: new Date(T0 + DAY), exitPrice: 104, reason: 'manual', qty: 999 }),
    );

    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_QTY_EXCEEDS_REMAINING' });
    expect(prisma.backtestTrade.updateMany).not.toHaveBeenCalled();
  });

  it('лимит-ордер сработал — closeOrderId удаляет строку в той же транзакции', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique
      .mockResolvedValueOnce(TRADE)
      .mockResolvedValueOnce({ ...TRADE, closedQty: 20, tags: [] });

    await service.closeTrade('u1', 't1', {
      exitTime: new Date(T0 + DAY),
      exitPrice: 104,
      reason: 'limit',
      qty: 20,
      closeOrderId: 'o1',
    });

    expect(prisma.backtestCloseOrder.deleteMany).toHaveBeenCalledWith({ where: { id: 'o1', tradeId: 't1' } });
  });

  it('повтор того же закрытия (уже полностью закрыта) — не ошибка и не второе начисление', async () => {
    const { service, prisma } = makeService();
    const closed = { ...TRADE, exitTime: new Date(T0 + DAY), exitPrice: 104 };
    prisma.backtestTrade.findUnique.mockResolvedValue({ ...closed, tags: [] });

    await service.closeTrade('u1', 't1', { exitTime: new Date(T0 + DAY), exitPrice: 104, reason: 'take' });

    expect(prisma.backtestTrade.updateMany).not.toHaveBeenCalled();
    expect(prisma.backtestSession.update).not.toHaveBeenCalled();
  });

  it('закрыть уже полностью закрытую другими данными — отказ', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValue({ ...TRADE, exitTime: new Date(T0 + DAY), exitPrice: 104 });

    const err = await rejection(
      service.closeTrade('u1', 't1', { exitTime: new Date(T0 + 2 * DAY), exitPrice: 90, reason: 'stop' }),
    );

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TRADE_CLOSED' });
  });

  it('гонка: updateMany по closedQty не задел строку, последний exit совпадает — тот же повтор', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique
      .mockResolvedValueOnce(TRADE) // ownedTrade
      .mockResolvedValueOnce({ ...TRADE, closedQty: 50, tags: [] }); // перечитывание внутри транзакции
    prisma.backtestTrade.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.backtestTradeExit.findMany.mockResolvedValue([
      { id: 'e1', tradeId: 't1', qty: 50, price: 104, time: new Date(T0 + DAY), reason: 'take', fee: 5.61, pnl: 194.39 },
    ]);
    prisma.backtestSession.findUnique.mockResolvedValue({ balance: 10_194.39 });

    const res = await service.closeTrade('u1', 't1', { exitTime: new Date(T0 + DAY), exitPrice: 104, reason: 'take' });

    expect(prisma.backtestSession.update).not.toHaveBeenCalled();
    expect(res.balance).toBe(10_194.39);
  });

  it('гонка: updateMany не задел строку, последний exit другой — отказ', async () => {
    const { service, prisma } = makeService();
    prisma.backtestTrade.findUnique.mockResolvedValueOnce(TRADE).mockResolvedValueOnce({ ...TRADE, closedQty: 50, tags: [] });
    prisma.backtestTrade.updateMany.mockResolvedValueOnce({ count: 0 });
    prisma.backtestTradeExit.findMany.mockResolvedValue([
      { id: 'e1', tradeId: 't1', qty: 50, price: 90, time: new Date(T0 + DAY), reason: 'stop', fee: 1, pnl: -500 },
    ]);

    const err = await rejection(
      service.closeTrade('u1', 't1', { exitTime: new Date(T0 + DAY), exitPrice: 104, reason: 'take' }),
    );

    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TRADE_CLOSED' });
    expect(prisma.backtestSession.update).not.toHaveBeenCalled();
  });
```

Оставить без изменений тест `'выход не позже входа — отказ'` — он проверяет проверку времени, которая идёт раньше по коду и не меняется.

- [ ] **Step 3: Убедиться, что тесты падают**

Run: `cd backend && npx jest backtest.service.spec.ts -t "закрыва|остатка|лимит-ордер|повтор|гонка"`
Expected: FAIL — старая реализация `closeTrade` не знает про `qty`/`closedQty`/`BacktestTradeExit`.

- [ ] **Step 4: DTO — необязательные `qty` и `closeOrderId`, новая причина**

В `backend/src/backtest/dto/backtest.dto.ts`, `CloseTradeDto`:

```ts
export class CloseTradeDto {
  @IsISO8601()
  exitTime: string;

  @IsPositive()
  exitPrice: number;

  @IsIn(['stop', 'take', 'manual', 'finish', 'limit'])
  reason: ExitReason;

  @IsOptional()
  @IsPositive()
  qty?: number;

  @IsOptional()
  @IsString()
  closeOrderId?: string;
}
```

- [ ] **Step 5: Тип `ExitReason` — добавить `'limit'`**

В `backend/src/backtest/backtest-math.ts`, заменить:

```ts
export type ExitReason = 'stop' | 'take' | 'manual' | 'finish';
```

на:

```ts
export type ExitReason = 'stop' | 'take' | 'manual' | 'finish' | 'limit';
```

- [ ] **Step 6: Переписать `closeTrade`**

В `backend/src/backtest/backtest.service.ts` заменить весь метод `closeTrade` (строки ~244–300) на:

```ts
  async closeTrade(userId: string, tradeId: string, input: CloseTradeInput) {
    const trade = await this.ownedTrade(userId, tradeId);
    if (trade.exitTime) {
      // Уже закрыта целиком — повтор того же финального запроса не ошибка.
      if (trade.exitTime.getTime() === input.exitTime.getTime() && trade.exitPrice === input.exitPrice) {
        const same = await this.prisma.backtestTrade.findUnique({ where: { id: tradeId }, include: TAGS });
        return { trade: tradeView(same!), balance: trade.session.balance };
      }
      throw tradeClosed();
    }
    if (input.exitTime.getTime() <= trade.entryTime.getTime()) throw timeInvalid();

    const remaining = trade.qty - trade.closedQty;
    const qty = input.qty ?? remaining;
    if (qty > remaining + QTY_EPS) {
      throw new BadRequestException({ message: 'Объём закрытия больше остатка', code: 'BACKTEST_QTY_EXCEEDS_REMAINING' });
    }

    const { fee, pnl } = tradeResult({
      direction: trade.direction as Direction,
      entryPrice: trade.entryPrice,
      exitPrice: input.exitPrice,
      qty,
      riskUsdt: trade.riskUsdt,
    });

    return this.prisma.$transaction(async (tx) => {
      await this.bumpCursor(tx, trade.sessionId, input.exitTime);
      // CAS по closedQty — тот же замысел, что раньше был у `exitTime: null`:
      // параллельный дубликат этого же запроса не должен начислить PnL дважды.
      const cas = await tx.backtestTrade.updateMany({
        where: { id: tradeId, closedQty: trade.closedQty },
        data: { closedQty: { increment: qty } },
      });
      if (cas.count === 0) {
        // Гонка или потерянный-и-повторённый ответ — разбираемся по последнему exit.
        const raced = await tx.backtestTrade.findUnique({ where: { id: tradeId }, include: TAGS });
        if (!raced) throw tradeClosed();
        const exits = await tx.backtestTradeExit.findMany({ where: { tradeId }, orderBy: { createdAt: 'desc' }, take: 1 });
        const last = exits[0];
        const same =
          last != null &&
          last.qty === qty &&
          last.price === input.exitPrice &&
          last.time.getTime() === input.exitTime.getTime() &&
          last.reason === input.reason;
        if (!same) throw tradeClosed();
        const fresh = await tx.backtestSession.findUnique({ where: { id: trade.sessionId }, select: { balance: true } });
        return { trade: tradeView(raced), balance: fresh!.balance };
      }

      await tx.backtestTradeExit.create({
        data: { tradeId, qty, price: input.exitPrice, time: input.exitTime, reason: input.reason, fee, pnl },
      });
      if (input.closeOrderId) {
        await tx.backtestCloseOrder.deleteMany({ where: { id: input.closeOrderId, tradeId } });
      }
      const session = await tx.backtestSession.update({
        where: { id: trade.sessionId },
        data: { balance: { increment: pnl } },
      });

      const newClosedQty = trade.closedQty + qty;
      if (newClosedQty >= trade.qty - QTY_EPS) {
        const exits = await tx.backtestTradeExit.findMany({ where: { tradeId } });
        const totalFee = exits.reduce((s, e) => s + e.fee, 0);
        const totalPnl = exits.reduce((s, e) => s + e.pnl, 0);
        await tx.backtestTrade.update({
          where: { id: tradeId },
          data: {
            exitTime: input.exitTime,
            exitPrice: input.exitPrice,
            exitReason: input.reason,
            fee: totalFee,
            pnl: totalPnl,
            r: totalPnl / trade.riskUsdt,
          },
        });
        await tx.backtestCloseOrder.deleteMany({ where: { tradeId } });
      }

      const updated = await tx.backtestTrade.findUnique({ where: { id: tradeId }, include: TAGS });
      return { trade: tradeView(updated!), balance: session.balance };
    });
  }
```

Добавить рядом с остальными константами модуля (после `const tradeClosed = ...`):

```ts
/** Допуск на накопленную погрешность float-сложений closedQty. */
const QTY_EPS = 1e-8;
```

Обновить `CloseTradeInput` (строки ~41–45):

```ts
export interface CloseTradeInput {
  exitTime: Date;
  exitPrice: number;
  reason: ExitReason;
  qty?: number;
  closeOrderId?: string;
}
```

- [ ] **Step 7: Прогнать тесты**

Run: `cd backend && npx jest backtest.service.spec.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/backtest
git commit -m "feat(backtest): частичное закрытие — closedQty, BacktestTradeExit, агрегаты на финале

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Эндпоинты висящих лимит-ордеров

**Files:**
- Modify: `backend/src/backtest/dto/backtest.dto.ts` (новый `CreateCloseOrderDto`)
- Modify: `backend/src/backtest/backtest.service.ts` (`createCloseOrder`, `cancelCloseOrder`, `closeOrders` в `getSession`)
- Modify: `backend/src/backtest/backtest.controller.ts`
- Test: `backend/src/backtest/backtest.service.spec.ts`

**Interfaces:**
- Produces: `POST /api/backtest/trades/:id/close-orders`, `DELETE /api/backtest/close-orders/:id`; `getSession` отдаёт `closeOrders: BacktestCloseOrder[]`. Использует Task 12 (фронт-хуки), Task 14 (реплей).

- [ ] **Step 1: Написать падающие тесты**

В `backend/src/backtest/backtest.service.spec.ts`, добавить в `makeService()`'s `prisma`:

```ts
    backtestCloseOrder: {
      deleteMany: jest.fn(),
      create: jest.fn(({ data }) => ({ id: 'o1', createdAt: new Date(), ...data })),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
```

(заменить прежнюю урезанную запись `backtestCloseOrder: { deleteMany: jest.fn() }` из Task 5 этой полной).

Добавить в конец `describe('BacktestService — сделки')`:

```ts
  describe('лимит-ордера на закрытие', () => {
    it('создаёт ордер в пределах остатка', async () => {
      const { service, prisma } = makeService();
      prisma.backtestTrade.findUnique.mockResolvedValue(TRADE);

      await service.createCloseOrder('u1', 't1', { price: 110, qty: 20 });

      expect(prisma.backtestCloseOrder.create).toHaveBeenCalledWith({ data: { tradeId: 't1', price: 110, qty: 20 } });
    });

    it('объём больше остатка — отказ', async () => {
      const { service, prisma } = makeService();
      prisma.backtestTrade.findUnique.mockResolvedValue(TRADE);

      const err = await rejection(service.createCloseOrder('u1', 't1', { price: 110, qty: 999 }));

      expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_QTY_EXCEEDS_REMAINING' });
    });

    it('на закрытую сделку ордер не поставить', async () => {
      const { service, prisma } = makeService();
      prisma.backtestTrade.findUnique.mockResolvedValue({ ...TRADE, exitTime: new Date(T0 + DAY) });

      const err = await rejection(service.createCloseOrder('u1', 't1', { price: 110, qty: 1 }));

      expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_TRADE_CLOSED' });
    });

    it('отменяет свой ордер', async () => {
      const { service, prisma } = makeService();
      prisma.backtestCloseOrder.findUnique.mockResolvedValue({ id: 'o1', trade: { session: { userId: 'u1' } } });

      await service.cancelCloseOrder('u1', 'o1');

      expect(prisma.backtestCloseOrder.delete).toHaveBeenCalledWith({ where: { id: 'o1' } });
    });

    it('чужой ордер — 404', async () => {
      const { service, prisma } = makeService();
      prisma.backtestCloseOrder.findUnique.mockResolvedValue({ id: 'o1', trade: { session: { userId: 'u2' } } });

      const err = await rejection(service.cancelCloseOrder('u1', 'o1'));

      expect(err).toBeInstanceOf(NotFoundException);
      expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_CLOSE_ORDER_NOT_FOUND' });
    });
  });
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd backend && npx jest backtest.service.spec.ts -t "лимит-ордер"`
Expected: FAIL — методы не существуют.

- [ ] **Step 3: DTO**

В `backend/src/backtest/dto/backtest.dto.ts`:

```ts
export class CreateCloseOrderDto {
  @IsPositive()
  price: number;

  @IsPositive()
  qty: number;
}
```

- [ ] **Step 4: Сервис**

В `backend/src/backtest/backtest.service.ts`, после `addToTrade`:

```ts
  async createCloseOrder(userId: string, tradeId: string, input: { price: number; qty: number }) {
    const trade = await this.ownedTrade(userId, tradeId);
    if (trade.exitTime) throw tradeClosed();
    if (trade.session.status !== 'active') throw sessionFinished();
    const remaining = trade.qty - trade.closedQty;
    if (input.qty > remaining + QTY_EPS) {
      throw new BadRequestException({ message: 'Объём больше остатка', code: 'BACKTEST_QTY_EXCEEDS_REMAINING' });
    }
    const order = await this.prisma.backtestCloseOrder.create({
      data: { tradeId, price: input.price, qty: input.qty },
    });
    return { closeOrder: order };
  }

  async cancelCloseOrder(userId: string, orderId: string) {
    const order = await this.prisma.backtestCloseOrder.findUnique({
      where: { id: orderId },
      include: { trade: { include: { session: true } } },
    });
    if (!order || order.trade.session.userId !== userId) {
      throw new NotFoundException({ message: 'Ордер не найден', code: 'BACKTEST_CLOSE_ORDER_NOT_FOUND' });
    }
    await this.prisma.backtestCloseOrder.delete({ where: { id: orderId } });
    return { success: true as const };
  }
```

В `getSession` (строки ~124–142), добавить запрос ордеров и вернуть их:

```ts
  async getSession(userId: string, id: string) {
    const session = await this.ownedSession(userId, id);
    const trades = await this.prisma.backtestTrade.findMany({
      where: { sessionId: id },
      orderBy: { entryTime: 'asc' },
      include: TAGS,
    });
    const closeOrders = await this.prisma.backtestCloseOrder.findMany({
      where: { trade: { sessionId: id, exitTime: null } },
    });
    const closed = trades
      .filter((t) => t.exitTime != null)
      .sort((a, b) => a.exitTime!.getTime() - b.exitTime!.getTime());
    return {
      session,
      trades: trades.map(tradeView),
      closeOrders,
      summary: {
        ...summarize(closed.map(closedNumbers)),
        maxDrawdownPct: maxDrawdownPct(session.startBalance, closed.map((t) => t.pnl ?? 0)),
      },
    };
  }
```

- [ ] **Step 5: Контроллер**

В `backend/src/backtest/backtest.controller.ts`: добавить `Delete` в импорт из `@nestjs/common`, `CreateCloseOrderDto` в импорт из DTO, добавить методы после `tags`:

```ts
  @Post('trades/:id/close-orders')
  createCloseOrder(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: CreateCloseOrderDto) {
    return this.backtest.createCloseOrder(userId, id, dto);
  }

  @Delete('close-orders/:id')
  cancelCloseOrder(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.backtest.cancelCloseOrder(userId, id);
  }
```

- [ ] **Step 6: Прогнать тесты**

Run: `cd backend && npx jest backtest.service.spec.ts`
Expected: PASS — весь файл.

- [ ] **Step 7: Commit**

```bash
git add backend/src/backtest
git commit -m "feat(backtest): создание/отмена висящих лимит-ордеров на закрытие

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Бэкенд целиком — прогон и фиксация базовой линии

**Files:** нет новых — только проверка.

- [ ] **Step 1: Полный прогон бэкенд-тестов**

Run: `cd backend && npx jest`
Expected: PASS — все файлы, включая `backtest.service.spec.ts` и `backtest-math.spec.ts`.

- [ ] **Step 2: Если что-то красное — исправить точечно, затем закоммитить фикс**

(Пропустить коммит, если Step 1 сразу зелёный.)

---

## Task 8: Плечо и маржа во фронтенд-`lib/money.ts`

**Files:**
- Modify: `frontend/src/views/backtest/lib/money.ts`
- Test: `frontend/src/views/backtest/lib/money.test.ts`

**Interfaces:**
- Produces: `previewSize(balance, riskPct, entry, stop, leverage, direction)` → `{ riskUsdt, qty, notional, margin, liqPrice } | null`; `liquidationPrice(direction, entry, leverage): number`; `averageIn(qtyA, entryA, qtyB, entryB): number`. Использует Task 9 (`OrderPanel`), Task 11 (`ReplayChart`/`SessionScreen` — уровень `liq`).

- [ ] **Step 1: Написать падающие тесты**

В `frontend/src/views/backtest/lib/money.test.ts`, добавить `liquidationPrice`, `averageIn` в импорт из `./money`, заменить тест `previewSize` и добавить новые:

```ts
describe('previewSize', () => {
  it('риск, размер, номинал и маржа', () => {
    expect(previewSize(10_000, 1, 100, 98, 10, 'long')).toEqual({
      riskUsdt: 100,
      qty: 50,
      notional: 5000,
      margin: 500,
      liqPrice: 90,
    });
  });

  it('стоп на цене входа — размера нет', () => {
    expect(previewSize(10_000, 1, 100, 100, 10, 'long')).toBeNull();
  });
});

describe('liquidationPrice', () => {
  it('лонг — ниже входа на 1/leverage', () => {
    expect(liquidationPrice('long', 100, 10)).toBeCloseTo(90, 9);
    expect(liquidationPrice('long', 100, 100)).toBeCloseTo(99, 9);
  });

  it('шорт — выше входа на 1/leverage', () => {
    expect(liquidationPrice('short', 100, 10)).toBeCloseTo(110, 9);
  });
});

describe('averageIn', () => {
  it('средневзвешенная цена по объёму', () => {
    expect(averageIn(10, 100, 10, 120)).toBeCloseTo(110, 9);
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd frontend && npx vitest run lib/money.test.ts`
Expected: FAIL — `liquidationPrice`/`averageIn` не экспортированы, `previewSize` возвращает старую форму.

- [ ] **Step 3: Реализация**

В `frontend/src/views/backtest/lib/money.ts` заменить `previewSize`:

```ts
export function previewSize(balance: number, riskPct: number, entry: number, stop: number, leverage: number, direction: Direction) {
  const dist = Math.abs(entry - stop);
  if (!(dist > 0) || !(balance > 0) || !(riskPct > 0)) return null;
  const riskUsdt = (balance * riskPct) / 100;
  const qty = riskUsdt / dist;
  const notional = qty * entry;
  return { riskUsdt, qty, notional, margin: notional / leverage, liqPrice: liquidationPrice(direction, entry, leverage) };
}

/** Ликвидация — упрощённо, без поддерживающей маржи и комиссий: long ниже входа, short выше, на 1/leverage. */
export function liquidationPrice(direction: Direction, entry: number, leverage: number): number {
  return direction === 'long' ? entry * (1 - 1 / leverage) : entry * (1 + 1 / leverage);
}

/** Средневзвешенная цена входа после добора — тот же расчёт, что на сервере (backtest-math.ts). */
export function averageIn(qtyA: number, entryA: number, qtyB: number, entryB: number): number {
  return (qtyA * entryA + qtyB * entryB) / (qtyA + qtyB);
}
```

Убрать старый комментарий над `previewSize` про «Плечо справочное...» (он больше не верен) — заменить на:

```ts
/**
 * Предпросмотр размера и маржи — те же формулы, что на сервере при открытии
 * (`positionSize`/margin-проверка в `backtest.service.ts`), чтобы число до
 * отправки не расходилось с тем, что вернётся.
 */
```

- [ ] **Step 4: Прогнать тесты**

Run: `cd frontend && npx vitest run lib/money.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/backtest/lib/money.ts frontend/src/views/backtest/lib/money.test.ts
git commit -m "feat(backtest): liquidationPrice, averageIn, previewSize с плечом и маржой

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Лимит-ордера в `checkMinute`/`advanceTo`

**Files:**
- Modify: `frontend/src/views/backtest/lib/fills.ts`
- Modify: `frontend/src/views/backtest/lib/advance.ts`
- Test: `frontend/src/views/backtest/lib/fills.test.ts` (создать, если не существует — проверить `Glob frontend/src/views/backtest/lib/*.test.ts`)

**Interfaces:**
- Produces: `CloseOrder { id, price, qty }`; `Exit` получает `qty?`, `closeOrderId?`; `checkMinute(p, m, closeOrders?)`; `findExit(p, minutes, from, to, closeOrders?)`; `advanceTo({ ..., closeOrders })`. Использует Task 14 (`useReplay`/`SessionScreen`).

- [ ] **Step 1: Написать падающие тесты**

Если `frontend/src/views/backtest/lib/fills.test.ts` не существует — создать с этим содержимым (иначе дополнить существующий describe-блоками):

```ts
import { describe, expect, it } from 'vitest';
import { checkMinute, findExit, type Position } from './fills';

const LONG: Position = { direction: 'long', stopLoss: 90, takeProfit: 120 };
const m = (t: number, o: number, h: number, l: number, c: number) => ({ t, o, h, l, c });

describe('checkMinute — лимит-ордера на закрытие', () => {
  it('касание лимит-ордера ниже стопа/тейка — своя цена и объём, позиция не закрыта целиком', () => {
    const exit = checkMinute(LONG, m(0, 100, 106, 94, 100), [{ id: 'o1', price: 95, qty: 5 }]);
    expect(exit).toEqual({ reason: 'limit', price: 95, time: 60_000, qty: 5, closeOrderId: 'o1' });
  });

  it('стоп важнее лимит-ордера в той же минутке', () => {
    const exit = checkMinute(LONG, m(0, 100, 100, 85, 100), [{ id: 'o1', price: 95, qty: 5 }]);
    expect(exit?.reason).toBe('stop');
  });

  it('тейк важнее лимит-ордера в той же минутке', () => {
    const exit = checkMinute(LONG, m(0, 100, 125, 100, 100), [{ id: 'o1', price: 115, qty: 5 }]);
    expect(exit?.reason).toBe('take');
  });

  it('несколько лимитов задеты — срабатывает ближайший к открытию свечи', () => {
    const exit = checkMinute(LONG, m(0, 100, 106, 94, 100), [
      { id: 'far', price: 95, qty: 1 },
      { id: 'near', price: 102, qty: 2 },
    ]);
    expect(exit?.closeOrderId).toBe('near');
  });

  it('гэп мимо лимит-ордера (диапазон свечи его не задел) — не исполняется', () => {
    // Открытие уже выше 95, но весь диапазон [98,110] уровня 95 не касается.
    const exit = checkMinute(LONG, m(0, 100, 110, 98, 105), [{ id: 'o1', price: 95, qty: 5 }]);
    expect(exit).toBeNull();
  });

  it('без лимит-ордеров ведёт себя как раньше', () => {
    expect(checkMinute(LONG, m(0, 100, 105, 95, 100))).toBeNull();
  });
});

describe('findExit — лимит-ордера передаются в каждую минутку', () => {
  it('находит первую минутку, где сработал лимит', () => {
    const minutes = [m(0, 100, 101, 99, 100), m(60_000, 100, 106, 94, 100)];
    const exit = findExit(LONG, minutes, 0, 120_000, [{ id: 'o1', price: 95, qty: 5 }]);
    expect(exit).toEqual({ reason: 'limit', price: 95, time: 120_000, qty: 5, closeOrderId: 'o1' });
  });
});
```

(Если в проекте уже есть файл с тестами `checkMinute`/`findExit` под другим именем — найти его через `Grep "checkMinute" frontend/src/views/backtest` и дополнить его, а не создавать дубликат.)

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd frontend && npx vitest run lib/fills.test.ts`
Expected: FAIL — `checkMinute` не принимает третий аргумент, лимит-ордера игнорируются.

- [ ] **Step 3: Реализация**

В `frontend/src/views/backtest/lib/fills.ts` заменить `Exit`, `checkMinute`, `findExit`:

```ts
export interface CloseOrder {
  id: string;
  price: number;
  qty: number;
}

export interface Exit {
  reason: 'stop' | 'take' | 'limit';
  price: number;
  /** Закрытие минутки, в которой сработало. */
  time: number;
  /** Заполнено только у 'limit' — частичный выход на свой объём, не весь остаток. */
  qty?: number;
  closeOrderId?: string;
}

/** Ближайший к цене открытия свечи среди кандидатов — тот, кого price достиг бы первым. */
function closestToOpen(candidates: CloseOrder[], open: number): CloseOrder | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, o) => (Math.abs(o.price - open) < Math.abs(best.price - open) ? o : best));
}

/** Правила в порядке спеки; первое совпавшее решает. */
export function checkMinute(p: Position, m: Candle, closeOrders: CloseOrder[] = []): Exit | null {
  const long = p.direction === 'long';
  const s = p.stopLoss;
  const tp = p.takeProfit;
  const time = m.t + MINUTE;

  // 1. Гэп за стопом — по открытию, то есть хуже стопа, как на бирже.
  if (long ? m.o <= s : m.o >= s) return { reason: 'stop', price: m.o, time };
  // 2. Гэп за тейком — по тейку: лучше заявленного тейк не исполняется.
  if (tp != null && (long ? m.o >= tp : m.o <= tp)) return { reason: 'take', price: tp, time };
  // 3 и 5. Касание стопа — стоп, даже если в той же минутке задет и тейк:
  // порядок внутри минутки не восстановить, честнее предполагать худшее.
  if (long ? m.l <= s : m.h >= s) return { reason: 'stop', price: s, time };
  // 4. Касание тейка.
  if (tp != null && (long ? m.h >= tp : m.l <= tp)) return { reason: 'take', price: tp, time };
  // 6. Касание лимит-ордера на закрытие — у него, в отличие от стопа/тейка,
  // нет фиксированной стороны от входа, поэтому гэпа для него нет (см. спеку):
  // диапазон свечи не задел уровень — ордер просто не исполнился в эту минутку.
  const touched = closeOrders.filter((o) => o.price <= m.h && o.price >= m.l);
  const fired = closestToOpen(touched, m.o);
  if (fired) return { reason: 'limit', price: fired.price, time, qty: fired.qty, closeOrderId: fired.id };
  return null;
}

/** Первая сработавшая минутка среди открытых не раньше from и закрытых не позже to. */
export function findExit(p: Position, minutes: Candle[], from: number, to: number, closeOrders: CloseOrder[] = []): Exit | null {
  for (const m of minutes) {
    if (m.t < from) continue;
    if (m.t + MINUTE > to) break;
    const exit = checkMinute(p, m, closeOrders);
    if (exit) return exit;
  }
  return null;
}
```

В `frontend/src/views/backtest/lib/advance.ts` — обновить сигнатуру `advanceTo`:

```ts
import type { Candle } from './candles';
import { findExit, type CloseOrder, type Direction, type Exit } from './fills';

export interface OpenPosition {
  direction: Direction;
  stopLoss: number;
  takeProfit: number | null;
  entryTime: number;
}

export interface AdvanceResult {
  reach: number;
  complete: boolean;
  exit: Exit | null;
}

export function advanceTo(p: {
  from: number;
  target: number;
  minutes: Candle[];
  loadedUntil: number | null;
  position: OpenPosition | null;
  closeOrders: CloseOrder[];
}): AdvanceResult {
  const reach = Math.min(p.target, p.loadedUntil ?? p.from);
  const complete = reach >= p.target;
  let exit: Exit | null = null;
  if (reach > p.from && p.position) {
    exit = findExit(p.position, p.minutes, Math.max(p.position.entryTime, p.from), reach, p.closeOrders);
  }
  return { reach, complete, exit };
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `cd frontend && npx vitest run lib/fills.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/backtest/lib/fills.ts frontend/src/views/backtest/lib/advance.ts frontend/src/views/backtest/lib/fills.test.ts
git commit -m "feat(backtest): лимит-ордера на закрытие в checkMinute/advanceTo

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: API-слой — типы и хуки

**Files:**
- Modify: `frontend/src/views/backtest/api/types.ts`
- Modify: `frontend/src/views/backtest/api/hooks.ts`

**Interfaces:**
- Consumes: ничего нового (только бэкенд-контракт из Task 3–6).
- Produces: `BacktestTrade.leverage`, `.closedQty`; `BacktestCloseOrder`; `SessionDetail.closeOrders`; `ExitReason` с `'limit'`; хуки `useAddToTrade`, `useCreateCloseOrder`, `useCancelCloseOrder`; `useCloseTrade` с `qty`/`closeOrderId`. Использует Task 11–15 (все компоненты бектеста).

- [ ] **Step 1: Типы**

В `frontend/src/views/backtest/api/types.ts`:

```ts
export type ExitReason = 'stop' | 'take' | 'manual' | 'finish' | 'limit';
```

В `BacktestTrade`, после `qty: number;`:

```ts
  leverage: number;
  closedQty: number;
```

После интерфейса `BacktestTrade`, перед `Summary`:

```ts
export interface BacktestCloseOrder {
  id: string;
  tradeId: string;
  price: number;
  qty: number;
  createdAt: string;
}
```

В `SessionDetail`, после `trades: BacktestTrade[];`:

```ts
  closeOrders: BacktestCloseOrder[];
```

- [ ] **Step 2: Хуки**

В `frontend/src/views/backtest/api/hooks.ts`:

Добавить `BacktestCloseOrder` в импорт типов из `./types`.

`useOpenTrade` — добавить `leverage: number` в тип тела мутации:

```ts
export const useOpenTrade = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      direction: Direction;
      entryTime: string;
      entryPrice: number;
      stopLoss: number;
      takeProfit?: number;
      riskPct: number;
      leverage: number;
    }) => apiJson<{ trade: BacktestTrade }>(`/api/backtest/sessions/${id}/trades`, json('POST', input)),
    onSettled: () => refresh(qc, id),
  });
};
```

`useCloseTrade` — добавить `qty`/`closeOrderId`:

```ts
export const useCloseTrade = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tradeId, ...body }: {
      tradeId: string;
      exitTime: string;
      exitPrice: number;
      reason: ExitReason;
      qty?: number;
      closeOrderId?: string;
    }) => apiJson<{ trade: BacktestTrade; balance: number }>(`/api/backtest/trades/${tradeId}/close`, json('POST', body)),
    retry: 3,
    retryDelay: (attempt) => 1000 * 2 ** attempt,
    onSettled: () => refresh(qc, id),
  });
};
```

Добавить после `useModifyTrade`:

```ts
export const useAddToTrade = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tradeId, ...body }: { tradeId: string; entryPrice: number; riskPct: number }) =>
      apiJson<{ trade: BacktestTrade }>(`/api/backtest/trades/${tradeId}/add`, json('POST', body)),
    onSettled: () => refresh(qc, id),
  });
};

export const useCreateCloseOrder = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tradeId, ...body }: { tradeId: string; price: number; qty: number }) =>
      apiJson<{ closeOrder: BacktestCloseOrder }>(`/api/backtest/trades/${tradeId}/close-orders`, json('POST', body)),
    onSettled: () => refresh(qc, id),
  });
};

export const useCancelCloseOrder = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => apiJson<{ success: boolean }>(`/api/backtest/close-orders/${orderId}`, json('DELETE')),
    onSettled: () => refresh(qc, id),
  });
};
```

- [ ] **Step 3: Проверка типов**

Run: `cd frontend && npx tsc --noEmit`
Expected: ошибки только в файлах, которые следующие таски ещё не тронули (`OrderPanel.tsx`, `SessionScreen.tsx`) — использование старых пропов/сигнатур. Убедиться, что ошибки локализованы именно там (не в `types.ts`/`hooks.ts`).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/backtest/api
git commit -m "feat(backtest): типы и хуки — плечо, closedQty, лимит-ордера, добор

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: `OrderPanel.tsx` без веток по открытой сделке

**Files:**
- Modify: `frontend/src/views/backtest/components/OrderPanel.tsx` (полная замена содержимого)

**Interfaces:**
- Consumes: `previewSize`, `liquidationPrice` (Task 8); `Draft.leverage` (новое поле).
- Produces: `OrderPanel` без пропов `openTrade`/`onApply`/`onClose`/`canClose`; новые пропы `sameDirectionOpen`, `openLeverage`, `onAdd`. Использует Task 15 (`SessionScreen`).

- [ ] **Step 1: Заменить файл целиком**

Заменить весь `frontend/src/views/backtest/components/OrderPanel.tsx` на:

```tsx
'use client';

import type { ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Field';
import { KeyValue } from '@/shared/ui/Lookup';
import { Slider } from '@/shared/ui/Slider';
import { fmtPctSigned, formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import type { Direction } from '../api/types';
import {
  applyStopChange,
  fromScreen,
  impliedDirection,
  levelSliderRange,
  previewSize,
  riskAmount,
  signedPctFromStop,
  stopFromSignedPct,
  STOP_RISK_PCT,
  toInput,
  toInputPrice,
  toScreen,
} from '../lib/money';

/** Поля панели — строками, как их набирает человек, и в экранных ценах. */
export interface Draft {
  risk: string;
  stop: string;
  take: string;
  leverage: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const MIN_LEVERAGE = 1;
const MAX_LEVERAGE = 100;

/**
 * Вход, уровни, риск и плечо — панель никогда не смотрит на то, открыта ли
 * сделка: сама открытая позиция и её закрытие живут в `OpenPositionsPanel` под
 * графиком. Единственное, что меняется по состоянию открытой сделки той же
 * стороны (`sameDirectionOpen`), — подписи и обработчик кнопок Лонг/Шорт: они
 * либо открывают новую сделку, либо добирают уже открытую.
 *
 * Слайдер стопа задаёт направление и дистанцию одним движением: центр — цена,
 * вправо (плюс) — лонг, влево (минус) — шорт, по 7% в каждую сторону
 * (`stopFromSignedPct`/`signedPctFromStop`). Тейк идёт следом: направление
 * стопа — общее для обоих уровней (`impliedDirection`), диапазон тейка
 * сужается на верную сторону, как только сторона стопа известна
 * (`levelSliderRange`), а если стоп меняет сторону — уже введённый тейк
 * зеркалится вместе с ним, синхронно, в том же обработчике, что двигает стоп
 * (`applyStopChange`).
 */
export function OrderPanel({
  draft,
  onDraft,
  sameDirectionOpen,
  openLeverage,
  scale,
  price,
  balance,
  disabled,
  hint,
  onOpen,
  onAdd,
  onFinish,
}: {
  draft: Draft;
  onDraft: (d: Draft) => void;
  /** Сторона уже открытой сделки, если она есть — кнопки становятся добором, а не открытием. */
  sameDirectionOpen: Direction | null;
  /** Плечо открытой сделки — панель его только показывает, слайдер её не меняет добором. */
  openLeverage: number | null;
  scale: number;
  /** Настоящая цена последней показанной минутки. */
  price: number | null;
  balance: number;
  disabled: boolean;
  hint: string | null;
  onOpen: (direction: Direction) => void;
  onAdd: (direction: Direction) => void;
  onFinish: () => void;
}) {
  const t = useTranslations('backtest');
  const set = (key: keyof Draft) => (e: ChangeEvent<HTMLInputElement>) => onDraft({ ...draft, [key]: e.target.value });

  const stop = Number(draft.stop);
  const take = draft.take.trim() ? Number(draft.take) : null;
  const risk = Number(draft.risk);
  const leverage = clamp(Number(draft.leverage) || MIN_LEVERAGE, MIN_LEVERAGE, MAX_LEVERAGE);
  const effectiveLeverage = openLeverage ?? leverage;
  const screenPrice = price != null ? toScreen(price, scale) : null;
  // Сторона стопа/тейка одна на двоих, и если сделка уже открыта — она решает
  // сама, независимо от того, что набрано в полях (см. impliedDirection).
  const direction = screenPrice != null ? impliedDirection(sameDirectionOpen, stop, take, screenPrice) : null;
  const takeRange = screenPrice != null ? levelSliderRange('take', screenPrice, direction) : null;
  const stopSignedPct = screenPrice != null ? clamp(signedPctFromStop(stop || screenPrice, screenPrice), -STOP_RISK_PCT, STOP_RISK_PCT) : null;
  const stopPct = stopSignedPct != null ? -stopSignedPct : null;
  const takeValue = takeRange ? clamp(take ?? screenPrice!, takeRange.min, takeRange.max) : null;
  const takePct = takeValue != null && screenPrice ? ((takeValue - screenPrice) / screenPrice) * 100 : null;

  /** Стоп получил новую цену — тейк зеркалится тут же, если сторона поменялась. */
  const setStop = (newStopScreen: number) => {
    if (screenPrice == null) return;
    onDraft({ ...draft, ...applyStopChange(draft, newStopScreen, screenPrice, sameDirectionOpen) });
  };
  const setStopText = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (screenPrice == null) {
      onDraft({ ...draft, stop: raw });
      return;
    }
    const { take: nextTake } = applyStopChange(draft, Number(raw), screenPrice, sameDirectionOpen);
    onDraft({ ...draft, stop: raw, take: nextTake });
  };

  const preview =
    price != null && stop > 0
      ? previewSize(balance, risk, price, fromScreen(stop, scale), effectiveLeverage, direction ?? 'long')
      : null;
  const riskUsd = riskAmount(balance, risk);

  return (
    <div className="order-panel">
      <p className="lbl">{t('orderType')}</p>

      <KeyValue label={t('balance')}>{formatPriceGrouped(balance)} USDT</KeyValue>

      <Field
        label={
          <span className="fld-head">
            <span className="fld-left">
              <span className="fld-val"></span>
              <span>{t('risk')} {(risk || 0).toFixed(1)}%</span>
            </span>
            {riskUsd != null && <span className="fld-val">{formatPriceGrouped(riskUsd)} USDT</span>}
          </span>
        }
      >
        {() => (
          <Slider
            value={clamp(risk || 0, 0, 10)}
            min={0}
            max={10}
            step={0.1}
            onChange={(v) => onDraft({ ...draft, risk: toInput(v) })}
            aria-label={t('risk')}
          />
        )}
      </Field>

      <Field label={<span className="fld-head"><span>{t('leverageLabel')} {effectiveLeverage.toFixed(0)}×</span></span>}>
        {() => (
          <Slider
            value={effectiveLeverage}
            min={MIN_LEVERAGE}
            max={MAX_LEVERAGE}
            step={1}
            disabled={openLeverage != null}
            onChange={(v) => onDraft({ ...draft, leverage: toInput(v) })}
            aria-label={t('leverageLabel')}
          />
        )}
      </Field>

      <Field
        label={
          <span className="fld-head">
            <span>{t('stop')}</span>
            {stopPct != null && <span className="fld-val">{fmtPctSigned(stopPct)}</span>}
          </span>
        }
      >
        {(id) => (
          <>
            {screenPrice != null && stopSignedPct != null && (
              <Slider
                value={stopSignedPct}
                min={-STOP_RISK_PCT}
                max={STOP_RISK_PCT}
                step={(STOP_RISK_PCT * 2) / 200}
                onChange={(pct) => setStop(stopFromSignedPct(pct, screenPrice))}
                aria-label={t('stop')}
              />
            )}
            <Input id={id} full inputMode="decimal" value={draft.stop} onChange={setStopText} />
          </>
        )}
      </Field>
      <Field
        label={
          <span className="fld-head">
            <span>{t('take')}</span>
            {takePct != null && <span className="fld-val">{fmtPctSigned(takePct)}</span>}
          </span>
        }
      >
        {(id) => (
          <>
            {takeRange && takeValue != null && (
              <Slider
                value={takeValue}
                min={takeRange.min}
                max={takeRange.max}
                step={(takeRange.max - takeRange.min) / 200 || 1}
                onChange={(v) => onDraft({ ...draft, take: toInputPrice(v) })}
                aria-label={t('take')}
              />
            )}
            <Input id={id} full inputMode="decimal" value={draft.take} onChange={set('take')} />
          </>
        )}
      </Field>

      {preview && (
        <div className="size-preview">
          <KeyValue label={t('sizeCoin')}>{formatQty(Number(preview.qty.toFixed(3)))}</KeyValue>
          <KeyValue label={t('notionalLabel')}>{formatPriceGrouped(preview.notional)} USDT</KeyValue>
        </div>
      )}
      {preview && <KeyValue label={t('marginLabel')}>{formatPriceGrouped(preview.margin)} USDT</KeyValue>}
      {preview && (
        <KeyValue label={t('liqLabel')} valueClassName="n neg">
          {formatPriceGrouped(toScreen(preview.liqPrice, scale))}
        </KeyValue>
      )}

      {hint && <p className="neg">{hint}</p>}

      <div className="order-actions">
        <Button
          variant="long"
          onClick={() => (sameDirectionOpen === 'long' ? onAdd('long') : onOpen('long'))}
          disabled={disabled || balance <= 0 || sameDirectionOpen === 'short'}
        >
          {sameDirectionOpen === 'long' ? t('addLong') : t('long')}
        </Button>
        <Button
          variant="short"
          onClick={() => (sameDirectionOpen === 'short' ? onAdd('short') : onOpen('short'))}
          disabled={disabled || balance <= 0 || sameDirectionOpen === 'long'}
        >
          {sameDirectionOpen === 'short' ? t('addShort') : t('short')}
        </Button>
      </div>
      {sameDirectionOpen != null && <p className="muted">{t('hedgeUnsupported')}</p>}

      <div className="risk-zone">
        <Button variant="risk" onClick={onFinish} disabled={disabled}>
          {t('finish')}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Проверка типов файла в изоляции**

Run: `cd frontend && npx tsc --noEmit`
Expected: ошибки остаются только в `SessionScreen.tsx` (ещё не обновлён — Task 15) и, возможно, в местах, где i18n-ключи ещё не добавлены (это не ошибка типов — `next-intl` не проверяет ключи статически, только рантайм; убедиться, что нет TS-ошибок именно по `OrderPanel.tsx`).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/backtest/components/OrderPanel.tsx
git commit -m "feat(backtest): OrderPanel без веток по openTrade — плечо, добор

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: `ReplayChart.tsx` — уровни `liq`/`limitClose`, id-ключи

**Files:**
- Modify: `frontend/src/views/backtest/components/ReplayChart.tsx`

**Interfaces:**
- Produces: `Level.id: string` (новое обязательное поле — раньше React-ключ строился из `kind`, что ломается при нескольких лимит-ордерах одного kind); `LevelKind` пополняется `'liq' | 'limitClose'`. Использует Task 15 (`SessionScreen`).

- [ ] **Step 1: Изменить типы и цвета**

В `frontend/src/views/backtest/components/ReplayChart.tsx` заменить:

```ts
export type LevelKind = 'entry' | 'stop' | 'take';

export interface Level {
  kind: LevelKind;
  price: number;
  draggable: boolean;
  /** Результат в USDT, если сработает — только у стопа и тейка, не у входа. */
  impact?: number | null;
}

const LEVEL_COLOR: Record<LevelKind, string> = {
  entry: 'var(--color-fg)',
  stop: 'var(--loss)',
  take: 'var(--profit)',
};
```

на:

```ts
export type LevelKind = 'entry' | 'stop' | 'take' | 'liq' | 'limitClose';

export interface Level {
  /** Ключ строки — не kind: лимит-ордеров одного kind может быть несколько. */
  id: string;
  kind: LevelKind;
  price: number;
  draggable: boolean;
  /** Результат в USDT, если сработает — не у входа и не у ликвидации. */
  impact?: number | null;
}

const LEVEL_COLOR: Record<LevelKind, string> = {
  entry: 'var(--color-fg)',
  stop: 'var(--loss)',
  take: 'var(--profit)',
  liq: 'var(--loss)',
  limitClose: 'var(--color-muted)',
};
```

- [ ] **Step 2: Ключ и подпись в рендере**

В блоке `{levels.map((l) => (...))}` (строки ~390–421):

Заменить `<g key={l.kind}>` на `<g key={l.id}>`.

Заменить содержимое `<text>` подписи:

```tsx
            <text x={px(4)} y={y(l.price) - px(4)} fill={LEVEL_COLOR[l.kind]} fontSize={px(10)} fontFamily="var(--font-mono)">
              {/* Вход и ликвидация подписаны ценой — это точки отсчёта, не
                  результат. Стоп, тейк и лимит-ордер подписаны результатом в
                  USDT: цену и так видно по линии и высоте над свечами. */}
              {l.kind === 'entry' || l.kind === 'liq'
                ? `${levelLabel(l.kind)} ${formatPriceGrouped(l.price)}`
                : `${levelLabel(l.kind)}${l.impact != null ? ` ${formatMoney(l.impact)} USDT` : ''}`}
            </text>
```

- [ ] **Step 3: Проверка типов**

Run: `cd frontend && npx tsc --noEmit`
Expected: ошибки в местах, где `Level` конструируется без `id` (только `SessionScreen.tsx`, ещё не обновлён — Task 15).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/backtest/components/ReplayChart.tsx
git commit -m "feat(backtest): уровни ликвидации и лимит-ордеров на графике, id-ключи

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 13: `ChangeLevelsModal.tsx` — правка стопа/тейка открытой сделки

**Files:**
- Create: `frontend/src/views/backtest/components/ChangeLevelsModal.tsx`

**Interfaces:**
- Consumes: `checkLevels`, `levelSliderRange`, `toInputPrice`, `toScreen` (существуют в `lib/money.ts`); `Dialog`/`DialogHeader`/`DialogBody`/`DialogActions` (`shared/ui/dialog`).
- Produces: `ChangeLevelsModal({ trade, scale, screenPrice, onApply, onClose, isPending, error })`. Использует Task 14 (`OpenPositionsPanel` открывает её), Task 15 (`SessionScreen` подключает мутацию).

- [ ] **Step 1: Создать компонент**

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Field, Input } from '@/shared/ui/Field';
import { Slider } from '@/shared/ui/Slider';
import { fmtPctSigned, formatPriceGrouped } from '@/shared/lib/utils/format';
import type { BacktestTrade } from '../api/types';
import { checkLevels, levelSliderRange, toInputPrice, toScreen } from '../lib/money';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Правка стопа/тейка открытой сделки — модалка, а не инлайн-поля панели:
 * `OrderPanel` больше не смотрит на то, открыта ли сделка, значит редактировать
 * уже существующие уровни негде, кроме отдельного диалога.
 */
export function ChangeLevelsModal({
  trade,
  scale,
  screenPrice,
  onApply,
  onClose,
  isPending,
  error,
}: {
  trade: BacktestTrade;
  scale: number;
  /** Текущая экранная цена — источник для диапазонов и процентов. */
  screenPrice: number;
  onApply: (stop: number, take: number | null) => void;
  onClose: () => void;
  isPending: boolean;
  error: unknown;
}) {
  const t = useTranslations('backtest');
  const [stop, setStop] = useState(() => toScreen(trade.stopLoss, scale));
  const [take, setTake] = useState<number | null>(() => (trade.takeProfit != null ? toScreen(trade.takeProfit, scale) : null));
  const takeRange = levelSliderRange('take', screenPrice, trade.direction);
  const stopRange = levelSliderRange('stop', screenPrice, trade.direction);
  const stopPct = ((stop - screenPrice) / screenPrice) * 100;
  const takePct = take != null ? ((take - screenPrice) / screenPrice) * 100 : null;
  const err = checkLevels(trade.direction, screenPrice, stop, take);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader
          title={t('changeLevelsTitle')}
          subtitle={`${t(`direction.${trade.direction}`)} · ${formatPriceGrouped(toScreen(trade.entryPrice, scale))}`}
        />
        <DialogBody>
          <Field
            label={
              <span className="fld-head">
                <span>{t('stop')}</span>
                <span className="fld-val">{fmtPctSigned(-stopPct)}</span>
              </span>
            }
          >
            {(id) => (
              <>
                <Slider
                  value={clamp(stop, stopRange.min, stopRange.max)}
                  min={stopRange.min}
                  max={stopRange.max}
                  step={(stopRange.max - stopRange.min) / 200 || 1}
                  onChange={setStop}
                  aria-label={t('stop')}
                />
                <Input id={id} full inputMode="decimal" value={toInputPrice(stop)} onChange={(e) => setStop(Number(e.target.value))} />
              </>
            )}
          </Field>
          <Field
            label={
              <span className="fld-head">
                <span>{t('take')}</span>
                {takePct != null && <span className="fld-val">{fmtPctSigned(takePct)}</span>}
              </span>
            }
          >
            {(id) => (
              <>
                <Slider
                  value={clamp(take ?? screenPrice, takeRange.min, takeRange.max)}
                  min={takeRange.min}
                  max={takeRange.max}
                  step={(takeRange.max - takeRange.min) / 200 || 1}
                  onChange={setTake}
                  aria-label={t('take')}
                />
                <Input
                  id={id}
                  full
                  inputMode="decimal"
                  value={take != null ? toInputPrice(take) : ''}
                  onChange={(e) => setTake(e.target.value.trim() ? Number(e.target.value) : null)}
                />
              </>
            )}
          </Field>
          {err && <p className="neg">{t(err)}</p>}
          {error != null && <p className="neg">{t('actionFailed')}</p>}
        </DialogBody>
        <DialogActions
          confirmLabel={t('apply')}
          confirmDisabled={isPending || err != null}
          onConfirm={() => onApply(stop, take)}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Проверка типов**

Run: `cd frontend && npx tsc --noEmit`
Expected: без новых ошибок в этом файле (i18n-ключи `changeLevelsTitle` и т.д. — рантайм, не TS; добавляются в Task 16).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/backtest/components/ChangeLevelsModal.tsx
git commit -m "feat(backtest): модалка правки TP/SL открытой сделки

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 14: `LimitCloseModal.tsx` и `MarketCloseModal.tsx`

**Files:**
- Create: `frontend/src/views/backtest/components/LimitCloseModal.tsx`
- Create: `frontend/src/views/backtest/components/MarketCloseModal.tsx`

**Interfaces:**
- Consumes: `levelImpact`, `fromScreen`, `toScreen` (`lib/money.ts`).
- Produces: `LimitCloseModal({ trade, remaining, scale, screenPrice, onSubmit, onClose, isPending, error })` — `onSubmit(price: number, qty: number)`, цена и qty в НАСТОЯЩИХ (не экранных) единицах. `MarketCloseModal({ trade, remaining, scale, screenPrice, onSubmit, onClose, isPending, error })` — `onSubmit(qty: number)`. Использует Task 15 (`SessionScreen`).

- [ ] **Step 1: `LimitCloseModal.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Field, Input } from '@/shared/ui/Field';
import { Slider } from '@/shared/ui/Slider';
import { formatMoney, formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import type { BacktestTrade } from '../api/types';
import { fromScreen, levelImpact, toInputPrice, toScreen } from '../lib/money';

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

/**
 * Закрытие частью объёма по указанной цене — не исполняется сразу, ждёт, пока
 * цена реплея её достигнет (как стоп/тейк). Confirm ставит висящий
 * лимит-ордер, а не закрывает сделку.
 */
export function LimitCloseModal({
  trade,
  remaining,
  scale,
  screenPrice,
  onSubmit,
  onClose,
  isPending,
  error,
}: {
  trade: BacktestTrade;
  /** Остаток открытой позиции в монете (qty - closedQty). */
  remaining: number;
  scale: number;
  screenPrice: number;
  onSubmit: (price: number, qty: number) => void;
  onClose: () => void;
  isPending: boolean;
  error: unknown;
}) {
  const t = useTranslations('backtest');
  const [price, setPrice] = useState(screenPrice);
  const [pct, setPct] = useState(100);
  const qty = (remaining * pct) / 100;
  const impact = levelImpact(trade.direction, screenPrice, price, qty);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader
          title={t('limitCloseTitle')}
          subtitle={`${t('entry')} ${formatPriceGrouped(toScreen(trade.entryPrice, scale))} · ${t('unrealized')} ${formatPriceGrouped(screenPrice)}`}
        />
        <DialogBody>
          <Field label={t('closingPrice')}>
            {(id) => (
              <Input id={id} full inputMode="decimal" value={toInputPrice(price)} onChange={(e) => setPrice(Number(e.target.value))} />
            )}
          </Field>
          <Field label={t('closedQtyCoin')}>
            {(id) => (
              <Input
                id={id}
                full
                inputMode="decimal"
                value={formatQty(qty)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setPct(remaining > 0 ? clampPct((v / remaining) * 100) : 0);
                }}
              />
            )}
          </Field>
          <Slider value={pct} min={0} max={100} step={1} onChange={(v) => setPct(clampPct(v))} aria-label={t('closedQtyCoin')} />
          <p className="muted">
            {t('limitCloseHint', { qty: formatQty(qty), price: formatPriceGrouped(price), pnl: formatMoney(impact.usdt) })}
          </p>
          {error != null && <p className="neg">{t('actionFailed')}</p>}
        </DialogBody>
        <DialogActions
          confirmLabel={t('limitCloseConfirm')}
          confirmDisabled={isPending || !(qty > 0) || !(price > 0)}
          onConfirm={() => onSubmit(fromScreen(price, scale), qty)}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: `MarketCloseModal.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader } from '@/shared/ui/dialog';
import { Field, Input } from '@/shared/ui/Field';
import { Slider } from '@/shared/ui/Slider';
import { formatMoney, formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import type { BacktestTrade } from '../api/types';
import { levelImpact } from '../lib/money';

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

/** Закрытие частью объёма сразу, по текущей цене — без ожидания. */
export function MarketCloseModal({
  trade,
  remaining,
  screenPrice,
  onSubmit,
  onClose,
  isPending,
  error,
}: {
  trade: BacktestTrade;
  remaining: number;
  screenPrice: number;
  onSubmit: (qty: number) => void;
  onClose: () => void;
  isPending: boolean;
  error: unknown;
}) {
  const t = useTranslations('backtest');
  const [pct, setPct] = useState(100);
  const qty = (remaining * pct) / 100;
  // Цена не меняется (закрытие сейчас) — levelImpact на равной цене даёт
  // только комиссии, этого достаточно для предпросмотра объёма.
  const impact = levelImpact(trade.direction, screenPrice, screenPrice, qty);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader title={t('marketCloseTitle')} subtitle={`${t('unrealized')} ${formatPriceGrouped(screenPrice)}`} />
        <DialogBody>
          <Field label={t('closedQtyCoin')}>
            {(id) => (
              <Input
                id={id}
                full
                inputMode="decimal"
                value={formatQty(qty)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setPct(remaining > 0 ? clampPct((v / remaining) * 100) : 0);
                }}
              />
            )}
          </Field>
          <Slider value={pct} min={0} max={100} step={1} onChange={(v) => setPct(clampPct(v))} aria-label={t('closedQtyCoin')} />
          <p className="muted">{t('marketCloseHint', { qty: formatQty(qty), pnl: formatMoney(impact.usdt) })}</p>
          {error != null && <p className="neg">{t('actionFailed')}</p>}
        </DialogBody>
        <DialogActions
          confirmLabel={t('marketCloseConfirm')}
          confirmVariant="risk"
          confirmDisabled={isPending || !(qty > 0)}
          onConfirm={() => onSubmit(qty)}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Проверка типов**

Run: `cd frontend && npx tsc --noEmit`
Expected: без новых ошибок в этих двух файлах.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/backtest/components/LimitCloseModal.tsx frontend/src/views/backtest/components/MarketCloseModal.tsx
git commit -m "feat(backtest): модалки частичного закрытия — лимит и маркет

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 15: `OpenPositionsPanel.tsx`

**Files:**
- Create: `frontend/src/views/backtest/components/OpenPositionsPanel.tsx`

**Interfaces:**
- Consumes: `unrealizedPnl`, `toScreen` (`lib/money.ts`); `LedgerTable`, `Money`, `EmptyState`, `Button` (`shared/ui`).
- Produces: `OpenPositionsPanel({ trade, scale, price, closeOrders, onLimit, onMarket, onCancelOrder, onChangeLevels })`. Использует Task 17 (`SessionScreen`).

- [ ] **Step 1: Создать компонент**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import type { BacktestCloseOrder, BacktestTrade } from '../api/types';
import { toScreen, unrealizedPnl } from '../lib/money';

interface Row {
  trade: BacktestTrade;
  remaining: number;
}

/**
 * Открытая позиция сессии — их не больше одной. Кнопки закрытия живут здесь,
 * а не в `OrderPanel`: панель ордера никогда не смотрит на то, открыта ли
 * сделка, а закрытие — как раз про то, что уже открыто.
 */
export function OpenPositionsPanel({
  trade,
  scale,
  price,
  closeOrders,
  onLimit,
  onMarket,
  onCancelOrder,
  onChangeLevels,
}: {
  trade: BacktestTrade | null;
  scale: number;
  /** Настоящая цена последней показанной минутки. */
  price: number | null;
  closeOrders: BacktestCloseOrder[];
  onLimit: () => void;
  onMarket: () => void;
  onCancelOrder: (orderId: string) => void;
  onChangeLevels: () => void;
}) {
  const t = useTranslations('backtest');

  if (!trade) {
    return <EmptyState title={t('noOpenPosition')}>{t('noOpenPositionHint')}</EmptyState>;
  }

  const remaining = trade.qty - trade.closedQty;
  const rows: Row[] = [{ trade, remaining }];

  const columns: LedgerColumn<Row>[] = [
    {
      key: 'dir',
      header: t('colDir'),
      render: (r) => <span className={`dir${r.trade.direction === 'short' ? ' short' : ''}`}>{t(`direction.${r.trade.direction}`)}</span>,
    },
    {
      key: 'entry',
      header: t('colEntry'),
      align: 'right',
      cellClassName: 'n',
      render: (r) => formatPriceGrouped(toScreen(r.trade.entryPrice, scale)),
    },
    {
      key: 'size',
      header: t('colSize'),
      align: 'right',
      cellClassName: 'n',
      render: (r) => (
        <span title={t('qtyTitle', { qty: formatQty(r.remaining) })}>
          {formatPriceGrouped(r.remaining * toScreen(r.trade.entryPrice, scale))}
        </span>
      ),
    },
    {
      key: 'leverage',
      header: t('leverageLabel'),
      align: 'right',
      cellClassName: 'n',
      render: (r) => `${r.trade.leverage.toFixed(0)}×`,
    },
    {
      key: 'pnl',
      header: t('colPnl'),
      align: 'right',
      cellClassName: 'n',
      render: (r) => (price != null ? <Money value={unrealizedPnl(r.trade.direction, r.trade.entryPrice, price, r.remaining)} large /> : '—'),
    },
    {
      key: 'actions',
      render: () => (
        <span className="row-actions">
          <Button tight onClick={onChangeLevels}>
            {t('changeLevels')}
          </Button>
          <Button tight onClick={onLimit}>
            {t('limitClose')}
          </Button>
          <Button tight variant="risk" onClick={onMarket}>
            {t('marketClose')}
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <LedgerTable columns={columns} rows={rows} rowKey={(r) => r.trade.id} />
      {closeOrders.length > 0 && (
        <ul className="close-orders">
          {closeOrders.map((o) => (
            <li key={o.id}>
              <span>{t('pendingLimitOrder', { qty: formatQty(o.qty), price: formatPriceGrouped(toScreen(o.price, scale)) })}</span>
              <Button tight onClick={() => onCancelOrder(o.id)}>
                {t('cancelOrder')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Проверка типов**

Run: `cd frontend && npx tsc --noEmit`
Expected: без новых ошибок в этом файле.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/backtest/components/OpenPositionsPanel.tsx
git commit -m "feat(backtest): таблица открытой позиции с кнопками Лимит/Маркет

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 16: i18n — все новые ключи (ru + en)

**Files:**
- Modify: `frontend/src/shared/i18n/messages/ru.json` (секция `backtest`, строки ~449–541)
- Modify: `frontend/src/shared/i18n/messages/en.json` (секция `backtest`)

**Interfaces:**
- Produces: все ключи, которые читают Task 11–15 через `t('...')`. Ничего не потребляет.

- [ ] **Step 1: Добавить ключи в `ru.json`**

В секцию `"backtest": { ... }` файла `frontend/src/shared/i18n/messages/ru.json`, заменить строку `"reason": { "stop": "стопу", "take": "тейку", "manual": "рынку", "finish": "завершению", "open": "открыта" },` на:

```json
    "reason": { "stop": "стопу", "take": "тейку", "manual": "рынку", "finish": "завершению", "limit": "лимиту", "open": "открыта" },
```

Заменить `"level": { "entry": "вход", "stop": "стоп", "take": "тейк" },` на:

```json
    "level": { "entry": "вход", "stop": "стоп", "take": "тейк", "liq": "ликвидация", "limitClose": "лимит закрытия" },
```

Добавить в конец секции `backtest` (перед закрывающей `}` секции, после `"balanceFromTo": "Депозит: {from} → {to} USDT"`) запятую и новые ключи:

```json
    "marginLabel": "Маржа",
    "liqLabel": "Ликвидация",
    "addLong": "Добрать лонг",
    "addShort": "Добрать шорт",
    "hedgeUnsupported": "Одновременно лонг и шорт по одной сделке не поддерживаются — вторая сторона добирает первую.",
    "colDirection": "Сторона",
    "colSize": "Размер",
    "colPnl": "PnL",
    "qtyTitle": "{qty} монет",
    "noOpenPosition": "Открытой позиции нет",
    "noOpenPositionHint": "Откройте сделку в панели слева — она появится здесь.",
    "openPositionsTab": "Открытые позиции",
    "historyTab": "История сделок",
    "changeLevels": "Изменить",
    "changeLevelsTitle": "Изменить стоп/тейк",
    "limitClose": "Лимит",
    "marketClose": "Маркет",
    "limitCloseTitle": "Закрытие лимитом",
    "marketCloseTitle": "Закрытие по рынку",
    "closingPrice": "Цена закрытия",
    "closedQtyCoin": "Объём закрытия",
    "limitCloseHint": "{qty} будет закрыто по цене {price}, результат {pnl} USDT (с учётом комиссий).",
    "marketCloseHint": "{qty} закроется прямо сейчас, результат {pnl} USDT (с учётом комиссий).",
    "limitCloseConfirm": "Поставить ордер",
    "marketCloseConfirm": "Закрыть сейчас",
    "pendingLimitOrder": "Лимит {qty} @ {price}",
    "cancelOrder": "Отменить"
```

- [ ] **Step 2: Добавить те же ключи в `en.json`**

Прочитать секцию `backtest` в `frontend/src/shared/i18n/messages/en.json` (`Grep '"backtest"' frontend/src/shared/i18n/messages/en.json` → `Read` со смещением), внести те же три правки (`reason.limit`, `level.liq`/`level.limitClose`, новый блок ключей) с английскими текстами, например:

```json
    "marginLabel": "Margin",
    "liqLabel": "Liquidation",
    "addLong": "Add to long",
    "addShort": "Add to short",
    "hedgeUnsupported": "Long and short on the same trade at once aren't supported — the other side adds to the first.",
    "colDirection": "Side",
    "colSize": "Size",
    "colPnl": "PnL",
    "qtyTitle": "{qty} coins",
    "noOpenPosition": "No open position",
    "noOpenPositionHint": "Open a trade in the panel on the left — it will show up here.",
    "openPositionsTab": "Open positions",
    "historyTab": "Trade history",
    "changeLevels": "Change",
    "changeLevelsTitle": "Change stop/take",
    "limitClose": "Limit",
    "marketClose": "Market",
    "limitCloseTitle": "Limit close",
    "marketCloseTitle": "Market close",
    "closingPrice": "Closing price",
    "closedQtyCoin": "Closed quantity",
    "limitCloseHint": "{qty} will close at {price}, result {pnl} USDT (fees included).",
    "marketCloseHint": "{qty} closes right now, result {pnl} USDT (fees included).",
    "limitCloseConfirm": "Place order",
    "marketCloseConfirm": "Close now",
    "pendingLimitOrder": "Limit {qty} @ {price}",
    "cancelOrder": "Cancel"
```

(`reason`/`level` — добавить `"limit": "limit"` и `"liq": "liquidation", "limitClose": "limit close"` по аналогии с русским.)

- [ ] **Step 2: Проверка — оба файла валидный JSON**

Run: `cd frontend && node -e "JSON.parse(require('fs').readFileSync('src/shared/i18n/messages/ru.json','utf8')); JSON.parse(require('fs').readFileSync('src/shared/i18n/messages/en.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/shared/i18n/messages/ru.json frontend/src/shared/i18n/messages/en.json
git commit -m "feat(backtest): переводы — плечо, добор, частичное закрытие

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 17: `SessionScreen.tsx` — собрать всё вместе

**Files:**
- Modify: `frontend/src/views/backtest/components/SessionScreen.tsx`

**Interfaces:**
- Consumes: всё из Task 8–16 (`OrderPanel`, `OpenPositionsPanel`, `LimitCloseModal`, `MarketCloseModal`, `ChangeLevelsModal`, хуки, `Level`/`advanceTo` с `closeOrders`).
- Produces: рабочий экран активной сессии; ничего не потребляют другие таски этого плана (последний перед Task 18).

- [ ] **Step 1: Обновить `useReplay.ts` — прокинуть `closeOrders` в проверку**

В `frontend/src/views/backtest/model/useReplay.ts`:

Импортировать `BacktestCloseOrder` из `../api/types` и `CloseOrder` из `../lib/fills` (добавить в существующие импорты).

После строки `openRef.current = detail.trades.find((x) => x.exitTime == null) ?? null;` добавить:

```ts
  const closeOrdersRef = useRef<BacktestCloseOrder[]>([]);
  closeOrdersRef.current = detail.closeOrders;
```

В `advance` (внутри `useCallback`), заменить вызов `advanceTo`:

```ts
        const { reach, complete, exit } = advanceTo({
          from,
          target,
          minutes: minutesRef.current,
          loadedUntil: loadedUntil(minutesRef.current),
          position,
          closeOrders: closeOrdersRef.current.map((o) => ({ id: o.id, price: o.price, qty: o.qty })),
        });
```

- [ ] **Step 2: `SessionScreen.tsx` — состояние и обработчики**

В `ActiveSession`, заменить блок хуков мутаций:

```ts
  const { data: tagsData } = useTags();
  const openM = useOpenTrade(session.id);
  const modifyM = useModifyTrade(session.id);
  const closeM = useCloseTrade(session.id);
  const finishM = useFinishSession(session.id);
  const tagsM = useSetBacktestTags(session.id);
```

на:

```ts
  const { data: tagsData } = useTags();
  const openM = useOpenTrade(session.id);
  const addM = useAddToTrade(session.id);
  const modifyM = useModifyTrade(session.id);
  const closeM = useCloseTrade(session.id);
  const createOrderM = useCreateCloseOrder(session.id);
  const cancelOrderM = useCancelCloseOrder(session.id);
  const finishM = useFinishSession(session.id);
  const tagsM = useSetBacktestTags(session.id);
```

Добавить импорты хуков в блок `from '../api/hooks'` (`useAddToTrade`, `useCreateCloseOrder`, `useCancelCloseOrder`), импорт `liquidationPrice` из `../lib/money`, импорты новых компонентов:

```ts
import { ChangeLevelsModal } from './ChangeLevelsModal';
import { LimitCloseModal } from './LimitCloseModal';
import { MarketCloseModal } from './MarketCloseModal';
import { OpenPositionsPanel } from './OpenPositionsPanel';
```

Заменить `closeTrade` helper (принимает опциональные `qty`/`closeOrderId`):

```ts
  const closeTrade = (trade: BacktestTrade, time: number, price: number, reason: ExitReason, qty?: number, closeOrderId?: string) =>
    closeM.mutateAsync({ tradeId: trade.id, exitTime: new Date(time).toISOString(), exitPrice: price, reason, qty, closeOrderId });

  const replay = useReplay(detail, (trade, exit) => {
    void closeTrade(trade, exit.time, exit.price, exit.reason, exit.qty, exit.closeOrderId).catch(() => undefined);
  });
```

Заменить `draft` начальное состояние:

```ts
  const [draft, setDraft] = useState<Draft>({ risk: '1', stop: '', take: '', leverage: '1' });
```

Удалить весь `useEffect`, синкающий `draft.stop`/`draft.take` из `openTrade` (строки со `// Уровни открытой сделки приезжают в поля...` до конца этого `useEffect`) — черновик панели больше не про открытую сделку.

Добавить состояние для модалок (рядом с `confirm`):

```ts
  const [limitModal, setLimitModal] = useState(false);
  const [marketModal, setMarketModal] = useState(false);
  const [levelsModal, setLevelsModal] = useState(false);
  const [tab, setTab] = useState<'open' | 'history'>('open');
```

Заменить сигнатуру `open`:

```ts
  const open = (direction: Direction) => {
    if (replay.price == null || screenPrice == null) return;
    const risk = Number(draft.risk);
    if (!(risk >= 0.01 && risk <= 100)) {
      setHint(t('riskInvalid'));
      return;
    }
    const err = checkLevels(direction, screenPrice, stopN, takeN);
    setHint(err ? t(err) : null);
    if (err) return;
    replay.setSpeed(null);
    openM.mutate({
      direction,
      entryTime: new Date(replay.cursor).toISOString(),
      entryPrice: replay.price,
      stopLoss: fromScreen(stopN, scale),
      takeProfit: takeN != null ? fromScreen(takeN, scale) : undefined,
      riskPct: risk,
      leverage: Number(draft.leverage) || 1,
    });
  };

  const addToPosition = (direction: Direction) => {
    if (replay.price == null || !openTrade || openTrade.direction !== direction) return;
    const risk = Number(draft.risk);
    if (!(risk >= 0.01 && risk <= 100)) {
      setHint(t('riskInvalid'));
      return;
    }
    addM.mutate({ tradeId: openTrade.id, entryPrice: replay.price, riskPct: risk });
  };
```

Заменить только тело `applyLevels` (сигнатура и место в файле те же — драг по графику, `onDragLevel`, `applyLevelsRef` и `dragCtxRef` НЕ трогать, они остаются как есть: спека про плечо/добор прямо требует сохранить драг уровня по графику, модалка — это ДОПОЛНИТЕЛЬНЫЙ способ той же правки через кнопку «Изменить», не замена):

```ts
  const applyLevels = (stop: number, take: number | null) => {
    if (!openTrade || screenPrice == null) return;
    const err = checkLevels(openTrade.direction, screenPrice, stop, take);
    setHint(err ? t(err) : null);
    if (err) return;
    modifyM.mutate(
      { tradeId: openTrade.id, stopLoss: fromScreen(stop, scale), takeProfit: take != null ? fromScreen(take, scale) : null },
      { onSuccess: () => setLevelsModal(false) },
    );
  };
```

(`onSuccess` закрывает модалку, если правка пришла из неё; на драг по графику это не влияет — там `levelsModal` и так `false`.)

`onDragLevel`, `applyLevelsRef`, `dragCtxRef` остаются в файле без изменений. `<ReplayChart ... onDragLevel={onDragLevel} .../>` тоже остаётся как есть — проп НЕ убирается (см. ниже, Step 4, где это уточнено).

Заменить `closeManual` на обработчики для новых модалок:

```ts
  const submitLimit = (price: number, qty: number) => {
    if (!openTrade) return;
    createOrderM.mutate({ tradeId: openTrade.id, price, qty }, { onSuccess: () => setLimitModal(false) });
  };

  const submitMarket = (qty: number) => {
    if (!openTrade || replay.price == null || !canClose) return;
    void closeTrade(openTrade, replay.cursor, replay.price, 'manual', qty).then(() => setMarketModal(false)).catch(() => undefined);
  };
```

- [ ] **Step 3: Уровни на графике — добавить `id`, `liq`, `limitClose`**

Заменить `useMemo<Level[]>` (блок `levels`):

```ts
  const levels = useMemo<Level[]>(() => {
    const levelUsdt = (levelReal: number) =>
      direction != null && impactQty != null && impactRef != null ? levelImpact(direction, impactRef, levelReal, impactQty).usdt : null;
    const list: Level[] = [];
    if (openTrade) {
      list.push({ id: 'entry', kind: 'entry', price: toScreen(openTrade.entryPrice, scale), draggable: false });
      list.push({
        id: 'liq',
        kind: 'liq',
        price: toScreen(liquidationPrice(openTrade.direction, openTrade.entryPrice, openTrade.leverage), scale),
        draggable: false,
      });
    }
    if (stopN > 0) list.push({ id: 'stop', kind: 'stop', price: stopN, draggable: true, impact: levelUsdt(fromScreen(stopN, scale)) });
    if (takeN != null && takeN > 0) list.push({ id: 'take', kind: 'take', price: takeN, draggable: true, impact: levelUsdt(fromScreen(takeN, scale)) });
    for (const o of detail.closeOrders) {
      list.push({ id: o.id, kind: 'limitClose', price: toScreen(o.price, scale), draggable: false, impact: levelUsdt(o.price) });
    }
    return list;
  }, [openTrade, scale, stopN, takeN, direction, impactQty, impactRef, detail.closeOrders]);
```

(Стоп/тейк остаются `draggable: true` — как и раньше, драг по графику никуда не делся, см. Step 2 выше. Лимит-ордера — `draggable: false`, двигать их означает отменить старый и поставить новый через модалку, отдельного UX для драга нет.)

- [ ] **Step 4: JSX — панель, вкладки, модалки**

Заменить блок `<div className="marg">...</div>` (панель ордера + ошибки):

```tsx
        <div className="marg">
          <OrderPanel
            draft={draft}
            onDraft={setDraft}
            sameDirectionOpen={openTrade?.direction ?? null}
            openLeverage={openTrade?.leverage ?? null}
            scale={scale}
            price={replay.price}
            balance={session.balance}
            disabled={busy || closePending || !replay.ready}
            hint={hint}
            onOpen={open}
            onAdd={addToPosition}
            onFinish={askFinish}
          />
          <ErrorNote error={openM.error ?? addM.error ?? finishM.error} fallback={t('actionFailed')} />
        </div>
      </div>

      <SectionHead title={tab === 'open' ? t('openPositionsTab') : t('historyTab')}>
        <Seg
          options={[
            { value: 'open' as const, label: t('openPositionsTab') },
            { value: 'history' as const, label: t('historyTab') },
          ]}
          value={tab}
          onChange={setTab}
          ariaLabel={t('openPositionsTab')}
        />
      </SectionHead>
      {tab === 'open' ? (
        <OpenPositionsPanel
          trade={openTrade}
          scale={scale}
          price={replay.price}
          closeOrders={detail.closeOrders}
          onLimit={() => setLimitModal(true)}
          onMarket={() => setMarketModal(true)}
          onCancelOrder={(id) => cancelOrderM.mutate(id)}
          onChangeLevels={() => setLevelsModal(true)}
        />
      ) : (
        <SessionTrades
          trades={trades}
          scale={scale}
          labelFor={labelFor}
          tags={tagsData?.tags ?? []}
          onSetTags={(tradeId, tagIds) => tagsM.mutate({ tradeId, tagIds })}
        />
      )}

      {levelsModal && openTrade && screenPrice != null && (
        <ChangeLevelsModal
          trade={openTrade}
          scale={scale}
          screenPrice={screenPrice}
          onApply={applyLevels}
          onClose={() => setLevelsModal(false)}
          isPending={modifyM.isPending}
          error={modifyM.error}
        />
      )}
      {limitModal && openTrade && screenPrice != null && (
        <LimitCloseModal
          trade={openTrade}
          remaining={openTrade.qty - openTrade.closedQty}
          scale={scale}
          screenPrice={screenPrice}
          onSubmit={submitLimit}
          onClose={() => setLimitModal(false)}
          isPending={createOrderM.isPending}
          error={createOrderM.error}
        />
      )}
      {marketModal && openTrade && screenPrice != null && (
        <MarketCloseModal
          trade={openTrade}
          remaining={openTrade.qty - openTrade.closedQty}
          screenPrice={screenPrice}
          onSubmit={submitMarket}
          onClose={() => setMarketModal(false)}
          isPending={closeM.isPending}
          error={closeM.isError ? closeM.error : null}
        />
      )}

      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
```

Убрать старый рендер `<SessionTrades .../>` и блок про `closeM.isError`/`retryClose` из старого места (он был сразу под `.marg` — заменяется логикой выше: ошибка ручного закрытия теперь показывается внутри `MarketCloseModal` через `error={closeM.isError ? closeM.error : null}`; для автоматического закрытия стопом/тейком/лимитом при потере ответа сети `useCloseTrade`'s `retry: 3` уже переотправляет запрос — отдельная кнопка «Повторить» была нужна как резерв на случай исчерпания трёх попыток; оставить её в свёрнутом виде под графиком:

```tsx
      {closeM.isError && closeM.variables && (
        <p className="neg">
          {t('closeFailed')}{' '}
          <Button tight onClick={() => closeM.mutate(closeM.variables!)}>
            {t('retryClose')}
          </Button>
        </p>
      )}
```

— вставить этот блок сразу перед `<SectionHead title={tab === 'open' ...`.

`<ReplayChart ... onDragLevel={onDragLevel} .../>` в JSX — без изменений (см. Step 2 выше: драг стопа/тейка по графику сохраняется, проп не убирается).

- [ ] **Step 5: Проверка типов всего фронтенда**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 ошибок.

- [ ] **Step 6: Прогнать линтер (если настроен для проекта)**

Run: `cd frontend && npx eslint src/views/backtest --max-warnings=0`
Expected: PASS либо только предупреждения, уже существовавшие до этого плана (сверить с `git stash` при сомнении).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/backtest
git commit -m "feat(backtest): SessionScreen — вкладки, добор, модалки закрытия, лимит-ордера на графике

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 18: Финальная проверка — полный прогон и сборка

**Files:** нет — только верификация.

- [ ] **Step 1: Полный бэкенд**

Run: `cd backend && npx jest`
Expected: PASS, все файлы.

- [ ] **Step 2: Полный фронтенд — тесты**

Run: `cd frontend && npx vitest run`
Expected: PASS, все файлы (включая `money.test.ts`, `fills.test.ts`).

- [ ] **Step 3: Продакшен-сборка фронтенда**

Run: `cd frontend && npx next build`
Expected: сборка завершается без ошибок (правило проекта: `tsc`/dev-сервер не ловят всё, что ловит `next build`).

- [ ] **Step 4: Ручная проверка на dev-сервере**

Запустить `start.bat` (или `docker compose up`), открыть `/backtest`, начать сессию и проверить по списку из спеки:
- Открытие сделки с разным плечом — маржа считается, отказ при марже больше депозита.
- Добор той же стороны — вход усредняется, риск суммируется; кнопка противоположной стороны задизейблена.
- Вкладка «Открытые позиции» показывает строку с остатком, PnL, кнопками Лимит/Маркет.
- «Маркет» на 50% — закрывает половину, остаток и PnL в таблице обновляются, сделка остаётся открытой.
- «Лимит» на будущую цену — появляется висящий ордер в списке под таблицей и линия на графике; при доходе цены реплея срабатывает автоматически, автопрокрутка встаёт.
- Отмена висящего лимит-ордера.
- Несколько лимит-ордеров одновременно.
- «Изменить» открывает модалку TP/SL, применяет без ошибок.
- Финальное закрытие (стоп/тейк/«Завершить сессию») агрегирует pnl/r корректно — сверить с `SessionSummary` после завершения.
- Вкладка «История сделок» показывает закрытую сделку одной строкой, тегирование работает.
- Демо-аккаунт (`demo@example.com`) и обычный журнал (`/journal`, `/overview`) не задеты — эта работа изолирована в `backtest`-модуле.

- [ ] **Step 5: Итоговый коммит (если Step 4 потребовал точечных фиксов)**

```bash
git add -A
git commit -m "fix(backtest): точечные правки по итогам ручной проверки

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
