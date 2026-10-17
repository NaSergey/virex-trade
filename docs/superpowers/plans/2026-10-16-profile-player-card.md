# Профиль: карточка игрока — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/profile/<id>` — карточка игрока в одно окно без прокрутки: картинка, имя, значки,
уровень, четыре клетки, вкладки (игры, сделки, открытые позиции, лента монет, достижения).

**Architecture:** Сервер добавляет размер листа сделок и открытые позиции профиля — снимком,
который синк пишет в `open_positions_seen` раз в минуту (чужой профиль к бирже не ходит).
Фронт: колонка-флекс слева и полоса справа; последний блок — содержимое вкладки — забирает
остаток высоты, строк на листе столько, сколько влезает.

**Tech Stack:** NestJS + Prisma (jest), Next.js App Router + FSD (vitest), next-intl, lucide-react.

**Спека:** `docs/superpowers/specs/2026-10-16-profile-player-card-design.md`.

## Global Constraints

- Игра `tournament` в профиле называется «Торговля» (en «Trading»).
- Открытые позиции — только из снимка синка, не старше 15 минут; к бирже по просмотру профиля — ни одного запроса.
- Закрытый показ (`showTrades = false`) — 403 `PROFILE_TRADES_HIDDEN` и у сделок, и у позиций; признаки `hasExchangeTrades`/`hasOpenPositions` — `false`.
- `pageSize` сделок — 1…20, иначе 20.
- Окно ≥ 1100 px в ширину и ≥ 620 px в высоту — без прокрутки; иначе — колонка на всю ширину, без полосы, лист 8 строк.
- Нулевой радиус, цвет — только деньги (`.pos`/`.neg`), без свечений и градиентов.
- Разметка — через `shared/ui` (`Seg`, `LedgerTable`, `Pagination`, `EmptyState`, `ErrorNote`, `Tooltip`, `CoinIcon`, `Money`).
- Схема — только новые столбцы: `npx prisma db push`.

## Файлы

**backend**
- `prisma/schema.prisma` — снимок в `OpenPositionSeen`.
- `src/trades/trade-sync.service.ts` — `positionSnapshot`, `storePositionSnapshots`.
- `src/trades/trade-sync.snapshot.spec.ts` — новый.
- `src/profile/profile.service.ts` — `pageSize`, `positions`, `hasOpenPositions`.
- `src/profile/profile.controller.ts` — `pageSize`, `GET :userId/positions`.
- `src/profile/profile.service.spec.ts` — тесты.

**frontend**
- `entities/profile/api/{types,hooks}.ts`, `entities/profile/index.ts`.
- `shared/lib/utils/format.ts` — `formatPositionAge` (общий с обзором); `views/overview/components/OpenPositions.tsx` — на него.
- `views/profile/lib/fit.ts` (+ `fit.test.ts`) — `rowsFor`, `pageOf`, `tileCols`.
- `views/profile/lib/charts.ts` (+ тест) — `favourite`.
- `views/profile/lib/achievements.ts` — `ACHIEVEMENT_ICONS`, `progressOf` (из `Achievements.tsx`).
- `views/profile/model/useBoxHeight.ts`, `useMediaQuery.ts`.
- `views/profile/components/` — `Identity`, `SeasonLevel`, `StatCells`, `Sparkline`, `ProfileTabs`, `GamesPane`, `TradesPane`, `PositionsPane`, `FeedPane`, `AchievementTiles`; `Stripe` — div; `PlayerResults` удалить.
- `views/profile/Page.tsx`.
- `app/globals.css` — блок «экран профиля».
- `shared/i18n/messages/{ru,en}.json`.
- `CLAUDE.md` — раздел профиля.

## Контрольные точки ревью (гибрид)

- **После Task 2** — стык «синк → снимок → API профиля» (класс B): Sonnet-ревьюер по диффу backend.
- **После Task 6** — фронт целиком со стыком API (класс B). Отдельного Opus-прогона нет: точек две, стык во второй.

---

### Task 1: Снимок открытой позиции в синке

**Files:**
- Modify: `backend/prisma/schema.prisma` (модель `OpenPositionSeen`)
- Modify: `backend/src/trades/trade-sync.service.ts`
- Create: `backend/src/trades/trade-sync.snapshot.spec.ts`

**Interfaces:**
- Produces: столбцы `size`, `avgPrice`, `markPrice`, `positionValue`, `unrealisedPnl`, `leverage`, `liqPrice` (`String?`), `snapshotAt` (`DateTime?`); `export function positionSnapshot(p: OpenPosition, at: Date)`.

- [ ] **Step 1: Схема** — в `OpenPositionSeen` перед `@@unique`:

```prisma
  /// Снимок позиции с последнего тика синка — строками, как их отдаёт биржа
  /// (`OpenPosition`). Его читает профиль игрока: чужой профиль не ходит к бирже
  /// ключом владельца (спека 2026-10-16). Null до первого тика после правки.
  size          String?
  avgPrice      String?
  markPrice     String?
  positionValue String?
  unrealisedPnl String?
  leverage      String?
  liqPrice      String?
  snapshotAt    DateTime?
```

