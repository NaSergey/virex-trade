# Декларации правил и экран соблюдения — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать пользователю объявить числовое правило («риск на сделку не больше 2%») и показать, насколько он его соблюдал.

**Architecture:** Правило — строка `metric + operator + threshold`; каталог метрик живёт константой в коде, а не в базе, поэтому новая метрика не требует миграции. Метрики уровня сделки уже посчитаны предыдущим планом и лежат в `TradeRisk`; дневные считаются на чтение по локальным суткам пользователя. Сравнение с порогом всегда на чтение — правило можно править и выключать без пересчёта истории.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Jest; Next.js App Router + FSD, next-intl, TanStack Query.

Спека: `docs/superpowers/specs/2026-08-27-balance-history-and-rules-design.md`.
Первый план (выполнен): `docs/superpowers/plans/2026-08-27-balance-history.md`.

Это второй и последний план по спеке. Первый построил историю баланса и метрики риска, которые пользователь не видит; этот делает их видимыми и проверяемыми.

## Что уже готово и на что опираться

- Модель `TradeRisk` (1:1 к `Trade`): `exposurePct`, `plannedRiskPct`, `balanceAtEntry`, `balanceSource`, `ok`. Досчитывается автоматически в `BalanceSnapshotService.captureAll`.
- `Trade.stopLoss`, `Trade.leverage`, `Trade.openedAt`, `Trade.closedAt`, `Trade.closedPnl`.
- `BalanceHistoryService.balanceAt(userId, exchange, at)` → `{ balance, source } | null`.
- `loadRows(prisma, userId, tzOffsetMin)` в `backend/src/trades/trade-rows.ts` — конвенция локальных суток.
- На фронте: `usePeriodFilter()` → `effectiveDays`; запросы шлют `days` и `tz` из `new Date().getTimezoneOffset()` (образец — `useTimeStats` в `frontend/src/entities/trade/api/hooks.ts`).

## Находка живых данных, обязательная к учёту

На реальном аккаунте `exposurePct` доходит до **412%**: у фьючерсного трейдера номинал позиции кратно превышает депозит. Отсюда два следствия, зашитые в этот план:

- метрика подписывается «номинал позиции к депозиту», а не «доля депозита» — второе прямо вводит в заблуждение;
- порог по умолчанию для неё — сотни процентов, а не десятки. Форма с подсказкой «например, 50» обесценила бы метрику с первого экрана.

## Global Constraints

- Бэкенд: комментарии по-русски в `trades/` и `balance/`, по-английски в `exchanges/`. Смотреть на соседние строки.
- Комментарий объясняет ПОЧЕМУ, а не пересказывает код. Пересказ считается шумом.
- Фронтенд: слой страниц — `frontend/src/views/`, НЕ `src/pages/` (последнее ломает `next build`). Проверять `npx next build`, а не только `tsc`.
- **Никакой сырой разметки.** Всё через `shared/ui`: `Button`, `Field`, `Input`, `Select`, `PageHead`, `SectionHead`, `Skeleton`, `EmptyState`, `Money`, `KeyValue`, `ErrorNote`, `Wrap`, `LedgerTable`, `Seg`, `Pagination`, `DialogActions`. Цвета — классами из `globals.css` (`.muted`, `.pos`, `.neg`), не инлайновым `style`.
- **Ни одной строки текста в коде.** Все подписи через `next-intl`, ключи в `frontend/src/shared/i18n/messages/ru.json` и `en.json`. Оба файла обновляются в одной задаче — англоязычный файл без ключа роняет страницу.
- Блок, живущий на одной странице, лежит в `views/<page>/components/`, а не в `widgets/`.
- Числа денег — `Float`; тесты — Jest, `*.spec.ts` рядом с исходником, Prisma подставляется заглушкой `as unknown as PrismaService`.
- Новых зависимостей не добавлять.

---

### Task 1: Модель Rule

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Consumes: ничего.
- Produces: модель `Rule`, связь `User.rules`.

- [ ] **Step 1: Добавить модель**

В конец `schema.prisma` (текст модели приведён в спеке, раздел «Модель данных»):

```prisma
/// Объявленное пользователем числовое правило: «метрика в таком-то отношении
/// к порогу». Окна здесь нет намеренно — оно свойство метрики, а не правила:
/// exposure_pct бывает только на сделку, trades_per_day только на день.
/// Отдельное поле разрешило бы в базе бессмысленные комбинации вроде
/// «экспозиция за неделю», которые пришлось бы отсеивать валидацией.
model Rule {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// Ключ из каталога метрик в коде (backend/src/rules/metric-catalog.ts).
  metric    String
  operator  String   // 'lte' | 'gte'
  threshold Float
  active    Boolean  @default(true)
  createdAt DateTime @default(now())

  /// Одно правило на метрику. «Риск ≤ 2%» и «риск ≤ 5%» одновременно —
  /// не декларация, а её отсутствие.
  @@unique([userId, metric])
  @@index([userId, active])
  @@map("rules")
}
```

В модель `User`, рядом с `balanceSnapshots`:

```prisma
  rules              Rule[]
```

- [ ] **Step 2: Применить схему**

Из `backend/`:

```bash
npm run prisma:push
npm run prisma:generate
npx tsc --noEmit -p tsconfig.json
```

Expected: все три проходят. Postgres поднят в контейнере `virex-trader-db-1`; если база недоступна — не править `DATABASE_URL` и не создавать миграции руками, а вернуть NEEDS_CONTEXT.

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(db): модель Rule"
```

---

### Task 2: Каталог метрик

Чистый модуль без зависимостей: одна константа, один тип, две функции доступа. Отдельным файлом, потому что на него смотрят и вычислитель, и контроллер (валидация ключа), и фронт (через ответ API).

**Files:**
- Create: `backend/src/rules/metric-catalog.ts`
- Test: `backend/src/rules/metric-catalog.spec.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `type MetricWindow = 'trade' | 'day'`
  - `type MetricUnit = 'pct' | 'x' | 'count'`
  - `interface MetricDef { key: string; window: MetricWindow; unit: MetricUnit; defaultOperator: 'lte' | 'gte'; defaultThreshold: number }`
  - `const METRICS: readonly MetricDef[]`
  - `metricByKey(key: string): MetricDef | undefined`

