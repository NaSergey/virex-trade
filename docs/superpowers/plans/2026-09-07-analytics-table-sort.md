# Сортировка таблицы «Подходящие сделки» на Аналитике — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** На странице Аналитики таблица «Подходящие сделки» получает сортировку кликом
по заголовку — «Закрыта», «Вход», «Диапазон входа», «P&L» — с сортировкой полного списка
из 200 сделок до нарезки на листы, а не после.

**Architecture:** Чистая функция `sortTrades` в `widgets/trades-table` сортирует массив
сделок вне React; `AnalyticsPage` держит состояние сортировки и вызывает её перед
`.slice()` на лист; `TradesTable` становится управляемой извне (принимает `sort`/`onSort`,
сама не сортирует) — на Обзоре, где эти пропсы не передаются, поведение не меняется.

**Tech Stack:** Next.js App Router + FSD (frontend), vitest для юнит-теста чистой функции.

## Global Constraints

- Весь пользовательский текст и комментарии в коде — на русском (код, имена файлов,
  импорты — как принято в проекте, латиницей).
- Сортируемые колонки — только числовые (тот же принцип, что в `AllTags`). Символ,
  направление, теги сортировку не получают.
- `sortKey` на колонке `TradesTable` выставляется только когда передан `onSort` —
  `LedgerTable` красит заголовок курсором-указателем по одному факту наличия `sortKey`,
  независимо от `onSort`, и без этого условия заголовки на Обзоре выглядели бы
  кликабельными, ничего не делая по клику.
- Первый клик по колонке — сортировка по убыванию, повторный клик по той же — переворот.
  Сделки без значения нужного поля (нет `openedAt`, нет диапазона этого таймфрейма) при
  сортировке по этому полю всегда уходят в конец списка, независимо от направления.
- Сортировка не сбрасывается сменой условий фильтра; лист сбрасывается на первый и при
  смене условий, и при смене сортировки.
- Тесты фронтенда — vitest, файл `*.test.ts` рядом с тестируемым модулем (см.
  `shared/lib/utils/range.test.ts`). Компоненты React тестами не покрываются — в проекте
  так не принято ни для одной фичи; финальная проверка — `npx next build`.
- Коммиты — каждая задача заканчивается отдельным коммитом. Сообщение коммита
  заканчивается строкой:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  ```

---

## Task 1: `tradeMetrics.ts` — вынести `rangeOf` и `holdMinutes`

**Files:**
- Create: `frontend/src/widgets/trades-table/tradeMetrics.ts`
- Modify: `frontend/src/widgets/trades-table/TradesTable.tsx`

**Interfaces:**
- Produces: `rangeOf(trade: Trade, tf: RangeTf): number | null`, `holdMinutes(openedAt:
  string | null, closedAt: string): number | null` — использует Task 2 (`sortTrades`) и
  сама `TradesTable.tsx` (рендер колонок «Диапазон» и «В позиции»).

- [ ] **Step 1: Создать `tradeMetrics.ts`**

Создать `frontend/src/widgets/trades-table/tradeMetrics.ts`:

```ts
import type { RangeTf, Trade } from '@/entities/trade';

/** Колонка снимка, в которой лежит диапазон входа этого ТФ. */
const RANGE_FIELD: Record<RangeTf, keyof NonNullable<Trade['context']>> = {
  '15m': 'rangePos15m',
  '30m': 'rangePos30m',
  '1h': 'rangePos1h',
  '4h': 'rangePos4h',
  '1d': 'rangePos1d',
};

/** Диапазон входа того ТФ, по которому сейчас смотрят. */
export function rangeOf(trade: Trade, tf: RangeTf): number | null {
  const v = trade.context?.[RANGE_FIELD[tf]];
  return typeof v === 'number' ? v : null;
}

/**
 * Сколько сделка держалась, в минутах. Основа и для подписи в таблице
 * (`fmtHold`), и для сортировки колонки «В позиции» (`sortTrades`) — одна
 * формула вместо двух копий, которые могли бы разойтись.
 */
