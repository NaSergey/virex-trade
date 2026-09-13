# Бектест: хедж, живое плечо и таблицы терминала — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Разрешить одновременно открытые long и short в одной сессии бектеста, сделать
плечо живым (меняется в любой момент, применяется ко всем открытым сделкам сразу), и
привести панель ордера, таблицу открытой позиции и историю сделок терминала к виду,
независимому от того, что именно сейчас открыто.

**Architecture:** Бэкенд-гвард «одна открытая сделка» становится гвардом «одна открытая
сделка **на направление**»; движок прокрутки (`advance.ts`/`useReplay.ts`) проверяет
массив из 0–2 открытых позиций за тик вместо одной; терминал (`ReplayChart`,
`SessionScreen`, `OrderPanel`, `OpenPositionsPanel`) читает `openTrades: BacktestTrade[]`
вместо `openTrade: BacktestTrade | null` по всей цепочке.

**Tech Stack:** NestJS + Prisma (бэкенд), Next.js App Router + React (фронтенд), Jest
(бэкенд-тесты), Vitest (фронтенд-тесты).

## Global Constraints

- Весь текст для пользователя — на русском (переводы `ru.json`, `en.json` — оба, `en.json`
  на английском).
- Никакой сырой разметки для повторяющихся элементов — через `shared/ui`
  (`Button`, `Field`/`Input`, `LedgerTable`, `Money`, `KeyValue`, `EmptyState`,
  `SectionHead`, `Slider`).
- Правка трогает бэкенд, схему (комментарий) и несколько слоёв фронта — это «крупное
  изменение» по глобальным правилам проекта: **Задача 6 обязана прогнать `next build` и
  полный набор бэкенд-тестов перед итоговым коммитом**, не ограничиваясь `tsc`.
- Спека: `docs/superpowers/specs/2026-09-13-backtest-terminal-design.md` — при
  расхождении плана с ней права спека, план поправить.

---

## Задача 1: Бэкенд — гвард открытия по направлению

Сейчас `openTrade` не даёт открыть вторую сделку сессии вообще, независимо от стороны.
Меняем на «не даёт открыть вторую сделку **той же стороны**» — открытие
противоположной стороны становится хеджем.

**Файлы:**
- Modify: `backend/src/backtest/backtest.service.ts:207-208`
- Test: `backend/src/backtest/backtest.service.spec.ts`

**Interfaces:**
- Consumes: ничего нового — сигнатура `openTrade(userId, sessionId, input: OpenTradeInput)` не меняется.
- Produces: `openTrade` больше не кидает `BACKTEST_OPEN_TRADE` для противоположного
  направления — на это опирается Задача 4 (кнопки Long/Short в `OrderPanel` перестают
  дизейблить друг друга).

- [ ] **Шаг 1: Написать падающий тест — открытие противоположной стороны при уже открытой**

В `backend/src/backtest/backtest.service.spec.ts`, сразу после существующего теста
`'не открывает вторую сделку, пока есть открытая'` (строка 312), переименовать его и
добавить рядом новый:

```ts
  it('не открывает вторую сделку той же стороны, пока она уже открыта', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);
    prisma.backtestTrade.count.mockResolvedValue(1);

    const err = await rejection(service.openTrade('u1', 's1', OPEN));

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_OPEN_TRADE' });
    expect(prisma.backtestTrade.count).toHaveBeenCalledWith({
      where: { sessionId: 's1', exitTime: null, direction: 'long' },
    });
    expect(prisma.backtestTrade.create).not.toHaveBeenCalled();
  });

  it('открывает противоположную сторону, даже если одна уже открыта — хедж', async () => {
    const { service, prisma } = makeService();
    prisma.backtestSession.findUnique.mockResolvedValue(SESSION);
    // В БД лежит одна открытая long — count с фильтром direction:'short' её не находит.
    prisma.backtestTrade.count.mockImplementation(({ where }: { where: { direction?: string } }) =>
      Promise.resolve(where.direction === 'short' ? 0 : 1),
    );

    await service.openTrade('u1', 's1', { ...OPEN, direction: 'short', stopLoss: 102 });

    expect(prisma.backtestTrade.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ direction: 'short' }) }),
    );
  });
```

(`OPEN.entryPrice = 100`; шорту нужен стоп выше входа — отсюда `stopLoss: 102`.)

- [ ] **Шаг 2: Прогнать тесты, убедиться, что новый падает**

Run: `cd backend && npx jest backtest.service.spec.ts -t "хедж"`
Expected: FAIL — `prisma.backtestTrade.create` не вызван (сервис всё ещё кидает `BACKTEST_OPEN_TRADE`).

- [ ] **Шаг 3: Поправить гвард в `openTrade`**

В `backend/src/backtest/backtest.service.ts:207-208`:

```ts
      const open = await tx.backtestTrade.count({ where: { sessionId, exitTime: null } });
      if (open > 0) throw new ConflictException({ message: 'Открытая сделка уже есть', code: 'BACKTEST_OPEN_TRADE' });
```

→

```ts
      const open = await tx.backtestTrade.count({ where: { sessionId, exitTime: null, direction: input.direction } });
      if (open > 0) throw new ConflictException({ message: 'Открытая сделка уже есть', code: 'BACKTEST_OPEN_TRADE' });
```

- [ ] **Шаг 4: Прогнать весь файл тестов, убедиться, что всё зелёное**

Run: `cd backend && npx jest backtest.service.spec.ts`
Expected: PASS, все тесты.

- [ ] **Шаг 5: Коммит**

```bash
git add backend/src/backtest/backtest.service.ts backend/src/backtest/backtest.service.spec.ts
git commit -m "feat(backtest): хедж — гвард открытия по направлению, не по сессии

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Задача 2: Бэкенд — живое плечо сессии

Новый метод и эндпоинт: меняет плечо у всех открытых сделок сессии разом, с проверкой
маржи по каждой. Плюс фронтовый хук-обёртка.

**Файлы:**
- Modify: `backend/src/backtest/backtest.service.ts`
- Modify: `backend/src/backtest/backtest.controller.ts`
- Modify: `backend/src/backtest/dto/backtest.dto.ts`
- Modify: `backend/prisma/schema.prisma:302-306` (комментарий поля)
- Modify: `frontend/src/views/backtest/api/hooks.ts`
- Test: `backend/src/backtest/backtest.service.spec.ts`

**Interfaces:**
- Consumes: `bumpCursor` (приватный метод сервиса, уже используется `openTrade`/`modifyTrade`/`addToTrade` тем же паттерном), `TAGS` (константа `include`, уже импортирована в файле).
- Produces: `BacktestService.setLeverage(userId: string, sessionId: string, leverage: number): Promise<{ trades: BacktestTrade[] }>`; эндпоинт `PATCH /api/backtest/sessions/:id/leverage`; фронтовый хук `useSetLeverage(sessionId: string)` → `useMutation<{ trades: BacktestTrade[] }, unknown, number>` — на нём строится Задача 4 (слайдер плеча в `OrderPanel`/`SessionScreen`).

- [ ] **Шаг 1: Написать падающие тесты**

В `backend/src/backtest/backtest.service.spec.ts`, новый блок `describe` внутри
`'BacktestService — сделки'` (после блока `'лимит-ордера на закрытие'`, перед закрывающей
скобкой на строке 723):

```ts
  describe('плечо сессии', () => {
    it('меняет плечо у всех открытых сделок сессии', async () => {
      const { service, prisma } = makeService();
      prisma.backtestSession.findUnique
        .mockResolvedValueOnce(SESSION) // ownedSession
        .mockResolvedValueOnce({ balance: 10_000, cursorTime: SESSION.cursorTime }); // свежее чтение под замком
      prisma.backtestTrade.findMany.mockResolvedValueOnce([
        { ...TRADE, id: 't1', direction: 'long', qty: 50, entryPrice: 100 },
        { ...TRADE, id: 't2', direction: 'short', qty: 20, entryPrice: 100 },
      ]);

      await service.setLeverage('u1', 's1', 20);

      expect(prisma.backtestTrade.updateMany).toHaveBeenCalledWith({
        where: { sessionId: 's1', exitTime: null },
        data: { leverage: 20 },
      });
    });

    it('отказ, если новая маржа хоть одной сделки больше депозита', async () => {
      const { service, prisma } = makeService();
      prisma.backtestSession.findUnique
        .mockResolvedValueOnce(SESSION)
        .mockResolvedValueOnce({ balance: 100, cursorTime: SESSION.cursorTime });
      prisma.backtestTrade.findMany.mockResolvedValueOnce([{ ...TRADE, id: 't1', qty: 50, entryPrice: 100 }]);
      // margin = 50*100/1 = 5000 > 100

      const err = await rejection(service.setLeverage('u1', 's1', 1));

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_MARGIN_EXCEEDS_BALANCE' });
      expect(prisma.backtestTrade.updateMany).not.toHaveBeenCalled();
    });

    it('чужая сессия — 404', async () => {
      const { service, prisma } = makeService();
      prisma.backtestSession.findUnique.mockResolvedValue({ ...SESSION, userId: 'u2' });

      const err = await rejection(service.setLeverage('u1', 's1', 10));

      expect(err).toBeInstanceOf(NotFoundException);
      expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_SESSION_NOT_FOUND' });
    });

    it('завершённая сессия — отказ', async () => {
      const { service, prisma } = makeService();
      prisma.backtestSession.findUnique.mockResolvedValue({ ...SESSION, status: 'finished' });

      const err = await rejection(service.setLeverage('u1', 's1', 10));

      expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_SESSION_FINISHED' });
    });
  });