- [ ] **Step 1: Написать падающий тест**

Создать `backend/src/rules/metric-catalog.spec.ts`:

```ts
import { METRICS, metricByKey } from './metric-catalog';

describe('каталог метрик', () => {
  it('отдаёт метрику по ключу', () => {
    expect(metricByKey('planned_risk_pct')).toMatchObject({ window: 'trade', unit: 'pct' });
  });

  it('неизвестный ключ — undefined, а не исключение', () => {
    // Правило может ссылаться на метрику, исчезнувшую при откате версии кода.
    // Такое правило показывается выключенным, а не роняет экран.
    expect(metricByKey('нет такой')).toBeUndefined();
  });

  it('ключи уникальны', () => {
    const keys = METRICS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // Живые данные показали экспозицию до 412%: у фьючерсного трейдера номинал
  // кратно больше депозита. Порог по умолчанию в десятках процентов обесценил
  // бы метрику с первого экрана — человек увидел бы «нарушено везде».
  it('порог экспозиции по умолчанию учитывает торговлю с плечом', () => {
    expect(metricByKey('exposure_pct')!.defaultThreshold).toBeGreaterThanOrEqual(100);
  });

  it('каждая метрика объявляет окно, единицу и умолчания', () => {
    for (const m of METRICS) {
      expect(['trade', 'day']).toContain(m.window);
      expect(['pct', 'x', 'count']).toContain(m.unit);
      expect(['lte', 'gte']).toContain(m.defaultOperator);
      expect(Number.isFinite(m.defaultThreshold)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

```bash
npx jest src/rules/metric-catalog.spec.ts
```

Expected: FAIL — `Cannot find module './metric-catalog'`.

- [ ] **Step 3: Написать реализацию**

Создать `backend/src/rules/metric-catalog.ts`:

```ts
/**
 * Каталог метрик, по которым можно объявить правило.
 *
 * Константа в коде, а не таблица в базе: набор метрик меняется вместе с
 * формулами, которые их считают, и хранить его отдельно от кода значило бы
 * позволить базе ссылаться на формулу, которой больше нет.
 *
 * Подписи здесь не живут — они на фронте, в файлах локализации: одна и та же
 * метрика называется по-разному на двух языках, а бэкенд про язык не знает.
 */

export type MetricWindow = 'trade' | 'day';
export type MetricUnit = 'pct' | 'x' | 'count';

export interface MetricDef {
  key: string;
  /** Окно — свойство метрики, а не правила. Отсюда его нет в модели Rule. */
  window: MetricWindow;
  unit: MetricUnit;
  defaultOperator: 'lte' | 'gte';
  /** Подставляется в форму при выборе метрики — чтобы поле не было пустым. */
  defaultThreshold: number;
}

export const METRICS: readonly MetricDef[] = [
  /**
   * Номинал позиции к депозиту, не маржа. У фьючерсного трейдера это по сути
   * плечо, умноженное на сто: на живом аккаунте встречались значения за 400%.
   * Поэтому и умолчание в сотнях процентов — порог «50» показал бы нарушение
   * на каждой сделке и метрика умерла бы на первом экране.
   */
  { key: 'exposure_pct', window: 'trade', unit: 'pct', defaultOperator: 'lte', defaultThreshold: 200 },
  /**
   * Сколько потерял бы трейдер, сработай его стоп. Единственная метрика,
   * которая меряет намерение, а не размер, — и единственная, требующая стопа
   * на бирже. У кого стоп в голове, у того она пустая.
   */
  { key: 'planned_risk_pct', window: 'trade', unit: 'pct', defaultOperator: 'lte', defaultThreshold: 2 },
  { key: 'leverage', window: 'trade', unit: 'x', defaultOperator: 'lte', defaultThreshold: 5 },
  { key: 'trades_per_day', window: 'day', unit: 'count', defaultOperator: 'lte', defaultThreshold: 5 },
  { key: 'daily_loss_pct', window: 'day', unit: 'pct', defaultOperator: 'lte', defaultThreshold: 5 },
];

const BY_KEY = new Map(METRICS.map((m) => [m.key, m]));

/** undefined, а не исключение: правило может пережить исчезновение метрики. */
export function metricByKey(key: string): MetricDef | undefined {
  return BY_KEY.get(key);
}
```

- [ ] **Step 4: Запустить тесты и убедиться, что проходят**

```bash
npx jest src/rules/metric-catalog.spec.ts
```

Expected: PASS, 5 тестов.

- [ ] **Step 5: Commit**

```bash
git add backend/src/rules/metric-catalog.ts backend/src/rules/metric-catalog.spec.ts
git commit -m "feat(rules): каталог метрик"
```

---

### Task 3: Вычисление значений метрик

Отдельно от проверки порогов: значение метрики не зависит ни от одного правила, и смешивать «сколько получилось» с «нарушает ли это порог» значило бы пересчитывать первое при каждой правке второго.

**Files:**
- Create: `backend/src/rules/metric-values.ts`
- Test: `backend/src/rules/metric-values.spec.ts`

**Interfaces:**
- Consumes: `MetricDef` из Task 2.
- Produces:
  - `interface TradeRow { id: string; closedAt: Date; closedPnl: number; leverage: number | null; risk: { exposurePct: number | null; plannedRiskPct: number | null; ok: boolean; balanceAtEntry: number | null } | null }`
  - `interface MetricValue { subjectId: string; value: number | null }` — `subjectId` это `Trade.id` для окна `trade` и `YYYY-MM-DD` для окна `day`
  - `tradeMetricValues(metric: string, rows: TradeRow[]): MetricValue[]`
  - `dayMetricValues(metric: string, rows: TradeRow[], tzOffsetMin: number): MetricValue[]`
  - `localDayKey(at: Date, tzOffsetMin: number): string`

- [ ] **Step 1: Написать падающий тест**

Создать `backend/src/rules/metric-values.spec.ts`:

```ts
import { dayMetricValues, localDayKey, tradeMetricValues, type TradeRow } from './metric-values';