Run: `cd backend && npx prisma generate && npx prisma db push` (nest watch держит движок — сначала остановить backend).

- [ ] **Step 2: Тест** — `trade-sync.snapshot.spec.ts`:

```ts
import { TradeSyncService, positionSnapshot } from './trade-sync.service';
import { ExchangePositionsCacheService } from '../exchanges/exchange-positions-cache.service';

const POS = {
  symbol: 'BTCUSDT',
  direction: 'long' as const,
  size: '0.05',
  avgPrice: '112430.5',
  markPrice: '113000',
  positionValue: '5650',
  unrealisedPnl: '28.47',
  leverage: '10',
  liqPrice: '101500',
};

function makeService(positions: unknown[], updateMany = jest.fn().mockResolvedValue({ count: 1 })) {
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1' }]) },
    trade: {
      count: jest.fn().mockResolvedValue(5),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    openPositionSeen: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany,
      upsert: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue(undefined),
    },
  } as any;
  const adapter = {
    fetchClosedTrades: jest.fn().mockResolvedValue({ items: [], partial: false }),
    getOpenPositions: jest.fn().mockResolvedValue({ success: true, positions }),
  };
  const exchanges = { get: () => adapter } as any;
  const credentials = {
    getActive: jest.fn().mockResolvedValue({ exchange: 'bybit', credentials: { apiKey: 'k', apiSecret: 's' } }),
  } as any;
  const tags = {
    linkTagsToNewTrades: jest.fn().mockResolvedValue(0),
    pruneClosedPositions: jest.fn().mockResolvedValue(undefined),
  } as any;
  const tradeAlerts = {
    syncOutcome: jest.fn().mockResolvedValue(undefined),
    tradesClosed: jest.fn().mockResolvedValue(undefined),
    overtradeCheck: jest.fn().mockResolvedValue(undefined),
    positionOpened: jest.fn().mockResolvedValue(undefined),
  } as any;
  const tradeContext = { computeMissing: jest.fn().mockResolvedValue(0), snapshotNow: jest.fn() } as any;
  const builder = { sync: jest.fn().mockResolvedValue({ fills: 0, positions: 0, stamped: 0 }) } as any;
  const dataVersion = { bump: jest.fn().mockResolvedValue(undefined) } as any;
  const service = new TradeSyncService(
    prisma, exchanges, credentials, tags, tradeAlerts, tradeContext, builder, dataVersion,
    new ExchangePositionsCacheService(exchanges),
  );
  return { service, prisma, tradeAlerts };
}

describe('positionSnapshot', () => {
  it('берёт поля биржи строками, а отсутствующие — null', () => {
    const at = new Date('2026-10-16T10:00:00Z');
    expect(positionSnapshot({ symbol: 'X', direction: 'short', size: '2' }, at)).toEqual({
      size: '2', avgPrice: null, markPrice: null, positionValue: null,
      unrealisedPnl: null, leverage: null, liqPrice: null, snapshotAt: at,
    });
  });
});

describe('TradeSyncService: снимок открытых позиций', () => {
  it('каждый тик пишет снимок открытой позиции в её строку реестра', async () => {
    const { service, prisma } = makeService([POS, { ...POS, symbol: 'ETHUSDT', size: '0' }]);
    await service.syncAll();
    const calls = prisma.openPositionSeen.updateMany.mock.calls.filter((c: any[]) => 'snapshotAt' in c[0].data);
    // Позиция нулевого размера — уже закрытая, снимок ей не нужен.
    expect(calls).toHaveLength(1);
    expect(calls[0][0].where).toEqual({ userId: 'u1', symbol: 'BTCUSDT', direction: 'long' });
    expect(calls[0][0].data).toMatchObject({ size: '0.05', unrealisedPnl: '28.47', liqPrice: '101500' });
  });

  it('сбой записи снимка не роняет тик и не засчитывается неудачей синка', async () => {
    const failing = jest.fn().mockImplementation(async (args: any) => {
      if ('snapshotAt' in args.data) throw new Error('db down');
      return { count: 0 };
    });
    const { service, tradeAlerts } = makeService([POS], failing);
    await expect(service.syncAll()).resolves.toEqual({ inserted: 0 });
    expect(tradeAlerts.syncOutcome).toHaveBeenCalledWith('u1', true);
  });
});
```

- [ ] **Step 3:** Run `cd backend && npx jest src/trades/trade-sync.snapshot.spec.ts` — FAIL: `positionSnapshot` не экспортирован.

- [ ] **Step 4: Код** — в `trade-sync.service.ts` импорт `OpenPosition` из `../exchanges/exchange.types`, рядом со `stopLossOf`:

```ts
/**
 * Снимок открытой позиции для профиля игрока (спека 2026-10-16): поля биржи
 * строками, как она их отдаёт, и время тика. Нет поля — null, а не «0»: у
 * биржи, которая не сообщает цену ликвидации, её и нет.
 */
export function positionSnapshot(p: OpenPosition, at: Date) {
  return {
    size: p.size,
    avgPrice: p.avgPrice ?? null,
    markPrice: p.markPrice ?? null,
    positionValue: p.positionValue ?? null,
    unrealisedPnl: p.unrealisedPnl ?? null,
    leverage: p.leverage ?? null,
    liqPrice: p.liqPrice ?? null,
    snapshotAt: at,
  };
}
```