```

- [ ] **Шаг 2: Прогнать, убедиться, что падает**

Run: `cd backend && npx jest backtest.service.spec.ts -t "плечо сессии"`
Expected: FAIL — `service.setLeverage is not a function`.

- [ ] **Шаг 3: DTO**

В `backend/src/backtest/dto/backtest.dto.ts`, после `export class AddToTradeDto` (строка 82):

```ts
export class SetLeverageDto {
  @IsNumber()
  @Min(1)
  @Max(100)
  leverage: number;
}
```

- [ ] **Шаг 4: Метод сервиса**

В `backend/src/backtest/backtest.service.ts`, после `addToTrade` (после строки 307):

```ts
  async setLeverage(userId: string, sessionId: string, leverage: number) {
    const s = await this.ownedSession(userId, sessionId);
    if (s.status !== 'active') throw sessionFinished();

    return this.prisma.$transaction(async (tx) => {
      // cursorTime — свежим чтением внутри транзакции, а не из `s` выше: у modifyTrade
      // для той же цели (bumpCursor как замок, без содержательного нового момента) есть
      // готовое значение под рукой через ownedTrade (trade.session.cursorTime), но
      // ownedSession отдаёт только то, что уже проверено выше (status) — своё чтение
      // надёжнее, чем полагаться на непроверенный состав остальных полей.
      const fresh = await tx.backtestSession.findUnique({ where: { id: sessionId }, select: { balance: true, cursorTime: true } });
      const bumped = await this.bumpCursor(tx, sessionId, fresh!.cursorTime);
      if (bumped === 0) throw sessionFinished();
      const open = await tx.backtestTrade.findMany({ where: { sessionId, exitTime: null } });
      for (const trade of open) {
        const margin = (trade.qty * trade.entryPrice) / leverage;
        if (margin > fresh!.balance) {
          throw new BadRequestException({ message: 'Маржа больше депозита', code: 'BACKTEST_MARGIN_EXCEEDS_BALANCE' });
        }
      }
      await tx.backtestTrade.updateMany({ where: { sessionId, exitTime: null }, data: { leverage } });
      const trades = await tx.backtestTrade.findMany({ where: { sessionId, exitTime: null }, include: TAGS });
      return { trades: trades.map(tradeView) };
    });
  }
```

(Использует те же приватные `ownedSession`/`bumpCursor`/`sessionFinished`/`tradeView`/`TAGS`, что и соседние методы файла — новых импортов не требует.)

- [ ] **Шаг 5: Эндпоинт**

В `backend/src/backtest/backtest.controller.ts`, импорт `SetLeverageDto` добавить в список
из `./dto/backtest.dto` (строка 5-14), метод — после `add` (после строки 60):

```ts
  @Patch('sessions/:id/leverage')
  setLeverage(@CurrentUser('userId') userId: string, @Param('id') id: string, @Body() dto: SetLeverageDto) {
    return this.backtest.setLeverage(userId, id, dto.leverage);
  }
```

- [ ] **Шаг 6: Комментарий схемы**

В `backend/prisma/schema.prisma:302-305`, заменить комментарий над `leverage`:

```prisma
  /// Плечо, с которым сделка открыта; 1–100. Общее на сессию — меняется в любой момент
  /// через BacktestService.setLeverage и применяется сразу ко всем открытым сделкам
  /// (как на бирже: плечо задаётся на символ, не на отдельную позицию). @default(1) —
  /// только чтобы существующие строки могли мигрировать без ошибки NOT NULL; новые
  /// сделки всегда получают явное значение из DTO.
  leverage   Float           @default(1)
```

Миграция не нужна — тип и default поля не меняются, меняется только doc-комментарий.

- [ ] **Шаг 7: Прогнать тесты файла**

Run: `cd backend && npx jest backtest.service.spec.ts`
Expected: PASS, все тесты.

- [ ] **Шаг 8: Фронтовый хук**

В `frontend/src/views/backtest/api/hooks.ts`, после `useAddToTrade` (после строки 102):

```ts
export const useSetLeverage = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (leverage: number) =>
      apiJson<{ trades: BacktestTrade[] }>(`/api/backtest/sessions/${id}/leverage`, json('PATCH', { leverage })),
    onSettled: () => refresh(qc, id),
  });
};
```

- [ ] **Шаг 9: Типы фронта не отстают**

Run: `cd frontend && npx tsc --noEmit`
Expected: без ошибок (хук пока нигде не используется — это нормально, подключается в Задаче 4).

- [ ] **Шаг 10: Коммит**

```bash
git add backend/src/backtest backend/prisma/schema.prisma frontend/src/views/backtest/api/hooks.ts
git commit -m "feat(backtest): живое плечо сессии — меняет все открытые сделки разом

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Задача 3: Движок прокрутки на массив открытых позиций

`checkMinute`/`findExit` в `fills.ts` уже чистые функции на одну позицию за вызов — не
трогаем. Меняются только их вызывающие: `advance.ts` (0–2 позиции за проход) и
`useReplay.ts` (собирает позиции из всех открытых сделок, зовёт `onExit` на каждый исход).

**Файлы:**
- Modify: `frontend/src/views/backtest/lib/fills.ts` (интерфейс `CloseOrder`, 1 поле)
- Modify: `frontend/src/views/backtest/lib/advance.ts`
- Modify: `frontend/src/views/backtest/model/useReplay.ts`
- Test: `frontend/src/views/backtest/lib/advance.test.ts`

**Interfaces:**
- Consumes: `findExit(position: Position, minutes: Candle[], from: number, to: number, closeOrders: CloseOrder[]): Exit | null` (из `fills.ts`, без изменений).
- Produces: `advanceTo(p: { from; target; minutes; loadedUntil; positions: OpenPosition[]; closeOrders?: (CloseOrder)[] }): { reach: number; complete: boolean; exits: PositionExit[] }` — на это опирается Задача 4 косвенно (через `useReplay`, публичный `Replay`-интерфейс которого не меняется).

- [ ] **Шаг 1: Написать падающие тесты**