const row = (over: Partial<TradeRow> & { id: string }): TradeRow => ({
  closedAt: new Date('2026-08-01T12:00:00Z'),
  closedPnl: 0,
  leverage: null,
  risk: { exposurePct: 30, plannedRiskPct: 2, ok: true, balanceAtEntry: 1000 },
  ...over,
});

describe('tradeMetricValues', () => {
  it('берёт экспозицию из посчитанных метрик риска', () => {
    expect(tradeMetricValues('exposure_pct', [row({ id: 't1' })])).toEqual([
      { subjectId: 't1', value: 30 },
    ]);
  });

  // «Нет данных» и «ноль» — разные вещи. Ноль соблюдал бы любое правило,
  // и сделка без стопа тихо засчиталась бы в дисциплинированные.
  it('сделка без стопа даёт null, а не ноль', () => {
    const r = row({ id: 't1', risk: { exposurePct: 30, plannedRiskPct: null, ok: true, balanceAtEntry: 1000 } });
    expect(tradeMetricValues('planned_risk_pct', [r])).toEqual([{ subjectId: 't1', value: null }]);
  });

  it('сделка без посчитанного риска даёт null по любой метрике риска', () => {
    const r = row({ id: 't1', risk: null });
    expect(tradeMetricValues('exposure_pct', [r])).toEqual([{ subjectId: 't1', value: null }]);
  });

  it('риск с ok=false даёт null, даже если числа в строке есть', () => {
    const r = row({ id: 't1', risk: { exposurePct: 30, plannedRiskPct: 2, ok: false, balanceAtEntry: null } });
    expect(tradeMetricValues('exposure_pct', [r])).toEqual([{ subjectId: 't1', value: null }]);
  });

  it('плечо берётся из сделки, а не из метрик риска', () => {
    expect(tradeMetricValues('leverage', [row({ id: 't1', leverage: 10 })])).toEqual([
      { subjectId: 't1', value: 10 },
    ]);
  });

  it('биржа не отдала плечо — null', () => {
    expect(tradeMetricValues('leverage', [row({ id: 't1', leverage: null })])).toEqual([
      { subjectId: 't1', value: null },
    ]);
  });
});

describe('localDayKey', () => {
  // tzOffsetMin приходит из getTimezoneOffset(): для UTC+3 это -180.
  it('режет сутки по локальной зоне, а не по UTC', () => {
    expect(localDayKey(new Date('2026-08-01T22:30:00Z'), -180)).toBe('2026-08-02');
  });

  it('в UTC совпадает с календарной датой', () => {
    expect(localDayKey(new Date('2026-08-01T22:30:00Z'), 0)).toBe('2026-08-01');
  });
});

