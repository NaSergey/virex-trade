# Рамка терминала как в TradingView и колонка «Монеты ↔ Терминал» — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** верхняя панель и легенда OHLC на графике, правая рейка «Терминал / Монеты» со сворачиванием, список монет с ценой и изменением за 24 ч.

**Architecture:** сервер отдаёт тикеры двух рынков (Bybit — из уже существующего кэша `/market/tickers`, Binance — одним запросом 24hr). У `LiveSource` появляется необязательный `tickers`, и по нему `Terminal` решает, есть ли список монет. Легенда рисуется внутри `ReplayChart` записью в DOM, как перекрестие.

**Tech Stack:** NestJS + Jest (backend), Next.js + React Query + Vitest (frontend), lucide-react.

Спека: `docs/superpowers/specs/2026-11-17-terminal-tv-frame-design.md`.

## Global Constraints

- Любой запрос к Bybit — только через `bybitFetch` / `BybitTerminalClient.publicGet`. Новых запросов к Bybit нет: тикеры берутся из кэша `markPrices`.
- Запросы к Binance — через `BinanceKlinesClient` с его общей паузой после 429/418.
- Эндпоинты — под `JwtAuthGuard`, как соседние.
- `Terminal` — один экран на биржу, демо-счёт, бектест, турнир и главную. Второй экран не заводить.
- Легенда и перекрестие пишутся в DOM, не через состояние React. Тикеры опрашивает `Watchlist`, а не `Terminal`.
- Без сырой разметки для повторяющихся элементов: `Button`, `Seg`, `Input` из `shared/ui`; цвета — классами `.pos` / `.neg` / `.muted`.
- Кнопок отмены и повтора над графиком нет (сняты владельцем 2026-10-23).
- Тексты интерфейса — в `messages/ru.json` и `en.json`, пространство `backtest`.

---

### Task 1: Тикеры Bybit — `GET /api/terminal/tickers`

**Files:**
- Modify: `backend/src/terminal/terminal-market.service.ts` (кэш `markPrices` → кэш тикеров)
- Modify: `backend/src/terminal/terminal.controller.ts`
- Test: `backend/src/terminal/terminal-market.service.spec.ts`

**Interfaces:**
- Produces: `TerminalMarketService.tickers(): Promise<Ticker[]>`, где `Ticker = { symbol: string; last: number; change24h: number }` (экспорт из `terminal-market.service.ts`); `GET /api/terminal/tickers` → `{ tickers: Ticker[] }`.

- [ ] **Step 1: тест** — в `describe` сервиса, рядом с тестом маркировки:

```ts
it('тикеры — из того же запроса, что маркировка: цена и изменение за 24 ч в процентах', async () => {
  const { market, bybit } = setup(() => []);
  const tickers = () => bybit.publicGet.mock.calls.filter(([p]) => p === '/market/tickers').length;
  expect(await market.tickers()).toEqual([{ symbol: 'BTCUSDT', last: 60_000, change24h: 1.25 }]);
  expect((await market.markPrices()).get('BTCUSDT')).toBe(60_010);
  expect(tickers()).toBe(1);
});
```

В мок `/market/tickers` в `setup` добавить `price24hPcnt: '0.0125'`.

- [ ] **Step 2:** `cd backend && npx jest src/terminal/terminal-market.service.spec.ts` → FAIL (`tickers is not a function`).

- [ ] **Step 3: реализация.** Кэш хранит строки тикера, `markPrices` и `tickers` читают его:

```ts
export interface Ticker {
  symbol: string;
  last: number;
  /** Изменение за 24 часа, проценты. */
  change24h: number;
}

interface TickerRow extends Ticker {
  mark: number;
}

// поля класса вместо marks/marksInflight:
private board: Cached<TickerRow[]> | null = null;
private boardInflight: Promise<TickerRow[]> | null = null;

/** Все USDT-перпы одним публичным запросом — на всех пользователей процесса, раз в 2 с. */
private async tickerBoard(): Promise<TickerRow[]> {
  const now = this.now();
  const stale = () => (this.board && now - this.board.at < MARKS_STALE_MS ? this.board.value : []);
  if (this.board && now - this.board.at < MARKS_TTL_MS) return this.board.value;
  if (now - this.marksFailedAt < MARKS_TTL_MS) return stale();
  this.boardInflight ??= this.bybit
    .publicGet('/market/tickers', { category: 'linear' })
    .then((result) => {
      const value: TickerRow[] = [];
      for (const t of result.list ?? []) {
        const last = parseFloat(t.lastPrice);
        const mark = parseFloat(t.markPrice);
        if (!(last > 0) && !(mark > 0)) continue;
        value.push({ symbol: String(t.symbol), last, mark, change24h: (parseFloat(t.price24hPcnt) || 0) * 100 });
      }
      this.board = { at: this.now(), value };
      return value;
    })
    .finally(() => {
      this.boardInflight = null;
    });
  try {
    return await this.boardInflight;
  } catch {
    this.marksFailedAt = this.now();
    return stale();
  }
}

async markPrices(): Promise<ReadonlyMap<string, number>> {
  const rows = await this.tickerBoard();
  return new Map(rows.filter((r) => r.mark > 0).map((r) => [r.symbol, r.mark]));
}

/** Цена и изменение за 24 ч — список монет терминала. */
async tickers(): Promise<Ticker[]> {
  const rows = await this.tickerBoard();
  return rows.filter((r) => r.last > 0).map(({ symbol, last, change24h }) => ({ symbol, last, change24h }));
}
```

Контроллер — рядом с `symbols`:

```ts
/** Цена и изменение за сутки всех монет — список монет справа от графика. */
@Get('tickers')
async tickers() {
  return { tickers: await this.market.tickers() };
}
```

- [ ] **Step 4:** тот же jest → PASS, включая старый тест маркировки.
- [ ] **Step 5:** commit `feat(terminal): тикеры Bybit для списка монет из кэша маркировки`.

### Task 2: Тикеры эфира — `GET /api/market-data/live/tickers`

**Files:**
- Modify: `backend/src/market-data/binance-klines.client.ts`
- Modify: `backend/src/market-data/live-market.service.ts`
- Modify: `backend/src/market-data/market-data.controller.ts`
- Test: `backend/src/market-data/live-market.service.spec.ts`, `backend/src/market-data/binance-klines.client.spec.ts`

**Interfaces:**
- Produces: `BinanceKlinesClient.fetchTickers24h(symbols: string[]): Promise<{ symbol: string; last: number; change24h: number }[]>`; `LiveMarketService.tickers(): Promise<Ticker[]>` (тот же вид `Ticker`, объявить локально в `live-market.service.ts`); `GET /api/market-data/live/tickers` → `{ tickers }`.

- [ ] **Step 1: тесты.** Клиент: ответ `[{ symbol: 'BTCUSDT', lastPrice: '60000.5', priceChangePercent: '-1.20' }]` → `[{ symbol: 'BTCUSDT', last: 60000.5, change24h: -1.2 }]`; адрес содержит `ticker/24hr?symbols=` и закодированный JSON-массив. Сервис:

```ts
describe('tickers', () => {
  it('один запрос на весь список эфира, кэш 2 с', async () => {
    const { service, binance, setNow } = make();
    binance.fetchTickers24h = jest.fn().mockResolvedValue([{ symbol: 'BTCUSDT', last: 1, change24h: 2 }]);
    expect(await service.tickers()).toEqual([{ symbol: 'BTCUSDT', last: 1, change24h: 2 }]);
    setNow(T0 + 21_000);
    await service.tickers();
    expect(binance.fetchTickers24h).toHaveBeenCalledTimes(1);
    expect(binance.fetchTickers24h.mock.calls[0][0]).toContain('ETHUSDT');
  });
  it('биржа не ответила — пустой список, а не 500', async () => {
    const { service, binance } = make();
    binance.fetchTickers24h = jest.fn().mockRejectedValue(new Error('down'));
    expect(await service.tickers()).toEqual([]);
  });
});
```