Полностью заменить `frontend/src/views/backtest/lib/advance.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { advanceTo } from './advance';
import { MINUTE } from './candles';

const at = (n: number) => Date.UTC(2024, 2, 5, 12, 0) + n * MINUTE;

const mins = (from: number, n: number, price = 100) =>
  Array.from({ length: n }, (_, i) => ({ t: from + i * MINUTE, o: price, h: price + 1, l: price - 1, c: price }));

describe('advanceTo', () => {
  it('доходит до target, когда минутки загружены дальше', () => {
    const r = advanceTo({ from: at(0), target: at(5), minutes: mins(at(0), 10), loadedUntil: at(10), positions: [] });
    expect(r).toEqual({ reach: at(5), complete: true, exits: [] });
  });

  it('останавливается на загруженном крае, если он раньше target', () => {
    const r = advanceTo({ from: at(0), target: at(5), minutes: mins(at(0), 3), loadedUntil: at(3), positions: [] });
    expect(r).toEqual({ reach: at(3), complete: false, exits: [] });
  });

  it('без прогресса (from === target) — срабатывание не проверяется', () => {
    const r = advanceTo({
      from: at(5),
      target: at(5),
      minutes: mins(at(0), 10),
      loadedUntil: at(10),
      positions: [{ tradeId: 'a', direction: 'long', stopLoss: 90, takeProfit: null, entryTime: at(0) }],
    });
    expect(r.exits).toEqual([]);
  });

  it('стоп сработал внутри окна — exit возвращается с id сделки', () => {
    const minutes = mins(at(0), 5, 100);
    minutes[2] = { ...minutes[2], l: 89 };
    const r = advanceTo({
      from: at(0),
      target: at(5),
      minutes,
      loadedUntil: at(5),
      positions: [{ tradeId: 'a', direction: 'long', stopLoss: 90, takeProfit: null, entryTime: at(0) }],
    });
    expect(r.exits).toEqual([{ reason: 'stop', price: 90, time: at(3), tradeId: 'a' }]);
  });

  it('позиций нет — срабатывания не бывает, даже если цена его коснулась', () => {
    const minutes = mins(at(0), 5, 100);
    minutes[2] = { ...minutes[2], l: 1 };
    const r = advanceTo({ from: at(0), target: at(5), minutes, loadedUntil: at(5), positions: [] });
    expect(r.exits).toEqual([]);
  });

  it('две открытые позиции — обе проверяются в одном проходе', () => {
    const minutes = mins(at(0), 5, 100);
    minutes[2] = { ...minutes[2], l: 89, h: 111 }; // и стоп лонга, и стоп шорта в одной минутке
    const r = advanceTo({
      from: at(0),
      target: at(5),
      minutes,
      loadedUntil: at(5),
      positions: [
        { tradeId: 'long1', direction: 'long', stopLoss: 90, takeProfit: null, entryTime: at(0) },
        { tradeId: 'short1', direction: 'short', stopLoss: 110, takeProfit: null, entryTime: at(0) },
      ],
    });
    expect(r.exits).toEqual([
      { reason: 'stop', price: 90, time: at(3), tradeId: 'long1' },
      { reason: 'stop', price: 110, time: at(3), tradeId: 'short1' },
    ]);
  });

  it('срабатывает только одна из двух позиций', () => {
    const minutes = mins(at(0), 5, 100);
    minutes[2] = { ...minutes[2], l: 89 };
    const r = advanceTo({
      from: at(0),
      target: at(5),
      minutes,
      loadedUntil: at(5),
      positions: [
        { tradeId: 'long1', direction: 'long', stopLoss: 90, takeProfit: null, entryTime: at(0) },
        { tradeId: 'short1', direction: 'short', stopLoss: 200, takeProfit: null, entryTime: at(0) },
      ],
    });
    expect(r.exits).toEqual([{ reason: 'stop', price: 90, time: at(3), tradeId: 'long1' }]);
  });

  it('лимит-ордер на закрытие фильтруется по своей сделке', () => {
    const minutes = mins(at(0), 3, 100);
    const r = advanceTo({
      from: at(0),
      target: at(3),
      minutes,
      loadedUntil: at(3),
      positions: [{ tradeId: 'long1', direction: 'long', stopLoss: 50, takeProfit: null, entryTime: at(0) }],
      // Ордер на другую сделку не должен сработать здесь, даже если цена его задела.
      closeOrders: [{ id: 'o1', price: 100, qty: 5, tradeId: 'other-trade' }],
    });
    expect(r.exits).toEqual([]);
  });
});
```

- [ ] **Шаг 2: Прогнать, убедиться, что падает**

Run: `cd frontend && npx vitest run src/views/backtest/lib/advance.test.ts`
Expected: FAIL — `advanceTo` всё ещё ждёт `position`, не `positions`.

- [ ] **Шаг 3: `CloseOrder` получает `tradeId`**

В `frontend/src/views/backtest/lib/fills.ts`, интерфейс `CloseOrder` (строки 21-25):

```ts
export interface CloseOrder {
  id: string;
  price: number;
  qty: number;
  tradeId: string;
}
```

(`checkMinute`/`findExit` читают только `price`/`qty`/`id` — лишнее поле их не касается, логику файла не меняем.)

- [ ] **Шаг 4: `advance.ts` на массив**

Заменить целиком `frontend/src/views/backtest/lib/advance.ts`:

```ts
import type { Candle } from './candles';
import { findExit, type CloseOrder, type Direction, type Exit } from './fills';

/** Открытая позиция в виде, достаточном для проверки срабатывания. entryTime — в мс. */
export interface OpenPosition {
  tradeId: string;
  direction: Direction;
  stopLoss: number;
  takeProfit: number | null;
  entryTime: number;
}

/** Исход одной позиции — тот же `Exit`, что и раньше, плюс какой сделке он принадлежит. */
export interface PositionExit extends Exit {
  tradeId: string;
}

export interface AdvanceResult {
  /** До какого момента реально дошли — не дальше загруженных минуток. */
  reach: number;
  /** Дошли до target, а не встали раньше из-за нехватки минуток. */
  complete: boolean;
  exits: PositionExit[];
}

/**
 * Продвигает момент сессии от `from` к `target`, попутно проверяя срабатывание
 * стопа/тейка каждой открытой позиции (их 0–2 — хедж, лонг и шорт разом) по настоящим
 * минуткам. Общая часть для «Шага» (target — закрытие свечи ТФ) и минутного тика
 * автопрокрутки (target — from + 1 минута): раздельные реализации однажды разошлись бы
 * в проверке срабатывания, и молча.
 */
export function advanceTo(p: {
  from: number;
  target: number;
  minutes: Candle[];
  loadedUntil: number | null;
  positions: OpenPosition[];
  /** Необязательное — без висящих лимит-ордеров ведёт себя как раньше. */
  closeOrders?: CloseOrder[];
}): AdvanceResult {
  const reach = Math.min(p.target, p.loadedUntil ?? p.from);
  const complete = reach >= p.target;
  const exits: PositionExit[] = [];
  if (reach > p.from) {
    for (const position of p.positions) {
      const orders = (p.closeOrders ?? []).filter((o) => o.tradeId === position.tradeId);
      const exit = findExit(position, p.minutes, Math.max(position.entryTime, p.from), reach, orders);
      if (exit) exits.push({ ...exit, tradeId: position.tradeId });
    }
  }
  return { reach, complete, exits };
}
```

- [ ] **Шаг 5: Прогнать тесты снова**

Run: `cd frontend && npx vitest run src/views/backtest/lib/advance.test.ts`
Expected: PASS, все 8.

- [ ] **Шаг 6: `useReplay.ts` — массив открытых сделок**

В `frontend/src/views/backtest/model/useReplay.ts`:

Импорт (строка 6) — добавить тип:

```ts
import type { OpenPosition } from '../lib/advance';
import { advanceTo } from '../lib/advance';
```

Строки 101-102, было:

```ts
  const openRef = useRef<BacktestTrade | null>(null);
  openRef.current = detail.trades.find((x) => x.exitTime == null) ?? null;
```

→

```ts
  const openTradesRef = useRef<BacktestTrade[]>([]);
  openTradesRef.current = detail.trades.filter((x) => x.exitTime == null);
```

Строки 213-237 (тело `advance`, чтение позиции и обработка исхода), было:

```ts
        const open = openRef.current;
        const position =
          open && !closing.current.has(open.id)
            ? { direction: open.direction, stopLoss: open.stopLoss, takeProfit: open.takeProfit, entryTime: Date.parse(open.entryTime) }
            : null;
        const { reach, complete, exit } = advanceTo({
          from,
          target,
          minutes: minutesRef.current,
          loadedUntil: loadedUntil(minutesRef.current),
          position,
          closeOrders: closeOrdersRef.current.map((o): CloseOrder => ({ id: o.id, price: o.price, qty: o.qty })),
        });
        if (reach > from) {
          if (exit && open) {
            closing.current.add(open.id);
            // Сработал уровень — автопрокрутка встаёт, чтобы исход не проскочил мимо глаз.
            setSpeed(null);
            onExitRef.current(open, exit);
          }
          cursorRef.current = reach;
          setCursor(reach);
          onLanded?.(from, reach);
        }
```

→

```ts
        const openTrades = openTradesRef.current.filter((t) => !closing.current.has(t.id));
        const positions: OpenPosition[] = openTrades.map((t) => ({
          tradeId: t.id,
          direction: t.direction,
          stopLoss: t.stopLoss,
          takeProfit: t.takeProfit,
          entryTime: Date.parse(t.entryTime),
        }));
        const { reach, complete, exits } = advanceTo({
          from,
          target,
          minutes: minutesRef.current,
          loadedUntil: loadedUntil(minutesRef.current),
          positions,
          closeOrders: closeOrdersRef.current.map((o): CloseOrder => ({ id: o.id, price: o.price, qty: o.qty, tradeId: o.tradeId })),
        });
        if (reach > from) {
          if (exits.length > 0) {
            // Сработал хоть один уровень — автопрокрутка встаёт, чтобы исход не проскочил мимо глаз.
            setSpeed(null);
            for (const exit of exits) {
              const trade = openTrades.find((t) => t.id === exit.tradeId);
              if (!trade) continue;
              closing.current.add(trade.id);
              onExitRef.current(trade, exit);
            }
          }
          cursorRef.current = reach;
          setCursor(reach);
          onLanded?.(from, reach);
        }
```