export function holdMinutes(openedAt: string | null, closedAt: string): number | null {
  if (!openedAt) return null;
  const min = Math.round((new Date(closedAt).getTime() - new Date(openedAt).getTime()) / 60_000);
  return Number.isFinite(min) && min >= 0 ? min : null;
}
```

- [ ] **Step 2: Убрать дублирующийся код из `TradesTable.tsx`**

В `frontend/src/widgets/trades-table/TradesTable.tsx` заменить:

```ts
import { useTranslations } from 'next-intl';
import type { RangeTf, Trade } from '@/entities/trade';
import { Tags } from '@/entities/tag';
import { Button } from '@/shared/ui/Button';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Money } from '@/shared/ui/Money';
import { TradeOrders } from './TradeOrders';
import { formatPriceGrouped, formatQty, durationUnitLabels } from '@/shared/lib/utils/format';
import { formatRangePos } from '@/shared/lib/utils/range';
import { useLocaleControl } from '@/shared/i18n';

/** «28 июл 11:42» — день с месяцем словом, как в записи журнала. */
function fmtClosed(iso: string, locale: string): string {
  return new Date(iso)
    .toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .replace('.', '');
}

/** Сколько сделка держалась — от входа до закрытия. */
function fmtHold(openedAt: string | null, closedAt: string, units: { d: string; h: string; m: string }): string {
  if (!openedAt) return '—';
  const min = Math.round((new Date(closedAt).getTime() - new Date(openedAt).getTime()) / 60_000);
  if (!Number.isFinite(min) || min < 0) return '—';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = String(min % 60).padStart(2, '0');
  if (d > 0) return `${d} ${units.d} ${h} ${units.h} ${m} ${units.m}`;
  return h > 0 ? `${h} ${units.h} ${m} ${units.m}` : `${min} ${units.m}`;
}

/** Колонка снимка, в которой лежит диапазон входа этого ТФ. */
const RANGE_FIELD: Record<RangeTf, keyof NonNullable<Trade['context']>> = {
  '15m': 'rangePos15m',
  '30m': 'rangePos30m',
  '1h': 'rangePos1h',
  '4h': 'rangePos4h',
  '1d': 'rangePos1d',
};

/** Диапазон входа того ТФ, по которому сейчас смотрят. */
function rangeOf(trade: Trade, tf: RangeTf): number | null {
  const v = trade.context?.[RANGE_FIELD[tf]];
  return typeof v === 'number' ? v : null;
}
```

на:

```ts
import { useTranslations } from 'next-intl';
import type { Trade } from '@/entities/trade';
import { Tags } from '@/entities/tag';
import { Button } from '@/shared/ui/Button';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Money } from '@/shared/ui/Money';
import { TradeOrders } from './TradeOrders';
import { formatPriceGrouped, formatQty, durationUnitLabels } from '@/shared/lib/utils/format';
import { formatRangePos } from '@/shared/lib/utils/range';
import { useLocaleControl } from '@/shared/i18n';
import { holdMinutes, rangeOf } from './tradeMetrics';

/** «28 июл 11:42» — день с месяцем словом, как в записи журнала. */
function fmtClosed(iso: string, locale: string): string {
  return new Date(iso)
    .toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    .replace('.', '');
}

