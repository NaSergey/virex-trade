# История баланса и метрики риска — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Построить ряд баланса пользователя во времени и посчитать на его основе метрики риска каждой сделки, чтобы следующий план мог сверять их с объявленными правилами.

**Architecture:** Снимки баланса — якоря, а не сам ряд: баланс в произвольный момент выводится из цепочки торговых потоков (PnL, комиссии, фандинг) относительно ближайшего якоря. Расхождение якоря с ожиданием по цепочке — это ввод или вывод средств; оно фиксируется и рвёт цепочку, чтобы одно пополнение не искажало ряд назад. Метрики уровня сделки материализуются в таблицу 1:1 к `Trade` по образцу существующего `TradeContext`.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Jest + ts-jest.

Спека: `docs/superpowers/specs/2026-08-27-balance-history-and-rules-design.md`.

Этот план — первый из двух. Он не даёт пользовательской функции: он даёт данные, без которых второй план (декларации правил и экран соблюдения) не запускается.

## Global Constraints

- Prisma-модели пишутся в `backend/prisma/schema.prisma`, применяются `npm run prisma:push`, клиент перегенерируется `npm run prisma:generate`.
- Тесты — Jest, файл `*.spec.ts` рядом с исходником (`rootDir: src`, `testRegex: .*\.spec\.ts$`). Запуск из `backend/`: `npx jest <путь>`.
- Prisma в тестах не поднимается: зависимости подставляются заглушками через `{ ... } as unknown as PrismaService`, как в `credentials.service.spec.ts`.
- Язык комментариев — по соседнему файлу: в `exchanges/` английский, в `trades/` русский. Новый модуль `balance/` — русский, это доменная логика уровня `habits.service.ts`.
- Комментарий объясняет **почему**, а не что. Комментарий, пересказывающий код, в этом проекте считается шумом.
- Числа денег — `Float`, как во всех существующих моделях.
- Границы суток — по `tzOffsetMin`, приходящему с запросом (конвенция `trade-rows.ts`). В этом плане суток нет, но константа не должна быть зашита «на будущее».

---

### Task 1: Разведка адаптеров — что на самом деле возвращают `getBalance` и `closedPnl`

Задача исследовательская: она не пишет продуктового кода, но без её результата две следующие задачи будут написаны на догадках. Спека называет обе ошибки: двойной учёт комиссий и нереализованный PnL в балансе дают один и тот же симптом — выдуманные пополнения в истории пользователя.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-27-balance-history-and-rules-design.md` (добавить раздел «Разведка адаптеров»)
- Read: `backend/src/exchanges/adapters/*.adapter.ts`

**Interfaces:**
- Consumes: ничего.
- Produces: раздел «Разведка адаптеров» в спеке и решение по двум константам — `GAP_TOLERANCE_PCT` и `ANCHOR_REQUIRES_FLAT` (нужно ли пропускать якорь при открытых позициях).

- [ ] **Step 1: Прочитать реализацию `getBalance` во всех семи адаптерах**

Файлы: `bybit`, `okx`, `bitget`, `kucoin`, `gate`, `binance`, `mexc` — `.adapter.ts` в `backend/src/exchanges/adapters/`.

Для каждого записать: какой эндпоинт дёргается, какое поле ответа кладётся в `balance`, какое в `availableToWithdraw`.

- [ ] **Step 2: По документации каждой биржи выяснить, включает ли это поле нереализованный PnL**

Вопрос дословно: если у пользователя открыта позиция в плюсе на $100, вырастет ли возвращаемое число на $100?

- [ ] **Step 3: Выяснить, включает ли `closedPnl` комиссии**

Для Bybit ответ известен — включает. Для остальных проверить по документации поля, которое адаптер кладёт в `ClosedTrade.closedPnl`. Проверить также, не дублирует ли `openFee`/`closeFee` то, что уже вычтено.

- [ ] **Step 4: Записать таблицу в спеку**

Добавить в спеку раздел `## Разведка адаптеров` с таблицей: биржа | поле баланса | включает нереализованный PnL | `closedPnl` включает комиссии | источник (ссылка на документацию).

- [ ] **Step 5: Принять два решения и записать их там же**

- `GAP_TOLERANCE_PCT` — доля баланса, ниже которой расхождение считается округлением, а не вводом средств. Если хотя бы одна биржа отдаёт баланс с нереализованным PnL, допуск не спасает: плавающая прибыль бывает любого размера.
- `ANCHOR_REQUIRES_FLAT` — если биржа отдаёт баланс с нереализованным PnL, якорь снимается только когда открытых позиций нет, а часовой тик пропускается. Записать, для каких бирж это включено.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-08-27-balance-history-and-rules-design.md
git commit -m "docs: разведка адаптеров — что возвращают getBalance и closedPnl"
```

---

### Task 2: Схема — модели баланса, риска и стопа

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Consumes: решения из Task 1.
- Produces: модели `BalanceSnapshot`, `TradeRisk`; поля `OpenPositionSeen.stopLoss`, `Trade.stopLoss`. Модель `Rule` в этом плане не создаётся — она во втором.

- [ ] **Step 1: Добавить `BalanceSnapshot`**

В конец `schema.prisma`:

```prisma
/// Якорь ряда баланса. Снимки не образуют сам ряд — баланс в произвольный
/// момент выводится из цепочки сделок относительно ближайшего якоря. Якоря
/// нужны, чтобы ловить снос вывода и обнаруживать ввод и вывод средств.
model BalanceSnapshot {
  id       String   @id @default(uuid())
  userId   String
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  exchange String
  at       DateTime
  balance  Float
  /// 'snapshot' — спросили биржу, 'derived' — вывели из цепочки PnL.
  source   String
  /// Неторговое изменение баланса: положительное — ввод, отрицательное —
  /// вывод. Null, пока расхождения нет. Цепочка вывода через разрыв не
  /// продолжается, поэтому одно пополнение не искажает весь ряд назад.
  gap      Float?

  @@unique([userId, exchange, at])
  @@index([userId, exchange, at])
  @@map("balance_snapshots")
}
```

- [ ] **Step 2: Добавить `TradeRisk`**

```prisma
/// Метрики риска одной сделки, посчитанные один раз. Материализуется дорогая
/// и стабильная часть — сопоставить сделке баланс на момент входа; сравнение
/// с порогом правила остаётся на чтение, чтобы правило можно было править без
/// пересчёта истории. Образец — TradeContext: та же версия набора полей и то
/// же правило «считаем только тем, у кого ещё нет».
model TradeRisk {
  id             String   @id @default(uuid())
  tradeId        String   @unique
  trade          Trade    @relation(fields: [tradeId], references: [id], onDelete: Cascade)
  balanceAtEntry Float?
  /// 'snapshot' | 'derived' — доезжает до интерфейса: расчётные числа
  /// подписываются как оценка, а не выдаются за факт.
  balanceSource  String?
  exposurePct    Float?
  /// Null у сделки без стопа. Отдельно от ok=false: баланс известен,
  /// exposurePct посчитан, не хватает только стопа.
  plannedRiskPct Float?
  /// false — баланс на тот момент неизвестен. Такая сделка выпадает и из
  /// числителя, и из знаменателя доли соблюдения.
  ok             Boolean  @default(true)
  riskVersion    Int      @default(1)
  computedAt     DateTime @default(now())

  @@map("trade_risks")
}
```

- [ ] **Step 2a: Добавить обратную связь в `Trade`**

В модель `Trade`, рядом с `context TradeContext?`:

```prisma
  risk    TradeRisk?
```

И рядом с `leverage`:

```prisma
  /// Стоп, объявленный на входе: копируется из OpenPositionSeen при закрытии,
  /// ровно как openedAt. Null у сделки, чья позиция открылась при лежащем
  /// сервере, и у тех, кто держит стоп в голове, а не на бирже.
  stopLoss      Float?
```

- [ ] **Step 2b: Добавить связь в `User`**

Рядом с `openPositionsSeen`:

```prisma
  balanceSnapshots   BalanceSnapshot[]
```

- [ ] **Step 3: Добавить `stopLoss` в `OpenPositionSeen`**

Рядом с `entryPrice`:

```prisma
  /// Стоп на первом тике жизни позиции. Снимается там же и тогда же, где
  /// entryPrice: передвинутый позже трал не должен подменять намерение,
  /// объявленное на входе.
  stopLoss      Float?
```

- [ ] **Step 4: Применить схему и перегенерировать клиент**

Из `backend/`:

```bash
npm run prisma:push
npm run prisma:generate
```

Expected: `prisma db push` сообщает о добавленных таблицах `balance_snapshots`, `trade_risks` и колонках `stop_loss`; генерация клиента проходит без ошибок.

- [ ] **Step 5: Проверить, что клиент видит новые модели**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(db): модели BalanceSnapshot и TradeRisk, поле stopLoss"
```

---

### Task 3: Чистая арифметика цепочки баланса

Ядро всей подсистемы и единственное место, где живёт формула. Вынесено в файл без зависимостей, чтобы тестироваться без Prisma, без сети и без времени.

**Files:**
- Create: `backend/src/balance/balance-chain.ts`
- Test: `backend/src/balance/balance-chain.spec.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `interface Flow { at: Date; amount: number }`
  - `interface Anchor { at: Date; balance: number }`
  - `sumFlows(flows: Flow[], from: Date, to: Date): number`
  - `deriveBalanceAt(anchor: Anchor, flows: Flow[], at: Date): number`
  - `detectGap(expected: number, actual: number, tolerance: number): number | null`

- [ ] **Step 1: Написать падающий тест**

Создать `backend/src/balance/balance-chain.spec.ts`:

```ts
import { deriveBalanceAt, detectGap, sumFlows, type Flow } from './balance-chain';

const at = (iso: string) => new Date(iso);

/**
 * Потоки — всё, что двигает баланс торговлей: закрытая прибыль за вычетом
 * комиссий и фандинг. Знак — как он влияет на баланс.
 */