(`onExitRef.current` по-прежнему типизирован как `(trade: BacktestTrade, exit: Exit) => void` — `PositionExit` структурно подходит, лишнее поле `tradeId` просто не используется вызывающим, `trade` и так передаётся отдельно.)

- [ ] **Шаг 7: Типы всего фронта**

Run: `cd frontend && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Шаг 8: Прогнать весь набор тестов бектеста**

Run: `cd frontend && npx vitest run src/views/backtest`
Expected: PASS, все файлы (`advance`, `candles`, `fills`, `money`, `motion`).

- [ ] **Шаг 9: Коммит**

```bash
git add frontend/src/views/backtest/lib/fills.ts frontend/src/views/backtest/lib/advance.ts frontend/src/views/backtest/lib/advance.test.ts frontend/src/views/backtest/model/useReplay.ts
git commit -m "feat(backtest): движок прокрутки проверяет массив открытых позиций

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Задача 4: Терминал — хедж и живое плечо в UI

`ReplayChart`, `SessionScreen`, `OrderPanel` и `OpenPositionsPanel` меняются одним
коммитом: `SessionScreen` — общий узел, через который остальные три получают пропы, и
промежуточное состояние (например, `OrderPanel` без пропа `sameDirectionOpen`, пока
`SessionScreen` всё ещё его передаёт) просто не скомпилируется. Это не нарушение
«частых коммитов» — это реальная форма связности кода, а не искусственное укрупнение.

**Файлы:**
- Modify: `frontend/src/views/backtest/components/ReplayChart.tsx`
- Modify: `frontend/src/views/backtest/components/SessionScreen.tsx`
- Modify: `frontend/src/views/backtest/components/OrderPanel.tsx`
- Modify: `frontend/src/views/backtest/components/OpenPositionsPanel.tsx`
- Modify: `frontend/src/shared/i18n/messages/ru.json`, `frontend/src/shared/i18n/messages/en.json`

**Interfaces:**
- Consumes: `useSetLeverage` (Задача 2), `OpenPosition`/`advanceTo` не напрямую (через `useReplay`, Задача 3), `liquidationPrice`/`previewSize`/`impliedDirection`/`applyStopChange`/`checkLevels` из `lib/money.ts` (без изменений).
- Produces: `OpenPositionsPanel({ trades: BacktestTrade[], scale, price, cursor, closeOrders, onLimit: (t) => void, onMarket: (t) => void, onCancelOrder: (id) => void, onChangeLevels: (t) => void })`; `OrderPanel({ draft, onDraft, openDirections: Direction[], scale, price, balance, disabled, hint, onOpen, onAdd, onFinish })`; `ReplayChart`'s `Level` incl. `tradeId?: string`, `onDragLevel?: (id, kind, price, done, tradeId?) => void` — на это опирается ничего дальше (терминальные компоненты этого дерева), кроме ручной проверки в Задаче 6.

Тестов с TDD-циклом у этих четырёх файлов нет и раньше не было (компоненты рендеринга —
`ReplayChart` своё SVG, остальные проверялись через дев-сервер, не юнит-тестами; см.
`docs/superpowers/specs/2026-09-12-backtest-order-panel-terminal-design.md`). Шаги ниже
идут: правки кода → `tsc` → лёгкая ручная проверка компиляции/рендера → коммит.
Полный сценарный прогон хеджа — в Задаче 6.

- [ ] **Шаг 1: i18n — новые и удалённый ключи**

В `frontend/src/shared/i18n/messages/ru.json`, неймспейс `backtest` (после строки 542
`"liqLabel": "Ликвидация",`):

```json
    "colMark": "Маркировка",
    "colInPosition": "В позиции",
```

Строку 545 (`"hedgeUnsupported": "..."`) — удалить.

Строку 535-эквивалент (`finishOpenTrade`) — поменять текст на множественное число,
т.к. открытых сделок теперь может быть до двух:

```json
    "finishOpenTrade": "Открытые сделки закроются по рынку.",
```

То же самое в `frontend/src/shared/i18n/messages/en.json` — найти аналогичные ключи в
неймспейсе `backtest` (`liqLabel`/`hedgeUnsupported`/`finishOpenTrade`) и внести
симметричные правки на английском (`"colMark": "Mark"`, `"colInPosition": "In position"`,
`hedgeUnsupported` — удалить, `finishOpenTrade` — во множественном числе).

- [ ] **Шаг 2: `ReplayChart.tsx` — уровень привязан к сделке**

`Level` (строки 26-34) — добавить поле:

```ts
export interface Level {
  id: string;
  kind: LevelKind;
  price: number;
  draggable: boolean;
  impact?: number | null;
  /** Чья это сделка — только у уровней открытой позиции (stop/take/entry/liq того трейда). */
  tradeId?: string;
}
```

Строка 85 (проп), было:

```ts
  onDragLevel?: (kind: LevelKind, price: number, done: boolean) => void;
```

→

```ts
  onDragLevel?: (id: string, kind: LevelKind, price: number, done: boolean, tradeId?: string) => void;
```

Строка 94, было:

```ts
  const [drag, setDrag] = useState<LevelKind | null>(null);
```

→

```ts
  const [drag, setDrag] = useState<{ id: string; kind: LevelKind; tradeId?: string } | null>(null);
```

Строка 245 (`startDrag`), было:

```ts
  const startDrag = (kind: LevelKind) => (e: PointerEvent<SVGRectElement>) => {
    e.stopPropagation();
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    frozen.current = { lo, hi };
    dragPointerId.current = e.pointerId;
    setDrag(kind);
  };
```

→

```ts
  const startDrag = (level: Level) => (e: PointerEvent<SVGRectElement>) => {
    e.stopPropagation();
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    frozen.current = { lo, hi };
    dragPointerId.current = e.pointerId;
    setDrag({ id: level.id, kind: level.kind, tradeId: level.tradeId });
  };
```

Строка 282-286 (`onMove`), было:

```ts
    if (drag && onDragLevel && e.pointerId === dragPointerId.current) {
      const p = priceAt(svgY(e.clientY));
      lastDrag.current = p;
      onDragLevel(drag, p, false);
      return;
    }
```

→

```ts
    if (drag && onDragLevel && e.pointerId === dragPointerId.current) {
      const p = priceAt(svgY(e.clientY));
      lastDrag.current = p;
      onDragLevel(drag.id, drag.kind, p, false, drag.tradeId);
      return;
    }
```

Строка 322-323 (`endDrag`), было:

```ts
    if (drag && e.pointerId === dragPointerId.current) {
      if (onDragLevel && lastDrag.current != null) onDragLevel(drag, lastDrag.current, true);
```

→

```ts
    if (drag && e.pointerId === dragPointerId.current) {
      if (onDragLevel && lastDrag.current != null) onDragLevel(drag.id, drag.kind, lastDrag.current, true, drag.tradeId);
```

Строка 421 (JSX), было:

```tsx
                onPointerDown={startDrag(l.kind)}
```

→

```tsx
                onPointerDown={startDrag(l)}
```

- [ ] **Шаг 3: `OpenPositionsPanel.tsx` — до двух строк, новые колонки**