describe('dayMetricValues', () => {
  const day = (id: string, iso: string, pnl: number): TradeRow =>
    row({ id, closedAt: new Date(iso), closedPnl: pnl });

  it('считает число сделок за локальные сутки', () => {
    const rows = [
      day('t1', '2026-08-01T10:00:00Z', 0),
      day('t2', '2026-08-01T11:00:00Z', 0),
      day('t3', '2026-08-02T10:00:00Z', 0),
    ];
    expect(dayMetricValues('trades_per_day', rows, 0)).toEqual([
      { subjectId: '2026-08-01', value: 2 },
      { subjectId: '2026-08-02', value: 1 },
    ]);
  });

  // Убыток положительным числом: правило звучит «дневной убыток не больше 5%»,
  // и сравнивать порог с отрицательной величиной значило бы требовать от
  // пользователя думать про знак. Прибыльный день даёт 0, а не отрицание.
  it('дневной убыток считается от баланса на начало суток и подаётся положительным', () => {
    const rows = [
      day('t1', '2026-08-01T10:00:00Z', -30),
      day('t2', '2026-08-01T11:00:00Z', -20),
    ];
    expect(dayMetricValues('daily_loss_pct', rows, 0)).toEqual([
      { subjectId: '2026-08-01', value: 5 },
    ]);
  });

  it('прибыльный день даёт нулевой убыток, а не отрицательный', () => {
    const rows = [day('t1', '2026-08-01T10:00:00Z', 40)];
    expect(dayMetricValues('daily_loss_pct', rows, 0)).toEqual([
      { subjectId: '2026-08-01', value: 0 },
    ]);
  });

  // Баланс на начало суток берётся из первой сделки дня. Если он неизвестен,
  // день выпадает из проверки целиком — так же, как сделка без баланса.
  it('день без известного баланса даёт null', () => {
    const r = row({
      id: 't1',
      closedAt: new Date('2026-08-01T10:00:00Z'),
      closedPnl: -30,
      risk: { exposurePct: null, plannedRiskPct: null, ok: false, balanceAtEntry: null },
    });
    expect(dayMetricValues('daily_loss_pct', [r], 0)).toEqual([
      { subjectId: '2026-08-01', value: null },
    ]);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

```bash
npx jest src/rules/metric-values.spec.ts
```

Expected: FAIL — `Cannot find module './metric-values'`.

- [ ] **Step 3: Написать реализацию**

Создать `backend/src/rules/metric-values.ts`:

```ts
/**
 * Значения метрик — отдельно от проверки порогов.
 *
 * Значение не зависит ни от одного правила: «экспозиция этой сделки 30%» —
 * факт, а «30% нарушает ваш порог 20%» — суждение. Смешав их, пришлось бы
 * пересчитывать факты при каждой правке порога.
 */

export interface TradeRow {
  id: string;
  closedAt: Date;
  closedPnl: number;
  leverage: number | null;
  risk: {
    exposurePct: number | null;
    plannedRiskPct: number | null;
    ok: boolean;
    balanceAtEntry: number | null;
  } | null;
}

/** subjectId — Trade.id для окна сделки, YYYY-MM-DD для окна суток. */
export interface MetricValue {
  subjectId: string;
  value: number | null;
}

/**
 * Календарные сутки в зоне пользователя.
 *
 * tzOffsetMin приходит с фронта из getTimezoneOffset(), где знак обратный
 * привычному: для UTC+3 это -180. Отсюда вычитание, а не прибавление.
 */
export function localDayKey(at: Date, tzOffsetMin: number): string {
  return new Date(at.getTime() - tzOffsetMin * 60_000).toISOString().slice(0, 10);
}

/** Метрика риска доступна, только когда она посчитана и помечена как годная. */
function riskValue(row: TradeRow, pick: 'exposurePct' | 'plannedRiskPct'): number | null {
  if (!row.risk || !row.risk.ok) return null;
  return row.risk[pick];
}

export function tradeMetricValues(metric: string, rows: TradeRow[]): MetricValue[] {
  return rows.map((r) => {
    let value: number | null;
    switch (metric) {
      case 'exposure_pct':
        value = riskValue(r, 'exposurePct');
        break;
      case 'planned_risk_pct':
        value = riskValue(r, 'plannedRiskPct');
        break;
      case 'leverage':
        value = r.leverage;
        break;
      default:
        value = null;
    }
    return { subjectId: r.id, value };
  });
}

export function dayMetricValues(
  metric: string,
  rows: TradeRow[],
  tzOffsetMin: number,
): MetricValue[] {
  const byDay = new Map<string, TradeRow[]>();
  for (const r of rows) {
    const key = localDayKey(r.closedAt, tzOffsetMin);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(r);
    else byDay.set(key, [r]);
  }

  const days = [...byDay.keys()].sort();
  return days.map((day) => {
    const dayRows = byDay.get(day)!;
    if (metric === 'trades_per_day') return { subjectId: day, value: dayRows.length };

    if (metric === 'daily_loss_pct') {
      // Баланс на начало суток — тот, что был на входе в первую сделку дня.
      // Точнее взять неоткуда: снимки часовые, а сделки могут идти чаще.
      const first = [...dayRows].sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime())[0];
      const base = first.risk?.ok ? first.risk.balanceAtEntry : null;
      if (base === null || base === undefined || base <= 0) return { subjectId: day, value: null };
      const pnl = dayRows.reduce((s, r) => s + r.closedPnl, 0);
      // Убыток положительным числом: правило звучит «не больше 5%», и заставлять
      // пользователя думать про знак порога — лишняя работа на пустом месте.
      return { subjectId: day, value: pnl >= 0 ? 0 : (-pnl / base) * 100 };
    }

    return { subjectId: day, value: null };
  });
}
```

- [ ] **Step 4: Запустить тесты и убедиться, что проходят**

```bash
npx jest src/rules/metric-values.spec.ts
```

Expected: PASS, 12 тестов.

- [ ] **Step 5: Commit**

```bash
git add backend/src/rules/metric-values.ts backend/src/rules/metric-values.spec.ts
git commit -m "feat(rules): вычисление значений метрик"
```

---

### Task 4: Проверка соблюдения

**Files:**
- Create: `backend/src/rules/compliance.ts`
- Test: `backend/src/rules/compliance.spec.ts`

**Interfaces:**
- Consumes: `MetricValue` из Task 3.
- Produces:
  - `interface RuleSpec { metric: string; operator: 'lte' | 'gte'; threshold: number }`
  - `interface RuleCompliance { metric: string; operator: 'lte' | 'gte'; threshold: number; followed: number; violated: number; unchecked: number; violatingIds: string[] }`
  - `evaluate(rule: RuleSpec, values: MetricValue[]): RuleCompliance`

- [ ] **Step 1: Написать падающий тест**

Создать `backend/src/rules/compliance.spec.ts`:

```ts
import { evaluate } from './compliance';

const RULE = { metric: 'exposure_pct', operator: 'lte' as const, threshold: 100 };

describe('evaluate', () => {
  it('считает соблюдённые и нарушенные', () => {
    const res = evaluate(RULE, [
      { subjectId: 'a', value: 50 },
      { subjectId: 'b', value: 150 },
    ]);
    expect(res).toMatchObject({ followed: 1, violated: 1, unchecked: 0, violatingIds: ['b'] });
  });

  // Ровно порог — соблюдение. «Не больше 100» включает сто, иначе правило
  // означало бы «меньше ста», а пользователь объявлял не это.
  it('значение ровно на пороге соблюдает правило', () => {
    expect(evaluate(RULE, [{ subjectId: 'a', value: 100 }])).toMatchObject({
      followed: 1,
      violated: 0,
    });
  });

  // Главное свойство всей фичи: непроверенное не засчитывается ни туда, ни
  // сюда. Иначе продукт врал бы в приятную сторону, а доверие к декларации —
  // единственное, ради чего она нужна.
  it('значение null не идёт ни в числитель, ни в знаменатель', () => {
    const res = evaluate(RULE, [
      { subjectId: 'a', value: 50 },
      { subjectId: 'b', value: null },
    ]);
    expect(res).toMatchObject({ followed: 1, violated: 0, unchecked: 1 });
  });

  it('оператор gte разворачивает сравнение', () => {
    const res = evaluate({ metric: 'x', operator: 'gte', threshold: 10 }, [
      { subjectId: 'a', value: 5 },
      { subjectId: 'b', value: 15 },
    ]);
    expect(res).toMatchObject({ followed: 1, violated: 1, violatingIds: ['a'] });
  });

  it('пустой список — все счётчики нули, а не деление на ноль', () => {
    expect(evaluate(RULE, [])).toMatchObject({
      followed: 0,
      violated: 0,
      unchecked: 0,
      violatingIds: [],
    });
  });

  it('переносит условие правила в результат без изменений', () => {
    expect(evaluate(RULE, [])).toMatchObject({
      metric: 'exposure_pct',
      operator: 'lte',
      threshold: 100,
    });
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

```bash
npx jest src/rules/compliance.spec.ts
```

Expected: FAIL — `Cannot find module './compliance'`.

- [ ] **Step 3: Написать реализацию**

Создать `backend/src/rules/compliance.ts`:

```ts
import type { MetricValue } from './metric-values';

export interface RuleSpec {
  metric: string;
  operator: 'lte' | 'gte';
  threshold: number;
}

export interface RuleCompliance extends RuleSpec {
  followed: number;
  violated: number;
  /** Сколько субъектов не удалось проверить: нет стопа, неизвестен баланс. */
  unchecked: number;
  /** Trade.id или YYYY-MM-DD нарушивших — для отметок в журнале. */
  violatingIds: string[];
}

/**
 * Сверка значений с порогом.
 *
 * Субъект со значением null не считается ни соблюдением, ни нарушением: он
 * выпадает из обеих чаш и попадает в unchecked. Засчитать непроверенное как
 * соблюдение значило бы соврать в приятную сторону — а доверие к декларации
 * это единственное, ради чего она вообще нужна.
 *
 * Значение ровно на пороге соблюдает правило: «не больше ста» включает сто.
 */
export function evaluate(rule: RuleSpec, values: MetricValue[]): RuleCompliance {
  let followed = 0;
  let violated = 0;
  let unchecked = 0;
  const violatingIds: string[] = [];

  for (const v of values) {
    if (v.value === null || !Number.isFinite(v.value)) {
      unchecked += 1;
      continue;
    }
    const ok = rule.operator === 'lte' ? v.value <= rule.threshold : v.value >= rule.threshold;
    if (ok) {
      followed += 1;
    } else {
      violated += 1;
      violatingIds.push(v.subjectId);
    }
  }

  return { ...rule, followed, violated, unchecked, violatingIds };
}
```

- [ ] **Step 4: Запустить тесты и убедиться, что проходят**

```bash
npx jest src/rules/compliance.spec.ts
```

Expected: PASS, 6 тестов.

- [ ] **Step 5: Commit**

```bash
git add backend/src/rules/compliance.ts backend/src/rules/compliance.spec.ts
git commit -m "feat(rules): сверка значений с порогом"
```

---

### Task 5: Сервис, контроллер и модуль

**Files:**
- Create: `backend/src/rules/rules.service.ts`
- Create: `backend/src/rules/rules.controller.ts`
- Create: `backend/src/rules/dto/rules.dto.ts`
- Create: `backend/src/rules/rules.module.ts`
- Test: `backend/src/rules/rules.service.spec.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `METRICS`, `metricByKey` (Task 2); `tradeMetricValues`, `dayMetricValues`, `TradeRow` (Task 3); `evaluate` (Task 4); модель `Rule` (Task 1).
- Produces: HTTP-контракт, на который опирается фронт:
  - `GET /api/rules` → `{ metrics: MetricDef[]; rules: RuleRow[] }`, где `RuleRow = { id, metric, operator, threshold, active }`
  - `PUT /api/rules/:metric` тело `{ operator, threshold, active }` → `RuleRow` (создаёт или обновляет — одно правило на метрику)
  - `DELETE /api/rules/:metric` → `{ success: true }`
  - `GET /api/rules/compliance?days=&tz=` → `{ rules: (RuleCompliance & { window: MetricWindow })[] }`

Окно метрики добавляется к каждой строке соблюдения именно здесь, а не выводится фронтом из каталога. Иначе журналу сделок пришлось бы сшивать два независимых ответа, чтобы понять, какие нарушения вешать на строку, а какие относятся к суткам целиком.

- [ ] **Step 1: Написать падающий тест**

Создать `backend/src/rules/rules.service.spec.ts`:

```ts
import { RulesService } from './rules.service';

const DAY = 24 * 60 * 60 * 1000;

function serviceWith(opts: {
  rules?: { metric: string; operator: string; threshold: number; active: boolean }[];
  trades?: {
    id: string;
    closedAt: Date;
    closedPnl: number;
    leverage: number | null;
    risk: { exposurePct: number | null; plannedRiskPct: number | null; ok: boolean; balanceAtEntry: number | null } | null;
  }[];
}) {
  const prisma = {
    rule: { findMany: jest.fn().mockResolvedValue(opts.rules ?? []) },
    trade: { findMany: jest.fn().mockResolvedValue(opts.trades ?? []) },
  } as never;
  return new RulesService(prisma);
}

const trade = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  closedAt: new Date('2026-08-01T12:00:00Z'),
  closedPnl: 0,
  leverage: null,
  risk: { exposurePct: 50, plannedRiskPct: 1, ok: true, balanceAtEntry: 1000 },
  ...over,
});

describe('RulesService.compliance', () => {
  it('проверяет только активные правила', async () => {
    const service = serviceWith({
      rules: [
        { metric: 'exposure_pct', operator: 'lte', threshold: 100, active: true },
        { metric: 'leverage', operator: 'lte', threshold: 3, active: false },
      ],
      trades: [trade('t1')],
    });

    const res = await service.compliance('u1', 30, 0);
    expect(res.rules).toHaveLength(1);
    expect(res.rules[0]).toMatchObject({ metric: 'exposure_pct', followed: 1 });
  });

  // Правило может пережить исчезновение метрики при откате версии кода.
  // Экран соблюдения от этого падать не должен.
  it('правило с неизвестной метрикой пропускается, а не роняет ответ', async () => {
    const service = serviceWith({
      rules: [{ metric: 'нет такой', operator: 'lte', threshold: 1, active: true }],
      trades: [trade('t1')],
    });

    await expect(service.compliance('u1', 30, 0)).resolves.toMatchObject({ rules: [] });
  });

  it('дневная метрика группирует сделки по локальным суткам', async () => {
    const service = serviceWith({
      rules: [{ metric: 'trades_per_day', operator: 'lte', threshold: 1, active: true }],
      trades: [
        trade('t1', { closedAt: new Date('2026-08-01T10:00:00Z') }),
        trade('t2', { closedAt: new Date('2026-08-01T11:00:00Z') }),
        trade('t3', { closedAt: new Date('2026-08-02T10:00:00Z') }),
      ],
    });

    const res = await service.compliance('u1', 30, 0);
    // Первые сутки нарушают (2 > 1), вторые соблюдают.
    expect(res.rules[0]).toMatchObject({ followed: 1, violated: 1, violatingIds: ['2026-08-01'] });
  });

  it('без правил отдаёт пустой список, а не ошибку', async () => {
    const service = serviceWith({ rules: [], trades: [trade('t1')] });
    await expect(service.compliance('u1', 30, 0)).resolves.toEqual({ rules: [] });
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

```bash
npx jest src/rules/rules.service.spec.ts
```

Expected: FAIL — `Cannot find module './rules.service'`.

- [ ] **Step 3: Написать сервис**

Создать `backend/src/rules/rules.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { METRICS, metricByKey, type MetricWindow } from './metric-catalog';
import { dayMetricValues, tradeMetricValues, type TradeRow } from './metric-values';
import { evaluate, type RuleCompliance } from './compliance';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ComplianceRow extends RuleCompliance {
  window: MetricWindow;
}

@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Каталог метрик едет вместе со списком правил, а не отдельным запросом:
   * форма объявления без него всё равно не рисуется, а два запроса дали бы
   * состояние, где список уже есть, а из чего выбирать — ещё нет.
   */
  async list(userId: string) {
    const rules = await this.prisma.rule.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, metric: true, operator: true, threshold: true, active: true },
    });
    return { metrics: METRICS, rules };
  }

  async upsert(
    userId: string,
    metric: string,
    dto: { operator: 'lte' | 'gte'; threshold: number; active?: boolean },
  ) {
    if (!metricByKey(metric)) {
      throw new BadRequestException({ code: 'RULE_UNKNOWN_METRIC', message: `Unknown metric: ${metric}` });
    }
    return this.prisma.rule.upsert({
      where: { userId_metric: { userId, metric } },
      create: { userId, metric, operator: dto.operator, threshold: dto.threshold, active: dto.active ?? true },
      update: { operator: dto.operator, threshold: dto.threshold, active: dto.active ?? true },
      select: { id: true, metric: true, operator: true, threshold: true, active: true },
    });
  }

  /**
   * deleteMany, а не delete: удаление правила, которого нет, — не ошибка.
   * Пользователь мог нажать «удалить» дважды или в двух вкладках, и отвечать
   * на это пятисоткой не за что.
   */
  async remove(userId: string, metric: string) {
    await this.prisma.rule.deleteMany({ where: { userId, metric } });
    return { success: true };
  }

  async compliance(
    userId: string,
    days: number,
    tzOffsetMin: number,
  ): Promise<{ rules: ComplianceRow[] }> {
    const rules = await this.prisma.rule.findMany({
      where: { userId, active: true },
      orderBy: { createdAt: 'asc' },
      select: { metric: true, operator: true, threshold: true },
    });
    if (rules.length === 0) return { rules: [] };

    // days = 0 означает «вся история» — та же конвенция, что у остальных
    // запросов статистики в проекте.
    const since = days > 0 ? new Date(Date.now() - days * DAY_MS) : undefined;
    const trades = (await this.prisma.trade.findMany({
      where: { userId, ...(since ? { closedAt: { gte: since } } : {}) },
      orderBy: { closedAt: 'asc' },
      select: {
        id: true,
        closedAt: true,
        closedPnl: true,
        leverage: true,
        risk: {
          select: { exposurePct: true, plannedRiskPct: true, ok: true, balanceAtEntry: true },
        },
      },
    })) as unknown as TradeRow[];

    const out: ComplianceRow[] = [];
    for (const r of rules) {
      const def = metricByKey(r.metric);
      // Правило переживает исчезновение своей метрики при откате версии кода.
      // Ронять из-за этого весь экран соблюдения нельзя: пользователь потерял
      // бы заодно и остальные правила, которые считаются прекрасно.
      if (!def) continue;

      const spec = { metric: r.metric, operator: r.operator as 'lte' | 'gte', threshold: r.threshold };
      const values =
        def.window === 'trade'
          ? tradeMetricValues(r.metric, trades)
          : dayMetricValues(r.metric, trades, tzOffsetMin);
      out.push({ ...evaluate(spec, values), window: def.window });
    }
    return { rules: out };
  }
}
```

- [ ] **Step 4: Написать DTO и контроллер**

`backend/src/rules/dto/rules.dto.ts` — `UpsertRuleDto` с `operator: 'lte' | 'gte'`, `threshold: number`, `active?: boolean`. Валидация как в соседних DTO проекта (посмотреть `backend/src/tags/dto/tags.dto.ts` и повторить приём).

`backend/src/rules/rules.controller.ts` — по образцу `tags.controller.ts`: `@UseGuards(JwtAuthGuard)`, `@Controller('api/rules')`, `@CurrentUser('userId')`. Четыре маршрута из блока Interfaces.

Ошибка неизвестной метрики бросается с кодом, а не только текстом — на фронте коды переводятся (`resolveApiError`). Посмотреть, как это сделано в `backend/src/auth/auth.service.ts`, и повторить: код `RULE_UNKNOWN_METRIC`.

- [ ] **Step 5: Написать модуль и подключить**

`backend/src/rules/rules.module.ts`: `PrismaModule` не импортировать (он `@Global`), объявить `RulesService` в `providers`, контроллер в `controllers`, сервис в `exports`.

В `backend/src/app.module.ts` добавить `RulesModule` в `imports` после `TagsModule`.

- [ ] **Step 6: Запустить тесты и собрать**

```bash
npx jest src/rules
npm run build
```

Expected: все тесты модуля проходят, сборка возвращает 0.

- [ ] **Step 7: Commit**

```bash
git add backend/src/rules backend/src/app.module.ts
git commit -m "feat(rules): сервис, контроллер и модуль"
```

---

### Task 6: Локализация и слой API на фронте

Ключи и хуки — одной задачей, потому что порознь ни то, ни другое не проверить: хук без ключей нечем отрисовать, ключи без хука не на что повесить.

**Files:**
- Modify: `frontend/src/shared/i18n/messages/ru.json`
- Modify: `frontend/src/shared/i18n/messages/en.json`
- Create: `frontend/src/features/rules/api/hooks.ts`
- Create: `frontend/src/features/rules/index.ts`

**Interfaces:**
- Consumes: HTTP-контракт из Task 5.
- Produces:
  - `useRules()` → `{ metrics, rules }`
  - `useUpsertRule()`, `useDeleteRule()` — мутации, инвалидирующие `['rules']` и `['rulesCompliance']`
  - `useCompliance(days: number)` → `{ rules: RuleCompliance[] }`
  - типы `MetricDef`, `RuleRow`, `RuleCompliance`

- [ ] **Step 1: Добавить ключи локализации**

Новый верхнеуровневый ключ `rules` в ОБА файла — `ru.json` и `en.json`. Английский файл без ключа роняет страницу при переключении языка, поэтому добавляются они вместе, а не «потом».

В `ru.json`:

```json
  "rules": {
    "settingsTitle": "Правила",
    "settingsLede": "Объявите числовое правило — сервис сверит его по вашим сделкам.",
    "overviewTitle": "Соблюдение правил",
    "metricLabel": "Показатель",
    "operatorLabel": "Условие",
    "thresholdLabel": "Порог",
    "opLte": "не больше",
    "opGte": "не меньше",
    "add": "Добавить правило",
    "save": "Сохранить",
    "remove": "Удалить",
    "unitPct": "%",
    "unitX": "x",
    "unitCount": "шт",
    "metricExposurePct": "Номинал позиции к депозиту",
    "metricExposurePctHint": "Сколько денег в рынке относительно депозита. С плечом бывает в разы больше 100%.",
    "metricPlannedRiskPct": "Плановый риск по стопу",
    "metricPlannedRiskPctHint": "Сколько потеряете, если сработает стоп. Считается только у сделок со стопом на бирже.",
    "metricLeverage": "Плечо",
    "metricLeverageHint": "Плечо позиции, как его отдала биржа.",
    "metricTradesPerDay": "Сделок в день",
    "metricTradesPerDayHint": "Число закрытых сделок за календарные сутки.",
    "metricDailyLossPct": "Дневной убыток",
    "metricDailyLossPctHint": "Убыток за сутки в процентах от депозита на начало дня.",
    "followed": "Соблюдено {followed} из {total}",
    "unchecked": "Ещё {count} не проверялись",
    "uncheckedWhy": "Нет стопа или неизвестен баланс на момент входа",
    "noRules": "Правил пока нет",
    "noRulesLede": "Правило — это то, что вы обещали себе соблюдать. Объявите его, и сервис покажет, насколько получается.",
    "noTradesInPeriod": "За период нет сделок, которые можно проверить",
    "unknownMetric": "Показатель больше не поддерживается",
    "violated": "{metric} {value} при вашем пороге {threshold}"
  }
