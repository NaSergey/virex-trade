# История бектеста на пяти монетах — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** реальная сессия бектеста идёт на BTC, ETH, BNB, XRP или SOL — на выбранной монете или на случайной, скрытой до итога.

**Architecture:** монета — колонка сессии (`symbol`, `hideSymbol`); сервер выбирает окно старта по монете и берёт цену старта у Binance; сделки сессии истории принимают только её монету. Фронт прокручивает свечи монеты сессии через тот же `/api/market-data/candles?symbol=`, который уже проксирует Binance для эфира.

**Tech Stack:** NestJS + Prisma (backend, jest), Next.js App Router + react-query (frontend, vitest).

Спека: `docs/superpowers/specs/2026-10-23-backtest-history-coins-design.md`.

## Global Constraints

- Монеты истории: BTCUSDT, ETHUSDT, BNBUSDT, XRPUSDT, SOLUSDT; `historySince` — первая минутка Binance (BTC — `START_MS`).
- `CreateSessionDto.symbol`: `'random'` | монета истории; не задан — BTC без скрытия.
- Случайная монета — сервером, `this.rnd`, равные доли; `hideSymbol = true`.
- Отказы: чужая монета — 400 `BACKTEST_SYMBOL_UNAVAILABLE`; Binance не ответил на цену старта — 503 `BACKTEST_MARKET_UNAVAILABLE`.
- Свечи не-BTC не хранятся. Колонки только добавляются (`db push` без потери данных).
- Тексты интерфейса — ru и en.

## Выполнение (гибрид, решение владельца)

Код и тесты — инлайн. Одна контрольная точка ревью (класс B: контракт бэк↔фронт) после задачи 2 — свежий Sonnet по всему диффу ветки. Opus не нужен: точка одна.

---

### Task 1: Сервер — монета у сессии истории

**Files:**
- Modify: `backend/src/market-data/symbols.ts`
- Modify: `backend/prisma/schema.prisma` (model `BacktestSession`)
- Modify: `backend/src/backtest/dto/backtest.dto.ts` (`CreateSessionDto`)
- Modify: `backend/src/backtest/backtest.service.ts` (`CreateSessionInput`, `MaybeLive`, `symbolFor`, `symbolUnavailable`, `createSession`, `setLeverage`, новые `historyWindow`, `priceBefore`, `marketUnavailable`)
- Test: `backend/src/backtest/backtest.service.spec.ts`

**Interfaces — Produces:**
- `LIVE_SYMBOLS[i].historySince?: number` (едет фронту в `/api/market-data/live/symbols`)
- `HISTORY_SYMBOL_IDS: string[]`, `historySince(symbol): number | null`
- Сессия в ответах API: `symbol: string`, `hideSymbol: boolean`
- `POST /api/backtest/sessions` принимает `symbol?: 'random' | HistorySymbol`

- [ ] **Step 1: список монет**

```ts
// symbols.ts — у пяти записей поле historySince (сверено klines?startTime=0, 2026-10-23)
{ symbol: 'BTCUSDT', base: 'BTC', decimals: 2, historySince: START_MS },
{ symbol: 'ETHUSDT', base: 'ETH', decimals: 2, historySince: Date.UTC(2017, 7, 17, 4) },
{ symbol: 'SOLUSDT', base: 'SOL', decimals: 2, historySince: Date.UTC(2020, 7, 11, 6) },
{ symbol: 'BNBUSDT', base: 'BNB', decimals: 2, historySince: Date.UTC(2017, 10, 6, 3, 54) },
{ symbol: 'XRPUSDT', base: 'XRP', decimals: 4, historySince: Date.UTC(2018, 4, 4, 8, 11) },

export const historySince = (symbol: string): number | null => {
  const s = LIVE_SYMBOLS.find((x) => x.symbol === symbol);
  return s && 'historySince' in s ? s.historySince : null;
};
export const HISTORY_SYMBOL_IDS: string[] = LIVE_SYMBOL_IDS.filter((s) => historySince(s) != null);
```