В `syncOne` сразу после блока `try { if (open.success) { … trackOpenPositions … } } catch`:

```ts
    // Снимок открытых позиций для профиля игрока: чужой профиль читает его из
    // базы, а не биржу ключом владельца. Свой try — сбой записи снимка не
    // роняет тик и не выдаёт себя за сбой обрезки тегов. После
    // trackOpenPositions: строку новой позиции заводит он.
    if (open.success) {
      try {
        await this.storePositionSnapshots(userId, open.positions);
      } catch (e) {
        this.logger.warn(`position snapshot failed: ${e}`);
      }
    }
```

Метод рядом с `trackOpenPositions`:

```ts
  /**
   * Снимок каждой открытой позиции — на каждом тике, где позиции прочитаны:
   * цена и P&L меняются каждую минуту. Строку заводит `trackOpenPositions`,
   * здесь она только обновляется по ключу; нулевой размер — позиция уже
   * закрылась, и её строка уйдёт вместе с ней.
   */
  private async storePositionSnapshots(userId: string, positions: OpenPosition[]): Promise<void> {
    const at = new Date();
    for (const p of positions) {
      if (!(parseFloat(p.size) > 0)) continue;
      await this.prisma.openPositionSeen.updateMany({
        where: { userId, symbol: p.symbol, direction: p.direction },
        data: positionSnapshot(p, at),
      });
    }
  }
```

- [ ] **Step 5:** Run `npx jest src/trades/trade-sync` — PASS (новый файл и прежние спеки синка).

---

### Task 2: API профиля — размер листа и открытые позиции

**Files:**
- Modify: `backend/src/profile/profile.service.ts`, `profile.controller.ts`, `profile.service.spec.ts`

**Interfaces:**
- Consumes: столбцы снимка из Task 1.
- Produces: `trades(userId, page = 1, pageSize = TRADES_PAGE_SIZE)`; `positions(userId, now?) → { asOf: string | null; positions: ProfilePositionRow[] }`, где строка — `{ symbol, direction, size, avgPrice?, markPrice?, positionValue?, unrealisedPnl?, leverage?, liqPrice?, openedAt }`; `hasOpenPositions: boolean` в `overview`; маршруты `GET api/profile/:userId/trades?page=&pageSize=`, `GET api/profile/:userId/positions`; `POSITION_FRESH_MS = 600_000`.

- [ ] **Step 1: Тесты** — в `fakePrisma` добавить
`openPositionSeen: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },`
и импорт `POSITION_FRESH_MS`. Новые тесты:

```ts
  it('открытые позиции есть и показ открыт — признак для вкладки, по свежему снимку', async () => {
    const { service, prisma } = make({ ...PLAYER, showTrades: true });
    prisma.openPositionSeen.findFirst.mockResolvedValue({ id: 'p1' });
    await expect(service.overview(ID, now)).resolves.toMatchObject({ hasOpenPositions: true });
    expect(prisma.openPositionSeen.findFirst).toHaveBeenCalledWith({
      where: { userId: ID, size: { not: null }, snapshotAt: { gte: new Date(now.getTime() - POSITION_FRESH_MS) } },
      select: { id: true },
    });
  });

  it('скрытый показ — признака открытых позиций нет', async () => {
    const { service, prisma } = make({ ...PLAYER, showTrades: false });
    prisma.openPositionSeen.findFirst.mockResolvedValue({ id: 'p1' });
    await expect(service.overview(ID, now)).resolves.toMatchObject({ hasOpenPositions: false });
  });
```

В `describe('ProfileService.trades')`:

```ts
  it('размер листа задаёт смотрящий — 1…20, мусор — 20, и у каждого размера свой лист в кэше', async () => {
    const { service, prisma } = make({ showTrades: true });
    const rows = Array.from({ length: 12 }, (_, i) =>
      part({ id: `r${i}`, positionId: `BTCUSDT:long:${1_700_000_000_000 + i}` }),
    );
    prisma.trade.findMany.mockResolvedValue(rows);

    const five = await service.trades(ID, 2, 5);
    expect(five).toMatchObject({ page: 2, pageSize: 5, total: 12 });
    expect(five.trades).toHaveLength(5);
    expect(await service.trades(ID, 1, 0)).toMatchObject({ pageSize: TRADES_PAGE_SIZE });
    expect(await service.trades(ID, 1, 500)).toMatchObject({ pageSize: TRADES_PAGE_SIZE });
    expect((await service.trades(ID, 3, 5)).trades).toHaveLength(2);
  });
```

Новый `describe`:

```ts
describe('ProfileService.positions', () => {
  const now = new Date('2026-10-16T10:00:00Z');
  const row = (over: Record<string, unknown> = {}) => ({
    symbol: 'BTCUSDT',
    direction: 'long',
    firstSeenAt: new Date('2026-10-16T08:00:00Z'),
    size: '0.05',
    avgPrice: '112430.5',
    markPrice: '113000',
    positionValue: '5650',
    unrealisedPnl: '28.47',
    leverage: '10',
    liqPrice: null,
    snapshotAt: new Date('2026-10-16T09:59:00Z'),
    ...over,
  });

  it('не UUID и нет игрока — 404; скрыл показ — 403, снимок не читается', async () => {
    const { service, prisma } = make(null);
    await expect(service.positions('admin', now)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.positions(ID, now)).rejects.toBeInstanceOf(NotFoundException);
    const hidden = make({ showTrades: false });
    await expect(hidden.service.positions(ID, now)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.openPositionSeen.findMany).not.toHaveBeenCalled();
    expect(hidden.prisma.openPositionSeen.findMany).not.toHaveBeenCalled();
  });

  it('только свежий снимок, строки в форме позиции биржи, время снимка — самое свежее', async () => {
    const { service, prisma } = make({ showTrades: true });
    prisma.openPositionSeen.findMany.mockResolvedValue([
      row(),
      row({ symbol: 'ETHUSDT', direction: 'short', snapshotAt: new Date('2026-10-16T09:59:30Z') }),
      row({ symbol: 'SOLUSDT', size: '0' }),
    ]);

    const out = await service.positions(ID, now);

    expect(prisma.openPositionSeen.findMany.mock.calls[0][0].where).toEqual({
      userId: ID,
      size: { not: null },
      snapshotAt: { gte: new Date(now.getTime() - POSITION_FRESH_MS) },
    });
    expect(out.asOf).toBe('2026-10-16T09:59:30.000Z');
    expect(out.positions).toHaveLength(2);
    expect(out.positions[0]).toEqual({
      symbol: 'BTCUSDT',
      direction: 'long',
      size: '0.05',
      avgPrice: '112430.5',
      markPrice: '113000',
      positionValue: '5650',
      unrealisedPnl: '28.47',
      leverage: '10',
      openedAt: '2026-10-16T08:00:00.000Z',
    });
  });

  it('свежих нет — пусто и без времени снимка', async () => {
    const { service } = make({ showTrades: true });
    await expect(service.positions(ID, now)).resolves.toEqual({ asOf: null, positions: [] });
  });
});
```

- [ ] **Step 2:** Run `npx jest src/profile/profile.service.spec.ts` — FAIL.

- [ ] **Step 3: Код** — `profile.service.ts`:

```ts
/**
 * Снимок открытой позиции старше этого не показывается: синк этого игрока не
 * идёт (ключ снят, биржа отказывает), и позиция могла давно закрыться.
 * Синк проходит всех раз в минуту — десять минут с большим запасом.
 */
export const POSITION_FRESH_MS = 10 * 60_000;

/** Строки реестра со свежим снимком — общее условие признака и списка. */
const freshPositions = (userId: string, now: Date) => ({
  userId,
  size: { not: null },
  snapshotAt: { gte: new Date(now.getTime() - POSITION_FRESH_MS) },
});
```

В `overview` — последним элементом `Promise.all` (и `openPosition` в деструктуризации):

```ts
        // Признак вкладки «Открытые позиции» — та же первая строка, что и у
        // сделок: число нигде не показывается.
        this.prisma.openPositionSeen.findFirst({ where: freshPositions(userId, now), select: { id: true } }),
```

и в ответе после `hasExchangeTrades`:

```ts
      /** Есть ли открытые позиции в свежем снимке синка — вкладка «Открытые позиции». */
      hasOpenPositions: user.showTrades && openPosition !== null,
```

`trades`:

```ts
  async trades(userId: string, page = 1, pageSize = TRADES_PAGE_SIZE) {
    …
    const current = Math.max(1, Math.floor(page) || 1);
    // Лист — сколько строк влезает в окно смотрящего (профиль без прокрутки),
    // но не больше прежнего: мусор и запредельное — прежние 20.
    const size = Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= TRADES_PAGE_SIZE ? pageSize : TRADES_PAGE_SIZE;
    const key = cacheKey('profile-trades', userId, await this.dataVersion.get(userId), { page: current, size });
    …
    const from = (current - 1) * size;
    const out: ProfileTradesPage = { total: positions.length, page: current, pageSize: size,
      trades: positions.slice(from, from + size).map(…) };
```

`positions`:

```ts
  /**
   * Открытые позиции игрока — вкладка «Открытые позиции» его профиля.
   *
   * Снимок синка, а не биржа: журнал берёт позиции у биржи ключом владельца в
   * момент запроса, но чужой профиль так делать не может — каждый просмотр
   * любого профиля тратил бы общий бюджет шлюза Bybit. Синк и так читает
   * позиции раз в минуту и пишет их в `open_positions_seen`; цена и P&L здесь
   * отстают до минуты, и время снимка уходит наружу (`asOf`).
   */
  async positions(userId: string, now: Date = new Date()) {
    if (!UUID.test(userId)) throw notFound();
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { showTrades: true } });
    if (!user) throw notFound();
    if (!user.showTrades) throw tradesHidden();

    const rows = await this.prisma.openPositionSeen.findMany({
      where: freshPositions(userId, now),
      orderBy: { firstSeenAt: 'asc' },
      select: {
        symbol: true, direction: true, firstSeenAt: true, size: true, avgPrice: true, markPrice: true,
        positionValue: true, unrealisedPnl: true, leverage: true, liqPrice: true, snapshotAt: true,
      },
    });
    const live = rows.filter((r) => parseFloat(r.size ?? '') > 0);
    const asOf = live.reduce<Date | null>((m, r) => (r.snapshotAt && (!m || r.snapshotAt > m) ? r.snapshotAt : m), null);
    const opt = (v: string | null) => v ?? undefined;
    return {
      asOf: asOf?.toISOString() ?? null,
      positions: live.map((r) => ({
        symbol: r.symbol,
        direction: r.direction as 'long' | 'short',
        size: r.size as string,
        avgPrice: opt(r.avgPrice),
        markPrice: opt(r.markPrice),
        positionValue: opt(r.positionValue),
        unrealisedPnl: opt(r.unrealisedPnl),
        leverage: opt(r.leverage),
        liqPrice: opt(r.liqPrice),
        openedAt: r.firstSeenAt.toISOString(),
      })),
    };
  }
```

(`undefined`-поля выпадают из JSON и из `toEqual` — тест выше без `liqPrice`.)

`profile.controller.ts` (`ProfileByIdController`):

```ts
  @Get(':userId/trades')
  trades(@Param('userId') userId: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.profile.trades(userId, Number(page) || 1, Number(pageSize) || TRADES_PAGE_SIZE);
  }

  /**
   * Его открытые позиции — снимок синка не старше десяти минут. Скрыл показ —
   * 403, как у сделок: выключатель один.
   */
  @Get(':userId/positions')
  positions(@Param('userId') userId: string) {
    return this.profile.positions(userId);
  }
```

- [ ] **Step 4:** Run `npx jest src/profile && npx tsc --noEmit -p tsconfig.json` — PASS.

- [ ] **Step 5: Контрольная точка ревью** (Sonnet): дифф backend Task 1–2 против спеки.

---

### Task 3: Сущность профиля и тексты

**Files:** `frontend/src/entities/profile/api/types.ts`, `hooks.ts`, `index.ts`; `shared/i18n/messages/ru.json`, `en.json`.

**Interfaces:**
- Produces: `ProfileOverview.hasOpenPositions: boolean`; `ProfilePosition`, `ProfilePositions`; `useProfileTrades(userId, page, pageSize, enabled)`; `useProfilePositions(userId, enabled)`.

- [ ] **Step 1: types.ts** — в `ProfileOverview` после `hasExchangeTrades`:

```ts
  /** Есть ли открытые позиции в свежем снимке синка — вкладка «Открытые позиции». Признак, а не число. */
  hasOpenPositions: boolean;
```

и в конец:

```ts
/**
 * Открытая позиция на чужом профиле (`GET /api/profile/<id>/positions`) — та же
 * форма, что у позиции биржи в журнале (её рисует тот же `PositionsTable`), плюс
 * время открытия по нашим часам. Своей копии `ExchangePosition` сущность не
 * импортирует: сущности друг друга не знают, совпадение — по форме.
 */
export interface ProfilePosition {
  symbol: string;
  direction: 'long' | 'short';
  size: string;
  avgPrice?: string;
  markPrice?: string;
  positionValue?: string;
  unrealisedPnl?: string;
  leverage?: string;
  liqPrice?: string;
  openedAt: string;
}

/** Снимок синка: `asOf` — когда он снят (null — свежих позиций нет). */
export interface ProfilePositions {
  asOf: string | null;
  positions: ProfilePosition[];
}
```

- [ ] **Step 2: hooks.ts** — `useProfileTrades` с размером и новый хук:

```ts
export const useProfileTrades = (userId: string, page: number, pageSize: number, enabled: boolean) =>
  useQuery({
    queryKey: [...profileKey, userId, 'trades', pageSize, page],
    queryFn: () =>
      apiJson<ProfileTrades>(
        `/api/profile/${encodeURIComponent(userId)}/trades?page=${page}&pageSize=${pageSize}`,
      ),
    enabled,
    retry: false,
  });

/**
 * Его открытые позиции — снимок синка (раз в минуту), поэтому и опрос раз в
 * минуту, и только пока вкладка открыта (`enabled`).
 */
export const useProfilePositions = (userId: string, enabled: boolean) =>
  useQuery({
    queryKey: [...profileKey, userId, 'positions'],
    queryFn: () => apiJson<ProfilePositions>(`/api/profile/${encodeURIComponent(userId)}/positions`),
    enabled,
    retry: false,
    refetchInterval: 60_000,
  });
```

`index.ts` — экспорт `useProfilePositions`, `ProfilePosition`, `ProfilePositions`.

- [ ] **Step 3: Тексты** — `profile` (ru / en):