/** Сколько сделка держалась — от входа до закрытия. */
function fmtHold(openedAt: string | null, closedAt: string, units: { d: string; h: string; m: string }): string {
  const min = holdMinutes(openedAt, closedAt);
  if (min == null) return '—';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = String(min % 60).padStart(2, '0');
  if (d > 0) return `${d} ${units.d} ${h} ${units.h} ${m} ${units.m}`;
  return h > 0 ? `${h} ${units.h} ${m} ${units.m}` : `${min} ${units.m}`;
}
```

`RangeColumn` (интерфейс чуть ниже в том же файле) не трогать — он остаётся в
`TradesTable.tsx`, `tf`/`label` нужны только тут, для пропсов.

- [ ] **Step 3: Проверить типы**

```bash
cd frontend && npx tsc --noEmit -p tsconfig.json
```

Ожидаемо: без ошибок. `RangeTf` больше не используется в `TradesTable.tsx` напрямую —
если tsc пожалуется на неиспользуемый импорт где-то ещё, это значит Step 2 применён не
полностью; сверить с блоком «на:» выше.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/widgets/trades-table/tradeMetrics.ts frontend/src/widgets/trades-table/TradesTable.tsx
git commit -m "refactor(trades-table): вынести rangeOf и holdMinutes в tradeMetrics.ts

Подготовка к сортировке (Task 2): holdMinutes нужен и подписи «В позиции»,
и будущей сортировке той же колонки — одна формула вместо двух копий.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `sortTrades` — чистая функция сортировки

**Files:**
- Create: `frontend/src/widgets/trades-table/sortTrades.ts`
- Test: `frontend/src/widgets/trades-table/sortTrades.test.ts`
- Modify: `frontend/src/widgets/trades-table/index.ts`

**Interfaces:**
- Consumes: `rangeOf`, `holdMinutes` из `./tradeMetrics` (Task 1); `Trade`, `RangeTf` из
  `@/entities/trade`; `LedgerSort` из `@/shared/ui/LedgerTable`.
- Produces: `sortTrades(trades: Trade[], sort: LedgerSort, rangeTf?: RangeTf): Trade[]` —
  использует Task 4 (`AnalyticsPage`).

- [ ] **Step 1: Написать падающий тест**

Создать `frontend/src/widgets/trades-table/sortTrades.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Trade } from '@/entities/trade';
import { sortTrades } from './sortTrades';

const trade = (over: Partial<Trade> = {}): Trade => ({
  id: over.id ?? 't1',
  symbol: 'BTCUSDT',
  side: 'Buy',
  direction: 'long',
  qty: 1,
  avgEntryPrice: 100,
  avgExitPrice: 110,
  closedPnl: 10,
  openFee: 0,
  closeFee: 0,
  leverage: null,
  orderId: 'o1',
  closedAt: '2026-01-01T00:00:00.000Z',
  openedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  parts: 1,
  ...over,
});

