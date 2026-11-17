# Несколько графиков на `/terminal` — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** сетка из 1–4 графиков на `/terminal`; активный график — нынешний график терминала, неактивные показывают свою монету и ТФ.

**Architecture:** каждая ячейка — один и тот же `ChartPane` (memo) со своей лентой `useLiveFeed`. Активной ячейке пропсы графика отдаёт `Terminal`, и её лента стоит. Уровни и отметки выносятся из `Terminal` в чистые функции, и неактивная ячейка зовёт их сама.

**Tech Stack:** Next.js, React 19 + React Compiler, Vitest.

Спека: `docs/superpowers/specs/2026-11-17-terminal-multichart-design.md`.

## Global Constraints

- Только там, где `Terminal` получил `multiChart` (`TerminalScreen`, `DemoTerminal`); без него поведение и разметка — как до правки.
- Узкий экран (≤ 1100 px) — одна ячейка, неактивные не монтируются.
- Неактивная ячейка: `draggable: false`, без ✕, без черновика, без правки рисунков; `pointerdown` в фазе захвата — активация.
- Ключи устройства: `virex.terminal.layout`, `virex.terminal.panes` (строка `SYM:tf,…`), `virex.terminal.activePane`.
- Вынос уровней не меняет поведения активного графика: существующие тесты зелёные.
- Без сырой разметки для повторяющихся элементов; цвета — токенами.

---

### Task 1: `lib/panes.ts` — раскладки и состав ячеек

**Files:** Create `frontend/src/widgets/backtest-session/lib/panes.ts`, `panes.test.ts`.

**Produces:**
```ts
export type LayoutId = '1' | '2h' | '2v' | '3' | '4';
export const LAYOUTS: readonly LayoutId[];
export interface Pane { symbol: string; tf: number }
export function paneCount(layout: LayoutId): number;           // 1,2,2,3,4
export function decodeLayout(raw: string | null): LayoutId;     // неизвестное → '1'
export function encodePanes(panes: readonly Pane[]): string;    // 'BTCUSDT:15,ETHUSDT:60'
export function decodePanes(raw: string | null, tfs: readonly number[]): Pane[]; // битые и чужие ТФ отбрасываются
export function fillPanes(panes: readonly Pane[], count: number, coins: readonly string[], tf: number): Pane[];
```
`fillPanes`: монета не из `coins` → заменяется свободной монетой из `coins` (той, которой нет среди остальных); недостающие ячейки до `count` — следующими свободными монетами из `coins` с ТФ `tf`; лишние ячейки сверх `count` сохраняются; если свободных монет нет — повтор первой монеты `coins`.

- [ ] Тесты: `paneCount`, кодирование туда-обратно, битая строка → `[]`, ТФ не из списка → ячейка отброшена, `fillPanes` (с 1 до 4 — разные монеты по порядку `coins`, без дублей, ТФ активного; с 4 до 2 — длина прежняя; неизвестная монета заменена свободной).
- [ ] FAIL → реализация → PASS → commit `feat(terminal): раскладки и состав графиков`.

### Task 2: уровни и отметки — чистыми функциями

**Files:** Create `frontend/src/widgets/backtest-session/lib/chart-levels.ts`, `chart-levels.test.ts`; Modify `components/SessionScreen.tsx` (`levels`, `markers`).

**Produces:**
```ts
export interface PositionLevelsInput {
  trades: readonly BacktestTrade[];          // открытые сделки монеты графика
  closeOrders: readonly BacktestCloseOrder[];
  entryOrders: readonly BacktestEntryOrder[];
  symbol: string;
  scale: number;
  livePrice: number | null;                  // настоящая цена — PnL плашки входа
  screenPrice: number | null;                // экранная — шанс тейка
  balance: number;
  qtyStepOf: (symbol: string) => number;
  draggable: boolean;                        // false — неактивная ячейка
  oddsOn: boolean;
  trailName: string;                         // t('level.trailStop')
  pendingLevel?: { tradeId: string; kind: 'stop' | 'take'; price: number } | null;
  pendingOrder?: { id: string; price: number } | null;
}
export function positionLevels(input: PositionLevelsInput): Level[];
export function tradeMarkers(trades: readonly BacktestTrade[], symbol: string, scale: number): Marker[];
```
Перенести дословно цикл по `chartTrades`, `entryOrders` из `levels` и весь `markers` (типы `pendingLevel`/`pendingOrder` — как у состояний в `Terminal`, сверить по коду). `draggable` подставляется вместо литералов `true`. Сетка фиксации и черновик остаются в `Terminal`: `levels = [...draft, ...positionLevels(...)]`, затем прежняя ветка сетки фиксации.