```

В `en.json` — те же ключи с английскими значениями. Английский файл без ключа роняет страницу при переключении языка, поэтому оба файла правятся в этом шаге, а не «потом».

Две подписи несут смысл, который нельзя потерять при переводе:

- `metricExposurePct` — **«номинал позиции к депозиту»**, не «доля депозита». На живом аккаунте метрика доходит до 412%, и слово «доля» прямо вводит в заблуждение.
- `metricPlannedRiskPctHint` обязан упоминать стоп на бирже, иначе непонятно, почему у большинства сделок метрика пуста.

Код ошибки `RULE_UNKNOWN_METRIC` добавить в существующий словарь `errors` рядом с прочими кодами бэкенда.

- [ ] **Step 2: Написать хуки**

`frontend/src/features/rules/api/hooks.ts` — по образцу `frontend/src/views/settings/api/hooks.ts`: `'use client'`, `useQuery`/`useMutation` из TanStack Query, `apiJson` из `@/shared/api/http`.

`useCompliance(days)` шлёт `days` и `tz`, как это делает `useTimeStats` в `frontend/src/entities/trade/api/hooks.ts`:

```ts
        days: days || undefined,
        // Сутки режутся по локальным часам пользователя, не по серверным.
        tz: new Date().getTimezoneOffset(),