```
"game.tournament": "Торговля" / "Trading"
"eyebrow": "Игрок · в игре с {date}" / "Player · since {date}"
"achCount": "{got} из {total}" / "{got} of {total}"
"xpInto": "{into} / {need} XP"
"seasonXp": "{xp} XP за сезон" / "{xp} XP this season"
"seasonLine": "Сезон {key} до {date} · ещё {days} дн." / "Season {key} until {date} · {days} d left"
"ratingPoints": "{n, plural, one {# очко} few {# очка} other {# очков}}" / "{n, plural, one {# point} other {# points}}"
"ratingGames": "{tournaments, plural, one {# турнир} few {# турнира} other {# турниров}} · {wins, plural, one {# победа} few {# победы} other {# побед}}" / "{tournaments, plural, one {# tournament} other {# tournaments}} · {wins, plural, one {# win} other {# wins}}"
"ratingNone": "Ещё не доиграл турнир" / "No finished tournament yet"
"coins30": "{delta} за 30 дней" / "{delta} in 30 days"
"xpWeek": "Опыт за 7 дней" / "XP in 7 days"
"xpBefore": "неделей раньше {xp}" / "week before {xp}"
"tabPositions": "Открытые позиции" / "Open positions"
"posAsOf": "Снимок на {time}" / "Snapshot at {time}"
"posEmptyTitle": "Открытых позиций нет" / "No open positions"
"posEmptyBody": "Здесь появятся позиции, которые сейчас открыты на бирже." / "Positions open on the exchange right now will appear here."
"positionsFailed": "Не удалось загрузить позиции" / "Failed to load positions"
```

`settings.privacy*` (ru): `privacyLede` — «На вашем профиле есть вкладки с закрытыми сделками и открытыми позициями: монета, сторона, плечо, цены, объём и результат в USDT. Открытые позиции — снимок раз в минуту. Теги — «почему вошли» — не видит никто, кроме вас.»; `privacyShowTrades` — «Показывать мои сделки и позиции на профиле»; `privacyOffFoot` — «Сейчас сделок и позиций на вашем профиле не видит никто. Результаты в играх и уровень сезона остаются видны.» (en — так же по смыслу).

---

### Task 4: Расчёты раскладки и любимая игра

**Files:** Create `frontend/src/views/profile/lib/fit.ts`, `fit.test.ts`; Modify `lib/charts.ts`, `lib/charts.test.ts`; Create `lib/achievements.ts`; Modify `components/Achievements.tsx`; Modify `shared/lib/utils/format.ts`, `views/overview/components/OpenPositions.tsx`.

**Interfaces:**
- Produces: `ROW_H = 41`, `TABLE_RESERVE`, `HEAD_RESERVE`, `FALLBACK_ROWS = 8`, `rowsFor(height, reserve): number`, `pageOf<T>(rows, page, size): { items; page; total }`, `tileCols(height): 4 | 6`; `favourite(games, hidden)`; `ACHIEVEMENT_ICONS`, `progressOf`; `formatPositionAge(iso, units, now?)`.

- [ ] **Step 1: Тесты** `fit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FALLBACK_ROWS, ROW_H, pageOf, rowsFor, tileCols } from './fit';

describe('rowsFor', () => {
  it('сколько целых строк влезает за вычетом шапки и листалки', () => {
    expect(rowsFor(100 + ROW_H * 6 + 20, 100)).toBe(6);
  });
  it('не меньше трёх и не больше двадцати', () => {
    expect(rowsFor(150, 100)).toBe(3);
    expect(rowsFor(5000, 100)).toBe(20);
  });
  it('высота неизвестна (узкое окно, страница листается) — постоянный лист', () => {
    expect(rowsFor(0, 100)).toBe(FALLBACK_ROWS);
  });
});

describe('pageOf', () => {
  const rows = [1, 2, 3, 4, 5, 6, 7];
  it('режет лист и считает всего', () => {
    expect(pageOf(rows, 2, 3)).toEqual({ items: [4, 5, 6], page: 2, total: 7 });
  });
  it('номер за последним листом — последний лист', () => {
    expect(pageOf(rows, 9, 3)).toEqual({ items: [7], page: 3, total: 7 });
  });
});

describe('tileCols', () => {
  it('три ряда плашек не влезают — шесть колонок в два ряда', () => {
    expect(tileCols(200)).toBe(6);
    expect(tileCols(400)).toBe(4);
    expect(tileCols(0)).toBe(4);
  });
});
```

В `charts.test.ts`:

```ts
describe('favourite', () => {
  const g = (id: string, days90: number, played: number) => ({ id, days90, played });
  it('чаще всего за 90 дней, бектест не считается, несыгранные — нет', () => {
    expect(favourite([g('backtest', 50, 90), g('jetpack', 19, 412), g('tournament', 31, 23)], new Set(['backtest']))?.id).toBe('tournament');
    expect(favourite([g('poker', 0, 0)], new Set())).toBeNull();
  });
});
```

- [ ] **Step 2:** Run `cd frontend && npx vitest run src/views/profile/lib` — FAIL.

- [ ] **Step 3: Код** `fit.ts`:

```ts
/**
 * Раскладка профиля в одно окно (спека 2026-10-16): содержимое вкладки забирает
 * остаток высоты, и строк на листе столько, сколько в него влезает. Чистые
 * функции — их проверяет vitest, компоненты только меряют высоту.
 */

/** Строка таблицы журнала: `.ledger td` — 40px и черта. */
export const ROW_H = 41;
/** Шапка таблицы и строка листания под ней. */
export const TABLE_RESERVE = 34 + 58;
/** Заголовок над таблицей открытых позиций (`SectionHead`). */
export const HEAD_RESERVE = 52;
/** Лист узкого окна: там страница листается, и мерить нечего. */
export const FALLBACK_ROWS = 8;

const MIN_ROWS = 3;
const MAX_ROWS = 20;
/** Три ряда плашек достижений с промежутками. */
const TILES_3_ROWS = 3 * 76 + 2 * 8;

export function rowsFor(height: number, reserve: number): number {
  if (!(height > 0)) return FALLBACK_ROWS;
  return Math.max(MIN_ROWS, Math.min(MAX_ROWS, Math.floor((height - reserve) / ROW_H)));
}

export function pageOf<T>(rows: T[], page: number, size: number): { items: T[]; page: number; total: number } {
  const last = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, page), last);
  return { items: rows.slice((current - 1) * size, current * size), page: current, total: rows.length };
}

export const tileCols = (height: number): 4 | 6 => (height > 0 && height < TILES_3_ROWS ? 6 : 4);
```

`charts.ts` — после `byFrequency`:

```ts
/** Любимая игра — первая по частоте среди сыгранных, без скрытых (бектест). */
export function favourite<T extends { id: string; days90: number; played: number }>(games: T[], hidden: Set<string>): T | null {
  return byFrequency(games.filter((g) => g.played > 0 && !hidden.has(g.id)))[0] ?? null;
}
```

`lib/achievements.ts` — перенести `ICONS` (как `ACHIEVEMENT_ICONS`) и `progressOf` из `Achievements.tsx`; `Achievements.tsx` импортирует их оттуда.

`format.ts` — перенести `fmtAge` из `OpenPositions.tsx`:

```ts
/** Возраст позиции по нашим часам: «2 д 3 ч», «3 ч 05 мин», «12 мин»; нет времени — «—». */
export function formatPositionAge(iso: string | null | undefined, units: { d: string; h: string; m: string }, now = Date.now()): string {
  if (!iso) return '—';
  const min = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(min) || min < 0) return '—';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  if (d > 0) return `${d} ${units.d} ${h} ${units.h}`;
  return h > 0 ? `${h} ${units.h} ${String(min % 60).padStart(2, '0')} ${units.m}` : `${min} ${units.m}`;
}
```

`OpenPositions.tsx` — `fmtAge` удалить, `AgeCell` зовёт `formatPositionAge`.

- [ ] **Step 4:** Run `npx vitest run src/views/profile src/shared/lib/utils` — PASS.

---

### Task 5: Компоненты карточки

**Files:** Create в `frontend/src/views/profile/`: `model/useBoxHeight.ts`, `model/useMediaQuery.ts`, `components/Identity.tsx`, `SeasonLevel.tsx`, `StatCells.tsx`, `Sparkline.tsx`, `ProfileTabs.tsx`, `GamesPane.tsx`, `TradesPane.tsx`, `PositionsPane.tsx`, `FeedPane.tsx`, `AchievementTiles.tsx`. Modify `Stripe.tsx`, `Page.tsx`. Delete `PlayerResults.tsx`.

**Interfaces:**
- Consumes: Task 3 хуки/типы, Task 4 расчёты.
- Produces: `ProfilePage` рисует `.pf-stage > .pf-stripe + .pf-card`.

- [ ] **Step 1: Модель**

`useBoxHeight.ts`:

```ts
'use client';

import { useLayoutEffect, useRef, useState } from 'react';

/** Высота блока, живая: окно меняет размер — меняется и число строк листа. */
export function useBoxHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setHeight(Math.round(entry.contentRect.height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, height] as const;
}
```

`useMediaQuery.ts`:

```ts
'use client';

import { useSyncExternalStore } from 'react';

/** Совпадает ли медиазапрос; на сервере — нет. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
```

- [ ] **Step 2: Шапка карточки** — `Identity.tsx` (картинка/буква, «Игрок · в игре с», имя `h1.pf-name`, ряд значков с `Tooltip`: `ACHIEVEMENT_ICONS[a.id]`, `size={20} strokeWidth={1.75}`, класс `pf-badge is-got`, текст подсказки `«имя. условие. Получено | progressOf(a)»`, в конце `achCount`). `SeasonLevel.tsx` (полоса `width: pct%`, `xpInto`/`toNext`/`seasonXp` слева, `seasonLine` справа: дата `dateFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })`, дни — `Math.max(0, Math.ceil((endsAt − now) / 86 400 000))`; `xpToNext === 0` — `maxed`, полоса 100 %).

- [ ] **Step 3: Клетки** — `Sparkline.tsx`: `LineSpark({ values })` (viewBox 200×34, `preserveAspectRatio="none"`, площадь, линия с `vector-effect`, точка — линия нулевой длины с круглым концом) и `BarSpark({ values, recent })` (столбики, последние `recent` — `is-now`). `StatCells.tsx`: рейтинг (`ratingPoints`, `ratingGames` | `ratingNone`), монеты (`int(balance)` + `CoinIcon`, `coins30` с `signed(trend(…, 30).abs)`, `LineSpark`), опыт (`windowSums(…, 7)`: `+int(now)` XP, `xpBefore`, `BarSpark recent={7}`), рекорды (`dl`: `recX` — `bestX100 > 0 ? (bestX100/100).toFixed(2)+'x' : '—'`, `recStreak` — `days`, `recPeak` — `int(peakBalance)`, `recFav` — `t('game.<id>')` | «—»).