`START_MS` — из `./timeframes` (тот symbols не импортирует — цикла нет).

- [ ] **Step 2: схема и DTO**

```prisma
  /// Монета сессии истории ('real'), market-data/symbols.ts (historySince). У тренажёра и
  /// эфира не используется: у эфира монета — у сделки и ордера.
  symbol         String      @default("BTCUSDT")
  /// Монету выбрал сервер случайно: интерфейс не показывает её до итога, как скрытую дату.
  hideSymbol     Boolean     @default(false)
```

```ts
  /** Монета истории: 'random' — выберет сервер и скроет. Не задана — BTC. Только у истории. */
  @IsOptional()
  @IsIn([...HISTORY_SYMBOL_IDS, 'random'])
  symbol?: string;
```

`npx prisma generate` (остановить `nest watch`, если держит движок — см. память про EPERM).

- [ ] **Step 3: падающие тесты** (в `backtest.service.spec.ts`; в `makeService` у `live` добавить `history: jest.fn().mockResolvedValue([{ time: new Date(T0), open: 1, high: 1, low: 1, close: 2_000, volume: 1 }])`)

```ts
it('без монеты — BTC без скрытия', async () => {
  const { service, prisma } = makeService();
  await service.createSession('u1', INPUT);
  expect(prisma.backtestSession.create.mock.calls[0][0].data).toMatchObject({ symbol: 'BTCUSDT', hideSymbol: false });
});

it('монета истории: окно от её первой минутки, цена старта — у Binance', async () => {
  const { service, prisma, marketData, live } = makeService();
  await service.createSession('u1', { ...INPUT, hidePrice: true, symbol: 'ETHUSDT' });
  const start = historySince('ETHUSDT')! + 200 * DAY; // rnd = 0 → начало окна
  expect(marketData.getCoverage).not.toHaveBeenCalled();
  expect(live.history).toHaveBeenCalledWith('ETHUSDT', { timeframe: 1, to: new Date(start - 60_000), limit: 1 });
  const data = prisma.backtestSession.create.mock.calls[0][0].data;
  expect(data).toMatchObject({ symbol: 'ETHUSDT', hideSymbol: false, startTime: new Date(start) });
  expect(data.priceScale).toBeCloseTo(100 / 2_000, 12);
});

it('случайная монета — её выбирает сервер и скрывает', async () => {
  const { service, prisma } = makeService();
  const seq = [0.99];
  (service as unknown as { rnd: () => number }).rnd = () => seq.shift() ?? 0;
  await service.createSession('u1', { ...INPUT, symbol: 'random' });
  const data = prisma.backtestSession.create.mock.calls[0][0].data;
  expect(data).toMatchObject({ symbol: HISTORY_SYMBOL_IDS[HISTORY_SYMBOL_IDS.length - 1], hideSymbol: true });
});

it('Binance не ответил на цену старта — 503, сессии нет', async () => {
  const { service, prisma, live } = makeService();
  live.history.mockRejectedValue(new Error('Binance klines: HTTP 502'));
  const err = await rejection(service.createSession('u1', { ...INPUT, symbol: 'SOLUSDT' }));
  expect(err).toBeInstanceOf(ServiceUnavailableException);
  expect(err.getResponse()).toMatchObject({ code: 'BACKTEST_MARKET_UNAVAILABLE' });
  expect(prisma.backtestSession.create).not.toHaveBeenCalled();
});
```

В блоке монет эфира (рядом с `openEth`):