```

Мутации инвалидируют оба ключа: правка порога меняет и список правил, и картину соблюдения.

`frontend/src/features/rules/index.ts` — реэкспорт публичного API фичи.

- [ ] **Step 3: Проверить типы и сборку**

Из `frontend/`:

```bash
npx tsc --noEmit
npx next build
```

Expected: оба проходят. `next build` обязателен: `tsc` не ловит поломки роутинга, а именно они в этом проекте и случались.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/shared/i18n/messages frontend/src/features/rules
git commit -m "feat(rules): локализация и слой API"
```

---

### Task 7: Секция «Правила» в настройках

**Files:**
- Create: `frontend/src/views/settings/components/RulesSection.tsx`
- Modify: `frontend/src/views/settings/Page.tsx`

**Interfaces:**
- Consumes: `useRules`, `useUpsertRule`, `useDeleteRule` (Task 6).
- Produces: ничего для других задач.

- [ ] **Step 1: Написать компонент**

`RulesSection.tsx` — секция под блоком бирж на странице настроек.

Состав:
- `SectionHead` с заголовком и лидом.
- Список объявленных правил: на каждое — подпись метрики, оператор, порог с единицей, переключатель активности и удаление. Строка собирается из `KeyValue` или `LedgerTable`, смотря что ближе по виду к соседям на странице; сырой разметки не заводить.
- Форма добавления: `Field` + `Select` для метрики (только те, на которые правила ещё нет), `Seg` для оператора, `Input` для порога, `Button` для сохранения.
- При выборе метрики порог и оператор подставляются из `defaultThreshold` и `defaultOperator` каталога — поле не должно быть пустым.
- `EmptyState`, когда правил нет: не просто «пусто», а зачем они нужны.
- `Skeleton` на время загрузки, `ErrorNote` на ошибку.
- **Правило, чьей метрики нет в каталоге** (`metrics` из того же ответа не содержит его `metric`), показывается в списке выключенным с подписью `rules.unknownMetric` и кнопкой удаления. Проверка соблюдения его молча пропускает, и если бы список тоже молчал, правило исчезло бы из интерфейса, продолжая лежать в базе, — человек не понял бы, куда оно делось, и не смог бы его убрать.