Заменить целиком `frontend/src/views/backtest/components/OpenPositionsPanel.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useLocaleControl } from '@/shared/i18n';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { durationUnitLabels, formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import type { BacktestCloseOrder, BacktestTrade } from '../api/types';
import { liquidationPrice, toScreen, unrealizedPnl } from '../lib/money';

interface Row {
  trade: BacktestTrade;
  remaining: number;
}

/** Время в позиции — по симулированному моменту сессии (`cursor`), не по настоящим часам.
 * Тот же приём отказа, что у `fmtAge` в `views/overview/components/OpenPositions.tsx`:
 * «—» на некорректном значении, а не молчаливое зажатие в 0 — вход позже курсора
 * сигнализирует баг в другом месте, и прятать его не нужно. */
function fmtSimAge(entryTime: string, cursor: number, units: { d: string; h: string; m: string }): string {
  const min = Math.floor((cursor - Date.parse(entryTime)) / 60_000);
  if (!Number.isFinite(min) || min < 0) return '—';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  if (d > 0) return `${d} ${units.d} ${h} ${units.h}`;
  return h > 0 ? `${h} ${units.h} ${String(min % 60).padStart(2, '0')} ${units.m}` : `${min} ${units.m}`;
}

/**
 * Открытые позиции сессии — до двух, лонг и шорт разом (хедж). Кнопки закрытия/добора
 * живут здесь, а не в `OrderPanel`: панель ордера никогда не смотрит на то, что уже
 * открыто, а эта таблица — как раз про то, что уже открыто. Колонки — по образцу
 * `views/overview/components/OpenPositions.tsx`, кроме того, чему в бектесте физически
 * неоткуда взяться (символ сессии один, «Диапазон входа» и теги на открытой сделке —
 * см. спеку).
 */
export function OpenPositionsPanel({
  trades,
  scale,
  price,
  cursor,
  closeOrders,
  onLimit,
  onMarket,
  onCancelOrder,
  onChangeLevels,
}: {
  trades: BacktestTrade[];
  scale: number;
  /** Настоящая цена последней показанной минутки. */
  price: number | null;
  /** Момент симуляции — для «В позиции». */
  cursor: number;
  closeOrders: BacktestCloseOrder[];
  onLimit: (trade: BacktestTrade) => void;
  onMarket: (trade: BacktestTrade) => void;
  onCancelOrder: (orderId: string) => void;
  onChangeLevels: (trade: BacktestTrade) => void;
}) {
  const t = useTranslations('backtest');
  const { locale } = useLocaleControl();
  const units = durationUnitLabels(locale);

  if (trades.length === 0) {
    return <EmptyState title={t('noOpenPosition')}>{t('noOpenPositionHint')}</EmptyState>;
  }

  const rows: Row[] = trades.map((trade) => ({ trade, remaining: trade.qty - trade.closedQty }));

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
      key: 'mark',
      header: t('colMark'),
      align: 'right',
      cellClassName: 'n',
      render: () => (price != null ? formatPriceGrouped(toScreen(price, scale)) : '—'),
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
      key: 'liq',
      header: t('liqLabel'),
      align: 'right',
      cellClassName: 'n neg',
      render: (r) => formatPriceGrouped(toScreen(liquidationPrice(r.trade.direction, r.trade.entryPrice, r.trade.leverage), scale)),
    },
    {
      key: 'age',
      header: t('colInPosition'),
      align: 'right',
      cellClassName: 'n',
      render: (r) => <span className="muted">{fmtSimAge(r.trade.entryTime, cursor, units)}</span>,
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
      render: (r) => (
        <span className="row-actions">
          <Button tight onClick={() => onChangeLevels(r.trade)}>
            {t('changeLevels')}
          </Button>
          <Button tight onClick={() => onLimit(r.trade)}>
            {t('limitClose')}
          </Button>
          <Button tight variant="risk" onClick={() => onMarket(r.trade)}>
            {t('marketClose')}
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <LedgerTable columns={columns} rows={rows} rowKey={(r) => r.trade.id} />
      {trades.map((trade) => {
        const orders = closeOrders.filter((o) => o.tradeId === trade.id);
        if (orders.length === 0) return null;
        return (
          <ul className="close-orders" key={trade.id}>
            {orders.map((o) => (
              <li key={o.id}>
                <span>{t('pendingLimitOrder', { qty: formatQty(o.qty), price: formatPriceGrouped(toScreen(o.price, scale)) })}</span>
                <Button tight onClick={() => onCancelOrder(o.id)}>
                  {t('cancelOrder')}
                </Button>
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}
```

- [ ] **Шаг 4: `OrderPanel.tsx` — без пропов о позиции**

Проп-интерфейс (строки 54-83), было:

```ts
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
  price: number | null;
  balance: number;
  disabled: boolean;
  hint: string | null;
  onOpen: (direction: Direction) => void;
  onAdd: (direction: Direction) => void;
  onFinish: () => void;
}) {
```

→

```ts
export function OrderPanel({
  draft,
  onDraft,
  openDirections,
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
  /** Стороны уже открытых сделок (хедж — до двух) — решают только подпись и обработчик
   * кнопок Лонг/Шорт: своя сторона добирает, а не открывает заново. Больше ни на что
   * панель не смотрит. */
  openDirections: Direction[];
  scale: number;
  price: number | null;
  balance: number;
  disabled: boolean;
  hint: string | null;
  onOpen: (direction: Direction) => void;
  onAdd: (direction: Direction) => void;
  onFinish: () => void;
}) {
```

Строки 90-91 (плечо и direction), было:

```ts
  const leverage = clamp(Number(draft.leverage) || MIN_LEVERAGE, MIN_LEVERAGE, MAX_LEVERAGE);
  const effectiveLeverage = openLeverage ?? leverage;
  const screenPrice = price != null ? toScreen(price, scale) : null;
  // Сторона стопа/тейка одна на двоих, и если сделка уже открыта — она решает
  // сама, независимо от того, что набрано в полях (см. impliedDirection).
  const direction = screenPrice != null ? impliedDirection(sameDirectionOpen, stop, take, screenPrice) : null;
```

→

```ts
  const leverage = clamp(Number(draft.leverage) || MIN_LEVERAGE, MIN_LEVERAGE, MAX_LEVERAGE);
  const screenPrice = price != null ? toScreen(price, scale) : null;
  // Панель больше не привязана ни к какой открытой сделке — направление всегда решают
  // только уже набранные стоп/тейк (см. impliedDirection).
  const direction = screenPrice != null ? impliedDirection(null, stop, take, screenPrice) : null;
```

Строки 103-114 (`setStop`/`setStopText`) — заменить `sameDirectionOpen` на `null`:

```ts
  const setStop = (newStopScreen: number) => {
    if (screenPrice == null) return;
    onDraft({ ...draft, ...applyStopChange(draft, newStopScreen, screenPrice, null) });
  };
  const setStopText = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (screenPrice == null) {
      onDraft({ ...draft, stop: raw });
      return;
    }
    const { take: nextTake } = applyStopChange(draft, Number(raw), screenPrice, null);
    onDraft({ ...draft, stop: raw, take: nextTake });
  };
```

Строки 117-120 (`preview`) — `effectiveLeverage` → `leverage`:

```ts
  const preview =
    price != null && stop > 0
      ? previewSize(balance, risk, price, fromScreen(stop, scale), leverage, direction ?? 'long')
      : null;
```

Строки 152-164 (`Field` плеча), было:

```tsx
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
```

→

```tsx
      <Field label={<span className="fld-head"><span>{t('leverageLabel')} {leverage.toFixed(0)}×</span></span>}>
        {() => (
          <Slider
            value={leverage}
            min={MIN_LEVERAGE}
            max={MAX_LEVERAGE}
            step={1}
            onChange={(v) => onDraft({ ...draft, leverage: toInput(v) })}
            aria-label={t('leverageLabel')}
          />
        )}
      </Field>
```

Строки 230-246 (кнопки Long/Short и `hedgeUnsupported`), было:

```tsx
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
```

→

```tsx
      <div className="order-actions">
        <Button
          variant="long"
          onClick={() => (openDirections.includes('long') ? onAdd('long') : onOpen('long'))}
          disabled={disabled || balance <= 0}
        >
          {openDirections.includes('long') ? t('addLong') : t('long')}
        </Button>
        <Button
          variant="short"
          onClick={() => (openDirections.includes('short') ? onAdd('short') : onOpen('short'))}
          disabled={disabled || balance <= 0}
        >
          {openDirections.includes('short') ? t('addShort') : t('short')}
        </Button>
      </div>
```

Остальной JSX (риск, стоп, тейк, карточка предпросмотра, кнопка «Завершить») —
не меняется.

- [ ] **Шаг 5: `SessionScreen.tsx` — `openTrades`, уровни, модалки по id, живое плечо**

Строка 87, было:

```ts
  const openTrade = trades.find((x) => x.exitTime == null) ?? null;
```

→

```ts
  // useMemo, не голый .filter(): `levels` ниже держит openTrades в зависимостях, а
  // ReplayChart — memo (см. его комментарий) и сверяет уровни по ссылке. .find() у
  // одной сделки был стабилен сам по себе (тот же объект из массива), .filter() каждый
  // раз аллоцирует новый массив — без useMemo levels пересчитывался бы на любой рендер,
  // включая тик слайдера риска, который к открытым сделкам отношения не имеет.
  const openTrades = useMemo(() => trades.filter((x) => x.exitTime == null), [trades]);
```