- [ ] **Step 2:** `cd backend && npx jest src/market-data` → FAIL.
- [ ] **Step 3: реализация.** В клиенте разделить `request` на `getJson(url): Promise<unknown>` (цикл с паузой и повторами — без изменений) и разбор свечей; `fetchKlines` / `fetchRecent` / `fetchRange` зовут `this.klines(url)`, а `klines` — `getJson` + прежний разбор. Новый метод:

```ts
private static readonly TICKER_URL = 'https://api.binance.com/api/v3/ticker/24hr';

/** Цена и изменение за 24 ч монет списком — один запрос (вес 2 до 20 монет). */
async fetchTickers24h(symbols: string[]): Promise<{ symbol: string; last: number; change24h: number }[]> {
  const url = `${BinanceKlinesClient.TICKER_URL}?symbols=${encodeURIComponent(JSON.stringify(symbols))}`;
  const rows = (await this.getJson(url)) as { symbol: string; lastPrice: string; priceChangePercent: string }[];
  return rows.map((r) => ({ symbol: r.symbol, last: parseFloat(r.lastPrice), change24h: parseFloat(r.priceChangePercent) || 0 }));
}
```

Сервис: поле `tickersCache: { at: number; value: Ticker[] } | null`, `tickersInflight`. Кэш `CACHE_MS * 4 / 3` = 2000 мс (`TICKERS_MS = 2000`), список — `LIVE_SYMBOL_IDS`. При сбое — `[]` (или прошлый ответ моложе 30 с). Контроллер:

```ts
/** Цена и изменение за сутки монет эфира — список монет справа от графика. */
@Get('live/tickers')
async getLiveTickers() {
  return { tickers: await this.live.tickers() };
}
```

Маршрут `live/tickers` объявить **до** `live/:…`, если такой есть (сейчас нет), рядом с `live/prices`.

- [ ] **Step 4:** `npx jest src/market-data src/terminal` → PASS; `npx tsc --noEmit -p .` → чисто.
- [ ] **Step 5:** commit `feat(market-data): тикеры эфира за 24 ч одним запросом к Binance`.

**Контрольная точка ревью (B — контракт бэк↔фронт, правка кэша маркировки, от которого зависит PnL терминала).**

### Task 3: Чистые функции легенды и списка монет

**Files:**
- Create: `frontend/src/widgets/backtest-session/lib/legend.ts`, `legend.test.ts`
- Create: `frontend/src/widgets/backtest-session/lib/watchlist.ts`, `watchlist.test.ts`

**Interfaces:**
- Produces:
  - `legendOf(c: Candle, prev: Candle | undefined, decimals: number | undefined): { o: string; h: string; l: string; c: string; change: string; up: boolean }`
  - `watchDefaults(all: readonly string[], kind: 'bybit' | 'live'): string[]`, `watchShown(list: readonly string[], all: readonly string[]): string[]`, `watchAdd(list, symbol): string[]`, `watchRemove(list, symbol): string[]`, `WATCH_DEFAULT_BYBIT = 12`.

- [ ] **Step 1: тесты.**

```ts
// legend.test.ts
const c = (o: number, h: number, l: number, cl: number): Candle => ({ t: 0, o, h, l, c: cl });
it('OHLC и изменение от закрытия предыдущей', () => {
  expect(legendOf(c(64549, 64894, 64117, 64873), c(64000, 64600, 63900, 64557), 0)).toEqual({
    o: '64 549', h: '64 894', l: '64 117', c: '64 873', change: '+316 (+0,49 %)', up: true,
  });
});
it('без предыдущей — изменение от открытия', () => {
  expect(legendOf(c(100, 101, 98, 99), undefined, 2).change).toBe('−1,00 (−1,00 %)');
});
```

Форматы: цены — `formatPriceGrouped(v, decimals)` (как на шкале); изменение — тот же формат со знаком `+` / `−` и процент с двумя знаками через `formatPct`, если он есть в `shared/lib`, иначе `toFixed(2)` с запятой. **Точные строки теста подогнать под существующие форматтеры** (`grep -rn "export function formatPriceGrouped" frontend/src`), а не наоборот.