```ts
const ETH_HISTORY = { ...SESSION, symbol: 'ETHUSDT', tournament: null };
const openHistory = (service: BacktestService, symbol?: string) =>
  service.openTrade('u1', 's1', {
    symbol, direction: 'long', entryTime: new Date(T0 + DAY), entryPrice: 2_500, stopLoss: 2_400, riskPct: 1, leverage: 10,
  });

it('история на ETH: сделка без монеты — по монете сессии', async () => {
  const { service, prisma } = makeService();
  prisma.backtestSession.findUnique.mockResolvedValue(ETH_HISTORY);
  await openHistory(service);
  expect(prisma.backtestTrade.create.mock.calls[0][0].data.symbol).toBe('ETHUSDT');
});

it('история на ETH: BTC — отказ', async () => {
  const { service, prisma } = makeService();
  prisma.backtestSession.findUnique.mockResolvedValue(ETH_HISTORY);
  const e = await rejection(openHistory(service, 'BTCUSDT'));
  expect(e.response.code).toBe('BACKTEST_SYMBOL_UNAVAILABLE');
});
```

Run: `cd backend && npx jest src/backtest/backtest.service.spec.ts` → новые падают (нет `symbol` в data, нет `history`-пути).

- [ ] **Step 4: реализация**

```ts
const marketUnavailable = () =>
  new ServiceUnavailableException({ message: 'Биржа не ответила — сессию не с чего начать', code: 'BACKTEST_MARKET_UNAVAILABLE' });

type MaybeLive = { dataSource?: string; tournament?: { mode: string } | null; endTime?: Date | null; symbol?: string };

const symbolFor = (s: MaybeLive, symbol: string | undefined): string => {
  if (isLive(s)) return symbol ?? DEFAULT_SYMBOL;
  const own = s.symbol ?? DEFAULT_SYMBOL;
  if (symbol !== undefined && symbol !== own) throw symbolUnavailable();
  return own;
};

// createSession, ветка истории:
const hideSymbol = input.symbol === 'random';
const symbol = hideSymbol
  ? HISTORY_SYMBOL_IDS[Math.floor(this.rnd() * HISTORY_SYMBOL_IDS.length)]
  : (input.symbol ?? DEFAULT_SYMBOL);
const win = await this.historyWindow(symbol);
if (!win) throw noHistory();
const start = pickStart(win, this.rnd);
const last = await this.priceBefore(symbol, start);
if (!last) throw noHistory();
// data: + symbol, hideSymbol

protected async historyWindow(symbol: string): Promise<StartWindow | null> {
  if (symbol === DEFAULT_SYMBOL) {
    const coverage = await this.marketData.getCoverage();
    return startWindow(coverage.find((c) => c.timeframe === 1440), coverage.find((c) => c.timeframe === 1));
  }
  const since = new Date(historySince(symbol)!);
  return startWindow({ from: since, to: null }, { from: since, to: new Date() });
}

protected async priceBefore(symbol: string, start: number) {
  const to = new Date(start - MINUTE_MS);
  if (symbol === DEFAULT_SYMBOL) return (await this.marketData.getCandles({ timeframe: 1, to, limit: 1 }))[0];
  try {
    return (await this.live.history(symbol, { timeframe: 1, to, limit: 1 }))[0];
  } catch {
    throw marketUnavailable();
  }
}
```

`setLeverage(…, symbol?: string)` → `const sym = symbolFor(s, symbol)` и `sym` в `where`. Сообщение `symbolUnavailable` — «Монета не этой сессии».

- [ ] **Step 5: прогон** — `npx jest src/backtest src/market-data` и `npx tsc --noEmit -p tsconfig.json` → зелёные.

- [ ] **Step 6: коммит** `feat(backtest): история бектеста на ETH, BNB, XRP, SOL — сервер`

### Task 2: Фронт — выбор монеты, прокрутка, скрытие