Импорты (строки 14-24) — добавить `useSetLeverage`, `toInput`:

```ts
import {
  useAddToTrade,
  useBacktestSession,
  useCancelCloseOrder,
  useCloseTrade,
  useCreateCloseOrder,
  useFinishSession,
  useModifyTrade,
  useOpenTrade,
  useSetBacktestTags,
  useSetLeverage,
} from '../api/hooks';
```

и в импорте из `../lib/money` (строки 27-37) — добавить `toInput`:

```ts
import {
  applyStopChange,
  checkLevels,
  fromScreen,
  impliedDirection,
  levelImpact,
  liquidationPrice,
  previewSize,
  toInput,
  toInputPrice,
  toScreen,
} from '../lib/money';
```

Строка 94 (после `tagsM`) — новый хук:

```ts
  const setLeverageM = useSetLeverage(session.id);
```

Строки 108-112 (состояния модалок), было:

```ts
  const [limitModal, setLimitModal] = useState(false);
  const [marketModal, setMarketModal] = useState(false);
  const [levelsModal, setLevelsModal] = useState(false);
```

→

```ts
  const [limitModalFor, setLimitModalFor] = useState<string | null>(null);
  const [marketModalFor, setMarketModalFor] = useState<string | null>(null);
  const [levelsModalFor, setLevelsModalFor] = useState<string | null>(null);
```

Строки 137-143 (`impactQty`/`impactRef`), было:

```ts
  const impactQty = openTrade
    ? openTrade.qty
    : stopN > 0 && replay.price != null
      ? previewSize(session.balance, Number(draft.risk), replay.price, fromScreen(stopN, scale), Number(draft.leverage) || 1, direction ?? 'long')
          ?.qty ?? null
      : null;
  const impactRef = openTrade ? openTrade.entryPrice : replay.price;
```

→

```ts
  // Черновик описывает только следующий ордер — открытых сделок это больше не
  // касается, их уровни строятся из них самих ниже.
  const impactQty =
    stopN > 0 && replay.price != null
      ? previewSize(session.balance, Number(draft.risk), replay.price, fromScreen(stopN, scale), Number(draft.leverage) || 1, direction ?? 'long')
          ?.qty ?? null
      : null;
  const impactRef = replay.price;
```

Строка 125 (`direction`), было:

```ts
  const direction = screenPrice != null ? impliedDirection(openTrade?.direction ?? null, stopN, takeN, screenPrice) : null;
```

→

```ts
  const direction = screenPrice != null ? impliedDirection(null, stopN, takeN, screenPrice) : null;
```

Строки 150-170 (`levels`), было (см. текущий файл) — заменить целиком на:

```ts
  const levels = useMemo<Level[]>(() => {
    const list: Level[] = [];

    // Уровни уже открытых сделок — от их собственных stopLoss/takeProfit, не от
    // черновика панели: с хеджем сделок может быть две, у каждой свои уровни.
    for (const trade of openTrades) {
      const remaining = trade.qty - trade.closedQty;
      list.push({ id: `entry-${trade.id}`, kind: 'entry', tradeId: trade.id, price: toScreen(trade.entryPrice, scale), draggable: false });
      list.push({
        id: `liq-${trade.id}`,
        kind: 'liq',
        tradeId: trade.id,
        price: toScreen(liquidationPrice(trade.direction, trade.entryPrice, trade.leverage), scale),
        draggable: false,
      });
      list.push({
        id: `stop-${trade.id}`,
        kind: 'stop',
        tradeId: trade.id,
        price: toScreen(trade.stopLoss, scale),
        draggable: true,
        impact: levelImpact(trade.direction, trade.entryPrice, trade.stopLoss, remaining).usdt,
      });
      if (trade.takeProfit != null) {
        list.push({
          id: `take-${trade.id}`,
          kind: 'take',
          tradeId: trade.id,
          price: toScreen(trade.takeProfit, scale),
          draggable: true,
          impact: levelImpact(trade.direction, trade.entryPrice, trade.takeProfit, remaining).usdt,
        });
      }
    }

    // Черновик следующего ордера — не привязан ни к какой сделке.
    if (stopN > 0) {
      list.push({
        id: 'draft-stop',
        kind: 'stop',
        price: stopN,
        draggable: true,
        impact:
          direction != null && impactQty != null && impactRef != null
            ? levelImpact(direction, impactRef, fromScreen(stopN, scale), impactQty).usdt
            : null,
      });
    }
    if (takeN != null && takeN > 0) {
      list.push({
        id: 'draft-take',
        kind: 'take',
        price: takeN,
        draggable: true,
        impact:
          direction != null && impactQty != null && impactRef != null
            ? levelImpact(direction, impactRef, fromScreen(takeN, scale), impactQty).usdt
            : null,
      });
    }

    for (const o of detail.closeOrders) {
      const trade = openTrades.find((t) => t.id === o.tradeId);
      if (!trade) continue;
      list.push({
        id: o.id,
        kind: 'limitClose',
        tradeId: o.tradeId,
        price: toScreen(o.price, scale),
        draggable: false,
        impact: levelImpact(trade.direction, trade.entryPrice, o.price, o.qty).usdt,
      });
    }
    return list;
  }, [openTrades, scale, stopN, takeN, direction, impactQty, impactRef, detail.closeOrders]);
```

Строки 188-191 (`busy`/`closePending`/`canClose`), было:

```ts
  const busy = openM.isPending || modifyM.isPending || closeM.isPending || finishM.isPending;
  const closePending = closeM.isPending || closeM.isError;
  const canClose = openTrade != null && replay.cursor > Date.parse(openTrade.entryTime);
```

→

```ts
  const busy = openM.isPending || modifyM.isPending || closeM.isPending || finishM.isPending;
  const closePending = closeM.isPending || closeM.isError;
  const canClose = (trade: BacktestTrade) => replay.cursor > Date.parse(trade.entryTime);
```

Строки 220-228 (`addToPosition`), было:

```ts
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

→

```ts
  const addToPosition = (direction: Direction) => {
    if (replay.price == null) return;
    const trade = openTrades.find((x) => x.direction === direction);
    if (!trade) return;
    const risk = Number(draft.risk);
    if (!(risk >= 0.01 && risk <= 100)) {
      setHint(t('riskInvalid'));
      return;
    }
    addM.mutate({ tradeId: trade.id, entryPrice: replay.price, riskPct: risk });
  };
```

Строки 230-239 (`applyLevels`), было:

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

→

```ts
  const applyLevels = (trade: BacktestTrade, stop: number, take: number | null) => {
    if (screenPrice == null) return;
    const err = checkLevels(trade.direction, screenPrice, stop, take);
    setHint(err ? t(err) : null);
    if (err) return;
    modifyM.mutate(
      { tradeId: trade.id, stopLoss: fromScreen(stop, scale), takeProfit: take != null ? fromScreen(take, scale) : null },
      { onSuccess: () => setLevelsModalFor(null) },
    );
  };
```

Строки 241-263 (`applyLevelsRef`, `dragCtxRef`, `onDragLevel`) — удалить `applyLevelsRef` целиком, заменить остальное:

```ts
  const dragCtxRef = useRef({ draft, openTrades, screenPrice });
  dragCtxRef.current = { draft, openTrades, screenPrice };

  const onDragLevel = useCallback((id: string, kind: LevelKind, price: number, done: boolean, tradeId?: string) => {
    if (kind === 'entry' || kind === 'liq') return;
    const { draft: d, openTrades: ots, screenPrice: sp } = dragCtxRef.current;
    if (tradeId != null) {
      // Уровень уже открытой сделки — направление зафиксировано, зеркалить нечего;
      // сохраняем на сервер только по отпусканию.
      if (!done || sp == null) return;
      const trade = ots.find((t) => t.id === tradeId);
      if (!trade) return;
      const nextStop = kind === 'stop' ? price : toScreen(trade.stopLoss, scale);
      const nextTake = kind === 'take' ? price : trade.takeProfit != null ? toScreen(trade.takeProfit, scale) : null;
      applyLevels(trade, nextStop, nextTake);
      return;
    }
    // Черновик следующего ордера — направление ещё не зафиксировано, стоп может
    // поменять сторону и утянуть за собой уже введённый тейк (applyStopChange).
    if (sp == null) return;
    const next = kind === 'stop' ? applyStopChange(d, price, sp, null) : { stop: d.stop, take: toInputPrice(price) };
    setDraft((prev) => ({ ...prev, ...next }));
  }, [scale]);