- [ ] Тесты: позиция монеты даёт `entry`, `stop`, `take`, `limitClose`; сделка чужой монеты — ничего; `draggable: false` у всех; лимит на вход своей монеты — `pendingEntry`; отметки: вход и выход, выход с тоном.
- [ ] Прогнать `npx vitest run src/widgets/backtest-session` → PASS; `tsc` чисто. Commit `refactor(terminal): уровни позиций и отметки сделок — чистыми функциями`.

**Контрольная точка ревью (B — рефактор рабочего кода общего экрана).**

### Task 3: лента с заданным ТФ, состояние графиков, ширина экрана

**Files:** Modify `model/useLiveFeed.ts`; Create `model/usePanes.ts`, `shared/lib/hooks/useMediaQuery.ts`.

**Produces:**
- `useLiveFeed(detail, enabled, symbol, source, paused, anchors, fixedTf?: number)` — с `fixedTf` `tf = fixedTf`, `setTf` ничего не делает.
- `useMediaQuery(query: string): boolean` — `useSyncExternalStore` по `matchMedia`, на сервере `true` (`(min-width: 1101px)` — широкий).
- `usePanes(coins: readonly string[], fallbackSymbol: string)` →
  `{ layout, setLayout, panes /* ровно paneCount(layout) */, active, activate(i), setPane(i, patch) }`; хранение — `usePersistentValue` строками; `panes` = `fillPanes(decodePanes(raw) ?? [{fallbackSymbol, DEFAULT_TIMEFRAME}], count, coins, activeTf).slice(0, count)`; запись — полный список (лишние сохраняются).
- [ ] `tsc` чисто, тесты ленты зелёные. Commit `feat(terminal): лента с заданным ТФ и состояние графиков`.

### Task 4: `ChartPane`, `LayoutPicker`, проводка `Terminal`

**Files:** Create `components/ChartPane.tsx`, `components/LayoutPicker.tsx`; Modify `components/SessionScreen.tsx`, `components/TerminalSkeleton.tsx`, `views/terminal/components/TerminalScreen.tsx`, `views/terminal/components/DemoTerminal.tsx`, `app/globals.css`, i18n.

- `ChartPane` (memo), пропсы: `pane: Pane`, `active: boolean`, `main: ReplayChartProps | null` (у активной), `detail`, `source`, `scale`, `decimals`, `labelFor`, `levelLabel`, `rsi`, `userId`, `sessionId`, `sourceLabel`, `qtyStepOf`, `oddsOn`, `onActivate`. Своя лента `useLiveFeed(detail, true, pane.symbol, source, active, NO_ANCHORS, pane.tf)`. Активная: `<ReplayChart {...main} candles={mainReady ? main.candles : ownCandles} />`. Неактивная: уровни `positionLevels({ draggable: false, … })`, отметки `tradeMarkers`, рисунки `useSessionDrawings` (ключ — `drawingsKey(sessionId, symbol)` — тот же, что у `useDrawingTools` в `Terminal`, вынести в `lib/drawings/store.ts`), легенда `символ · ТФ · источник`. Корень `.pane` с `onPointerDownCapture`: не активна → `onActivate()`, `e.stopPropagation()`, `e.preventDefault()`.
- `LayoutPicker`: кнопка `LayoutGrid` в `.chart-top-r`, меню из пяти кнопок-схем (SVG 20×14 по раскладке), закрытие по клику мимо (`useOutsideClose`), Escape.
- `Terminal`: проп `multiChart`; при нём и широком экране — `usePanes`; `symbol`/`setSymbol` — активной ячейки (и `setLiveSymbol`); лента терминала — `fixedTf = panes[active].tf`, смена ТФ пишет ячейку; `chart-tools-main` рисует `.panes[data-layout]` с `ChartPane` на каждую ячейку (без `multiChart` — одна ячейка с `main`).
- CSS `.panes`, `.pane`, `.pane.on`, `.layout-menu`; заглушка с сеткой; `multiChart` у `TerminalScreen` и `DemoTerminal` (через `SessionScreen`).
- i18n: `layout.label` «Раскладка» / «Layout», `layout.1` «Один график» / «One chart», `layout.2h` «Два рядом» / «Two side by side», `layout.2v` «Два стопкой» / «Two stacked», `layout.3` «Три» / «Three», `layout.4` «Четыре» / «Four».
- [ ] `tsc`, `eslint`, `vitest` чисто. Commit `feat(terminal): несколько графиков на /terminal`.

### Task 5: сборка и CLAUDE.md

- [ ] `npx next build` → успешно.
- [ ] CLAUDE.md, раздел «Биржевой терминал»: несколько графиков (одна ячейка — один компонент; активная — график терминала; первое нажатие — активация; ключи устройства; узкий экран — один).
- [ ] Commit `docs: несколько графиков терминала в CLAUDE.md`.

**Контрольная точка ревью (B — общий экран и стык уровней).** Вторая и последняя; Opus не нужен.