**Files:**
- Modify: `frontend/src/widgets/backtest-session/api/types.ts` (`BacktestSession.symbol`, `.hideSymbol`, `LiveSymbol.historySince?`)
- Modify: `frontend/src/widgets/backtest-session/api/hooks.ts` (`useCreateSession` — `symbol?: string`)
- Modify: `frontend/src/widgets/backtest-session/index.ts` (экспорт `useLiveSymbols`)
- Modify: `frontend/src/widgets/backtest-session/model/useReplay.ts` (монета в запросах свечей)
- Modify: `frontend/src/widgets/backtest-session/components/SessionScreen.tsx` (`localSymbol`, знаки цены)
- Modify: `frontend/src/widgets/backtest-session/components/SessionSummary.tsx` (`revealedCoin`)
- Modify: `frontend/src/views/backtest/components/StartSession.tsx` (поле «Монета»)
- Modify: `frontend/src/views/backtest/components/SessionsList.tsx` (колонки «График», «Вслепую»)
- Modify: `frontend/src/views/terminal/lib/adapt.ts`, `frontend/src/views/landing/lib/demoAccount.ts` (новые поля сессии)
- Modify: `frontend/src/shared/i18n/messages/ru.json`, `en.json` (`backtest.coinRandom`, `blindCoin`, `revealedCoin`, `startLead`)

- [ ] **Step 1: типы и запросы** — поля в типах; `useCreateSession` input `+ symbol?: string`; `useLiveSymbols` в экспорт виджета; снимки сессии в `adapt.ts`/`demoAccount.ts` — `symbol: DEFAULT_SYMBOL, hideSymbol: false`.
- [ ] **Step 2: прокрутка** — в `useReplay` источник несёт монету только у истории:

```ts
const symbol = dataSource === 'real' ? detail.session.symbol : undefined;
const source = useMemo(() => ({ id: sessionId, dataSource, symbol }), [sessionId, dataSource, symbol]);
// три вызова: fetchCandles(source, tf, range, source.symbol)
```

- [ ] **Step 3: экран** — `useState(session.symbol)` вместо `DEFAULT_SYMBOL` у `localSymbol`; знаки цены у истории с видимой ценой:

```ts
const symbolDecimals = isLive || (session.dataSource === 'real' && !session.hidePrice);
const liveDecimalsOf = useDecimalsOf(symbolDecimals && !decimalsOfProp);
```

- [ ] **Step 4: форма** — `Seg` «Монета» под «Графиком» у истории: `random` + монеты с `historySince` из `useLiveSymbols(market === 'real')`, подписи — `base`; по умолчанию `random`; в `create.mutate` — `symbol: market === 'real' ? coin : undefined`.
- [ ] **Step 5: список и итог** — «График»: у истории без скрытия `«История · ETH»` (`symbol.replace(/USDT$/, '')`); «Вслепую»: у `hideSymbol` первым `blindCoin`. Итог истории: `t('revealedCoin', { coin, from, to })`, у эфира — прежний `revealed`.
- [ ] **Step 6: тексты** — ru: `coinRandom` «Случайная», `blindCoin` «монета», `revealedCoin` «Отрезок {coin}: {from} — {to}», `startLead` «Случайный отрезок истории BTC, ETH, BNB, XRP или SOL. Будущее скрыто: свечи открываются по одной, в сделку вы входите и выходите сами.»; en: «Random», «coin», «Stretch {coin}: {from} — {to}», «A random stretch of BTC, ETH, BNB, XRP or SOL history. The future is hidden: candles open one by one, and you enter and exit trades yourself.»
- [ ] **Step 7: проверка** — `npx tsc --noEmit`, `npx eslint` по изменённым файлам, `npx vitest run src/widgets/backtest-session src/views/terminal`, `npx next build`.
- [ ] **Step 8: коммит** `feat(backtest): выбор монеты истории на фронте`

### Контрольная точка B: ревью Sonnet

Свежий ревьюер (Sonnet) по `git diff main...HEAD` против спеки: вердикт «спека ✅/❌» + качество. Правки — до 3 кругов.

### Task 3: Живой прогон и документация

- [ ] Поднять стек (`start.bat`), войти тестовым пользователем; сессия SOL с видимыми ценой и датой — 1Д, прокрутка, сделка со стопом, закрытие; случайная со скрытыми ценой и датой — монеты нет ни в терминале, ни в списке; завершить — монета в итоге.
- [ ] CLAUDE.md: в «Бектест: режим «Эфир»» поправить строку про не-BTC вне эфира и добавить короткий раздел про монеты истории.
- [ ] Коммит `docs: монеты истории бектеста`.