```

(`applyLevels` замыкает `screenPrice`/`t`/`modifyM` текущего рендера — читается не
напрямую, а даёт `onDragLevel` минимум зависимостей для стабильной ссылки, как и раньше
в комментарии у `dragCtxRef`; здесь это уже не нужно объяснять отдельно — `applyLevels`
вызывается только из ветки `done`, где актуальность замыкания не так критична, как была
у покадрового вызова.)

Строка 296 (`finishNow`, тело) — цикл вместо одной сделки:

```ts
  const finishNow = async () => {
    if (finishing.current) return;
    finishing.current = true;
    replay.setSpeed(null);
    try {
      if (replay.price != null) {
        for (const trade of openTrades) {
          if (canClose(trade)) await closeTrade(trade, replay.cursor, replay.price, 'finish');
        }
      }
      await replay.flush();
      await finishM.mutateAsync();
    } catch {
      finishing.current = false;
    }
  };
```

Строка 303 (`askFinish`, consequences) — `openTrade` → `openTrades.length > 0`:

```ts
  const askFinish = () =>
    setConfirm({
      title: t('finishTitle'),
      subtitle: t('finishSubtitle'),
      consequences: [...(openTrades.length > 0 ? [t('finishOpenTrade')] : []), t('finishReveal')],
      word: t('finishWord'),
      onConfirm: () => void finishNow(),
    });
```

Новый эффект — плечо открытых сделок держит черновик синхронным (после блока `useEffect`
с `finishRef`, перед `askFinish`):

```ts
  // Плечо общее на все открытые сделки — держим черновик синхронным с сервером, пока
  // хоть одна открыта: свой слайдер стал бы источником рассинхрона. Не тот же приём,
  // что у стопа/тейка (те специально НЕ синкаются — черновик там всегда про следующий
  // ордер): плечо, в отличие от них, — общее состояние символа, а не намерение на будущее.
  const openLeverageValue = openTrades[0]?.leverage ?? null;
  useEffect(() => {
    if (openLeverageValue == null) return;
    setDraft((prev) => (Number(prev.leverage) === openLeverageValue ? prev : { ...prev, leverage: toInput(openLeverageValue) }));
  }, [openLeverageValue]);

  // Коммит плеча — по паузе после последнего движения слайдера, не на каждый кадр
  // (Slider шлёт onChange через requestAnimationFrame). Тем же приёмом, что автосохранение
  // курсора в useReplay (SAVE_DELAY_MS). Сравнение с openLeverageValue — не оптимизация,
  // а разрыв цикла с эффектом синхронизации выше: тот при открытии новой сделки меняет
  // draft.leverage под сервер, и без проверки это тут же гнало бы то же значение обратно.
  useEffect(() => {
    if (openTrades.length === 0) return;
    const v = Number(draft.leverage);
    if (!(v >= 1) || v === openLeverageValue) return;
    const h = setTimeout(() => setLeverageM.mutate(v), 600);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.leverage, openTrades.length, openLeverageValue]);
```

Строка 369-382 (рендер `OrderPanel`), было:

```tsx
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
```

→

```tsx
          <OrderPanel
            draft={draft}
            onDraft={setDraft}
            openDirections={openTrades.map((x) => x.direction)}
            scale={scale}
            price={replay.price}
            balance={session.balance}
            disabled={busy || closePending || !replay.ready}
            hint={hint}
            onOpen={open}
            onAdd={addToPosition}
            onFinish={askFinish}
          />
          <ErrorNote error={openM.error ?? addM.error ?? finishM.error ?? setLeverageM.error} fallback={t('actionFailed')} />
```

Строки 407-417 (рендер `OpenPositionsPanel`), было:

```tsx
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
```

→

```tsx
        <OpenPositionsPanel
          trades={openTrades}
          scale={scale}
          price={replay.price}
          cursor={replay.cursor}
          closeOrders={detail.closeOrders}
          onLimit={(trade) => setLimitModalFor(trade.id)}
          onMarket={(trade) => setMarketModalFor(trade.id)}
          onCancelOrder={(id) => cancelOrderM.mutate(id)}
          onChangeLevels={(trade) => setLevelsModalFor(trade.id)}
        />
```

Строки 428-462 (три модалки), было (все три условия вида `{levelsModal && openTrade && ...}`)
→ заменить на поиск по id:

```tsx
      {levelsModalFor != null && screenPrice != null && (() => {
        const trade = openTrades.find((x) => x.id === levelsModalFor);
        return trade ? (
          <ChangeLevelsModal
            trade={trade}
            scale={scale}
            screenPrice={screenPrice}
            onApply={(stop, take) => applyLevels(trade, stop, take)}
            onClose={() => setLevelsModalFor(null)}
            isPending={modifyM.isPending}
            error={modifyM.error}
          />
        ) : null;
      })()}
      {limitModalFor != null && screenPrice != null && (() => {
        const trade = openTrades.find((x) => x.id === limitModalFor);
        return trade ? (
          <LimitCloseModal
            trade={trade}
            remaining={trade.qty - trade.closedQty}
            scale={scale}
            screenPrice={screenPrice}
            onSubmit={(price, qty) => submitLimit(trade, price, qty)}
            onClose={() => setLimitModalFor(null)}
            isPending={createOrderM.isPending}
            error={createOrderM.error}
          />
        ) : null;
      })()}
      {marketModalFor != null && screenPrice != null && (() => {
        const trade = openTrades.find((x) => x.id === marketModalFor);
        return trade ? (
          <MarketCloseModal
            trade={trade}
            remaining={trade.qty - trade.closedQty}
            screenPrice={screenPrice}
            canClose={canClose(trade)}
            onSubmit={(qty) => submitMarket(trade, qty)}
            onClose={() => setMarketModalFor(null)}
            isPending={closeM.isPending}
            error={closeM.isError ? closeM.error : null}
          />
        ) : null;
      })()}
```

И `submitLimit`/`submitMarket` (строки 265-273), было:

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

→

```ts
  const submitLimit = (trade: BacktestTrade, price: number, qty: number) => {
    createOrderM.mutate({ tradeId: trade.id, price, qty }, { onSuccess: () => setLimitModalFor(null) });
  };

  const submitMarket = (trade: BacktestTrade, qty: number) => {
    if (replay.price == null || !canClose(trade)) return;
    void closeTrade(trade, replay.cursor, replay.price, 'manual', qty).then(() => setMarketModalFor(null)).catch(() => undefined);
  };
```

Блок `{closeM.isError && closeM.variables && (...)}` (строки 387-394) — без изменений.

- [ ] **Шаг 6: Типы всего фронта**

Run: `cd frontend && npx tsc --noEmit`
Expected: без ошибок. Если есть — почти наверняка пропущенное место, ссылавшееся на
удалённые `openTrade`/`sameDirectionOpen`/`openLeverage`/`applyLevelsRef` — найти
через сообщение компилятора и поправить по аналогии с шагами выше.

- [ ] **Шаг 7: Лёгкая проверка рендера**

Run: `cd frontend && npm run dev` (или использовать уже поднятый дев-сервер), открыть
`/backtest`, начать новую сессию, сделать «Шаг» пару раз, открыть лонг. Убедиться: панель
ордера не блокирует плечо, таблица открытой позиции показывает новую строку с колонками
Маркировка/Ликвидация/В позиции, график рисует уровни входа/ликвидации/стопа. Остановить
дев-сервер, если поднимали отдельно для этой проверки. Полный сценарий с двумя
одновременными позициями — в Задаче 6, после того как готова и история (Задача 5).

- [ ] **Шаг 8: Коммит**

```bash
git add frontend/src/views/backtest/components/ReplayChart.tsx frontend/src/views/backtest/components/SessionScreen.tsx frontend/src/views/backtest/components/OrderPanel.tsx frontend/src/views/backtest/components/OpenPositionsPanel.tsx frontend/src/shared/i18n/messages/ru.json frontend/src/shared/i18n/messages/en.json
git commit -m "feat(backtest): терминал — хедж и живое плечо в UI

Панель ордера больше не завязана на открытую позицию (кроме добора своим
направлением); таблица открытой позиции — до двух строк, колонки по образцу
overview; график рисует уровни каждой открытой сделки отдельно.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Задача 5: История — колонки по образцу «Закрытых сделок»

Не зависит от хеджа: `SessionTrades` читает только массив `trades` целиком (закрытые и
открытая вперемешку), без обращения к состоянию открытой позиции.

**Файлы:**
- Modify: `frontend/src/views/backtest/components/SessionTrades.tsx`
- Modify: `frontend/src/shared/i18n/messages/ru.json`, `frontend/src/shared/i18n/messages/en.json`