```ts
// watchlist.test.ts
const all = Array.from({ length: 20 }, (_, i) => `C${i}USDT`);
it('по умолчанию: биржа — первые 12, эфир — все', () => {
  expect(watchDefaults(all, 'bybit')).toEqual(all.slice(0, 12));
  expect(watchDefaults(all.slice(0, 9), 'live')).toEqual(all.slice(0, 9));
});
it('выпадает монета, которой больше нет', () => expect(watchShown(['C1USDT', 'XUSDT'], all)).toEqual(['C1USDT']));
it('добавить — в конец и без дублей; убрать', () => {
  expect(watchAdd(['A'], 'B')).toEqual(['A', 'B']);
  expect(watchAdd(['A', 'B'], 'A')).toEqual(['A', 'B']);
  expect(watchRemove(['A', 'B'], 'A')).toEqual(['B']);
});
```

- [ ] **Step 2:** `cd frontend && npx vitest run src/widgets/backtest-session/lib/legend.test.ts src/widgets/backtest-session/lib/watchlist.test.ts` → FAIL.
- [ ] **Step 3:** реализация по интерфейсам выше (по 15–25 строк каждая, без зависимостей кроме форматтеров).
- [ ] **Step 4:** тот же vitest → PASS.
- [ ] **Step 5:** commit `feat(terminal): расчёт легенды OHLC и состава списка монет`.

### Task 4: Источник тикеров, общее меню монет, компонент `Watchlist`

**Files:**
- Modify: `frontend/src/widgets/backtest-session/model/useLiveFeed.ts` (`LiveSource.tickers`, `SESSION_SOURCE.tickers`)
- Modify: `frontend/src/views/terminal/api/hooks.ts` (`EXCHANGE_SOURCE.tickers`)
- Modify: `frontend/src/widgets/backtest-session/components/CoinPicker.tsx` (вынести `CoinMenu`)
- Create: `frontend/src/widgets/backtest-session/components/Watchlist.tsx`
- Modify: `frontend/src/shared/i18n/messages/ru.json`, `en.json`

**Interfaces:**
- Consumes: `watchDefaults/watchShown/watchAdd/watchRemove` (Task 3), эндпоинты Task 1–2.
- Produces:
  - `interface Ticker { symbol: string; last: number; change24h: number }` (в `useLiveFeed.ts`, экспорт);
  - `LiveSource.tickers?: { kind: 'bybit' | 'live'; fetch: () => Promise<Ticker[]> }`;
  - `CoinMenu({ coins, value, onPick, onClose })` — поиск и список из `CoinPicker`, без кнопки;
  - `Watchlist({ coins, value, source, decimalsOf, onPick })` где `coins: readonly PickerCoin[]`, `source: NonNullable<LiveSource['tickers']>`.

- [ ] **Step 1:** `LiveSource`:

```ts
/** Цена и изменение за 24 ч всех монет — список монет справа. Нет — у этого рынка списка нет (главная). */
tickers?: { kind: 'bybit' | 'live'; fetch: () => Promise<Ticker[]> };
```

`SESSION_SOURCE.tickers = { kind: 'live', fetch: () => apiJson<{ tickers: Ticker[] }>('/api/market-data/live/tickers').then((r) => r.tickers) }`; `EXCHANGE_SOURCE.tickers` — то же с `'bybit'` и `/api/terminal/tickers`. `DEMO_SOURCE` главной не трогать.

- [ ] **Step 2:** `CoinMenu` — перенести из `CoinPicker` блок `.coin-menu` (поле поиска, список, «не найдено», Escape / Enter) в отдельный экспортируемый компонент того же файла; `CoinPicker` рисует `<CoinMenu … onClose={close} />`. Поведение `CoinPicker` не меняется.

- [ ] **Step 3:** `Watchlist`:

```tsx
const POLL_MS = 2000;

export function Watchlist({ coins, value, source, decimalsOf, onPick }: {
  coins: readonly PickerCoin[];
  value: string;
  source: NonNullable<LiveSource['tickers']>;
  decimalsOf: (symbol: string) => number | undefined;
  onPick: (symbol: string) => void;
}) {
  const t = useTranslations('backtest');
  const all = useMemo(() => coins.map((c) => c.symbol), [coins]);
  const [saved, setSaved] = usePersistentValue<string[] | null>(`virex.terminal.watchlist.${source.kind}`, decodeList, null, encodeList);
  const list = watchShown(saved ?? watchDefaults(all, source.kind), all);
  const [adding, setAdding] = useState(false);
  // Опрос — здесь, а не в Terminal: приход раз в 2 с перерисовывает только список.
  const { data } = useQuery({
    queryKey: ['market', 'tickers', source.kind],
    queryFn: source.fetch,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const bySymbol = useMemo(() => new Map((data ?? []).map((x) => [x.symbol, x])), [data]);
  // … разметка: шапка (.watch-head: «Монеты» + Button «+» → CoinMenu поверх),
  // таблица .watch: строка — Button variant="none" .watch-row (CoinLogo, символ без USDT,
  // цена formatPriceGrouped(last, decimalsOf(sym)), изменение .pos/.neg «+1,25 %»),
  // on — у value; ✕ — Button variant="bare" .watch-x, видна по наведению,
  // onClick stopPropagation → setSaved(watchRemove(list, sym)).
}
```

`usePersistentValue` / кодеки — как у соседних настроек (`grep -rn "usePersistentValue" frontend/src/widgets/backtest-session/model | head`); список — JSON-массив строк, битое значение → `null`.

- [ ] **Step 4: i18n** (`backtest`): `watch.title` «Монеты» / «Watchlist», `watch.add` «Добавить монету» / «Add symbol», `watch.remove` «Убрать из списка» / «Remove», `watch.symbol` «Инструмент» / «Symbol», `watch.last` «Цена» / «Last», `watch.change` «24 ч» / «24h».
- [ ] **Step 5:** `npx tsc --noEmit` во фронте → чисто; vitest Task 3 → PASS. Commit `feat(terminal): список монет с ценой и изменением за сутки`.

### Task 5: Легенда на графике

**Files:**
- Modify: `frontend/src/widgets/backtest-session/components/ReplayChart.tsx`
- Modify: `frontend/src/app/globals.css` (`.chart-legend*`)
- Modify: `ru.json` / `en.json`

**Interfaces:**
- Consumes: `legendOf` (Task 3).
- Produces: проп `ReplayChart.legend?: string` — первая строка легенды («BTCUSDT · 15м · Bybit»); без пропа легенды нет.

- [ ] **Step 1:** SVG-узлы поверх свечей, после группы свечей и до уровней, `pointerEvents="none"`:

```tsx
{legend && (
  <g className="chart-legend" pointerEvents="none">
    <text x={px(8)} y={PT + px(10)} className="chart-legend-title" fontSize={px(11)}>{legend}</text>
    <text x={px(8)} y={PT + px(24)} fontSize={px(11)} ref={legendRef}>
      {(['o', 'h', 'l', 'c'] as const).map((k) => (
        <Fragment key={k}>
          <tspan className="muted-fill">{t(`legend.${k}`)} </tspan>
          <tspan ref={(n) => { legendVal.current[k] = n; }} />
          <tspan>{'  '}</tspan>
        </Fragment>
      ))}
      <tspan ref={legendChange} />
    </text>
    {rsi && (
      <text x={px(8)} y={rsiTop + px(12)} fontSize={px(10)}>
        <tspan className="muted-fill">RSI 14 </tspan>
        <tspan ref={legendRsi} />
      </text>
    )}
  </g>
)}
```

- [ ] **Step 2:** `paintLegend()` — свеча под перекрестием (`crossPos` в поле, индекс как в `updateCross`), иначе последняя; у последней — анимированная (`animRef`, как в `paintLast`). Пишет `textContent` значений и `fill` (`var(--profit)` / `var(--loss)` по `up`) в узлы; RSI — `rsiData.rsi[f]` или `rsiLast`, `toFixed(2)`. Вызов — в конце `updateCross` и в конце `paintLast`. Никакого `useState`.
- [ ] **Step 3:** i18n `legend.o/h/l/c`: ru «О» «М» «Мн» «З», en «O» «H» «L» «C»; `legend.history` «История» / «History», `legend.synthetic` «Тренажёр» / «Simulator».
- [ ] **Step 4:** `npx tsc --noEmit`, `npx vitest run src/widgets/backtest-session` → PASS. Commit `feat(terminal): легенда OHLC и RSI на графике`.