Комментарий к подстановке умолчаний:

```tsx
  // Порог подставляется из каталога, а не остаётся пустым: у метрик разный
  // масштаб (проценты депозита, разы плеча, штуки сделок), и пустое поле
  // заставило бы человека угадывать порядок величины до первого результата.
```

- [ ] **Step 2: Встроить в страницу**

В `frontend/src/views/settings/Page.tsx` отрисовать `<RulesSection />` после блока с биржами, внутри того же `Wrap page`. Секция не должна зависеть от состояния подключения биржи: правило можно объявить до первой сделки, и запрещать это незачем.

- [ ] **Step 3: Проверить**

Из `frontend/`:

```bash
npx tsc --noEmit
npx next build
```

Expected: оба проходят.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/settings
git commit -m "feat(rules): секция правил в настройках"
```

---

### Task 8: Блок соблюдения на Обзоре

**Files:**
- Create: `frontend/src/views/overview/components/RuleCompliance.tsx`
- Modify: `frontend/src/views/overview/Page.tsx`

**Interfaces:**
- Consumes: `useCompliance` (Task 6); `usePeriodFilter().effectiveDays` (существует).
- Produces: ничего для других задач.

- [ ] **Step 1: Написать компонент**

`RuleCompliance.tsx` — блок за выбранный на странице период.

На каждое активное правило показать: подпись метрики, условие с порогом, долю соблюдения (`followed` из `followed + violated`) и — обязательно рядом — число `unchecked`.

**Число непроверенных не прячется ни при каких условиях.** Доля «39 из 50» рядом с молчанием о том, что ещё 12 сделок вообще не проверялись, — это ровно то враньё в приятную сторону, против которого вся фича и построена.

Пустое состояние: правил нет — `EmptyState` со ссылкой на настройки. Правила есть, но сделок за период нет — отдельная строка, а не нулевая доля: ноль из нуля это не «плохо соблюдал».

Цвета — классами `.pos` / `.neg` / `.muted` из `globals.css`, не инлайновым `style`.

- [ ] **Step 2: Встроить в страницу**

В `frontend/src/views/overview/Page.tsx` отрисовать `<RuleCompliance days={period.effectiveDays} />` после `SummaryStrip` и до графика эквити: соблюдение правил — про поведение, и оно должно попадаться на глаза раньше, чем кривая доходности.

- [ ] **Step 3: Проверить**

```bash
npx tsc --noEmit
npx next build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/overview
git commit -m "feat(rules): блок соблюдения на Обзоре"
```

---

### Task 9: Отметка нарушений в журнале сделок

**Files:**
- Modify: `frontend/src/widgets/trades-table/TradesTable.tsx`
- Modify: `frontend/src/views/overview/Page.tsx` (проброс данных)

**Interfaces:**
- Consumes: `useCompliance` (Task 6) — `violatingIds` каждого правила.
- Produces: ничего.

- [ ] **Step 1: Построить отображение «сделка → нарушенные правила»**

В `Page.tsx` из уже загруженного ответа `useCompliance` собрать `Map<tradeId, RuleCompliance[]>`, пройдя `violatingIds` правил с окном `trade`. Дневные правила в журнал не идут: их субъект — сутки, а не сделка, и вешать дневное нарушение на каждую сделку дня значило бы посчитать его пять раз.

Второго запроса не заводить: блок соблюдения на той же странице уже держит эти данные.

- [ ] **Step 2: Показать отметку в раскрытой строке**

В `TradesTable.tsx` принять необязательный проп с этим отображением и в раскрытой строке показать список нарушенных правил с фактическим значением и порогом — «экспозиция 412% при вашем пороге 200%».

Проп необязательный: таблица используется не только на Обзоре, и на других страницах отметок не будет.

- [ ] **Step 3: Проверить**

```bash
npx tsc --noEmit
npx next build
```

- [ ] **Step 4: Прогнать весь набор тестов бэкенда**

Из `backend/`:

```bash
npx jest
```

Expected: все тесты проходят, включая существовавшие до этого плана.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(rules): отметка нарушений в журнале"
```

