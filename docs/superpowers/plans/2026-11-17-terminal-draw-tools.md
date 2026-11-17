# Новые инструменты рисования и объёмы — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 23 новых инструмента рисования, объём в свечах и индикатор «Объём».

**Architecture:** вид фигуры — запись в `DRAWING_KINDS`, число кликов — `placement`, геометрия — чистые функции (`lib/drawings/geometry.ts`, расчёты по свечам — `lib/drawings/series.ts`), отрисовка — ветка в `DrawingLayer`, кнопка — запись в `GROUPS` панели. Постановка за N кликов обобщает нынешний жест «две точки».

**Tech Stack:** React 19, SVG, Vitest.

Спека: `docs/superpowers/specs/2026-11-17-terminal-draw-tools-design.md`.

## Global Constraints

- Новые виды: `regression, pitchfork, fibExt, fibChannel, fibFan, fibTime, gannFan, ellipse, triangle, polyline, path, curve, arc, callout, priceLabel, flag, xabcd, headShoulders, elliottImpulse, elliottCorrection, cycleLines, volumeProfile, vwap`.
- Клики: 1 — `priceLabel, flag, vwap`; 2 — `regression, fibFan, fibTime, gannFan, ellipse, callout, cycleLines, volumeProfile`; 3 — `pitchfork, fibExt, fibChannel, triangle, curve, arc`; 4 — `elliottCorrection`; 5 — `xabcd`; 6 — `elliottImpulse`; 7 — `headShoulders`; `'open'` — `polyline, path` (2–200 точек).
- Отрисовка в DOM SVG, без новых состояний React на кадр; хит — прозрачная толстая копия штриха (`hitLine`).
- Старые рисунки читаются (версия формата прежняя).
- Индикатор «Объём» по умолчанию выключен (`virex.terminal.volume`).

---

### Task 1: объём в свечах и индикатор «Объём»
**Files:** `lib/candles.ts` (+test), `views/landing/lib/demoMarket.ts`, `model/useChartSettings.ts`, `components/ChartSettingsPanel.tsx`, `components/ReplayChart.tsx` (проп `volume`), `components/SessionScreen.tsx`, `components/ChartPane.tsx`, i18n.
- [ ] `Candle.v?: number`; `fromApi` → `v: c.volume`; склейка суммирует `v` (тест); `scaleCandle` сохраняет `v`.
- [ ] `useVolumeOn` (`virex.terminal.volume`, по умолчанию false); выключатель в `ChartSettingsPanel` рядом с RSI.
- [ ] `ReplayChart volume` — столбики у низа поля цены (до 18 % высоты поля, цвет направления, opacity 0.35), под свечами; `V` в легенде (`paintLegend`).
- [ ] Commit `feat(terminal): объём в свечах и индикатор «Объём»`.

### Task 2: постановка за N кликов, хранилище, панель
**Files:** `lib/drawings/types.ts`, `lib/drawings/geometry.ts`, `lib/drawings/store.ts` (+tests), `components/drawings/useDrawingGestures.ts`, `components/drawings/DrawingToolbar.tsx`, `components/drawings/ToolIcons.tsx` (новый, свои SVG), i18n (`drawings.tool.<kind>`, `drawings.group.patterns`).
- [ ] Виды в `DrawingKind`/`DRAWING_KINDS`; `placement(kind): number | 'open' | 'drag'`; `pointsNeeded(kind)` для проверки хранилища; `isDrawing` проверяет число точек (тест).
- [ ] Жест `create` копит `pts`; фиксированное N — фигура на N-м клике; `'open'` — двойной клик / Enter / клик по последней точке; превью — точки + курсор. Двухточечные — как сейчас (Shift, магнит).
- [ ] `GROUPS` по спеке, иконки.
- [ ] Commit `feat(terminal): постановка фигур за несколько кликов, новые виды в хранилище и на панели`.

**Контрольная точка ревью (B — общий жест рисования).**

### Task 3: Фибоначчи, Ганн, вилы, регрессия
- [ ] Геометрия (тесты): `fibExtLevels(a,b,c)`, `fibChannelLines(a,b,c)`, `fanRays(a,b,ks)`, `fibTimeTs(a,b)`, `gannRays(a,b)`, `pitchforkLines(p0,p1,p2)`; `series.ts`: `regression(candles, t1, t2)` → `{ a, b, sigma }` (тест).
- [ ] Ветки `DrawingLayer`; anchors `fibChannel` как у канала. Commit.

### Task 4: фигуры
- [ ] Геометрия: `ellipseOf(a,b)`, `quadThrough(a,b,c)` → контрольная точка (тест). Ветки `ellipse, triangle, polyline, path, curve, arc`. Commit.

### Task 5: метки
- [ ] Ветки `callout` (текст — `DrawingStyleBar` как у `text`), `priceLabel`, `flag`. Commit.

### Task 6: паттерны и волны
- [ ] Геометрия: `xabcdRatios(pts)`, `necklineOf(pts)`, `cycleTs(a,b,tEnd)` (тесты). Ветки пяти видов. Commit.

### Task 7: инструменты объёма
- [ ] `series.ts`: `volumeProfile(candles, t1, t2, rows)` → `{ lo, hi, rows: number[], poc, vaLo, vaHi }`, `anchoredVwap(candles, t)` → точки (тесты). Ветки `volumeProfile`, `vwap`. Commit.

### Task 8: сборка, CLAUDE.md
- [ ] `npx next build`; CLAUDE.md — раздел «График терминала: разметка как в TradingView» дополнить; commit.

**Контрольная точка ревью (C/B — инструменты и стык с данными).**