describe('sortTrades', () => {
  it('сортирует по closedAt: по умолчанию новые сверху', () => {
    const older = trade({ id: 'a', closedAt: '2026-01-01T00:00:00.000Z' });
    const newer = trade({ id: 'b', closedAt: '2026-01-02T00:00:00.000Z' });
    const result = sortTrades([older, newer], { key: 'closedAt', dir: -1 });
    expect(result.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('переворачивает направление', () => {
    const older = trade({ id: 'a', closedAt: '2026-01-01T00:00:00.000Z' });
    const newer = trade({ id: 'b', closedAt: '2026-01-02T00:00:00.000Z' });
    const result = sortTrades([older, newer], { key: 'closedAt', dir: 1 });
    expect(result.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('сортирует по pnl', () => {
    const small = trade({ id: 'a', closedPnl: 5 });
    const big = trade({ id: 'b', closedPnl: 50 });
    const result = sortTrades([small, big], { key: 'pnl', dir: -1 });
    expect(result.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('сортирует по entry', () => {
    const low = trade({ id: 'a', avgEntryPrice: 90 });
    const high = trade({ id: 'b', avgEntryPrice: 110 });
    const result = sortTrades([low, high], { key: 'entry', dir: -1 });
    expect(result.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('сделки без openedAt уходят в конец при сортировке по hold, независимо от направления', () => {
    const withHold = trade({ id: 'a', openedAt: '2026-01-01T00:00:00.000Z', closedAt: '2026-01-01T01:00:00.000Z' });
    const noHold = trade({ id: 'b', openedAt: null });
    expect(sortTrades([noHold, withHold], { key: 'hold', dir: -1 }).map((t) => t.id)).toEqual(['a', 'b']);
    expect(sortTrades([noHold, withHold], { key: 'hold', dir: 1 }).map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('сделки без диапазона нужного ТФ уходят в конец при сортировке по range', () => {
    const withRange = trade({ id: 'a', context: { ok: true, atrPct: null, volRel: null, ema200Above: null, trend4h: null, rangePos15m: null, rangePos30m: null, rangePos1h: 42, rangePos4h: null, rangePos1d: null, entryQuality: null, exitQuality: null } });
    const noRange = trade({ id: 'b', context: null });
    expect(sortTrades([noRange, withRange], { key: 'range', dir: -1 }, '1h').map((t) => t.id)).toEqual(['a', 'b']);
    expect(sortTrades([noRange, withRange], { key: 'range', dir: 1 }, '1h').map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('неизвестный ключ сортировки возвращает исходный порядок', () => {
    const a = trade({ id: 'a' });
    const b = trade({ id: 'b' });
    expect(sortTrades([a, b], { key: 'symbol', dir: -1 }).map((t) => t.id)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Запустить тест, убедиться, что падает**

```bash
cd frontend && npx vitest run src/widgets/trades-table/sortTrades.test.ts
```

Ожидаемо: FAIL — `Cannot find module './sortTrades'` (файла ещё нет).

- [ ] **Step 3: Реализовать `sortTrades`**

Создать `frontend/src/widgets/trades-table/sortTrades.ts`:

```ts
import type { RangeTf, Trade } from '@/entities/trade';
import type { LedgerSort } from '@/shared/ui/LedgerTable';
import { holdMinutes, rangeOf } from './tradeMetrics';

/**
 * Значение сделки для каждого сортируемого ключа — только числа, как и
 * сортируемые колонки во всех таблицах продукта (см. AllTags). closedAt
 * сравнивается меткой времени, а не строкой ISO: строки с разными часовыми
 * поясами так не отсортировать корректно.
 */
function valueOf(key: string, tr: Trade, rangeTf?: RangeTf): number | null {
  switch (key) {
    case 'closedAt':
      return new Date(tr.closedAt).getTime();
    case 'entry':
      return tr.avgEntryPrice;
    case 'exit':
      return tr.avgExitPrice;
    case 'qty':
      return tr.qty * tr.avgEntryPrice;
    case 'hold':
      return holdMinutes(tr.openedAt, tr.closedAt);
    case 'pnl':
      return tr.closedPnl;
    case 'range':
      return rangeTf ? rangeOf(tr, rangeTf) : null;
    default:
      return null;
  }
}

/**
 * Сортировка журнала сделок для таблиц, которые сами режут список на листы
 * (см. AnalyticsPage): сортировать нужно ДО пагинации, иначе клик по колонке
 * переставляет местами только тридцать строк текущего листа, а следующий лист
 * остаётся в прежнем порядке.
 *
 * Пропуски (нет времени открытия, нет диапазона этого ТФ) всегда уходят в
 * конец списка независимо от направления — иначе сортировка по «Диапазону»
 * на каждый клик переставляла бы местами только дыры в данных.
 */
export function sortTrades(trades: Trade[], sort: LedgerSort, rangeTf?: RangeTf): Trade[] {
  return [...trades].sort((a, b) => {
    const va = valueOf(sort.key, a, rangeTf);
    const vb = valueOf(sort.key, b, rangeTf);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va - vb) * sort.dir;
  });
}
```

- [ ] **Step 4: Запустить тест, убедиться, что проходит**

```bash
npx vitest run src/widgets/trades-table/sortTrades.test.ts
```

Ожидаемо: PASS, все семь тестов.

- [ ] **Step 5: Экспортировать из виджета**

В `frontend/src/widgets/trades-table/index.ts` заменить:

```ts
export * from './TradesTable';
```

на:

```ts
export * from './TradesTable';
export { sortTrades } from './sortTrades';
```

- [ ] **Step 6: Проверить типы**

```bash
npx tsc --noEmit -p tsconfig.json
```

Ожидаемо: без ошибок.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/widgets/trades-table/sortTrades.ts frontend/src/widgets/trades-table/sortTrades.test.ts frontend/src/widgets/trades-table/index.ts
git commit -m "feat(trades-table): sortTrades — сортировка списка до пагинации

Чистая функция: closedAt/entry/exit/qty/hold/pnl/range, только числовые
поля. Пропуски (нет openedAt, нет диапазона этого ТФ) всегда в конце
списка независимо от направления сортировки.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `TradesTable` — управляемая сортировка

**Files:**
- Modify: `frontend/src/widgets/trades-table/TradesTable.tsx`

**Interfaces:**
- Consumes: `LedgerSort` из `@/shared/ui/LedgerTable`.
- Produces: `TradesTable` принимает необязательные `sort?: LedgerSort` и `onSort?: (key:
  string) => void`, пробрасывает их в `LedgerTable` без изменений. Колонки `closedAt`,
  `entry`, `exit`, `qty`, `hold`, `pnl` и (когда передан `range`) `range` получают
  `sortKey`, но только пока передан `onSort` — использует Task 4 (`AnalyticsPage`).

- [ ] **Step 1: Добавить пропсы и условный `sortKey`**

В `frontend/src/widgets/trades-table/TradesTable.tsx` заменить сигнатуру функции:

```ts
export function TradesTable({
  trades,
  isLoading,
  skeletonRows,
  onEditTags,
  range,
  compact,
  empty,
}: {
  trades: Trade[];
  isLoading?: boolean;
  /** Сколько строк-заглушек показать при загрузке — размер листа страницы. */
  skeletonRows?: number;
  /** Без обработчика тег из таблицы не завести — плашки останутся только на чтение. */
  onEditTags?: (trade: Trade) => void;
  /** Показать колонку «Диапазон» выбранного таймфрейма. */
  range?: RangeColumn;
  /** Таблица стоит в узкой колонке: подробности исполнения снимаются. */
  compact?: boolean;
  /** Чем заменить таблицу, когда сделок нет. */
  empty?: React.ReactNode;
}) {
  const t = useTranslations('tradesTable');
  const { locale } = useLocaleControl();
  const intlLocale = locale === 'en' ? 'en-US' : 'ru-RU';
  const units = durationUnitLabels(locale);
```

на:

```ts
export function TradesTable({
  trades,
  isLoading,
  skeletonRows,
  onEditTags,
  range,
  compact,
  empty,
  sort,
  onSort,
}: {
  trades: Trade[];
  isLoading?: boolean;
  /** Сколько строк-заглушек показать при загрузке — размер листа страницы. */
  skeletonRows?: number;
  /** Без обработчика тег из таблицы не завести — плашки останутся только на чтение. */
  onEditTags?: (trade: Trade) => void;
  /** Показать колонку «Диапазон» выбранного таймфрейма. */
  range?: RangeColumn;
  /** Таблица стоит в узкой колонке: подробности исполнения снимаются. */
  compact?: boolean;
  /** Чем заменить таблицу, когда сделок нет. */
  empty?: React.ReactNode;
  /**
   * Текущая сортировка и обработчик клика по заголовку. Оба необязательны и
   * приходят парой: без `onSort` таблица не сортирует сама (список режут на
   * листы снаружи — см. AnalyticsPage, — и сортировать надо ДО этого), а
   * заголовки без `onSort` остаются некликабельными, как на Обзоре.
   */
  sort?: LedgerSort;
  onSort?: (key: string) => void;
}) {
  const t = useTranslations('tradesTable');
  const { locale } = useLocaleControl();
  const intlLocale = locale === 'en' ? 'en-US' : 'ru-RU';
  const units = durationUnitLabels(locale);
  // sortKey ставится только когда есть onSort: сам по себе sortKey красит
  // заголовок LedgerTable курсором-указателем (см. LedgerTable.tsx), и без
  // этого условия заголовки на Обзоре выглядели бы кликабельными, ничего не
  // делая по клику.
  const colSortKey = (key: string) => (onSort ? key : undefined);
```

- [ ] **Step 2: Проставить `sortKey` на числовых колонках**

В том же файле, в массиве `columns`, заменить:

```ts
  const columns: LedgerColumn<Trade>[] = [
    {
      key: 'closedAt',
      header: t('colClosed'),
      cellClassName: 'n',
      render: (tr) => <span className="muted">{fmtClosed(tr.closedAt, intlLocale)}</span>,
    },
```

на:

```ts
  const columns: LedgerColumn<Trade>[] = [
    {
      key: 'closedAt',
      header: t('colClosed'),
      cellClassName: 'n',
      sortKey: colSortKey('closedAt'),
      render: (tr) => <span className="muted">{fmtClosed(tr.closedAt, intlLocale)}</span>,
    },
```

Заменить:

```ts
    {
      key: 'entry',
      header: t('colEntry'),
      align: 'right',
      cellClassName: 'n',
      render: (tr) => formatPriceGrouped(tr.avgEntryPrice),
    },
    {
      key: 'exit',
      header: t('colExit'),
      align: 'right',
      cellClassName: 'n',
      render: (tr) => formatPriceGrouped(tr.avgExitPrice),
    },
```

на:

```ts
    {
      key: 'entry',
      header: t('colEntry'),
      align: 'right',
      cellClassName: 'n',
      sortKey: colSortKey('entry'),
      render: (tr) => formatPriceGrouped(tr.avgEntryPrice),
    },
    {
      key: 'exit',
      header: t('colExit'),
      align: 'right',
      cellClassName: 'n',
      sortKey: colSortKey('exit'),
      render: (tr) => formatPriceGrouped(tr.avgExitPrice),
    },
```

Заменить блок колонки диапазона:

```ts
    ...(range
      ? [
          {
            key: 'range',
            header: t('colRange', { tf: range.label }),
            label: t('colRangeLabel'),
            align: 'right',
            cellClassName: 'n',
            render: (tr: Trade) => (
              <span className="muted">{formatRangePos(rangeOf(tr, range.tf), locale)}</span>
            ),
          } satisfies LedgerColumn<Trade>,
        ]
      : []),
```

на:

```ts
    ...(range
      ? [
          {
            key: 'range',
            header: t('colRange', { tf: range.label }),
            label: t('colRangeLabel'),
            align: 'right',
            cellClassName: 'n',
            sortKey: colSortKey('range'),
            render: (tr: Trade) => (
              <span className="muted">{formatRangePos(rangeOf(tr, range.tf), locale)}</span>
            ),
          } satisfies LedgerColumn<Trade>,
        ]
      : []),
```

Заменить:

```ts
    {
      key: 'qty',
      header: t('colSize'),
      align: 'right',
      cellClassName: 'n',
      // Размер деньгами, а не в монете: 47 UNI и 47 SOL между собой не
      // сравнить, а USDT сравнимы со всем остальным в журнале — P&L в соседней
      // колонке меряется той же мерой. Считается по входу: это объём, которым
      // в позицию заходили. Сколько это было монет, говорит подсказка — так же,
      // как у ордеров раскрытой записи.
      render: (tr) => (
```

на:

```ts
    {
      key: 'qty',
      header: t('colSize'),
      align: 'right',
      cellClassName: 'n',
      sortKey: colSortKey('qty'),
      // Размер деньгами, а не в монете: 47 UNI и 47 SOL между собой не
      // сравнить, а USDT сравнимы со всем остальным в журнале — P&L в соседней
      // колонке меряется той же мерой. Считается по входу: это объём, которым
      // в позицию заходили. Сколько это было монет, говорит подсказка — так же,
      // как у ордеров раскрытой записи.
      render: (tr) => (
```

Заменить:

```ts
    {
      key: 'hold',
      header: t('colInPosition'),
      align: 'right',
      cellClassName: 'n',
      render: (tr) => <span className="muted">{fmtHold(tr.openedAt, tr.closedAt, units)}</span>,
    },
    {
      key: 'pnl',
      header: 'P&L',
      align: 'right',
      cellClassName: 'n',
      // Крупный кегль P&L — привилегия широкой раскладки: в тесной он ломает
      // строку, а ведущей величиной там всё равно стоит диапазон.
      render: (tr) => <Money value={tr.closedPnl} large={!compact} />,
    },
```

на:

```ts
    {
      key: 'hold',
      header: t('colInPosition'),
      align: 'right',
      cellClassName: 'n',
      sortKey: colSortKey('hold'),
      render: (tr) => <span className="muted">{fmtHold(tr.openedAt, tr.closedAt, units)}</span>,
    },
    {
      key: 'pnl',
      header: 'P&L',
      align: 'right',
      cellClassName: 'n',
      sortKey: colSortKey('pnl'),
      // Крупный кегль P&L — привилегия широкой раскладки: в тесной он ломает
      // строку, а ведущей величиной там всё равно стоит диапазон.
      render: (tr) => <Money value={tr.closedPnl} large={!compact} />,
    },
```

- [ ] **Step 3: Пробросить `sort`/`onSort` в `LedgerTable`**

В том же файле заменить:

```tsx
  return (
    <LedgerTable
      columns={compact ? columns.filter((c) => !ROOMY_ONLY.has(c.key)) : columns}
      rows={trades}
      rowKey={(tr) => tr.id}
      isLoading={isLoading}
      skeletonRows={skeletonRows}
      renderExpanded={(tr) => <TradeOrders trade={tr} />}
      empty={
        empty ?? (
          <EmptyState title={t('emptyTitle')}>{t('emptyBody')}</EmptyState>
        )
      }
    />
  );
}
```

на:

```tsx
  return (
    <LedgerTable
      columns={compact ? columns.filter((c) => !ROOMY_ONLY.has(c.key)) : columns}
      rows={trades}
      rowKey={(tr) => tr.id}
      isLoading={isLoading}
      skeletonRows={skeletonRows}
      renderExpanded={(tr) => <TradeOrders trade={tr} />}
      sort={sort}
      onSort={onSort}
      empty={
        empty ?? (
          <EmptyState title={t('emptyTitle')}>{t('emptyBody')}</EmptyState>
        )
      }
    />
  );
}
```

- [ ] **Step 4: Добавить импорт `LedgerSort`**

В начале файла заменить:

```ts
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
```

на:

```ts
import { LedgerTable, type LedgerColumn, type LedgerSort } from '@/shared/ui/LedgerTable';
```

- [ ] **Step 5: Проверить типы**

```bash
npx tsc --noEmit -p tsconfig.json
```

Ожидаемо: без ошибок. `rows={trades}` остаётся без изменений — `TradesTable` по-прежнему
не сортирует сама, только рендерит то, что ей передали.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/widgets/trades-table/TradesTable.tsx
git commit -m "feat(trades-table): управляемая сортировка через sort/onSort

Пропсы необязательны и приходят парой. sortKey на числовых колонках
ставится только когда передан onSort — иначе LedgerTable красит
заголовок курсором-указателем без рабочего клика.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: `AnalyticsPage` — состояние сортировки перед пагинацией

**Files:**
- Modify: `frontend/src/views/analytics/Page.tsx`

**Interfaces:**
- Consumes: `sortTrades` и `TradesTable` из `@/widgets/trades-table` (Task 2, Task 3),
  `LedgerSort` из `@/shared/ui/LedgerTable`.

- [ ] **Step 1: Импорты**

В `frontend/src/views/analytics/Page.tsx` заменить:

```ts
import { EquityChart, EquityChartSkeleton } from '@/widgets/equity-chart';
import { TradesTable } from '@/widgets/trades-table';
import { Pagination } from '@/shared/ui/Pagination';
```

на:

```ts
import { EquityChart, EquityChartSkeleton } from '@/widgets/equity-chart';
import { TradesTable, sortTrades } from '@/widgets/trades-table';
import { Pagination } from '@/shared/ui/Pagination';
import type { LedgerSort } from '@/shared/ui/LedgerTable';
```

- [ ] **Step 2: Состояние сортировки и сортировка перед нарезкой на листы**

В том же файле заменить:

```ts
  // Смена условий сбрасывает список на первый лист: третий лист прежней
  // выборки в новой означал бы уже не те сделки — та же причина, по которой
  // Обзор сбрасывает журнал при смене периода.
  const [page, setPage] = useState(1);
  const filtersKey = JSON.stringify(labFilters);
  useEffect(() => {
    setPage(1);
  }, [filtersKey]);

  const pageTrades = useMemo(
    () => trades.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [trades, page],
  );
```

на:

```ts
  // Сортировка таблицы «Подходящие сделки» — по умолчанию тот же порядок,
  // что уже приходит с бэкенда (LabService отдаёт trades по убыванию closedAt),
  // так что до первого клика по заголовку список выглядит как раньше.
  const [sort, setSort] = useState<LedgerSort>({ key: 'closedAt', dir: -1 });
  const sortedTrades = useMemo(
    () => sortTrades(trades, sort, state.filters.rangeTf),
    [trades, sort, state.filters.rangeTf],
  );

  // Смена условий или сортировки сбрасывает список на первый лист: третий
  // лист прежнего порядка после переупорядочивания означал бы уже не те
  // сделки — та же причина, по которой Обзор сбрасывает журнал при смене
  // периода.
  const [page, setPage] = useState(1);
  const filtersKey = JSON.stringify(labFilters);
  useEffect(() => {
    setPage(1);
  }, [filtersKey, sort]);

  const pageTrades = useMemo(
    () => sortedTrades.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sortedTrades, page],
  );
```

- [ ] **Step 3: Передать `sort`/`onSort` в `TradesTable`**

В том же файле заменить:

```tsx
              <TradesTable
                trades={pageTrades}
                isLoading={isLoading}
                skeletonRows={10}
                compact
                range={{ tf: state.filters.rangeTf, label: RANGE_TF_LABELS[state.filters.rangeTf] }}
              />
```

на:

```tsx
              <TradesTable
                trades={pageTrades}
                isLoading={isLoading}
                skeletonRows={10}
                compact
                range={{ tf: state.filters.rangeTf, label: RANGE_TF_LABELS[state.filters.rangeTf] }}
                sort={sort}
                onSort={(key) =>
                  setSort((s) => (s.key === key ? { key, dir: s.dir === -1 ? 1 : -1 } : { key, dir: -1 }))
                }
              />
```

- [ ] **Step 4: Проверить типы**

```bash
npx tsc --noEmit -p tsconfig.json
```

Ожидаемо: без ошибок.

- [ ] **Step 5: Прогнать весь набор фронтенд-тестов**

```bash
npx vitest run
```

Ожидаемо: PASS, без регрессий (включая новые тесты `sortTrades` из Task 2).

- [ ] **Step 6: Полная сборка**

Изменение трогает несколько файлов и общий виджет (`TradesTable`), используемый двумя
страницами, — по правилам сборки (CLAUDE.md пользователя) это крупное изменение, билд
запускается не спрашивая:

```bash
npx next build
```

Ожидаемо: сборка проходит без ошибок.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/analytics/Page.tsx
git commit -m "feat(analytics): сортировка «Подходящих сделок» по клику на заголовок

Список из useLab сортируется целиком до нарезки на листы — клик по
колонке применяется ко всем подошедшим сделкам, а не только к текущим
тридцати. Смена сортировки сбрасывает лист на первый, как и смена
условий слева.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Ручная проверка (после Task 4)

1. Открыть `/analytics`, дождаться загрузки «Подходящих сделок».
2. Кликнуть по заголовку «P&L» — список должен пересортироваться по убыванию, лист
   сброситься на первый (если стоял не на первом).
3. Кликнуть по «P&L» ещё раз — направление переворачивается (по возрастанию).
4. Перейти на второй лист (если сделок больше 30), убедиться, что порядок продолжает тот
   же отсортированный список, а не начинается заново с хронологического порядка.
5. Кликнуть по «Диапазон входа» — сделки без диапазона этого ТФ (если такие есть в
   выборке) должны оказаться в самом низу списка независимо от направления.
6. Сменить условие слева (например, добавить тег) — сортировка должна сохраниться (тот же
   столбец и направление), список пересчитаться и остаться отсортированным.
7. Открыть `/overview`, убедиться, что заголовки «Закрытых сделок» по-прежнему не
   кликабельны (курсор обычный, клик ничего не делает) — поведение не изменилось.