**Interfaces:**
- Consumes: `BacktestTrade` (без изменений), `durationUnitLabels`/`useLocaleControl` (уже используются в `OpenPositionsPanel` после Задачи 4 — тот же приём).
- Produces: ничего, чем пользуются другие файлы плана — конечный узел дерева.

- [ ] **Шаг 1: i18n — новый ключ `colClosed`**

В `frontend/src/shared/i18n/messages/ru.json`, неймспейс `backtest`, рядом с `colDir`
(строка 523):

```json
    "colClosed": "Закрыта",
```

В `frontend/src/shared/i18n/messages/en.json`, тот же неймспейс: `"colClosed": "Closed",`.

- [ ] **Шаг 2: Заменить `SessionTrades.tsx` целиком**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { TagPicker, type TagItem } from '@/entities/tag';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { Money } from '@/shared/ui/Money';
import { SectionHead } from '@/shared/ui/SectionHead';
import { durationUnitLabels, formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import { useLocaleControl } from '@/shared/i18n';
import type { BacktestTrade } from '../api/types';
import { formatR, toScreen } from '../lib/money';

/** Сколько сделка держалась — от входа до закрытия, тем же счётом, что и `fmtHold` в
 * `widgets/trades-table/TradesTable.tsx`, но от полей самой сделки бектеста. */
function fmtHold(entryTime: string, exitTime: string, units: { d: string; h: string; m: string }): string {
  const min = Math.floor((Date.parse(exitTime) - Date.parse(entryTime)) / 60_000);
  if (!Number.isFinite(min) || min < 0) return '—';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = String(min % 60).padStart(2, '0');
  if (d > 0) return `${d} ${units.d} ${h} ${units.h} ${m} ${units.m}`;
  return h > 0 ? `${h} ${units.h} ${m} ${units.m}` : `${min} ${units.m}`;
}

/**
 * Сделки сессии, свежие сверху. Колонки — по образцу «Закрытых сделок» обзора
 * (`TradesTable`): закрыто/вход/выход отдельными колонками, размер в USDT, время в
 * позиции. R и «Выход по» остаются — их даёт только бектест, в живой торговле такого нет.
 * Раскрытие строки — выбор тегов (`TagPicker`), не переезжает на ордера/график из
 * `TradesTable`: график сессии и так всегда на экране.
 */
export function SessionTrades({
  trades,
  scale,
  labelFor,
  tags,
  onSetTags,
}: {
  trades: BacktestTrade[];
  /** Масштаб показа; у завершённой сессии — 1, цены раскрыты. */
  scale: number;
  labelFor: (t: number) => string;
  tags: TagItem[];
  onSetTags: (tradeId: string, tagIds: string[]) => void;
}) {
  const t = useTranslations('backtest');
  const { locale } = useLocaleControl();
  const units = durationUnitLabels(locale);
  const price = (p: number) => formatPriceGrouped(toScreen(p, scale));

  const columns: LedgerColumn<BacktestTrade>[] = [
    {
      key: 'closed',
      header: t('colClosed'),
      cellClassName: 'n',
      render: (x) => <span className="muted">{x.exitTime ? labelFor(Date.parse(x.exitTime)) : '—'}</span>,
    },
    { key: 'dir', header: t('colDir'), render: (x) => t(`direction.${x.direction}`) },
    { key: 'entry', header: t('colEntry'), align: 'right', cellClassName: 'n', render: (x) => price(x.entryPrice) },
    {
      key: 'exit',
      header: t('colExit'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => (x.exitPrice != null ? price(x.exitPrice) : '—'),
    },
    {
      key: 'size',
      header: t('colSize'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => (
        <span title={t('qtyTitle', { qty: formatQty(x.qty) })}>{formatPriceGrouped(x.qty * toScreen(x.entryPrice, scale))}</span>
      ),
    },
    {
      key: 'hold',
      header: t('colInPosition'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => <span className="muted">{x.exitTime ? fmtHold(x.entryTime, x.exitTime, units) : '—'}</span>,
    },
    { key: 'reason', header: t('colReason'), render: (x) => t(`reason.${x.exitReason ?? 'open'}`) },
    {
      key: 'r',
      header: t('colR'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => (x.r != null ? <span className={x.r >= 0 ? 'pos' : 'neg'}>{formatR(x.r)}</span> : '—'),
    },
    {
      key: 'pnl',
      header: t('colPnl'),
      align: 'right',
      cellClassName: 'n',
      render: (x) => (x.pnl != null ? <Money value={x.pnl} /> : '—'),
    },
    {
      key: 'tags',
      header: t('colTags'),
      cellClassName: 'cell-tags',
      render: (x) => (x.tags.length ? x.tags.map((g) => g.name).join(', ') : <span className="muted">—</span>),
    },
  ];

  return (
    <section>
      <SectionHead title={t('tradesTitle')} />
      <LedgerTable
        columns={columns}
        rows={[...trades].reverse()}
        rowKey={(x) => x.id}
        empty={t('noTrades')}
        renderExpanded={(x) => {
          const selected = new Set(x.tags.map((g) => g.id));
          return (
            <TagPicker
              tags={tags}
              selected={selected}
              onToggle={(id) => {
                const next = new Set(selected);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                onSetTags(x.id, [...next]);
              }}
            />
          );
        }}
      />
    </section>
  );
}
```

- [ ] **Шаг 3: Типы фронта**

Run: `cd frontend && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Шаг 4: Коммит**

```bash
git add frontend/src/views/backtest/components/SessionTrades.tsx frontend/src/shared/i18n/messages/ru.json frontend/src/shared/i18n/messages/en.json
git commit -m "feat(backtest): история сессии — колонки по образцу «Закрытых сделок»

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Задача 6: Сквозная проверка и сборка

Правка трогает бэкенд, схему и несколько слоёв фронта — по глобальным правилам это
«крупное изменение», полный `next build` и весь бэкенд-набор тестов гоняются перед
финальным коммитом, а не только точечные прогоны предыдущих задач.

**Файлы:** нет новых — только запуск и, если найдутся расхождения, точечные правки в
файлах задач 1-5.

**Interfaces:** нет — терминальная задача плана.

- [ ] **Шаг 1: Полный прогон бэкенд-тестов**

Run: `cd backend && npx jest`
Expected: PASS, весь набор (не только `backtest.service.spec.ts`).

- [ ] **Шаг 2: Полный прогон фронтовых тестов**

Run: `cd frontend && npx vitest run`
Expected: PASS.

- [ ] **Шаг 3: `next build`**

Run: `cd frontend && npx next build`
Expected: сборка проходит без ошибок типов и без ошибок рендера (см. память
`nextjs_src_pages_collision.md` — билд ловит то, что `tsc`/dev-сервер пропускают).

- [ ] **Шаг 4: Сценарий хеджа на дев-сервере**

Запустить `start.bat` (или уже поднятый `docker compose`), открыть `/backtest`, начать
сессию:

1. Открыть лонг. Убедиться: в таблице позиции одна строка (Маркировка/Ликвидация/В
   позиции заполнены), на графике — вход и ликвидация лонга.
2. Не закрывая лонг, открыть шорт. Убедиться: в таблице теперь две строки, на графике —
   два набора уровней (вход/ликвидация каждой стороны), кнопки Long/Short в панели
   ордера обе остались активны всё это время.
3. Нажать Long ещё раз (лонг уже открыт) — убедиться, что это добор (сообщение/кнопка
   говорит «Добрать лонг»), а не попытка открыть третью сделку.
4. Подвинуть слайдер плеча — подождать секунду, обновить (React Query сам подтянет) —
   убедиться, что колонка «Ликвидация» пересчиталась у **обеих** строк.
5. Через кнопки таблицы: изменить уровни одной стороны, поставить лимит-ордер на
   закрытие другой, закрыть одну по рынку — убедиться, что действие применяется к
   правильной строке и не задевает вторую.
6. Перейти на вкладку «История», убедиться, что закрытая сделка попала туда с колонками
   Закрыта/Вход/Выход/Размер/В позиции/Выход по/R/PnL/Теги.
7. Завершить сессию с одной ещё открытой стороной — убедиться, что она закрылась по
   рынку и итог сессии показывает обе сделки.

- [ ] **Шаг 5: Финальный коммит (если шаги 1-4 потребовали правок)**

```bash
git add -A
git commit -m "fix(backtest): правки по итогам сквозной проверки хеджа

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

Если правок не потребовалось — задача закрывается без коммита, все изменения уже
закоммичены в задачах 1–5.