- [ ] **Step 4: Вкладки** — `ProfileTabs.tsx`: `Seg` с вариантами по признакам, `useBoxHeight` на `.pf-pane`, `useMediaQuery('(min-width: 1100px) and (min-height: 620px)')` → `h = fits ? height : 0`; строки: `rowsFor(h, TABLE_RESERVE)` (игры, сделки, лента), `rowsFor(h, TABLE_RESERVE + HEAD_RESERVE)` (позиции), `tileCols(h)`; панели получают `rows` и `key={rows}` (смена числа строк — снова первый лист).
  - `GamesPane` — колонки из `PlayerResults` (с `HIDDEN_GAMES`), `pageOf` + `Pagination`, если игр больше листа.
  - `TradesPane` — `useProfileTrades(userId, page, rows, true)`, `TradesTable` (`chart={false} expand={false} tags={false}`, `skeletonRows={rows}`), `Pagination`.
  - `PositionsPane` — `useProfilePositions(userId, true)`, `PositionsTable flush` с `title={asOf ? posAsOf(time) : tabPositions}`, `totalPnl` — сумма по всем, `renderAge` — `formatPositionAge(openedAt)` по ключу `symbol-direction`; пусто — `EmptyState posEmpty*`; ошибка — `ErrorNote positionsFailed`.
  - `FeedPane` — `LedgerTable` Когда/Событие/Сумма/Баланс (`kinds.<kind>` с откатом на сам вид), `pageOf` + `Pagination`; пусто — `feedEmpty*`.
  - `AchievementTiles` — `ul.pf-tiles` со `--cols`, плашка `li.pf-tile[.is-got]` в `Tooltip` (условие), значок, имя, прогресс (у неполученных — полоса).

- [ ] **Step 5: Страница** — `Stripe.tsx` возвращает `<div className="pf-stripe" aria-hidden />`; `Page.tsx`:

```tsx
  return (
    <div className="pf-stage games-page">
      <Stripe />
      <div className="pf-card">
        <ErrorNote error={error} fallback={t('loadFailed')} />
        {data && (
          <>
            <Identity profile={data} />
            <SeasonLevel season={data.season} />
            <StatCells profile={data} />
            <ProfileTabs profile={data} />
          </>
        )}
      </div>
    </div>
  );
```

Удалить `PlayerResults.tsx`.

- [ ] **Step 6:** Run `cd frontend && npx tsc --noEmit && npx eslint src/views/profile src/entities/profile` — чисто.

---

### Task 6: Стили и сборка

**Files:** `frontend/src/app/globals.css` (блок «экран профиля» вместо `.pf-stage`/`.pfs-*`/`.pf-page`/`.pf-results`), `CLAUDE.md`.

- [ ] **Step 1: CSS** — сцена (`.pf-stage` как была), полоса `.pf-stripe` (`clip-path: polygon(80% 0, 104% 0, 89.5% 100%, 65% 100%)`, `#f2f0ea`), колонка `.pf-card` (`--pf-left: clamp(24px, 4.4vw, 64px)`, ширина `min(866px, calc(65vw - var(--pf-left) - 16px))`, флекс-колонка, `gap: clamp(14px, 2.4vh, 28px)`, сверху `top-h + clamp(16px, 3.5vh, 40px)`), шапка (`.pf-id`, `.pf-ava`, `.pf-name` `clamp(44px, 9vh, 84px)`, `.pf-badges`), уровень (`.pf-lvl`, `.pf-bar`), клетки (`.pf-stats` — сетка `1fr 1.15fr 1.15fr 1.25fr` между двумя линейками, `.pf-stat`, `.pf-spark*`, `.pf-rec`), вкладки (`.pf-tabs`, `.pf-pane { flex: 1; min-height: 0; overflow: hidden }`), плашки (`.pf-tiles`, `.pf-tile`, `.is-got` — выворот). Узкое/низкое окно — `@media (max-width: 1099px), (max-height: 619px)`: сцена `height: auto`, полосы нет, колонка во всю ширину, `.pf-pane` без обрезки, клетки 2×2; ≤ 700 px — плашки по две.

- [ ] **Step 2:** `npx next build` (новая страница данных и эндпоинты) и весь vitest; backend — весь jest и `tsc`.

- [ ] **Step 3: Глазами** — локальный стек, профиль демо-аккаунта и `pw-tester`, окно 1440×900 и 1366×768: `document.scrollingElement.scrollHeight <= innerHeight`, содержимое вкладки не срезано, вкладки переключаются; 390 px — колонка, страница листается.

- [ ] **Step 4: Контрольная точка ревью** (Sonnet): фронт + стык с API.

- [ ] **Step 5: CLAUDE.md** — раздел «Профиль игрока»: экран — карточка игрока (ссылка на спеку), «Торговля», вкладки, открытые позиции из снимка синка (не биржа), `pageSize`.