### Task 6: Рамка `Terminal` — верхняя панель, полный экран, рейка и панель

**Files:**
- Create: `frontend/src/widgets/backtest-session/components/TerminalRail.tsx`
- Create: `frontend/src/widgets/backtest-session/model/useFullscreen.ts`
- Modify: `frontend/src/widgets/backtest-session/components/SessionScreen.tsx` (`Terminal`)
- Modify: `frontend/src/widgets/backtest-session/model/useChartSettings.ts` (`useRailPanel`)
- Modify: `frontend/src/views/terminal/components/TerminalScreen.tsx` (`sourceLabel`)
- Modify: терминал главной (`grep -rn "<Terminal" frontend/src/views/landing`) — `rail={false}`
- Modify: `frontend/src/app/globals.css`, `ru.json` / `en.json`

**Interfaces:**
- Consumes: `Watchlist`, `LiveSource.tickers` (Task 4), проп `legend` (Task 5).
- Produces: пропсы `Terminal`: `rail?: boolean` (по умолчанию true), `sourceLabel?: string` (по умолчанию «Binance» в эфире, нет — иначе); `useRailPanel(): ['order' | 'watch' | 'none', set]` (ключ `virex.terminal.rail`); `useFullscreen(ref): { on: boolean; toggle: () => void; supported: boolean }`.

- [ ] **Step 1: `useFullscreen`** — `document.fullscreenElement === ref.current`, подписка на `fullscreenchange`, `toggle` — `requestFullscreen()` / `exitFullscreen()` с `.catch(() => {})`; `supported = !!document.fullscreenEnabled` (в браузере, после монтирования).
- [ ] **Step 2: `TerminalRail`**:

```tsx
export function TerminalRail({ value, watch, onChange }: {
  value: 'order' | 'watch' | 'none';
  watch: boolean;
  onChange: (v: 'order' | 'watch' | 'none') => void;
}) {
  const t = useTranslations('backtest');
  const item = (id: 'order' | 'watch', Icon: typeof ArrowDownUp) => (
    <Button variant="bare" className={cn('rail-btn', value === id && 'on')} aria-pressed={value === id}
      title={t(`rail.${id}`)} aria-label={t(`rail.${id}`)} onClick={() => onChange(value === id ? 'none' : id)}>
      <Icon size={20} />
    </Button>
  );
  return <nav className="term-rail" aria-label={t('rail.label')}>{item('order', ArrowDownUp)}{watch && item('watch', List)}</nav>;
}
```

- [ ] **Step 3: `Terminal`.**
  - `const [railPanel, setRailPanel] = useRailPanel();` `const watchSource = (source ?? SESSION_SOURCE).tickers;` `const hasWatch = rail && isLive && !!watchSource && (coins?.length ?? 0) > 1;` `const panel = railPanel === 'watch' && !hasWatch ? 'order' : railPanel;`
  - Ключ `.panel-swap`: `chartSettingsOpen ? 'settings' : gridTrade ? 'grid' : panel === 'watch' ? 'watch' : 'order'`; ветка `'watch'` рисует `<Watchlist coins={coins} value={symbol} source={watchSource} decimalsOf={decimalsOf} onPick={switchSymbol} />`.
  - Корневой `.asym.terminal` получает `has-rail` (если `rail`) и `data-rail={chartSettingsOpen || gridTrade ? 'open' : panel}` — свёрнутость решает CSS; настройки и сетка разворачивают панель сами собой.
  - Над панелью — `Seg` «Терминал / Монеты» (`.rail-seg`, только при `hasWatch`; виден только на узком экране, см. CSS).
  - После `.marg` — `{rail && <TerminalRail value={panel} watch={hasWatch} onChange={setRailPanel} />}`.
  - Строка `.h2row` над графиком → `.chart-top`: слева `CoinPicker` / заглушка, черта `.chart-top-sep`, ТФ; справа `chartActions`, звук, настройки, полный экран (`Maximize` / `Minimize`, только при `supported`). `ref` полноэкранного — корень `.bt-live`.
  - Легенда: `legend={[symbolShown ? symbol : session.dataSource === 'synthetic' ? t('legend.synthetic') : t('legend.history'), t(`tf.${replay.shownTf}`), sourceLabel ?? (isLive ? 'Binance' : null)].filter(Boolean).join(' · ')}` — строкой через `useMemo`, ссылка стабильна между тиками.