const FLOWS: Flow[] = [
  { at: at('2026-08-01T10:00:00Z'), amount: 100 },
  { at: at('2026-08-01T12:00:00Z'), amount: -40 },
  { at: at('2026-08-01T14:00:00Z'), amount: 25 },
];

describe('sumFlows', () => {
  it('суммирует полуинтервал (from, to]', () => {
    expect(sumFlows(FLOWS, at('2026-08-01T09:00:00Z'), at('2026-08-01T12:00:00Z'))).toBe(60);
  });

  // Поток ровно на левой границе принадлежит предыдущему отрезку. Иначе
  // сделка, закрытая ровно в момент якоря, учтётся и в нём, и после него, и
  // ряд поедет на её размер — а поехавший ряд читается как ввод средств.
  it('не берёт поток, стоящий ровно на левой границе', () => {
    expect(sumFlows(FLOWS, at('2026-08-01T10:00:00Z'), at('2026-08-01T14:00:00Z'))).toBe(-15);
  });

  it('пустой отрезок даёт ноль', () => {
    expect(sumFlows(FLOWS, at('2026-08-01T15:00:00Z'), at('2026-08-01T16:00:00Z'))).toBe(0);
  });
});

describe('deriveBalanceAt', () => {
  const anchor = { at: at('2026-08-01T15:00:00Z'), balance: 1085 };

  it('выводит баланс назад от якоря', () => {
    // До всех трёх потоков: 1085 - (100 - 40 + 25) = 1000
    expect(deriveBalanceAt(anchor, FLOWS, at('2026-08-01T09:00:00Z'))).toBe(1000);
  });

  it('выводит баланс на момент между потоками', () => {
    // После первых двух: 1085 - 25 = 1060
    expect(deriveBalanceAt(anchor, FLOWS, at('2026-08-01T13:00:00Z'))).toBe(1060);
  });

  it('выводит баланс вперёд от якоря', () => {
    const early = { at: at('2026-08-01T09:00:00Z'), balance: 1000 };
    expect(deriveBalanceAt(early, FLOWS, at('2026-08-01T13:00:00Z'))).toBe(1060);
  });

  it('в момент самого якоря отдаёт его баланс', () => {
    expect(deriveBalanceAt(anchor, FLOWS, anchor.at)).toBe(1085);
  });
});