---

## Что этот план сознательно не делает

- **Не показывает цену нарушений в долларах.** Это была бы сумма PnL нарушивших сделок, а `HabitsService` в этом же коде объясняет, почему так нельзя: у убыточного счёта убыточен любой срез, и число выйдет убедительным и бессмысленным. Правильный ответ уже написан — контрфактуал с перестановочным тестом в «Цене привычек».
- **Не шлёт Telegram-предупреждений в момент нарушения.** Обсуждалось и отложено. Шов оставлен: расчёт метрики на открытой позиции отличается от закрытой только источником `qty` и цены входа.
- **Не читает историю транзакций с биржи.** Вводы и выводы по-прежнему выводятся из расхождения якорей.
- **Не даёт больше одного правила на метрику.** Ограничение в схеме, снимается миграцией, если когда-нибудь понадобится диапазон.

---

## Остаточные замечания после исполнения

План выполнен целиком. Ниже — то, что ревью сочло несущественным для слияния.

- **Единица измерения метрики продублирована на фронте.** `frontend/src/features/rules/lib/metric-labels.ts`
  держит карту «метрика → единица», хотя бэкенд отдаёт `unit` в каталоге метрик. Просьба брать её с
  бэкенда была выполнена не буквально: исполнитель централизовал хардкод в один покрытый тестом
  модуль вместо трёх разъехавшихся копий. Ревью оценило как приемлемый компромисс низкой
  серьёзности — карта «метрика → ключ локализации» на фронте нужна в любом случае, потому что
  подписей бэкенд не хранит намеренно, и единица едет рядом с ней. Синхронизация при этом ручная.
- **`{value} {unit}` даёт «412 %» с пробелом перед процентом.** Для «шт» и «x» пробел уместен, для
  процента типографически спорно. Ключ `rules.violated` в обоих языковых файлах.
- **В `en.json` блок `errors` переставлен** относительно прежнего порядка — шум в диффе, потерь
  ключей нет (проверено пофайловой сверкой: 343 → 376 ключей, ни один не исчез).

## Урок, который стоит унести из исполнения

Дефект с регистром ключей метрик — snake_case на бэкенде против camelCase на фронте — пережил
**девять поштучных ревью** и был пойман только финальным ревью всей ветки. Причина в том, что
каждое ревью смотрело свой дифф и ни разу не пересекало границу бэкенд/фронт, а типы `Record<string,
string>` принимают любой ключ, поэтому ни `tsc`, ни сборка, ни тесты дефекта не видели. Четыре
метрики из пяти показывали пользователю сырой ключ вместо подписи.

Вывод для следующих планов: контракт между слоями надо покрывать тестом, который сверяет реальные
значения, а не типы. Такой тест теперь есть — `frontend/src/features/rules/lib/metric-labels.test.ts`.