- [ ] **Step 4: CSS** (в блоке терминала `globals.css`):

```css
.chart-top { display: flex; align-items: center; justify-content: space-between; gap: var(--s2); border-bottom: 1px solid var(--rule); padding-bottom: var(--s2); margin-bottom: var(--s2); flex-wrap: wrap; }
.chart-top-sep { width: 1px; align-self: stretch; background: var(--hair); margin: 0 var(--s1); }
.term-rail { display: none; }
.rail-seg { margin-bottom: var(--s2); }
@media (min-width: 1101px) {
  .asym.terminal.has-rail { grid-template-columns: minmax(0, 1fr) 360px 44px; }
  .asym.terminal.has-rail[data-rail="none"] { grid-template-columns: minmax(0, 1fr) 44px; }
  .asym.terminal.has-rail[data-rail="none"] > .marg { display: none; }
  .asym.terminal.has-rail .terminal-controls { grid-column: 1 / -2; }
  .term-rail { display: flex; flex-direction: column; gap: var(--s1); grid-column: -2 / -1; grid-row: 1 / -1; border-left: 1px solid var(--hair); padding-left: var(--s1); }
  .rail-btn { width: 36px; height: 36px; }
  .rail-btn.on { color: var(--ink); background: var(--fill-2, var(--hair)); }
  .rail-seg { display: none; }
}
.bt-live:fullscreen { --bt-screen: calc(100dvh - var(--s4) * 2); overflow-y: auto; background: var(--ground); }
.chart-legend text { fill: var(--color-fg); font-variant-numeric: tabular-nums; }
.chart-legend .muted-fill { fill: var(--muted, currentColor); opacity: 0.7; }
/* .watch* — таблица списка: строки 32 px, цена и изменение вправо, tabular-nums, ✕ видна на :hover строки */
```

  Токены (`--ink`, `--hair`, `--muted`, `--ground`) — сверить с `:root` в `globals.css` и взять существующие имена.
- [ ] **Step 5: страницы.** `TerminalScreen`: `sourceLabel={demo ? 'Bybit Demo' : 'Bybit'}` (признак демо — как у `useAccountBadge`). Главная: `rail={false}`.
- [ ] **Step 6: i18n**: `rail.label` «Панели» / «Panels», `rail.order` «Терминал» / «Trade», `rail.watch` «Монеты» / «Watchlist», `fullscreen` «Во весь экран» / «Fullscreen», `exitFullscreen` «Выйти из полного экрана» / «Exit fullscreen».
- [ ] **Step 7:** `npx tsc --noEmit`, `npx eslint src/widgets/backtest-session src/views/terminal`, `npx vitest run src/widgets/backtest-session src/views/terminal` → чисто. Commit `feat(terminal): верхняя панель, полный экран и правая рейка «Терминал / Монеты»`.

### Task 7: Сборка и CLAUDE.md

- [ ] **Step 1:** `cd frontend && npx next build` → успешно; `cd backend && npx jest src/terminal src/market-data && npx tsc --noEmit` → чисто.
- [ ] **Step 2:** CLAUDE.md, раздел «Биржевой терминал»: абзац про рамку (верхняя панель, легенда в DOM, рейка `virex.terminal.rail`, список монет `virex.terminal.watchlist.<kind>`, тикеры из кэша маркировки и одним запросом Binance; на главной рейки нет). В «Цена рендера терминала» — строка: легенда пишется в DOM вместе с перекрестием и последней свечой; тикеры опрашивает `Watchlist`.
- [ ] **Step 3:** commit `docs: рамка терминала и список монет в CLAUDE.md`.

**Контрольная точка ревью (B — общий экран трёх страниц, стык бэк↔фронт).** Вторая и последняя точка: в неё включается стык; отдельный Opus-прогон не нужен.