describe('detectGap', () => {
  it('расхождение в пределах допуска — не разрыв', () => {
    expect(detectGap(1000, 1000.4, 1)).toBeNull();
  });

  it('пополнение — положительный разрыв', () => {
    expect(detectGap(1000, 1500, 1)).toBe(500);
  });

  it('вывод — отрицательный разрыв', () => {
    expect(detectGap(1000, 700, 1)).toBe(-300);
  });

  // Ровно на границе допуска расхождение ещё не разрыв: иначе допуск,
  // подобранный по округлению биржи, срабатывал бы на самом округлении.
  it('расхождение ровно в допуск — не разрыв', () => {
    expect(detectGap(1000, 1001, 1)).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

Из `backend/`:

```bash
npx jest src/balance/balance-chain.spec.ts
```

Expected: FAIL — `Cannot find module './balance-chain'`.

- [ ] **Step 3: Написать минимальную реализацию**

Создать `backend/src/balance/balance-chain.ts`:

```ts
/**
 * Арифметика ряда баланса, вынесенная из сервисов: ни Prisma, ни сети, ни
 * часов. Здесь живёт единственная формула подсистемы, и здесь же её можно
 * прогнать на бумажном примере.
 */

/** Изменение баланса от торговли: закрытая прибыль за вычетом комиссий, фандинг. */
export interface Flow {
  at: Date;
  amount: number;
}

/** Точка, в которой баланс известен: снимок с биржи или начало отрезка. */
export interface Anchor {
  at: Date;
  balance: number;
}

/**
 * Сумма потоков в полуинтервале (from, to].
 *
 * Левая граница исключена намеренно: поток, стоящий ровно в момент якоря,
 * уже учтён в самом якоре. Включить его значило бы посчитать одну сделку
 * дважды, а сдвинутый на её размер ряд код прочитает как ввод средств.
 */
export function sumFlows(flows: Flow[], from: Date, to: Date): number {
  const a = from.getTime();
  const b = to.getTime();
  let sum = 0;
  for (const f of flows) {
    const t = f.at.getTime();
    if (t > a && t <= b) sum += f.amount;
  }
  return sum;
}

/**
 * Баланс в произвольный момент, выведенный от якоря.
 *
 * Направление не важно: вперёд потоки прибавляются, назад — вычитаются. Одна
 * формула на оба случая держит реконструкцию истории и текущий ряд на общем
 * коде, вместо двух почти одинаковых, расходящихся при первой же правке.
 */
export function deriveBalanceAt(anchor: Anchor, flows: Flow[], at: Date): number {
  if (at.getTime() >= anchor.at.getTime()) {
    return anchor.balance + sumFlows(flows, anchor.at, at);
  }
  return anchor.balance - sumFlows(flows, at, anchor.at);
}

/**
 * Неторговое изменение баланса: сколько денег появилось или исчезло помимо
 * торговли. Положительное — ввод, отрицательное — вывод.
 *
 * Null означает «расхождения нет», а не «ноль»: разрыв в ноль рублей и
 * отсутствие разрыва — разные вещи для того, кто читает ряд.
 */
export function detectGap(expected: number, actual: number, tolerance: number): number | null {
  const diff = actual - expected;
  if (Math.abs(diff) <= tolerance) return null;
  return diff;
}
```

- [ ] **Step 4: Запустить тесты и убедиться, что проходят**

```bash
npx jest src/balance/balance-chain.spec.ts
```

Expected: PASS, 11 тестов.

- [ ] **Step 5: Commit**

```bash
git add backend/src/balance/balance-chain.ts backend/src/balance/balance-chain.spec.ts
git commit -m "feat(balance): арифметика цепочки баланса"
```

---

### Task 4: Захват стопа на входе и перенос его в сделку

Делается до сервиса снимков: чем раньше начнут копиться стопы, тем раньше `planned_risk_pct` перестанет быть пустой колонкой.

**Files:**
- Modify: `backend/src/telegram/telegram.service.ts:21-27` (интерфейс `OpenedPositionInfo`)
- Modify: `backend/src/trades/trade-sync.service.ts:185-190` (маппинг позиций)
- Modify: `backend/src/trades/trade-sync.service.ts:215-221` (создание `OpenPositionSeen`)
- Test: `backend/src/trades/trade-sync.stoploss.spec.ts`

**Interfaces:**
- Consumes: `OpenPositionSeen.stopLoss`, `Trade.stopLoss` из Task 2.
- Produces: `OpenedPositionInfo.stopLoss?: string`; заполненный `Trade.stopLoss` у сделок, чья позиция была замечена открытой.

- [ ] **Step 1: Расширить `OpenedPositionInfo`**

В `backend/src/telegram/telegram.service.ts`, в интерфейс:

```ts
export interface OpenedPositionInfo {
  symbol: string;
  direction: 'long' | 'short';
  size?: string;
  avgPrice?: string;
  leverage?: string;
  /** Стоп на бирже. Отсутствует и когда его нет, и когда биржа его не отдаёт. */
  stopLoss?: string;
}
```

- [ ] **Step 2: Провести `stopLoss` через маппинг**

В `backend/src/trades/trade-sync.service.ts`, в объекте на строках 185-190 добавить строку после `leverage: p.leverage,`:

```ts
            stopLoss: p.stopLoss,
```

- [ ] **Step 3: Написать падающий тест**

Создать `backend/src/trades/trade-sync.stoploss.spec.ts`:

```ts
import { stopLossOf } from './trade-sync.service';

/**
 * Стоп приходит с биржи десятичной строкой, как и все размеры и цены. Ноль и
 * пустая строка у нескольких бирж означают «стопа нет» — превратить их в 0
 * значило бы объявить, что человек рискует всей позицией до нуля, и правило
 * planned_risk_pct показало бы 100% там, где стопа просто не было.
 */
describe('stopLossOf', () => {
  it('разбирает десятичную строку', () => {
    expect(stopLossOf('62100.5')).toBe(62100.5);
  });

  it('ноль читает как отсутствие стопа', () => {
    expect(stopLossOf('0')).toBeNull();
  });

  it('пустую строку читает как отсутствие стопа', () => {
    expect(stopLossOf('')).toBeNull();
  });

  it('undefined читает как отсутствие стопа', () => {
    expect(stopLossOf(undefined)).toBeNull();
  });

  it('мусор читает как отсутствие стопа, а не как NaN', () => {
    expect(stopLossOf('n/a')).toBeNull();
  });
});
```

- [ ] **Step 4: Запустить тест и убедиться, что падает**

```bash
npx jest src/trades/trade-sync.stoploss.spec.ts
```

Expected: FAIL — `stopLossOf` не экспортируется.

- [ ] **Step 5: Реализовать `stopLossOf` и использовать при создании строки**

В `backend/src/trades/trade-sync.service.ts`, рядом с константами вверху файла:

```ts
/**
 * Стоп с биржи — десятичная строка. Ноль и пустая строка у нескольких бирж
 * означают «стопа нет», и превращать их в 0 нельзя: planned_risk_pct тогда
 * покажет 100% там, где стопа просто не было, и правило соврёт в сторону,
 * которая выглядит как забота о пользователе.
 */
export function stopLossOf(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
```

В `trackOpenPositions`, в `create` (строка ~219):

```ts
        create: {
          userId,
          symbol: p.symbol,
          direction: p.direction,
          stopLoss: stopLossOf(p.stopLoss),
        },
```

- [ ] **Step 6: Запустить тесты и убедиться, что проходят**

```bash
npx jest src/trades/trade-sync.stoploss.spec.ts
```

Expected: PASS, 5 тестов.

- [ ] **Step 7: Перенести стоп в сделку при закрытии**

Найти место, где при вставке сделки подставляется `openedAt` из `OpenPositionSeen` (искать `openedAt` в `trade-sync.service.ts`). Рядом с ним, из той же найденной строки реестра, подставить:

```ts
        stopLoss: seen?.stopLoss ?? null,
```

Комментарий рядом:

```ts
        // Стоп берётся оттуда же, откуда openedAt, и по той же причине: это
        // единственный след намерения на входе, а закрытая сделка о нём уже
        // ничего не знает.
```

- [ ] **Step 8: Проверить типы**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: без ошибок.

- [ ] **Step 9: Commit**

```bash
git add backend/src/telegram/telegram.service.ts backend/src/trades/trade-sync.service.ts backend/src/trades/trade-sync.stoploss.spec.ts
git commit -m "feat(trades): снимать стоп на входе и переносить его в сделку"
```

---

### Task 5: Сервис снимков — часовые якоря и обнаружение разрывов

**Files:**
- Create: `backend/src/balance/balance-snapshot.service.ts`
- Create: `backend/src/balance/balance.module.ts`
- Test: `backend/src/balance/balance-snapshot.service.spec.ts`
- Modify: `backend/src/app.module.ts` (подключить `BalanceModule`)

**Interfaces:**
- Consumes: `sumFlows`, `detectGap` из Task 3; `BalanceSnapshot` из Task 2; `ExchangeRegistry` и `CredentialsService` — как их использует `TradeSyncService`.
- Produces: `BalanceSnapshotService.captureFor(userId: string): Promise<'written' | 'skipped' | 'failed'>` — снимает якорь одного пользователя. Публичный, чтобы Task 7 мог позвать его вручную, а тест — без таймера.

- [ ] **Step 1: Написать падающий тест**

Создать `backend/src/balance/balance-snapshot.service.spec.ts`:

```ts
import { BalanceSnapshotService } from './balance-snapshot.service';

const HOUR = 60 * 60 * 1000;
const T0 = new Date('2026-08-01T10:00:00Z');
const T1 = new Date(T0.getTime() + HOUR);

/**
 * Сервис собирается вручную с заглушками — это тест про то, какая строка
 * появляется в базе, а не про HTTP и не про Nest.
 */
function serviceWith(opts: {
  balance: number;
  prevAnchor?: { at: Date; balance: number };
  flows?: { at: Date; amount: number }[];
  positionsOpen?: boolean;
}) {
  const created: Record<string, unknown>[] = [];
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', activeExchange: 'bybit' }]) },
    balanceSnapshot: {
      findFirst: jest.fn().mockResolvedValue(
        opts.prevAnchor ? { ...opts.prevAnchor, source: 'snapshot', gap: null } : null,
      ),
      create: jest.fn().mockImplementation(({ data }) => {
        created.push(data);
        return data;
      }),
    },
    trade: {
      findMany: jest.fn().mockResolvedValue(
        (opts.flows ?? []).map((f) => ({ closedAt: f.at, closedPnl: f.amount, openFee: 0, closeFee: 0 })),
      ),
    },
    fundingFee: { findMany: jest.fn().mockResolvedValue([]) },
  } as never;

  const adapter = {
    getBalance: jest.fn().mockResolvedValue({ success: true, balance: opts.balance, availableToWithdraw: opts.balance }),
    getOpenPositions: jest
      .fn()
      .mockResolvedValue({ success: true, positions: opts.positionsOpen ? [{ symbol: 'BTCUSDT' }] : [] }),
  };
  const exchanges = { get: () => adapter } as never;
  const credentials = {
    getActive: jest
      .fn()
      .mockResolvedValue({ exchange: 'bybit', credentials: { apiKey: 'k', apiSecret: 's' } }),
  } as never;

  return { service: new BalanceSnapshotService(prisma, exchanges, credentials), created };
}

describe('BalanceSnapshotService.captureFor', () => {
  it('пишет якорь, когда предыдущего нет', async () => {
    const { service, created } = serviceWith({ balance: 1000 });

    await expect(service.captureFor('u1', T0)).resolves.toBe('written');
    expect(created[0]).toMatchObject({ userId: 'u1', balance: 1000, source: 'snapshot', gap: null });
  });

  // Ряд, который сошёлся с ожиданием по сделкам, разрыва не несёт: gap здесь
  // должен быть именно null, а не 0 — «расхождения не было» и «расхождение
  // ровно нулевое» читаются по-разному тем, кто потом смотрит историю.
  it('не ставит разрыв, когда баланс сошёлся с ожиданием', async () => {
    const { service, created } = serviceWith({
      balance: 1060,
      prevAnchor: { at: T0, balance: 1000 },
      flows: [{ at: new Date(T0.getTime() + HOUR / 2), amount: 60 }],
    });

    await service.captureFor('u1', T1);
    expect(created[0]).toMatchObject({ balance: 1060, gap: null });
  });

  it('ставит разрыв, когда баланс вырос без сделок', async () => {
    const { service, created } = serviceWith({
      balance: 1500,
      prevAnchor: { at: T0, balance: 1000 },
      flows: [],
    });

    await service.captureFor('u1', T1);
    expect(created[0]).toMatchObject({ balance: 1500, gap: 500 });
  });

  it('ставит отрицательный разрыв на выводе средств', async () => {
    const { service, created } = serviceWith({
      balance: 700,
      prevAnchor: { at: T0, balance: 1000 },
      flows: [],
    });

    await service.captureFor('u1', T1);
    expect(created[0]).toMatchObject({ gap: -300 });
  });

  // Пропуск не ошибка: дыру закроет вывод по цепочке, а следующий якорь
  // заодно проверит отрезок. Ошибкой было бы записать баланс, в котором
  // болтается нереализованный PnL открытой позиции — он дышит вместе с
  // рынком, и каждый вдох прочитался бы как ввод средств.
  it('пропускает тик, когда есть открытые позиции', async () => {
    const { service, created } = serviceWith({ balance: 1000, positionsOpen: true });

    await expect(service.captureFor('u1', T0)).resolves.toBe('skipped');
    expect(created).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

```bash
npx jest src/balance/balance-snapshot.service.spec.ts
```

Expected: FAIL — `Cannot find module './balance-snapshot.service'`.

- [ ] **Step 3a: Вынести загрузку потоков в общий файл**

Создать `backend/src/balance/flows.ts`. Отдельным файлом с самого начала, а не приватным методом сервиса: те же потоки понадобятся в Task 6, а две копии трактовки комиссий разойдутся при первой же правке — и разойдутся молча, потому что обе дадут правдоподобные числа.

```ts
import { PrismaService } from '../prisma/prisma.service';
import type { Flow } from './balance-chain';

/**
 * Биржи, у которых closedPnl НЕ включает комиссии, — их надо вычесть отдельно.
 *
 * Разведка (Task 1) установила две такие биржи из семи:
 *  - Binance: сотрудник на форуме разработчиков прямо пишет, что «REALIZED_PNL
 *    doesn't include the fee so you'll need to deduct the fees from it».
 *  - Bitget: адаптер берёт поле `pnl`, а не `netProfit`, и на реальном ответе
 *    API сходится `pnl + openFee + closeFee + totalFunding = netProfit` — то
 *    есть `pnl` стоит ДО комиссий.
 *
 * Ошибиться здесь можно в обе стороны, и обе дают один симптом. Вычесть
 * комиссии там, где они уже вычтены, — ряд поедет вниз. Не вычесть там, где
 * они не вычтены, — поедет вверх. Поехавший в любую сторону ряд код прочитает
 * как ввод или вывод средств, то есть придумает пользователю движение денег,
 * которого не было.
 *
 * Знак: в ответах бирж комиссии приходят отрицательными, но адаптеры кладут их
 * в базу через Math.abs() — в `Trade.openFee` и `Trade.closeFee` лежат
 * положительные величины. Поэтому здесь именно ВЫЧИТАНИЕ. Прибавление, взятое
 * по аналогии с формулой из документации Bitget, дало бы удвоенную ошибку
 * вместо нулевой.
 */
const FEES_EXCLUDED_FROM_PNL = new Set<string>(['binance', 'bitget']);

/**
 * Торговые потоки между двумя моментами: всё, что двигало баланс торговлей.
 *
 * Фандинг лежит отдельной моделью и ни в один из вариантов closedPnl не
 * входит. Его знак — «плюс значит пользователь заплатил», поэтому в поток он
 * идёт со знаком минус.
 */
export async function loadFlows(
  prisma: PrismaService,
  userId: string,
  exchange: string,
  from: Date,
  to: Date,
): Promise<Flow[]> {
  const [trades, funding] = await Promise.all([
    prisma.trade.findMany({
      where: { userId, exchange, closedAt: { gt: from, lte: to } },
      select: { closedAt: true, closedPnl: true, openFee: true, closeFee: true },
    }),
    prisma.fundingFee.findMany({
      where: { userId, exchange, at: { gt: from, lte: to } },
      select: { at: true, amount: true },
    }),
  ]);
  const deductFees = FEES_EXCLUDED_FROM_PNL.has(exchange);
  return [
    ...trades.map((t) => ({
      at: t.closedAt,
      amount: deductFees ? t.closedPnl - t.openFee - t.closeFee : t.closedPnl,
    })),
    ...funding.map((f) => ({ at: f.at, amount: -f.amount })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
}
```

Перед реализацией сверить знак `openFee` и `closeFee` в базе на реальных строках: если адаптер уже кладёт их отрицательными, вычитание превратится в прибавление. Проверяется одним запросом — `SELECT "openFee", "closeFee" FROM trades WHERE exchange = 'binance' LIMIT 5`.

- [ ] **Step 3a-bis: Покрыть тестом расхождение бирж по комиссиям**

Ровно та ошибка, которую разведка нашла в первоначальном плане, поэтому она обязана иметь тест. Создать `backend/src/balance/flows.spec.ts`:

```ts
import { loadFlows } from './flows';

const T0 = new Date('2026-08-01T10:00:00Z');
const T1 = new Date('2026-08-01T12:00:00Z');

const prismaWith = (trade: { closedPnl: number; openFee: number; closeFee: number }) =>
  ({
    trade: {
      findMany: jest.fn().mockResolvedValue([{ at: T0, closedAt: T0, ...trade }]),
    },
    fundingFee: { findMany: jest.fn().mockResolvedValue([]) },
  }) as never;

describe('loadFlows', () => {
  const trade = { closedPnl: 100, openFee: 3, closeFee: 2 };

  // Шесть бирж из семи отдают PnL уже за вычетом комиссий. Вычесть их второй
  // раз значит увести ряд вниз, а уехавший ряд читается как вывод средств.
  it('не вычитает комиссии там, где биржа их уже вычла', async () => {
    const flows = await loadFlows(prismaWith(trade), 'u1', 'bybit', T0, T1);
    expect(flows[0].amount).toBe(100);
  });

  // Binance и Bitget — исключения: их поле PnL стоит до комиссий. Комиссии в
  // базе лежат положительными (адаптеры зовут Math.abs), поэтому вычитаем.
  it('вычитает комиссии у Binance', async () => {
    const flows = await loadFlows(prismaWith(trade), 'u1', 'binance', T0, T1);
    expect(flows[0].amount).toBe(95);
  });

  it('вычитает комиссии у Bitget', async () => {
    const flows = await loadFlows(prismaWith(trade), 'u1', 'bitget', T0, T1);
    expect(flows[0].amount).toBe(95);
  });
});
```

Запустить: `npx jest src/balance/flows.spec.ts` — сначала должен упасть на отсутствии модуля, после Step 3a пройти все три теста.

**Известное ограничение, фиксируем сознательно.** У Binance адаптер всегда кладёт `openFee: 0` — комиссия входа приходит на отдельном филле и в строку закрытой сделки не попадает вовсе ([binance.adapter.ts:139-142](backend/src/exchanges/adapters/binance.adapter.ts#L139-L142)). Значит на Binance цепочка систематически недосчитывает комиссии входа и медленно уезжает вверх. Это терпимо ровно потому, что якоря часовые: комиссия порядка сотых долей процента от номинала, за час их набирается заметно меньше допуска в 0.5%, а каждый следующий якорь обнуляет накопленное. При переходе на более редкие якоря ограничение перестаёт быть безобидным.

- [ ] **Step 3b: Написать сервис**

Создать `backend/src/balance/balance-snapshot.service.ts`:

```ts
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExchangeRegistry } from '../exchanges/exchange-registry.service';
import { CredentialsService } from '../credentials/credentials.service';
import { detectGap, sumFlows, type Flow } from './balance-chain';

const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000;
/** Из Task 1: доля баланса, ниже которой расхождение — округление биржи. */
const GAP_TOLERANCE_PCT = 0.05;

/**
 * Часовые якоря ряда баланса.
 *
 * Раз в час, не раз в минуту: 1440 строк в сутки на пользователя не дают
 * ничего сверх вывода по цепочке сделок. И не раз в сутки: якорь должен быть
 * достаточно частым, чтобы пополнение локализовалось в узкое окно, а не
 * размазалось по дню.
 */
@Injectable()
export class BalanceSnapshotService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BalanceSnapshotService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly exchanges: ExchangeRegistry,
    private readonly credentials: CredentialsService,
  ) {}

  onApplicationBootstrap(): void {
    this.captureAll().catch((e) => this.logger.error('initial balance capture failed', e));
    this.timer = setInterval(() => {
      this.captureAll().catch((e) => this.logger.error('periodic balance capture failed', e));
    }, SNAPSHOT_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async captureAll(at = new Date()): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { activeExchange: { not: null } },
      select: { id: true },
    });
    for (const u of users) {
      // Провал у одного пользователя не должен ронять обход остальных —
      // тот же приём, что в TradeSyncService.syncAll.
      try {
        await this.captureFor(u.id, at);
      } catch (e) {
        this.logger.warn(`balance capture failed for user ${u.id}: ${e}`);
      }
    }
  }

  /**
   * Якорь одного пользователя.
   *
   * Публичный и принимает момент параметром: так его можно позвать вручную
   * после подключения биржи и прогнать в тесте без таймера и без часов.
   */
  async captureFor(userId: string, at = new Date()): Promise<'written' | 'skipped' | 'failed'> {
    const active = await this.credentials.getActive(userId);
    if (!active) return 'skipped';
    const { exchange, credentials: creds } = active;
    const adapter = this.exchanges.get(exchange);

    // Открытая позиция делает баланс непригодным для якоря на биржах,
    // возвращающих его вместе с нереализованным PnL: такой якорь дышит
    // вместе с рынком, и каждый вдох прочитается как ввод средств. Пропуск
    // безопасен — дыру закроет вывод по цепочке сделок.
    if (ANCHOR_REQUIRES_FLAT.has(exchange)) {
      const open = await adapter.getOpenPositions(creds);
      if (!open.success) return 'failed';
      if (open.positions.some((p) => Number(p.size) !== 0)) return 'skipped';
    }

    const res = await adapter.getBalance(creds);
    if (!res.success) return 'failed';
    const balance = res.balance;

    const prev = await this.prisma.balanceSnapshot.findFirst({
      where: { userId, exchange, at: { lt: at } },
      orderBy: { at: 'desc' },
    });

    // Первый якорь сравнивать не с чем: разрыва нет, а не «нулевой разрыв».
    let gap: number | null = null;
    if (prev) {
      const flows = await loadFlows(this.prisma, userId, exchange, prev.at, at);
      const expected = prev.balance + sumFlows(flows, prev.at, at);
      gap = detectGap(expected, balance, (Math.abs(balance) * GAP_TOLERANCE_PCT) / 100);
    }

    await this.prisma.balanceSnapshot.create({
      data: { userId, exchange, at, balance, source: 'snapshot', gap },
    });
    return 'written';
  }
}
```

Импорты сверху файла дополнить: `import { loadFlows } from './flows';`. Множество бирж, требующих плоского счёта, объявить рядом с константами по результату Task 1:

```ts
/**
 * Биржи, у которых getBalance включает нереализованный PnL (см. «Разведка
 * адаптеров» в спеке). У них якорь снимается только на плоском счёте: иначе
 * он дышит вместе с рынком, и каждое движение цены по открытой позиции код
 * прочитает как ввод или вывод средств.
 *
 * MEXC включён, хотя вывод по нему собран из двух источников, а не из прямой
 * цитаты: цена ошибки несимметрична. Ложно исключить биржу отсюда — значит
 * показать пользователю выдуманные пополнения; ложно включить — эпизодически
 * пропустить часовой тик, что дешевле.
 */
const ANCHOR_REQUIRES_FLAT = new Set<string>(['okx', 'bitget', 'kucoin', 'mexc']);
```

Значение `GAP_TOLERANCE_PCT` — `0.005`. Оно закрывает только шум округления: накопленную погрешность float по сделкам в окне и рассинхронизацию на секунды между чтением баланса и последней учтённой сделкой. Задачу «не спутать плавающую прибыль с вводом средств» решает не допуск, а `ANCHOR_REQUIRES_FLAT` — плавающая прибыль бывает любого размера, и никакой допуск её не отфильтрует.

Пересчёт метрик риска сюда пока не подключается: `TradeRiskService` появляется только в Task 7, и ссылка на него здесь уронит Nest на неразрешённой зависимости — Task 5 не пройдёт свой Step 6. Task 7 добавит вызов сам.

- [ ] **Step 4: Запустить тесты и убедиться, что проходят**

```bash
npx jest src/balance/balance-snapshot.service.spec.ts
```

Expected: PASS, 5 тестов.

- [ ] **Step 5: Создать модуль и подключить его**

Создать `backend/src/balance/balance.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ExchangesModule } from '../exchanges/exchanges.module';
import { CredentialsModule } from '../credentials/credentials.module';
import { BalanceSnapshotService } from './balance-snapshot.service';

// PrismaModule не импортируется: он объявлен @Global, и PrismaService
// инжектится где угодно без повторного импорта.
@Module({
  imports: [ExchangesModule, CredentialsModule],
  providers: [BalanceSnapshotService],
  exports: [BalanceSnapshotService],
})
export class BalanceModule {}
```

В `backend/src/app.module.ts` добавить импорт и поставить `BalanceModule` в массив `imports` после `TradesModule`.

- [ ] **Step 6: Проверить, что приложение поднимается**

```bash
npm run build
```

Expected: сборка проходит; Nest не жалуется на неразрешённые зависимости.

- [ ] **Step 7: Commit**

```bash
git add backend/src/balance backend/src/app.module.ts
git commit -m "feat(balance): часовые якоря баланса и обнаружение вводов/выводов"
```

---

### Task 6: Баланс в произвольный момент

**Files:**
- Create: `backend/src/balance/balance-history.service.ts`
- Test: `backend/src/balance/balance-history.service.spec.ts`
- Modify: `backend/src/balance/balance.module.ts`

**Interfaces:**
- Consumes: `deriveBalanceAt` из Task 3; `BalanceSnapshot` из Task 2.
- Produces: `BalanceHistoryService.balanceAt(userId: string, exchange: string, at: Date): Promise<{ balance: number; source: 'snapshot' | 'derived' } | null>` — `null`, когда момент лежит вне известного отрезка.

- [ ] **Step 1: Написать падающий тест**

Создать `backend/src/balance/balance-history.service.spec.ts`:

```ts
import { BalanceHistoryService } from './balance-history.service';

const HOUR = 60 * 60 * 1000;
const T0 = new Date('2026-08-01T10:00:00Z');
const T1 = new Date(T0.getTime() + HOUR);
const T2 = new Date(T0.getTime() + 2 * HOUR);

function serviceWith(opts: {
  anchors: { at: Date; balance: number; gap: number | null }[];
  flows?: { at: Date; amount: number }[];
}) {
  const prisma = {
    balanceSnapshot: {
      findMany: jest.fn().mockResolvedValue(
        opts.anchors.map((a) => ({ ...a, source: 'snapshot', userId: 'u1', exchange: 'bybit' })),
      ),
    },
    trade: {
      findMany: jest.fn().mockResolvedValue(
        (opts.flows ?? []).map((f) => ({ closedAt: f.at, closedPnl: f.amount })),
      ),
    },
    fundingFee: { findMany: jest.fn().mockResolvedValue([]) },
  } as never;
  return new BalanceHistoryService(prisma);
}

describe('BalanceHistoryService.balanceAt', () => {
  it('отдаёт якорь как есть, когда момент совпал с ним', async () => {
    const service = serviceWith({ anchors: [{ at: T1, balance: 1060, gap: null }] });

    await expect(service.balanceAt('u1', 'bybit', T1)).resolves.toEqual({
      balance: 1060,
      source: 'snapshot',
    });
  });

  it('выводит баланс назад от ближайшего якоря', async () => {
    const service = serviceWith({
      anchors: [{ at: T1, balance: 1060, gap: null }],
      flows: [{ at: new Date(T0.getTime() + HOUR / 2), amount: 60 }],
    });

    await expect(service.balanceAt('u1', 'bybit', T0)).resolves.toEqual({
      balance: 1000,
      source: 'derived',
    });
  });

  // Разрыв — граница отрезка, а не точка на нём. Ввод средств в T1 означает,
  // что баланс до него с балансом после него цепочкой не связан, и протянуть
  // вывод через разрыв значило бы приписать пользователю прибыль в размере
  // его же пополнения.
  it('не выводит баланс через разрыв', async () => {
    const service = serviceWith({
      anchors: [
        { at: T1, balance: 1500, gap: 500 },
        { at: T2, balance: 1520, gap: null },
      ],
      flows: [],
    });

    await expect(service.balanceAt('u1', 'bybit', T0)).resolves.toBeNull();
  });

  it('внутри отрезка после разрыва выводит нормально', async () => {
    const service = serviceWith({
      anchors: [
        { at: T1, balance: 1500, gap: 500 },
        { at: T2, balance: 1520, gap: null },
      ],
      flows: [{ at: new Date(T1.getTime() + HOUR / 2), amount: 20 }],
    });

    await expect(service.balanceAt('u1', 'bybit', new Date(T1.getTime() + HOUR / 4))).resolves.toEqual(
      { balance: 1500, source: 'derived' },
    );
  });

  it('отдаёт null, когда якорей нет вовсе', async () => {
    const service = serviceWith({ anchors: [] });

    await expect(service.balanceAt('u1', 'bybit', T0)).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

```bash
npx jest src/balance/balance-history.service.spec.ts
```

Expected: FAIL — `Cannot find module './balance-history.service'`.

- [ ] **Step 3: Написать реализацию**

Создать `backend/src/balance/balance-history.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { deriveBalanceAt, type Anchor } from './balance-chain';
import { loadFlows } from './flows';

export interface BalanceAt {
  balance: number;
  source: 'snapshot' | 'derived';
}

/** Непрерывный отрезок ряда: внутри него баланс связан цепочкой сделок. */
interface Segment {
  anchors: Anchor[];
}

@Injectable()
export class BalanceHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Баланс в произвольный момент.
   *
   * Null означает «не знаем», и это не то же самое, что ноль: сделка с
   * неизвестным балансом выпадает из проверки правил целиком, а сделка с
   * нулевым балансом нарушила бы любое правило.
   */
  async balanceAt(userId: string, exchange: string, at: Date): Promise<BalanceAt | null> {
    const rows = await this.prisma.balanceSnapshot.findMany({
      where: { userId, exchange },
      orderBy: { at: 'asc' },
      select: { at: true, balance: true, gap: true },
    });
    if (rows.length === 0) return null;

    const segment = this.segmentFor(rows, at);
    if (!segment) return null;

    const anchor = this.nearestAnchor(segment, at);
    const flows = await loadFlows(
      this.prisma,
      userId,
      exchange,
      at < anchor.at ? at : anchor.at,
      at < anchor.at ? anchor.at : at,
    );
    const balance = deriveBalanceAt(anchor, flows, at);
    const exact = segment.anchors.some((a) => a.at.getTime() === at.getTime());
    return { balance, source: exact ? 'snapshot' : 'derived' };
  }

  /**
   * Разбивает якоря на непрерывные отрезки и возвращает тот, которому
   * принадлежит момент.
   *
   * Якорь с разрывом открывает НОВЫЙ отрезок: он первая точка, в которой
   * баланс уже включает пополнение, и тянуть цепочку через него значило бы
   * приписать пользователю прибыль в размере его собственного взноса.
   *
   * Момент раньше самого первого якоря принадлежит первому отрезку — это и
   * есть реконструкция истории назад. Момент, попавший в промежуток между
   * концом одного отрезка и началом следующего, не принадлежит никому:
   * известно только, что где-то там двигались неторговые деньги.
   */
  private segmentFor(
    rows: { at: Date; balance: number; gap: number | null }[],
    at: Date,
  ): Segment | null {
    const segments: Segment[] = [];
    for (const r of rows) {
      const anchor: Anchor = { at: r.at, balance: r.balance };
      if (segments.length === 0 || r.gap !== null) segments.push({ anchors: [anchor] });
      else segments[segments.length - 1].anchors.push(anchor);
    }

    // Назад ряд продлевается, только если самый ранний якорь разрыва не несёт.
    // Разрыв на первом же якоре означает, что прямо перед началом наблюдений
    // двигались неторговые деньги, и всё, что было раньше, с этим рядом
    // цепочкой не связано.
    const openEnded = rows[0].gap === null;

    const t = at.getTime();
    for (let i = 0; i < segments.length; i += 1) {
      const anchors = segments[i].anchors;
      const first = anchors[0].at.getTime();
      const last = anchors[anchors.length - 1].at.getTime();
      const lowerBound = i === 0 && openEnded ? Number.NEGATIVE_INFINITY : first;
      if (t >= lowerBound && t <= last) return segments[i];
      // Вперёд продлевается только последний: за ним ещё ничего не случилось.
      if (i === segments.length - 1 && t > last) return segments[i];
    }
    return null;
  }

  /** Ближайший по времени якорь отрезка: чем короче цепочка, тем меньше снос. */
  private nearestAnchor(segment: Segment, at: Date): Anchor {
    return segment.anchors.reduce((best, a) =>
      Math.abs(a.at.getTime() - at.getTime()) < Math.abs(best.at.getTime() - at.getTime()) ? a : best,
    );
  }
}
```

- [ ] **Step 4: Запустить тесты и убедиться, что проходят**

```bash
npx jest src/balance
```

Expected: PASS, все тесты модуля (Task 3, 5, 6).

- [ ] **Step 5: Зарегистрировать сервис в модуле**

Добавить `BalanceHistoryService` в `providers` и `exports` `balance.module.ts`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/balance
git commit -m "feat(balance): баланс в произвольный момент с уважением к разрывам"
```

---

### Task 7: Метрики риска сделки

**Files:**
- Create: `backend/src/balance/trade-risk.service.ts`
- Test: `backend/src/balance/trade-risk.service.spec.ts`
- Modify: `backend/src/balance/balance.module.ts`

**Interfaces:**
- Consumes: `BalanceHistoryService.balanceAt` из Task 6; `TradeRisk` из Task 2; `Trade.stopLoss` из Task 4.
- Produces: `TradeRiskService.computeMissing(userId: string): Promise<number>` — считает метрики сделкам без `TradeRisk` или с устаревшим `riskVersion`, возвращает число обработанных. Чистая функция `riskOf(trade, balance)` экспортируется отдельно для теста.

- [ ] **Step 1: Написать падающий тест**

Создать `backend/src/balance/trade-risk.service.spec.ts`:

```ts
import { riskOf } from './trade-risk.service';

const TRADE = {
  qty: 0.5,
  avgEntryPrice: 60000,
  stopLoss: null as number | null,
};

describe('riskOf', () => {
  it('считает экспозицию как долю депозита в позиции', () => {
    // 0.5 × 60000 = 30000 номинала при депозите 100000 → 30%
    expect(riskOf(TRADE, 100000)).toMatchObject({ exposurePct: 30, plannedRiskPct: null, ok: true });
  });

  it('считает плановый риск от стопа', () => {
    // 0.5 × |60000 − 59000| = 500 при депозите 100000 → 0.5%
    expect(riskOf({ ...TRADE, stopLoss: 59000 }, 100000)).toMatchObject({ plannedRiskPct: 0.5 });
  });

  // Шорт: стоп выше входа. Модуль разности держит обе стороны на одной
  // формуле — без него у шорта риск получался отрицательным, и правило
  // «риск ≤ 2%» соблюдалось бы тем охотнее, чем дальше стоял стоп.
  it('считает плановый риск шорта со стопом выше входа', () => {
    expect(riskOf({ ...TRADE, stopLoss: 61000 }, 100000)).toMatchObject({ plannedRiskPct: 0.5 });
  });

  // Отсутствие стопа — это не нулевой риск и не полный: это «не знаем».
  // Ноль соблюдал бы любое правило, 100% нарушал бы любое, и оба варианта
  // врут о том, чего мы не измеряли.
  it('без стопа отдаёт null, но экспозицию считает', () => {
    expect(riskOf(TRADE, 100000)).toMatchObject({ exposurePct: 30, plannedRiskPct: null });
  });

  it('без баланса отдаёт ok: false и обе метрики null', () => {
    expect(riskOf({ ...TRADE, stopLoss: 59000 }, null)).toEqual({
      exposurePct: null,
      plannedRiskPct: null,
      ok: false,
    });
  });

  // Нулевой баланс — это не «депозит слит в ноль», это деление на ноль.
  it('нулевой баланс отдаёт ok: false, а не Infinity', () => {
    expect(riskOf(TRADE, 0)).toMatchObject({ ok: false, exposurePct: null });
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

```bash
npx jest src/balance/trade-risk.service.spec.ts
```

Expected: FAIL — `Cannot find module './trade-risk.service'`.

- [ ] **Step 3: Написать реализацию**

Создать `backend/src/balance/trade-risk.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BalanceHistoryService } from './balance-history.service';

/** Версия набора полей. Растёт, когда меняется формула — строки старой версии пересчитываются. */
export const RISK_VERSION = 1;

export interface RiskInput {
  qty: number;
  avgEntryPrice: number;
  stopLoss: number | null;
}

export interface RiskOutput {
  exposurePct: number | null;
  plannedRiskPct: number | null;
  ok: boolean;
}

/**
 * Метрики риска одной сделки.
 *
 * Экспозиция — доля депозита в номинале позиции, а не в марже: при плече
 * «сколько денег в рынке» и «сколько своих внесено» расходятся в разы, и
 * правило должно ограничивать первое. Плановый риск берёт модуль разности,
 * чтобы шорт со стопом выше входа считался той же формулой — иначе у него
 * риск выходил отрицательным и соблюдал любое правило.
 */
export function riskOf(trade: RiskInput, balance: number | null): RiskOutput {
  if (balance === null || !Number.isFinite(balance) || balance <= 0) {
    return { exposurePct: null, plannedRiskPct: null, ok: false };
  }
  const notional = trade.qty * trade.avgEntryPrice;
  const exposurePct = (notional / balance) * 100;
  const plannedRiskPct =
    trade.stopLoss === null
      ? null
      : ((trade.qty * Math.abs(trade.avgEntryPrice - trade.stopLoss)) / balance) * 100;
  return { exposurePct, plannedRiskPct, ok: true };
}

@Injectable()
export class TradeRiskService {
  private readonly logger = new Logger(TradeRiskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly history: BalanceHistoryService,
  ) {}

  /**
   * Досчитывает метрики сделкам, у которых их ещё нет.
   *
   * Тот же приём, что в TradeContextService: считаем только тем, у кого нет,
   * а строки устаревшей версии сначала удаляем — иначе новая формула никогда
   * не доедет до уже посчитанных сделок и продукт будет показывать два разных
   * определения риска одновременно.
   */
  async computeMissing(userId: string): Promise<number> {
    await this.prisma.tradeRisk.deleteMany({
      where: { riskVersion: { lt: RISK_VERSION }, trade: { userId } },
    });
    const trades = await this.prisma.trade.findMany({
      where: { userId, risk: null },
      select: {
        id: true,
        exchange: true,
        qty: true,
        avgEntryPrice: true,
        stopLoss: true,
        openedAt: true,
        closedAt: true,
      },
    });

    let done = 0;
    for (const t of trades) {
      // Момент входа, а не закрытия: правило ограничивает решение, принятое
      // на входе, и мерить его балансом, уже изменённым исходом этой самой
      // сделки, значит оценивать решение по его результату.
      const at = t.openedAt ?? t.closedAt;
      const found = await this.history.balanceAt(userId, t.exchange, at);
      const risk = riskOf(
        { qty: t.qty, avgEntryPrice: t.avgEntryPrice, stopLoss: t.stopLoss },
        found?.balance ?? null,
      );
      await this.prisma.tradeRisk.create({
        data: {
          tradeId: t.id,
          balanceAtEntry: found?.balance ?? null,
          balanceSource: found?.source ?? null,
          exposurePct: risk.exposurePct,
          plannedRiskPct: risk.plannedRiskPct,
          ok: risk.ok,
          riskVersion: RISK_VERSION,
        },
      });
      done += 1;
    }
    return done;
  }
}
```

- [ ] **Step 4: Запустить тесты и убедиться, что проходят**

```bash
npx jest src/balance/trade-risk.service.spec.ts
```

Expected: PASS, 6 тестов.

- [ ] **Step 5: Зарегистрировать сервис и повесить его на цикл снимков**

Добавить `TradeRiskService` в `providers` и `exports` `balance.module.ts`.

В `BalanceSnapshotService` добавить его в конструктор (`private readonly risk: TradeRiskService`) и вызвать в `captureFor` прямо перед `return 'written'`:

```ts
    // Новый якорь мог открыть баланс сделкам, для которых он был неизвестен.
    // Провал расчёта не должен ронять уже записанный якорь — тот же приём,
    // что с Telegram в trackOpenPositions.
    try {
      await this.risk.computeMissing(userId);
    } catch (e) {
      this.logger.warn(`risk recompute failed for user ${userId}: ${e}`);
    }
```

Тест Task 5 после этого требует заглушки нового конструкторного аргумента: в `serviceWith` добавить `const risk = { computeMissing: jest.fn().mockResolvedValue(0) } as never;` и передать его четвёртым аргументом. Без этого пять тестов Task 5 упадут на `Cannot read properties of undefined`.

- [ ] **Step 6: Прогнать весь набор тестов бэкенда**

```bash
npx jest
```

Expected: PASS, включая все ранее существовавшие тесты.

- [ ] **Step 7: Собрать проект**

```bash
npm run build
```

Expected: сборка проходит.

- [ ] **Step 8: Commit**

```bash
git add backend/src/balance
git commit -m "feat(balance): метрики риска сделки"
```

---

## Что этот план сознательно не делает

- **Не создаёт `Rule` и не проверяет правила.** Это второй план.
- **Не рисует ничего в интерфейсе.** Ряд баланса и метрики видны только в базе; экран соблюдения и отметки в журнале — второй план.
- **Не читает историю транзакций с биржи.** Вводы и выводы выводятся из расхождения якоря с ожиданием. Пополнение и вывод в один час на близкие суммы взаимно погасятся и останутся невидимыми — записано в «Границах» спеки.
- **Не шлёт Telegram-предупреждений.** Шов оставлен: расчёт метрики на открытой позиции отличается от закрытой только источником `qty` и цены входа.
