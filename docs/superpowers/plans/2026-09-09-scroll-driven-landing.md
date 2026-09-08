# Cinematic scroll-driven лендинг — план реализации

> **Для агентов-исполнителей:** ОБЯЗАТЕЛЬНЫЙ ПОДСКИЛЛ: используйте subagent-driven-development
> (рекомендуется) или executing-plans для выполнения плана по задачам. Шаги отмечены чекбоксами
> (`- [ ]`) для отслеживания.

**Цель:** Полностью пересобрать `/` (views/landing) в непрерывную scroll-driven историю на
GSAP + ScrollTrigger + Lenis: пустота → сборка логотипа → zoom + вспышка → контент на светлой
палитре → возврат в тёмную → CTA — без переключения реальной темы приложения.

**Архитектура:** Восемь сцен, смонтированных последовательно в `Page.tsx`. Интро (сцены
00–02) — три файла разметки, один владелец timeline (`IntroScene/index.tsx`) с одним
ScrollTrigger. Контентные сцены (03–07) — независимые компоненты, каждый со своим
ScrollTrigger. Фон-путешествие — один фиксированный слой (`SceneBackground`) с opacity,
которым управляют сцены 02 и 07; никакой другой компонент прогресс кроссфейда не читает —
вместо этого каждая сцена обёрнута в `.ls-light`/`.ls-dark`, которые **переопределяют те же
generic custom properties** (`--ink`, `--ground`, `--profit`, …), что уже использует вся
остальная дизайн-система, поэтому существующие компоненты (`MetricCell`, `Tag`, `Money`,
`.lp-*`, `.mval`, `.ledger`) переиспользуются внутри сцен без единой правки — они не знают,
что рисуются не в «настоящей» теме, а в авторском сюжете лендинга.

**Технологии:** `gsap` (+ScrollTrigger), `@gsap/react` (`useGSAP`), `lenis`. Next.js 16 App
Router, React 19, next-intl, существующие shared/entities-компоненты.

Спека: `docs/superpowers/specs/2026-09-09-scroll-driven-landing-design.md`.

## Global Constraints

- Комментарии в коде и текст плана — на русском, как во всём репозитории.
- Каждый файл с хуками получает свой `'use client'` — в проекте это соблюдается на каждом
  файле независимо от глубины вложенности, а не только на границе клиент/сервер.
- Анимируются только `transform`, `opacity`, `clip-path`, `stroke-dashoffset`. Никаких
  `width/height/top/left` в твинах.
- Радиусы и тени в системе занулены глобально (`* { border-radius: 0 !important; box-shadow:
  none !important; }`) — новый код с этим не спорит и не пытается это обойти.
- Цвет — только через CSS-классы/custom properties, не инлайновым hex, за одним
  задокументированным исключением: цвет тега (`Tag`/`TagCombo`) как и в остальном продукте
  передаётся пропом, потому что теги пользователь красит сам.
- Три семантических цвета (`--profit`/`--loss`/`--doubt`) используются только для денег —
  иллюстративные цвета тегов в демо-сцене нарочно **другие** оттенки (см. задачу 9).
- Каждая сцена вызывает `registerGsap()` первой строкой своего `useGSAP` — идемпотентно,
  защищает от порядка монтирования дочерних/родительских эффектов.
- Новая разметка получает классы с префиксом `ls-` (landing-scene). Существующие `.lp-*`
  правила, которые по-прежнему подходят по смыслу (сетка шагов, честный список и т.п.),
  переезжают в `landing.css` как есть — рерайта ради рерайта не делаем. Правила, которые
  заменяются другой композицией (`.lp-splash*`, `.lp-hero*`, `.lp-grid`/`.lp-card*`,
  `.lp-end`), удаляются насовсем.
- В проекте нет jsdom/testing-library и ни одного `.test.tsx` — `vitest.config.ts` работает в
  `environment: 'node'`. Это осознанная конвенция (весь тест-суит — чистые функции), и план ей
  следует: где есть настоящая чистая логика — пишем тест по TDD; там, где её нет (JSX,
  ScrollTrigger, DOM), задача проверяется `npx tsc --noEmit` и явным визуальным шагом (дев-сервер
  / Playwright), а не выдуманным тестом ради теста. Итоговая визуальная/интерактивная проверка —
  задача 12.
- Ключи i18n добавляются в оба файла (`ru.json`, `en.json`) одновременно — паритет уже
  проверяет существующий `messages.test.ts`, отдельного теста заводить не нужно.

---

## Карта файлов

```
frontend/src/views/landing/
  Page.tsx                        — правится в задачах 4–11 (замена секций по одной)
  landing.css                     — создаётся в задаче 4, дополняется в 5–11
  lib/
    breakpoints.ts                — задача 1
    breakpoints.test.ts           — задача 1
    gsapConfig.ts                 — задача 1
    reducedMotion.ts              — задача 2
    useLenis.ts                   — задача 2
  components/
    LandingHeader.tsx             — задача 4
    SceneBackground.tsx           — задача 6
    IntroScene/
      index.tsx                   — задача 5 (сцены 00+01), расширяется в задаче 6 (сцена 02)
      VoidIntro.tsx                — задача 5
      LogoAssemblyScene.tsx         — задача 5
      LogoZoomFloodScene.tsx        — задача 6
    PromiseScene.tsx              — задача 7
    StepsScene.tsx                — задача 8
    ProductDemoScene.tsx          — задача 9
    TrustScene.tsx                — задача 10
    FinaleScene.tsx               — задача 11

frontend/src/shared/ui/VirexLogo.tsx   — правится в задаче 3 (data-candle)
frontend/src/shared/i18n/messages/{ru,en}.json — новый ключ landing.skipToContent (задача 7)
```

Порядок задач = порядок монтирования: `/` остаётся рабочей страницей после каждой задачи —
старые секции заменяются по одной, а не одним большим переключением в конце.

---

### Task 1: Зависимости, брейкпоинты, регистрация GSAP

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/views/landing/lib/breakpoints.ts`
- Test: `frontend/src/views/landing/lib/breakpoints.test.ts`
- Create: `frontend/src/views/landing/lib/gsapConfig.ts`

**Interfaces:**
- Produces: `MOBILE_MAX_WIDTH: number`, `TABLET_MAX_WIDTH: number`, `BREAKPOINTS: { mobile: string; tablet: string; desktop: string }` из `breakpoints.ts`; `registerGsap(): void` из `gsapConfig.ts`.

- [ ] **Шаг 1: Установить зависимости**

```bash
cd frontend
npm install gsap@^3.15.0 lenis@^1.3.26 @gsap/react@^2.1.2
```

- [ ] **Шаг 2: Написать падающий тест на брейкпоинты**

`frontend/src/views/landing/lib/breakpoints.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BREAKPOINTS, MOBILE_MAX_WIDTH, TABLET_MAX_WIDTH } from './breakpoints';

describe('брейкпоинты лендинга', () => {
  it('совпадают со значениями в globals.css (@media max-width: 720px / 1100px)', () => {
    expect(MOBILE_MAX_WIDTH).toBe(720);
    expect(TABLET_MAX_WIDTH).toBe(1100);
  });

  it('медиа-строки согласованы с границами', () => {
    expect(BREAKPOINTS.mobile).toBe('(max-width: 720px)');
    expect(BREAKPOINTS.tablet).toBe('(min-width: 721px) and (max-width: 1100px)');
    expect(BREAKPOINTS.desktop).toBe('(min-width: 1101px)');
  });
});
```

- [ ] **Шаг 3: Убедиться, что тест падает**

Run: `cd frontend && npx vitest run src/views/landing/lib/breakpoints.test.ts`
Expected: FAIL — `Cannot find module './breakpoints'`.

- [ ] **Шаг 4: Реализовать `breakpoints.ts`**

```ts
/**
 * Брейкпоинты лендинга. Значения — те же самые числа, что в двух
 * `@media (max-width: …)` в globals.css: одна точка правды для CSS и для
 * `gsap.matchMedia()` в сценах, которым нужна JS-логика поверх CSS.
 */
export const MOBILE_MAX_WIDTH = 720;
export const TABLET_MAX_WIDTH = 1100;

export const BREAKPOINTS = {
  mobile: `(max-width: ${MOBILE_MAX_WIDTH}px)`,
  tablet: `(min-width: ${MOBILE_MAX_WIDTH + 1}px) and (max-width: ${TABLET_MAX_WIDTH}px)`,
  desktop: `(min-width: ${TABLET_MAX_WIDTH + 1}px)`,
} as const;
```

- [ ] **Шаг 5: Убедиться, что тест проходит**

Run: `cd frontend && npx vitest run src/views/landing/lib/breakpoints.test.ts`
Expected: PASS, 2 теста.

- [ ] **Шаг 6: Реализовать `gsapConfig.ts`**

```ts
'use client';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

let registered = false;

/**
 * Регистрация плагинов GSAP. Вызывается на модульном уровне (см. низ файла) —
 * до того, как React вообще начнёт рендерить дерево, — и повторно, идемпотентно,
 * первой строкой `useGSAP` каждой сцены: эффекты дочерних компонентов в React
 * могут отработать раньше эффекта родителя, и полагаться на порядок монтирования
 * для регистрации плагинов было бы гонкой.
 */
export function registerGsap(): void {
  if (registered) return;
  gsap.registerPlugin(ScrollTrigger, useGSAP);
  registered = true;
}

registerGsap();
```

- [ ] **Шаг 7: Проверить типы и полный прогон тестов**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: без ошибок типов, все тесты (включая новые) зелёные.

- [ ] **Шаг 8: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/views/landing/lib/breakpoints.ts frontend/src/views/landing/lib/breakpoints.test.ts frontend/src/views/landing/lib/gsapConfig.ts
git commit -m "feat(landing): зависимости GSAP/Lenis, брейкпоинты, регистрация плагинов"
```

---

### Task 2: Lenis и prefers-reduced-motion

**Files:**
- Create: `frontend/src/views/landing/lib/reducedMotion.ts`
- Create: `frontend/src/views/landing/lib/useLenis.ts`

**Interfaces:**
- Consumes: `registerGsap()` из `./gsapConfig`.
- Produces: `prefersReducedMotion(): boolean`; `useLenis(): void` — хук без возвращаемого значения, монтируется один раз в `Page.tsx` (задача 4).

Чистой тестируемой логики здесь нет: обе функции читают `window`/RAF, которых в
node-окружении vitest нет, а заводить jsdom ради одного хука — новая тестовая инфраструктура,
которой в проекте осознанно нет нигде (см. Global Constraints). Проверка — типами и
видимым поведением на живой странице (задача 4 и итоговая задача 12).

- [ ] **Шаг 1: Реализовать `reducedMotion.ts`**

```ts
'use client';

/**
 * true, если пользователь просит меньше движения. Проверяется в начале
 * каждого `useGSAP`: сцена в этом случае не строит pin/scrub, а сразу
 * выставляет конечное состояние — тот же контент, без движения.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
```

- [ ] **Шаг 2: Реализовать `useLenis.ts`**

```ts
'use client';

import { useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { registerGsap } from './gsapConfig';
import { prefersReducedMotion } from './reducedMotion';

/**
 * Плавный скролл Lenis, синхронизированный с ScrollTrigger через тикер GSAP —
 * рекомендованная самим GSAP интеграция для React. `autoRaf: false` — Lenis не
 * заводит свой RAF-цикл, кадры ему отдаёт `gsap.ticker`, поэтому не возникает
 * двух параллельных циклов кадров, гоняющихся за одним и тем же скроллом.
 *
 * При `prefers-reduced-motion: reduce` Lenis не создаётся вовсе — скролл
 * нативный. ScrollTrigger при этом всё равно зарегистрирован (см.
 * `registerGsap`): каждая сцена сама решает не строить pin/scrub в этом
 * случае (см. `reducedMotion.ts`), а не полагается на отсутствие Lenis.
 */
export function useLenis(): void {
  useEffect(() => {
    registerGsap();
    if (prefersReducedMotion()) return;

    const lenis = new Lenis({ autoRaf: false });
    lenis.on('scroll', ScrollTrigger.update);

    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);
}
```

- [ ] **Шаг 3: Проверить типы**

Run: `cd frontend && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Шаг 4: Commit**

```bash
git add frontend/src/views/landing/lib/reducedMotion.ts frontend/src/views/landing/lib/useLenis.ts
git commit -m "feat(landing): Lenis + prefers-reduced-motion"
```

---

### Task 3: Логотип — точки крепления для GSAP

**Files:**
- Modify: `frontend/src/shared/ui/VirexLogo.tsx`

**Interfaces:**
- Produces: у каждого `<path>` внутри `.virex-logo` появляется атрибут `data-candle` со значением `'left' | 'left-center' | 'center' | 'right-center' | 'right'` — по нему сцена сборки находит нужную свечу через `querySelector('[data-candle="center"]')`.

Геометрия и заливка (`#fff`, `<g fill="#fff">`) не меняются — обе сцены, где знак
появляется (сборка и финал), стоят на тёмном фоне, где белая заливка уже верна по умолчанию.

- [ ] **Шаг 1: Дать каждой свече имя**

`frontend/src/shared/ui/VirexLogo.tsx`:

```diff
-/** Пять свечей мотивом логотипа: контуры на сетке 100 × 100, сплошная заливка. */
-const CANDLES = [
-  // LEFT
-  'M25 30 H27 V43 L29 45 V56 L27 58 V70 H25 V58 L23 56 V45 L25 43 Z',
-  // LEFT CENTER
-  'M38 18 H40 V35 L42 37 V63 L40 65 V82 H38 V65 L36 63 V37 L38 35 Z',
-  // CENTER
-  'M49 8 H51 V28 L53 30 V70 L51 72 V92 H49 V72 L47 70 V30 L49 28 Z',
-  // RIGHT CENTER
-  'M60 18 H62 V35 L64 37 V63 L62 65 V82 H60 V65 L58 63 V37 L60 35 Z',
-  // RIGHT
-  'M73 30 H75 V43 L77 45 V56 L75 58 V70 H73 V58 L71 56 V45 L73 43 Z',
-];
+/**
+ * Пять свечей мотивом логотипа: контуры на сетке 100 × 100, сплошная заливка.
+ * `id` — не про DOM id (их здесь по-прежнему нет, см. комментарий класса
+ * ниже), а имя, по которому сцена сборки на главной находит нужный path
+ * через `data-candle` — `data-candle="center"`, а не по индексу массива.
+ */
+const CANDLES = [
+  { id: 'left', d: 'M25 30 H27 V43 L29 45 V56 L27 58 V70 H25 V58 L23 56 V45 L25 43 Z' },
+  { id: 'left-center', d: 'M38 18 H40 V35 L42 37 V63 L40 65 V82 H38 V65 L36 63 V37 L38 35 Z' },
+  { id: 'center', d: 'M49 8 H51 V28 L53 30 V70 L51 72 V92 H49 V72 L47 70 V30 L49 28 Z' },
+  { id: 'right-center', d: 'M60 18 H62 V35 L64 37 V63 L62 65 V82 H60 V65 L58 63 V37 L60 35 Z' },
+  { id: 'right', d: 'M73 30 H75 V43 L77 45 V56 L75 58 V70 H73 V58 L71 56 V45 L73 43 Z' },
+] as const;
```

```diff
       <g fill="#fff">
-        {CANDLES.map((d) => (
-          <path key={d} d={d} />
-        ))}
+        {CANDLES.map(({ id, d }) => (
+          <path key={id} d={d} data-candle={id} />
+        ))}
       </g>
```

- [ ] **Шаг 2: Проверить типы**

Run: `cd frontend && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Шаг 3: Визуально сверить**

Запустить `npm run dev` в `frontend/`, открыть `/` (текущий, ещё нестроенный лендинг) и
любую страницу с шапкой продукта (например `/tags` после логина, или обложку тура) —
знак должен выглядеть **буквально идентично** тому, что было: правка не трогает геометрию
и заливку, только добавляет невизуальный атрибут.

- [ ] **Шаг 4: Commit**

```bash
git add frontend/src/shared/ui/VirexLogo.tsx
git commit -m "feat(logo): именованные data-candle на каждой свече для GSAP"
```

---

### Task 4: `landing.css`, шапка с проявлением по скроллу, монтирование Lenis

**Files:**
- Create: `frontend/src/views/landing/landing.css`
- Create: `frontend/src/views/landing/components/LandingHeader.tsx`
- Modify: `frontend/src/views/landing/Page.tsx`
- Modify: `frontend/src/app/globals.css` (удалить перенесённые правила)

**Interfaces:**
- Produces: `<LandingHeader />` — без пропов, сам следит за первым скроллом; классы `.ls-light`/`.ls-dark`, определённые прямо здесь для будущих сцен, — теневые generic-переменные (`--ink`, `--ground`, `--profit`, …), не завязанные на `data-theme`.

Первая задача, где заводится `landing.css` — поэтому здесь же определяется механизм
фон-путешествия: `.ls-light`/`.ls-dark` переопределяют те **же имена** custom properties, что
уже используют все существующие компоненты (`--ink`, `--ink-2`, `--ground`, `--profit`,
`--loss`, `--doubt`, `--meta`, `--band`, `--rule`, `--hair` …). Обернуть будущую сцену в
`.ls-light` — и `MetricCell`/`Tag`/`Money`/`.lp-lede`/`.ledger` внутри неё автоматически
рисуются светлой палитрой, не зная, что «настоящая» тема сайчас может быть тёмной.

- [ ] **Шаг 1: Создать `landing.css`**

`frontend/src/views/landing/landing.css`:

```css
/* ═══════════════════════════════════════════════════════════════
   ГЛАВНАЯ — сцены cinematic-лендинга.
   Правила `.lp-*` здесь — перенесённые как есть из globals.css (шапка,
   ссылка входа, футер): их вид не меняется, меняется только файл-владелец.
   Новая разметка сцен — классы `.ls-*`.
   ═══════════════════════════════════════════════════════════════ */

/* ── фон-путешествие: светлая/тёмная половина истории ──────────────
   Переопределяют те же generic-переменные, что уже использует вся
   остальная система (--ink, --ground, --profit, …), поэтому существующие
   компоненты внутри сцены не нуждаются в правках — они уже написаны через
   var(--ink) и просто получают другое значение на время сюжета лендинга,
   независимо от реальной куки темы. */
.ls-light {
  --ground: #f5f2ea;
  --ink: #1c1a16;
  --ink-2: #6b655b;
  --ink-3: #8b8477;
  --hair: rgba(28, 26, 22, 0.16);
  --hair-2: rgba(28, 26, 22, 0.28);
  --rule: rgba(28, 26, 22, 0.32);
  --major: rgba(28, 26, 22, 0.85);
  --profit: #2f7d55;
  --loss: #b23a31;
  --doubt: #8a6118;
  --meta: #5a6a86;
  --meta-dim: #7b8799;
  --band: #eae5d9;
  color: var(--ink);
}

.ls-dark {
  --ground: #050505;
  --ink: #e8e4dc;
  --ink-2: #8e887e;
  --ink-3: #565149;
  --hair: rgba(232, 228, 220, 0.14);
  --hair-2: rgba(232, 228, 220, 0.26);
  --rule: rgba(232, 228, 220, 0.3);
  --major: rgba(232, 228, 220, 0.85);
  --profit: #5ba378;
  --loss: #c9524a;
  --doubt: #b8893f;
  --meta: #7c8ca6;
  --meta-dim: #5d6b80;
  --band: #0b0b0a;
  color: var(--ink);
}

/* ── шапка (перенесено из globals.css без изменений вида) ─────────── */
.lp-top {
  border-bottom: 1px solid var(--rule);
  padding: var(--s3) 0;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;
  background: var(--ground);
  /* Скрыта до первого скролла — первый экран обязан быть пустым. */
  opacity: 0;
  transform: translateY(-8px);
  pointer-events: none;
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.lp-top-visible {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
.lp-top-in {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s3);
}
.lp-top-r {
  display: flex;
  align-items: center;
  gap: var(--s3);
}
.lp-login {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-2);
  text-decoration: none;
  border-bottom: 1px solid var(--hair-2);
  padding-bottom: 1px;
}
.lp-login:hover {
  color: var(--ink);
  border-color: var(--ink);
}

/* ── футер (перенесено из globals.css без изменений вида) ─────────── */
.lp-foot {
  border-top: 1px solid var(--rule);
  padding: var(--s4) 0;
  font-size: var(--t-xs);
}
```

Шапка становится `position: fixed` — раньше она была верхним элементом обычного
`document flow`. Теперь под ней в `<main>` начинается интро на весь вьюпорт, и шапке
нужно самой держать себя над ним, а не полагаться на порядок разметки.

- [ ] **Шаг 2: Реализовать `LandingHeader.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LocaleSwitch } from '@/shared/ui/LocaleSwitch';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';
import { Wrap } from '@/shared/ui/Wrap';

/**
 * Шапка лендинга. Скрыта до первого движения скролла — первый экран обязан
 * быть пустым, — затем мягко проявляется и остаётся доступной поверх всех
 * последующих сцен.
 *
 * Слушает нативный `scroll`, а не Lenis: тогда шапка реагирует на любой
 * источник движения (колесо, клавиатура, скролл по skip-ссылке), не завися
 * от того, создан ли в этот момент экземпляр Lenis — при
 * prefers-reduced-motion его не будет вовсе (см. useLenis).
 */
export function LandingHeader() {
  const t = useTranslations('landing');
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (revealed) return;
    const onScroll = () => {
      if (window.scrollY > 0) setRevealed(true);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [revealed]);

  return (
    <header className={revealed ? 'lp-top lp-top-visible' : 'lp-top'} aria-hidden={!revealed}>
      <Wrap>
        <div className="lp-top-in">
          <div className="mark">Virex</div>
          <div className="lp-top-r">
            <ThemeToggle />
            <LocaleSwitch className="seg-tight" />
            <Link href="/login" className="lp-login" tabIndex={revealed ? 0 : -1}>
              {t('signIn')}
            </Link>
          </div>
        </div>
      </Wrap>
    </header>
  );
}
```

`tabIndex={-1}` на скрытой ссылке — пока шапка не проявилась, `Tab` не должен на неё
заводить фокус: элемент невидим и `aria-hidden`, а без `tabIndex` он бы всё равно ловил
фокус клавиатурой.

- [ ] **Шаг 3: Смонтировать шапку и Lenis в `Page.tsx`, убрать перенесённое**

Текущий `Page.tsx` целиком уже прочитан ранее в сессии. Правки:

```diff
 'use client';

 import Link from 'next/link';
 import { useTranslations } from 'next-intl';
 import { Button } from '@/shared/ui/Button';
-import { LocaleSwitch } from '@/shared/ui/LocaleSwitch';
-import { ThemeToggle } from '@/shared/ui/ThemeToggle';
 import { VirexLogo } from '@/shared/ui/VirexLogo';
 import { Wrap } from '@/shared/ui/Wrap';
+import { useLenis } from './lib/useLenis';
+import { LandingHeader } from './components/LandingHeader';
+import './landing.css';

 const SECTIONS = ['overview', 'tags', 'analytics', 'market'] as const;
 const STEPS = [1, 2, 3] as const;

 export function LandingPage() {
   const t = useTranslations('landing');
+  useLenis();

   return (
     <>
-      <header className="lp-top">
-        <Wrap>
-          <div className="lp-top-in">
-            <div className="mark">
-              {/* <VirexLogo width={42} height={42} /> */}
-              Virex
-            </div>
-            <div className="lp-top-r">
-              <ThemeToggle />
-              <LocaleSwitch className="seg-tight" />
-              <Link href="/login" className="lp-login">
-                {t('signIn')}
-              </Link>
-            </div>
-          </div>
-        </Wrap>
-      </header>
+      <LandingHeader />

       <main>
```

`Button`, `Link`, `VirexLogo`, `SECTIONS`, `STEPS` пока остаются импортированы и
используются — старые секции (`lp-splash`, `lp-hero`, сетка разделов, `lp-end`) ещё живы и
будут заменяться по одной в задачах 5–11.

- [ ] **Шаг 4: Удалить перенесённые правила из globals.css**

`frontend/src/app/globals.css` — удалить блоки `.lp-top`, `.lp-top-in`, `.lp-top-r`,
`.lp-login`, `.lp-login:hover` (строки из комментария «── первый экран главной» и выше,
до `.lp-splash`) и блок `.lp-foot` (в самом низу секции «ГЛАВНАЯ»). Оставить заголовок
секции `/* ═══ ГЛАВНАЯ ═══ */` и всё остальное — их правки ждут задачи 5–11.

- [ ] **Шаг 5: Проверить типы**

Run: `cd frontend && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Шаг 6: Проверить в браузере**

`npm run dev`, открыть `http://localhost:8090/`. Ожидание: страница выглядит как раньше
(старые секции), но шапки не видно, пока не начат скролл; при первом скролле (колесо,
`Page Down`, свайп) шапка мягко проявляется и остаётся видна дальше. Проверить обе темы
через `ThemeToggle` — после проявления шапка красится правильно в обеих.

- [ ] **Шаг 7: Commit**

```bash
git add frontend/src/views/landing/landing.css frontend/src/views/landing/components/LandingHeader.tsx frontend/src/views/landing/Page.tsx frontend/src/app/globals.css
git commit -m "feat(landing): выносим шапку, проявление по скроллу, монтируем Lenis"
```

---

### Task 5: IntroScene — пустота и сборка логотипа (сцены 00+01)

**Files:**
- Create: `frontend/src/views/landing/components/IntroScene/index.tsx`
- Create: `frontend/src/views/landing/components/IntroScene/VoidIntro.tsx`
- Create: `frontend/src/views/landing/components/IntroScene/LogoAssemblyScene.tsx`
- Modify: `frontend/src/views/landing/Page.tsx`
- Modify: `frontend/src/views/landing/landing.css`
- Modify: `frontend/src/app/globals.css` (удалить `.lp-splash*`)

**Interfaces:**
- Consumes: `data-candle` на путях `VirexLogo` (задача 3), `registerGsap`/`prefersReducedMotion`.
- Produces: `<IntroScene lightLayerRef={RefObject<HTMLDivElement | null>} />` — принимает реф светлого слоя (используется начиная с задачи 6; в этой задаче просто прокидывается насквозь и не читается). Timeline с метками `assembly` и `assembled` — задача 6 расширяет этот же timeline с метки `assembled`.

- [ ] **Шаг 1: `VoidIntro.tsx`**

```tsx
'use client';

import { type RefObject } from 'react';

/** Сцена 00: состояние покоя до первого скролла — слово и тихая подсказка. */
export function VoidIntro({
  wordRef,
  hintRef,
}: {
  wordRef: RefObject<HTMLSpanElement | null>;
  hintRef: RefObject<HTMLSpanElement | null>;
}) {
  return (
    <div className="ls-void">
      <span className="ls-void-word" ref={wordRef}>
        Virex
      </span>
      <span className="ls-void-hint" ref={hintRef} aria-hidden>
        ↓
      </span>
    </div>
  );
}
```

- [ ] **Шаг 2: `LogoAssemblyScene.tsx`**

```tsx
'use client';

import { type RefObject } from 'react';
import { VirexLogo } from '@/shared/ui/VirexLogo';

/** Сцена 01: обёртка вокруг знака — по этому рефу сборка ищет свечи и (в задаче 6) масштабирует знак целиком. */
export function LogoAssemblyScene({ groupRef }: { groupRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="ls-logo-group" ref={groupRef}>
      <VirexLogo aria-hidden />
    </div>
  );
}
```

- [ ] **Шаг 3: `IntroScene/index.tsx`**

```tsx
'use client';

import { useRef, type RefObject } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { registerGsap } from '../../lib/gsapConfig';
import { prefersReducedMotion } from '../../lib/reducedMotion';
import { VoidIntro } from './VoidIntro';
import { LogoAssemblyScene } from './LogoAssemblyScene';

/**
 * Сцены 00–02 одним операторским планом: пустота → сборка логотипа → (задача 6)
 * zoom и вспышка. Один компонент — один timeline: части логотипа и вспышка
 * обязаны знать конечное состояние друг друга кадр в кадр, и рвать это на
 * несколько независимых ScrollTrigger рискованно на реверсе.
 *
 * Три файла разметки (этот + VoidIntro + LogoAssemblyScene, и в задаче 6 —
 * LogoZoomFloodScene) — для читаемости; вся анимационная логика — здесь.
 */
export function IntroScene({ lightLayerRef }: { lightLayerRef: RefObject<HTMLDivElement | null> }) {
  const root = useRef<HTMLElement>(null);
  const wordRef = useRef<HTMLSpanElement>(null);
  const hintRef = useRef<HTMLSpanElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      registerGsap();
      const logo = logoRef.current;
      if (!logo) return;

      const candle = (id: string) => logo.querySelector<SVGPathElement>(`[data-candle="${id}"]`);
      const left = candle('left');
      const leftCenter = candle('left-center');
      const center = candle('center');
      const rightCenter = candle('right-center');
      const right = candle('right');
      if (!left || !leftCenter || !center || !rightCenter || !right) return;

      if (prefersReducedMotion()) {
        gsap.set([wordRef.current, hintRef.current], { opacity: 0 });
        gsap.set([left, leftCenter, center, rightCenter, right], { opacity: 1, x: 0, y: 0 });
        return;
      }

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: root.current,
          start: 'top top',
          end: '+=3400',
          scrub: 1,
          pin: true,
          anticipatePin: 1,
        },
      });

      // x/y ниже — в локальных единицах viewBox знака (0–100, см. VirexLogo), не
      // в пикселях: цель твина — сам <path>, а не что-то на странице, и GSAP
      // считает смещение в системе координат SVG. 100 единиц — это примерно вся
      // высота знака, поэтому офсеты в 70–100 уже уверенно уводят свечу за
      // пределы его собственной рамки, а не на миллиметр от неё.
      tl.to([wordRef.current, hintRef.current], { opacity: 0, y: -16, duration: 0.4, ease: 'power1.out' }, 0)
        .addLabel('assembly', 0.4)
        // крайние — сверху, с лёгкой диагональю
        .fromTo(left, { x: -14, y: -70, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 1.4, ease: 'power3.out' }, 'assembly')
        .fromTo(right, { x: 14, y: -70, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 1.4, ease: 'power3.out' }, 'assembly')
        // средние — снизу
        .fromTo(leftCenter, { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 1.3, ease: 'power3.out' }, 'assembly+=0.15')
        .fromTo(rightCenter, { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 1.3, ease: 'power3.out' }, 'assembly+=0.15')
        // центральная — последней, строго сверху, довершает знак
        .fromTo(center, { y: -100, opacity: 0 }, { y: 0, opacity: 1, duration: 1.2, ease: 'power3.out' }, 'assembly+=0.4')
        .addLabel('assembled', 'assembly+=1.9');

      // Задача 6 продолжает этот же timeline с метки 'assembled' (zoom + вспышка).
    },
    { scope: root },
  );

  return (
    <section className="ls-intro ls-dark" ref={root}>
      <VoidIntro wordRef={wordRef} hintRef={hintRef} />
      <LogoAssemblyScene groupRef={logoRef} />
    </section>
  );
}
```

`lightLayerRef` пока не используется телом эффекта — это осознанно: интерфейс компонента
фиксируется целиком сейчас, чтобы монтирование в `Page.tsx` не переписывать в задаче 6
(добавится только использование значения внутри `IntroScene`, не сигнатура пропа и не
вызов из `Page.tsx`). `tsc --noEmit` на это не ругается (неиспользуемые параметры функций
не входят в `strict`, и `noUnusedParameters` в `tsconfig.json` проекта не включён) — задача
5 намеренно проверяется только типами, без `lint`, который добавляет пусть небольшой, но
лишний повод споткнуться на промежуточном состоянии; `lint` первый раз гоняется в задаче
12, когда `lightLayerRef` уже используется (задача 6).

- [ ] **Шаг 4: CSS сцен 00–01**

Добавить в `landing.css` (после блока `.ls-light`/`.ls-dark`):

```css
/* ── интро: пустота + сборка (сцены 00–01) ─────────────────────── */
/* Grid с одной ячейкой — приём, чтобы наложить слово и знак друг на друга по
   центру, не трогая их `transform`: он целиком отдан GSAP (word/hint едут по
   y при затухании, знак — масштабируется в задаче 6). `position: absolute` +
   `transform: translate(-50%,-50%)` для центрирования сделали бы то же самое,
   но GSAP при первом же `gsap.set/to` заменяет весь inline `transform`
   целиком по своим x/y/scale — и стёр бы центрирующий сдвиг, которого сам
   не назначал. `grid-area: 1 / 1` на обоих детях не использует transform
   вообще, конфликтовать не с чем. */
.ls-intro {
  position: relative;
  min-height: 100svh;
  display: grid;
  place-items: center;
  overflow: clip;
  background: var(--ground);
}

.ls-void,
.ls-logo-group {
  grid-area: 1 / 1;
}

.ls-void {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s3);
}
.ls-void-word {
  font-family: var(--font-mono);
  font-size: var(--t-m);
  letter-spacing: 0.42em;
  text-indent: 0.42em;
  text-transform: uppercase;
  color: var(--ink-2);
}
.ls-void-hint {
  font-size: var(--t-m);
  color: var(--ink-3);
}

.ls-logo-group {
  width: min(46svh, 74vw);
}
.ls-logo-group svg {
  display: block;
  width: 100%;
  height: auto;
}
```

- [ ] **Шаг 5: Смонтировать в `Page.tsx`, заменить `.lp-splash`**

```diff
 import Link from 'next/link';
 import { useTranslations } from 'next-intl';
+import { useRef } from 'react';
 import { Button } from '@/shared/ui/Button';
 import { VirexLogo } from '@/shared/ui/VirexLogo';
 import { Wrap } from '@/shared/ui/Wrap';
 import { useLenis } from './lib/useLenis';
 import { LandingHeader } from './components/LandingHeader';
+import { IntroScene } from './components/IntroScene';
 import './landing.css';

 export function LandingPage() {
   const t = useTranslations('landing');
+  const lightLayerRef = useRef<HTMLDivElement>(null);
   useLenis();

   return (
     <>
       <LandingHeader />

       <main>
-        {/* Первый экран — только знак. … */}
-        <section className="lp-splash">
-          <VirexLogo className="lp-splash-logo" aria-hidden />
-          <span className="lp-splash-word">Virex</span>
-          <span className="lp-splash-more" aria-hidden>
-            ↓
-          </span>
-        </section>
+        <IntroScene lightLayerRef={lightLayerRef} />

         <Wrap page>
           <section className="lp-hero">
```

`VirexLogo` в импортах Page.tsx после этой правки становится неиспользуемым (сборка теперь
живёт внутри `IntroScene`) — удалить импорт `VirexLogo` из `Page.tsx`.

- [ ] **Шаг 6: Удалить `.lp-splash*` из globals.css**

Удалить правила `.lp-splash`, `.lp-splash-logo`, `.lp-splash-word`, `.lp-splash-more` и их
комментарий-заголовок «── первый экран главной ──…», а также в блоке `@media (max-width:
720px)` строку `.lp-splash-logo { width: min(38svh, 80vw); }`.

- [ ] **Шаг 7: Проверить типы**

Run: `cd frontend && npx tsc --noEmit`
Expected: без ошибок (включая отсутствие неиспользуемых импортов, если включён
соответствующий lint/tsc флаг).

- [ ] **Шаг 8: Проверить в браузере**

`npm run dev`, открыть `/`. Ожидание: пустой тёмный экран, слово «VIREX» и стрелка по
центру; при скролле стрелка/слово гаснут, пять свечей влетают и складываются в знак
(крайние — сверху по диагонали, средние — снизу, центральная — последней сверху), без
рывков и bounce; после сборки экран пока «залипает» (пин длится до конца timeline — на
этом этапе плана дальше зума ещё нет, поэтому после сборки скролл просто продолжит через
пин до его границы, затем упадёт на старый `.lp-hero`). Прокрутить назад — сборка
разбирается в обратном порядке. Проверить на ширине 390px.

- [ ] **Шаг 9: Commit**

```bash
git add frontend/src/views/landing/components/IntroScene frontend/src/views/landing/Page.tsx frontend/src/views/landing/landing.css frontend/src/app/globals.css
git commit -m "feat(landing): сцены 00–01 — пустота и сборка логотипа"
```

---

### Task 6: Zoom + вспышка, фон-путешествие (сцена 02)

**Files:**
- Create: `frontend/src/views/landing/components/SceneBackground.tsx`
- Create: `frontend/src/views/landing/components/IntroScene/LogoZoomFloodScene.tsx`
- Modify: `frontend/src/views/landing/components/IntroScene/index.tsx`
- Modify: `frontend/src/views/landing/Page.tsx`
- Modify: `frontend/src/views/landing/landing.css`

**Interfaces:**
- Produces: `<SceneBackground ref={RefObject<HTMLDivElement>} />` — `ref` указывает прямо на светлый слой (`.ls-bg-light`), сцены анимируют его `opacity` напрямую через GSAP.
- Consumes/расширяет: timeline и метку `assembled` из задачи 5.

- [ ] **Шаг 1: `SceneBackground.tsx`**

```tsx
'use client';

import { forwardRef } from 'react';

/**
 * Фиксированная на весь вьюпорт подложка позади всех сцен: тёмный слой снизу,
 * светлый — сверху. Прогресс фон-путешествия — это opacity светлого слоя:
 * 0 в начале истории, 1 после вспышки (эта задача), обратно к 0 в финале
 * (задача 11). Сам компонент анимацией не занимается — только держит два
 * div'а с правильным z-index; `ref` указывает прямо на светлый слой, сцены
 * тянут его GSAP-ом напрямую.
 */
export const SceneBackground = forwardRef<HTMLDivElement>(function SceneBackground(_, ref) {
  return (
    <div className="ls-bg" aria-hidden>
      <div className="ls-bg-dark" />
      <div className="ls-bg-light" ref={ref} />
    </div>
  );
});
```

- [ ] **Шаг 2: `LogoZoomFloodScene.tsx`**

Чисто презентационный — сама вспышка анимируется в `IntroScene/index.tsx` через
`lightLayerRef`, этот компонент только держит паузу-подпись для скринридера (у сцены нет
текста, который стоило бы озвучивать дважды).

```tsx
'use client';

/** Сцена 02: сам zoom анимируется в IntroScene/index.tsx (transform знака + opacity SceneBackground). */
export function LogoZoomFloodScene() {
  return <span className="sr-only" aria-hidden />;
}
```

- [ ] **Шаг 3: Расширить `IntroScene/index.tsx` с метки `assembled`**

```diff
 import { VoidIntro } from './VoidIntro';
 import { LogoAssemblyScene } from './LogoAssemblyScene';
+import { LogoZoomFloodScene } from './LogoZoomFloodScene';

 export function IntroScene({ lightLayerRef }: { lightLayerRef: RefObject<HTMLDivElement | null> }) {
   const root = useRef<HTMLElement>(null);
   const wordRef = useRef<HTMLSpanElement>(null);
   const hintRef = useRef<HTMLSpanElement>(null);
   const logoRef = useRef<HTMLDivElement>(null);

   useGSAP(
     () => {
       registerGsap();
       const logo = logoRef.current;
       if (!logo) return;
+      gsap.set(logo, { transformOrigin: '50% 50%' });

       const candle = (id: string) => logo.querySelector<SVGPathElement>(`[data-candle="${id}"]`);
       const left = candle('left');
       const leftCenter = candle('left-center');
       const center = candle('center');
       const rightCenter = candle('right-center');
       const right = candle('right');
       if (!left || !leftCenter || !center || !rightCenter || !right) return;

       if (prefersReducedMotion()) {
         gsap.set([wordRef.current, hintRef.current], { opacity: 0 });
         gsap.set([left, leftCenter, center, rightCenter, right], { opacity: 1, x: 0, y: 0 });
+        gsap.set(logo, { scale: 26 });
+        if (lightLayerRef.current) gsap.set(lightLayerRef.current, { opacity: 1 });
         return;
       }

       const tl = gsap.timeline({
         scrollTrigger: {
           trigger: root.current,
           start: 'top top',
-          end: '+=3400',
+          end: '+=5200',
           scrub: 1,
           pin: true,
           anticipatePin: 1,
         },
       });

       tl.to([wordRef.current, hintRef.current], { opacity: 0, y: -16, duration: 0.4, ease: 'power1.out' }, 0)
         .addLabel('assembly', 0.4)
         .fromTo(left, { x: -44, y: -260, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 1.4, ease: 'power3.out' }, 'assembly')
         .fromTo(right, { x: 44, y: -260, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 1.4, ease: 'power3.out' }, 'assembly')
         .fromTo(leftCenter, { y: 220, opacity: 0 }, { y: 0, opacity: 1, duration: 1.3, ease: 'power3.out' }, 'assembly+=0.15')
         .fromTo(rightCenter, { y: 220, opacity: 0 }, { y: 0, opacity: 1, duration: 1.3, ease: 'power3.out' }, 'assembly+=0.15')
         .fromTo(center, { y: -320, opacity: 0 }, { y: 0, opacity: 1, duration: 1.2, ease: 'power3.out' }, 'assembly+=0.4')
         .addLabel('assembled', 'assembly+=1.9')
-        ;
-
-      // Задача 6 продолжает этот же timeline с метки 'assembled' (zoom + вспышка).
+        // zoom: знак «летит на зрителя», части уходят за края экрана
+        .to(logo, { scale: 26, duration: 2.2, ease: 'power2.in' }, 'assembled+=0.1')
+        // вспышка: белый слой перекрывает весь экран к концу zoom
+        .to(lightLayerRef.current, { opacity: 1, duration: 1.4, ease: 'power1.inOut' }, 'assembled+=1.1')
+        // короткая пауза на пике белого — визуальный вдох перед контентом
+        .to({}, { duration: 0.5 }, 'assembled+=2.6');
     },
     { scope: root },
   );

   return (
     <section className="ls-intro ls-dark" ref={root}>
       <VoidIntro wordRef={wordRef} hintRef={hintRef} />
       <LogoAssemblyScene groupRef={logoRef} />
+      <LogoZoomFloodScene />
     </section>
   );
 }
```

- [ ] **Шаг 4: CSS вспышки**

Добавить в `landing.css`:

```css
/* ── фон-путешествие: фиксированная тёмная/светлая подложка ────────── */
.ls-bg {
  position: fixed;
  inset: 0;
  z-index: -1;
}
.ls-bg-dark,
.ls-bg-light {
  position: absolute;
  inset: 0;
}
.ls-bg-dark {
  background: #050505;
}
.ls-bg-light {
  background: #f5f2ea;
  opacity: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
```

- [ ] **Шаг 4а: Убрать собственный фон `.ls-intro`**

Правило `.ls-intro` (добавлено в задаче 5) красило себя само — с появлением `.ls-bg` это
стало багом: непрозрачный фон секции навсегда перекрывал бы собой фиксированный слой
позади, включая саму вспышку — она бы никогда не стала видна физически, при этом ни
типы, ни сборка на такую ошибку не укажут. Все сцены-секции сознательно ничего не красят
собственным фоном — единственный видимый фон всей страницы — `.ls-bg`, один и общий на
все сцены. В `landing.css`:

```diff
 .ls-intro {
   position: relative;
   min-height: 100svh;
   display: grid;
   place-items: center;
   overflow: clip;
-  background: var(--ground);
 }
```

- [ ] **Шаг 5: Смонтировать `SceneBackground` в `Page.tsx`**

```diff
   const lightLayerRef = useRef<HTMLDivElement>(null);
   useLenis();

   return (
     <>
       <LandingHeader />
+      <SceneBackground ref={lightLayerRef} />

       <main>
         <IntroScene lightLayerRef={lightLayerRef} />
```

```diff
 import { IntroScene } from './components/IntroScene';
+import { SceneBackground } from './components/SceneBackground';
```

- [ ] **Шаг 6: Проверить типы**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Шаг 7: Проверить в браузере**

`/`, скроллим до конца интро: знак собирается, затем стремительно увеличивается,
свечи уходят за края экрана, экран заливает белым, короткая пауза — затем провал на
старый (пока не заменённый) `.lp-hero`, который на белом фоне будет смотреться чужеродно
до задачи 7 — это ожидаемо, следующая задача его заменит. Прокрутить назад с середины
zoom — знак должен плавно уменьшиться обратно и разобраться на части, вспышка погаснуть.

- [ ] **Шаг 8: Commit**

```bash
git add frontend/src/views/landing/components/SceneBackground.tsx frontend/src/views/landing/components/IntroScene frontend/src/views/landing/Page.tsx frontend/src/views/landing/landing.css
git commit -m "feat(landing): сцена 02 — zoom и вспышка, фон-путешествие"
```

---

### Task 7: PromiseScene (сцена 03) + skip-ссылка

**Files:**
- Create: `frontend/src/views/landing/components/PromiseScene.tsx`
- Modify: `frontend/src/views/landing/Page.tsx`
- Modify: `frontend/src/views/landing/landing.css`
- Modify: `frontend/src/app/globals.css` (удалить `.lp-hero*`, перенести `.lp-lede`)
- Modify: `frontend/src/shared/i18n/messages/ru.json`, `en.json` (новый ключ `landing.skipToContent`)

**Interfaces:**
- Produces: `<PromiseScene />` — без пропов, корневая секция несёт `id="promise-scene"` — цель skip-ссылки.

- [ ] **Шаг 1: Добавить ключ `skipToContent`**

`ru.json`, внутри `"landing": { ... }`, сразу после `"signIn"`:

```diff
   "landing": {
     "signIn": "Войти",
+    "skipToContent": "Перейти к содержимому",
     "ctaStart": "Создать аккаунт",
```

`en.json`, тем же местом:

```diff
   "landing": {
     "signIn": "Sign in",
+    "skipToContent": "Skip to content",
     "ctaStart": "Create account",
```

- [ ] **Шаг 2: `PromiseScene.tsx`**

```tsx
'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { Wrap } from '@/shared/ui/Wrap';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';

/** Сцена 03: обещание продукта — построчный clip-path reveal на светлой палитре. */
export function PromiseScene() {
  const t = useTranslations('landing');
  const root = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const ledeRef = useRef<HTMLParagraphElement>(null);

  useGSAP(
    () => {
      registerGsap();
      if (prefersReducedMotion()) return;

      gsap.set([titleRef.current, ledeRef.current], { clipPath: 'inset(0 0 100% 0)' });

      gsap
        .timeline({
          scrollTrigger: { trigger: root.current, start: 'top 70%', end: 'top 20%', scrub: 1 },
        })
        .to(titleRef.current, { clipPath: 'inset(0 0 0% 0)', duration: 1, ease: 'power2.out' })
        .to(ledeRef.current, { clipPath: 'inset(0 0 0% 0)', duration: 1, ease: 'power2.out' }, '<0.2');
    },
    { scope: root },
  );

  return (
    <section className="ls-promise ls-light" ref={root} id="promise-scene" tabIndex={-1}>
      <Wrap>
        <h1 ref={titleRef}>{t('heroTitle')}</h1>
        <p className="lp-lede" ref={ledeRef}>
          {t('heroLede')}
        </p>
      </Wrap>
    </section>
  );
}
```

- [ ] **Шаг 3: CSS сцены + перенос `.lp-lede`**

Добавить в `landing.css`:

```css
/* ── обещание (сцена 03) ───────────────────────────────────────── */
.ls-promise {
  min-height: 100svh;
  display: flex;
  align-items: center;
  padding: var(--s6) 0;
}
.ls-promise h1 {
  margin: 0 0 var(--s3);
  max-width: 18ch;
  font-size: var(--t-xl);
  font-weight: 400;
  line-height: 1.15;
}
.lp-lede {
  max-width: 62ch;
  margin: 0;
  color: var(--ink-2);
  font-size: var(--t-m);
  line-height: 1.6;
}

/* ── skip-ссылка ────────────────────────────────────────────────── */
.ls-skip {
  position: fixed;
  top: var(--s3);
  left: var(--s3);
  z-index: 60;
  transform: translateY(-140%);
  background: var(--ink);
  color: var(--ground);
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: var(--s2) var(--s3);
  text-decoration: none;
  transition: transform 0.15s ease;
}
.ls-skip:focus {
  transform: translateY(0);
}
```

`.ls-skip` не завязан на `.ls-light`/`.ls-dark` намеренно: он вообще не должен быть
частью авторского сюжета — это чисто служебный элемент, видимый только по фокусу, и
красится инверсией `--ink`/`--ground` той секции, где физически расположен в DOM
(верх страницы, ещё до `IntroScene`, то есть `.ls-dark` от body унаследовать нечему —
он использует **не** сценовые переменные, а обычные `--color-fg`/`--color-app`
приложения, что здесь уместно: это элемент доступности поверх всей страницы, а не
часть истории).

- [ ] **Шаг 4: Удалить `.lp-hero`/`.lp-hero h1`, перенести `.lp-lede` из globals.css**

Удалить из `globals.css`: `.lp-hero`, `.lp-hero h1` и в `@media (max-width: 720px)` —
`.lp-hero { padding: var(--s5) 0 var(--s4); }`, `.lp-hero h1 { max-width: none; }`.
Правило `.lp-lede` **удалить из globals.css и добавить в landing.css** (см. шаг 3 выше —
уже добавлено там, здесь только убрать из globals.css). `.lp-cta`/`.lp-note` пока
оставить в globals.css — их всё ещё использует старый `.lp-end` до задачи 11.

- [ ] **Шаг 5: Смонтировать в `Page.tsx`, добавить skip-ссылку, убрать старую `.lp-hero`**

```diff
 import { IntroScene } from './components/IntroScene';
+import { PromiseScene } from './components/PromiseScene';
 import { SceneBackground } from './components/SceneBackground';

   return (
     <>
+      <a href="#promise-scene" className="ls-skip">
+        {t('skipToContent')}
+      </a>
       <LandingHeader />
       <SceneBackground ref={lightLayerRef} />

       <main>
         <IntroScene lightLayerRef={lightLayerRef} />
+        <PromiseScene />

         <Wrap page>
-          <section className="lp-hero">
-            <h1>{t('heroTitle')}</h1>
-            <p className="lp-lede">{t('heroLede')}</p>
-            <div className="lp-cta">
-              <Link href="/login?mode=register">
-                <Button variant="solid">{t('ctaStart')}</Button>
-              </Link>
-              <span className="lp-note">{t('ctaNote')}</span>
-            </div>
-          </section>

           <section className="lp-sec">
```

Инлайновая CTA после обещания убирается насовсем (не переносится) — по компактному
сценарию CTA одна, в финале; повторять её сразу после заголовка означало бы два
одинаковых по силе призыва на одной короткой странице.

- [ ] **Шаг 6: Проверить типы и паритет ключей**

Run: `cd frontend && npx tsc --noEmit && npx vitest run src/shared/i18n/messages.test.ts`
Expected: без ошибок, тест паритета ru/en зелёный.

- [ ] **Шаг 7: Проверить в браузере**

`/`, прокрутить через интро до обещания: заголовок и лид проявляются построчно (сверху
вниз, через clip-path, не через мгновенный fade). `Tab` с самого верха страницы — первый
таб-стоп — skip-ссылка (не видна до фокуса), активация переносит фокус и скролл к
`#promise-scene`.

- [ ] **Шаг 8: Commit**

```bash
git add frontend/src/views/landing/components/PromiseScene.tsx frontend/src/views/landing/Page.tsx frontend/src/views/landing/landing.css frontend/src/app/globals.css frontend/src/shared/i18n/messages/ru.json frontend/src/shared/i18n/messages/en.json
git commit -m "feat(landing): сцена 03 — обещание, skip-ссылка"
```

---

### Task 8: StepsScene (сцена 04)

**Files:**
- Create: `frontend/src/views/landing/components/StepsScene.tsx`
- Modify: `frontend/src/views/landing/Page.tsx`
- Modify: `frontend/src/views/landing/landing.css`
- Modify: `frontend/src/app/globals.css` (перенести `.lp-steps*`, `.lp-step*`)

**Interfaces:**
- Produces: `<StepsScene />` — без пропов.

- [ ] **Шаг 1: `StepsScene.tsx`**

```tsx
'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { Wrap } from '@/shared/ui/Wrap';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';

const STEPS = [1, 2, 3] as const;

/** Сцена 04: три шага «как это работает» — раскрываются по одному, не разом. */
export function StepsScene() {
  const t = useTranslations('landing');
  const root = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useGSAP(
    () => {
      registerGsap();
      const items = listRef.current ? gsap.utils.toArray<HTMLLIElement>('.ls-step', listRef.current) : [];
      if (items.length === 0) return;

      if (prefersReducedMotion()) {
        gsap.set(items, { opacity: 1, y: 0 });
        return;
      }

      gsap.set(items, { opacity: 0, y: 48 });
      gsap.timeline({
        scrollTrigger: { trigger: root.current, start: 'top top', end: '+=1600', scrub: 1, pin: true },
      }).to(items, { opacity: 1, y: 0, duration: 1, ease: 'power2.out', stagger: 0.5 });
    },
    { scope: root },
  );

  return (
    <section className="ls-steps ls-light" ref={root}>
      <Wrap>
        <h2>{t('stepsTitle')}</h2>
        <ol className="lp-steps" ref={listRef}>
          {STEPS.map((n) => (
            <li className="lp-step ls-step" key={n}>
              <h3>{t(`step${n}Title`)}</h3>
              <p>{t(`step${n}Body`)}</p>
            </li>
          ))}
        </ol>
      </Wrap>
    </section>
  );
}
```

- [ ] **Шаг 2: CSS сцены**

Добавить в `landing.css`:

```css
/* ── как это работает (сцена 04) ───────────────────────────────── */
.ls-steps {
  min-height: 100svh;
  display: flex;
  align-items: center;
  padding: var(--s5) 0;
}
.ls-steps h2 {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 400;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-3);
  margin: 0 0 var(--s4);
}
```

Перенести `.lp-steps`, `.lp-step`, `.lp-step h3`, `.lp-step h3::before`, `.lp-step p`
из globals.css в landing.css **без изменений тела правил** (только релокация файла).

- [ ] **Шаг 3: Удалить перенесённое из globals.css**

Убрать блоки `.lp-steps`, `.lp-step`, `.lp-step h3`, `.lp-step h3::before`, `.lp-step p` из
`globals.css` (тело правил один в один переехало в landing.css на шаге 2).

- [ ] **Шаг 4: Смонтировать, убрать старую секцию**

`<StepsScene />` встаёт **рядом** с `<Wrap page>`, не внутрь нЕё — сцена сама оборачивает
своё содержимое в `Wrap` (см. код сцены выше), и вложить её ещё и в старый внешний `Wrap`
значило бы удвоить горизонтальные поля. Старая секция удаляется изнутри всё ещё открытого
`<Wrap page>` — он пока держит на себе три оставшихся немигрировавших блока (sections-grid,
keys, honest, end) и закроется только в задаче 11, когда внутри него ничего не останется.

```diff
 import { PromiseScene } from './components/PromiseScene';
+import { StepsScene } from './components/StepsScene';

           <PromiseScene />
+          <StepsScene />

         <Wrap page>
-          <section className="lp-sec">
-            <h2>{t('stepsTitle')}</h2>
-            <ol className="lp-steps">
-              {STEPS.map((n) => (
-                <li className="lp-step" key={n}>
-                  <h3>{t(`step${n}Title`)}</h3>
-                  <p>{t(`step${n}Body`)}</p>
-                </li>
-              ))}
-            </ol>
-          </section>

           <section className="lp-sec">
             <h2>{t('sectionsTitle')}</h2>
```

Константа `STEPS` в `Page.tsx` становится неиспользуемой — удалить.

- [ ] **Шаг 5: Проверить типы**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Шаг 6: Проверить в браузере**

Прокрутить до трёх шагов: раскрываются по одному (не разом), нумерация — та же
счётчик-нумерация, что была. Реверс — шаги гаснут по одному в обратном порядке.

- [ ] **Шаг 7: Commit**

```bash
git add frontend/src/views/landing/components/StepsScene.tsx frontend/src/views/landing/Page.tsx frontend/src/views/landing/landing.css frontend/src/app/globals.css
git commit -m "feat(landing): сцена 04 — как это работает"
```

---

### Task 9: ProductDemoScene (сцена 05)

**Files:**
- Create: `frontend/src/views/landing/components/ProductDemoScene.tsx`
- Modify: `frontend/src/views/landing/Page.tsx`
- Modify: `frontend/src/views/landing/landing.css`
- Modify: `frontend/src/app/globals.css` (удалить `.lp-grid`, `.lp-card*`)

**Interfaces:**
- Produces: `<ProductDemoScene />` — без пропов.
- Consumes: `MetricCell` (`@/shared/ui/MetricCell`), `Money` (`@/shared/ui/Money`), `Tag` (`@/entities/tag`), `buildEquityGeometry`+`W`+`EquityGeometry` (`@/widgets/equity-chart/model/geometry` — напрямую, не через барrel-файл виджета, см. шаг 1).

Самая постановочная сцена: числа считают вверх, кривая эквити прочерчивается по скроллу,
срез журнала с тегом, подписи четырёх разделов продукта сменяются синхронно с тем, какая
часть панели сейчас главная. Данные — иллюстративные, не связаны с реальным
демо-аккаунтом (`seed-demo.ts`): это витрина механики, а не претензия на чьи-то данные.
Цвета тегов — намеренно **не** из тройки `--profit/--loss/--doubt` (см. Global
Constraints): те означают только деньги.

- [ ] **Шаг 1: `ProductDemoScene.tsx`**

```tsx
'use client';

import { useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { Wrap } from '@/shared/ui/Wrap';
import { MetricCell } from '@/shared/ui/MetricCell';
import { Money } from '@/shared/ui/Money';
import { Tag } from '@/entities/tag';
// Импорт из model/geometry напрямую, а не из '@/widgets/equity-chart' — тот
// барrel-файл реэкспортирует ещё и сам React-компонент EquityChart со своими
// зависимостями (next-intl, ui/layers), которые лендингу не нужны и незачем
// тащить в бандл ради одной чистой функции геометрии.
import { buildEquityGeometry, W, type EquityGeometry } from '@/widgets/equity-chart/model/geometry';
import type { EquityPoint } from '@/entities/trade';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';

const CURVE_HEIGHT = 220;

/** Иллюстративная кривая — с реалистичной просадкой, не идеальная прямая. */
const DEMO_EQUITY: EquityPoint[] = [
  { time: 0, value: 0 },
  { time: 1, value: 340 },
  { time: 2, value: 210 },
  { time: 3, value: 480 },
  { time: 4, value: 260 },
  { time: 5, value: 690 },
  { time: 6, value: 980 },
  { time: 7, value: 860 },
  { time: 8, value: 1240 },
];

const DEMO_TRADES = [
  { symbol: 'BTCUSDT', dir: 'long' as const, pnl: 128.4, tag: { name: 'Пробой диапазона', color: '#5b78a3' } },
  { symbol: 'ETHUSDT', dir: 'short' as const, pnl: -42.1, tag: { name: 'Контртренд', color: '#8a5ba3' } },
];

const METRICS = [
  { key: 'edge', label: 'Edge Score', target: 61, format: (v: number) => Math.round(v).toString() },
  { key: 'winrate', label: 'Винрейт', target: 57.4, format: (v: number) => `${v.toFixed(1)} %` },
  { key: 'pf', label: 'Профит-фактор', target: 1.9, format: (v: number) => v.toFixed(2) },
] as const;

const SECTIONS = ['overview', 'tags', 'analytics', 'market'] as const;

export function ProductDemoScene() {
  const t = useTranslations('landing');
  const root = useRef<HTMLElement>(null);
  const metricRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const curveRef = useRef<SVGPolylineElement>(null);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const captionRefs = useRef<(HTMLParagraphElement | null)[]>([]);

  const geometry = useMemo<EquityGeometry | null>(() => buildEquityGeometry(DEMO_EQUITY, CURVE_HEIGHT), []);

  useGSAP(
    () => {
      registerGsap();
      const curve = curveRef.current;
      const metricsEls = metricRefs.current.filter((el): el is HTMLSpanElement => el != null);
      const rows = rowRefs.current.filter((el): el is HTMLTableRowElement => el != null);
      const captions = captionRefs.current.filter((el): el is HTMLParagraphElement => el != null);
      if (!curve || metricsEls.length === 0) return;

      const length = curve.getTotalLength();
      gsap.set(curve, { strokeDasharray: length, strokeDashoffset: length });
      gsap.set(rows, { opacity: 0, y: 16 });
      gsap.set(captions, { opacity: 0 });
      gsap.set(captions[0] ?? null, { opacity: 1 });

      if (prefersReducedMotion()) {
        gsap.set(curve, { strokeDashoffset: 0 });
        gsap.set(rows, { opacity: 1, y: 0 });
        gsap.set(captions, { opacity: 1 });
        metricsEls.forEach((el, i) => {
          el.textContent = METRICS[i].format(METRICS[i].target);
        });
        return;
      }

      const tl = gsap.timeline({
        scrollTrigger: { trigger: root.current, start: 'top top', end: '+=2600', scrub: 1, pin: true },
      });

      tl.addLabel('metrics', 0);
      METRICS.forEach((m, i) => {
        const el = metricsEls[i];
        if (!el) return;
        const counter = { v: 0 };
        tl.to(
          counter,
          {
            v: m.target,
            duration: 1,
            ease: 'power1.out',
            onUpdate: () => {
              el.textContent = m.format(counter.v);
            },
          },
          `metrics+=${i * 0.15}`,
        );
      });

      tl.addLabel('curve', 'metrics+=0.6')
        .to(curve, { strokeDashoffset: 0, duration: 1.6, ease: 'power1.inOut' }, 'curve')
        .addLabel('ledger', 'curve+=0.9')
        .to(rows, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out', stagger: 0.25 }, 'ledger');

      // Подписи разделов сменяются по числу секций, синхронно с тем, что сейчас
      // «главное» на панели: metrics+curve → overview, ledger → tags, дальше —
      // аналитика и рынок как продолжение того же ритма.
      captions.forEach((caption, i) => {
        if (i === 0) return;
        tl.to(captions[i - 1], { opacity: 0, duration: 0.3 }, `metrics+=${0.9 * i}`).to(
          caption,
          { opacity: 1, duration: 0.3 },
          `metrics+=${0.9 * i}`,
        );
      });
    },
    { scope: root },
  );

  return (
    <section className="ls-demo ls-light" ref={root}>
      <Wrap>
        <div className="ls-demo-panel">
          <div className="metrics metrics-3">
            {METRICS.map((m, i) => (
              <MetricCell
                key={m.key}
                label={m.label}
                value={
                  <span ref={(el) => { metricRefs.current[i] = el; }}>
                    {m.format(0)}
                  </span>
                }
              />
            ))}
          </div>

          {geometry && (
            <svg
              className="ls-demo-curve"
              viewBox={`0 0 ${W} ${CURVE_HEIGHT}`}
              preserveAspectRatio="none"
              aria-hidden
            >
              <polyline ref={curveRef} points={geometry.line} fill="none" stroke="var(--ink)" strokeWidth={2} />
            </svg>
          )}

          <div className="scroll">
            <table className="ledger ls-demo-ledger">
              <tbody>
                {DEMO_TRADES.map((row, i) => (
                  <tr key={row.symbol} ref={(el) => { rowRefs.current[i] = el; }}>
                    <td className="sym">{row.symbol}</td>
                    <td>
                      <span className={row.dir === 'short' ? 'dir short' : 'dir'}>
                        {row.dir === 'short' ? 'Short' : 'Long'}
                      </span>
                    </td>
                    <td>
                      <Tag name={row.tag.name} color={row.tag.color} />
                    </td>
                    <td className="r">
                      <Money value={row.pnl} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="ls-demo-captions">
          {SECTIONS.map((id, i) => (
            <p className="ls-demo-caption" key={id} ref={(el) => { captionRefs.current[i] = el; }}>
              <strong>{t(`section_${id}_title`)}</strong> — {t(`section_${id}_body`)}
            </p>
          ))}
        </div>
      </Wrap>
    </section>
  );
}
```

`Tag` требует поле `id` по своему интерфейсу `TagLike` в `Tags`/`TagCombo`, но сам
компонент `Tag` (используемый здесь напрямую) принимает только `{ name, color }` — id
здесь не нужен.

- [ ] **Шаг 2: CSS сцены**

Добавить в `landing.css`:

```css
/* ── продукт в движении (сцена 05) ─────────────────────────────── */
.ls-demo {
  min-height: 100svh;
  display: flex;
  align-items: center;
  padding: var(--s5) 0;
}
.ls-demo-panel {
  border: 1px solid var(--rule);
  padding: var(--s4);
}
.ls-demo-curve {
  display: block;
  width: 100%;
  height: auto;
  margin: var(--s4) 0;
}
.ls-demo-ledger {
  min-width: 0;
}
.ls-demo-captions {
  position: relative;
  margin-top: var(--s4);
  min-height: 4.8em;
}
.ls-demo-caption {
  position: absolute;
  inset: 0;
  max-width: 62ch;
  color: var(--ink-2);
  font-size: var(--t-s);
  line-height: 1.6;
}
.ls-demo-caption strong {
  color: var(--ink);
  font-weight: 400;
}

@media (max-width: 720px) {
  .ls-demo-panel {
    padding: var(--s3);
  }
}
```

- [ ] **Шаг 3: Удалить `.lp-grid`/`.lp-card*` из globals.css**

Удалить `.lp-grid`, `.lp-card h3`, `.lp-card p` и в `@media (max-width: 720px)` —
`.lp-grid { grid-template-columns: 1fr; }`.

- [ ] **Шаг 4: Смонтировать, убрать старую секцию**

`<ProductDemoScene />` — снова сиблинг `<Wrap page>`, а не её содержимое, по той же причине,
что и `StepsScene` в задаче 8. Старая секция удаляется изнутри всё ещё открытого
`<Wrap page>`, в котором на этот момент остаются keys, honest и end.

```diff
 import { StepsScene } from './components/StepsScene';
+import { ProductDemoScene } from './components/ProductDemoScene';

           <StepsScene />
+          <ProductDemoScene />

         <Wrap page>
-          <section className="lp-sec">
-            <h2>{t('sectionsTitle')}</h2>
-            <div className="lp-grid">
-              {SECTIONS.map((id) => (
-                <div className="lp-card" key={id}>
-                  <h3>{t(`section_${id}_title`)}</h3>
-                  <p>{t(`section_${id}_body`)}</p>
-                </div>
-              ))}
-            </div>
-          </section>

           <section className="lp-sec">
             <h2>{t('keysTitle')}</h2>
```

`SECTIONS` в `Page.tsx` теперь неиспользуема (своя копия появилась в
`ProductDemoScene.tsx`) — удалить константу из `Page.tsx`.

- [ ] **Шаг 5: Проверить типы**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Шаг 6: Проверить в браузере**

Прокрутить до демо-панели: три числа считают вверх, кривая прочерчивается слева направо
(не мгновенно), затем проявляются две строки журнала с тегом, подписи разделов внизу
сменяют друг друга. Реверс — кривая «стирается» обратно, числа считают вниз.

- [ ] **Шаг 7: Commit**

```bash
git add frontend/src/views/landing/components/ProductDemoScene.tsx frontend/src/views/landing/Page.tsx frontend/src/views/landing/landing.css frontend/src/app/globals.css
git commit -m "feat(landing): сцена 05 — продукт в движении"
```

---

### Task 10: TrustScene (сцена 06)

**Files:**
- Create: `frontend/src/views/landing/components/TrustScene.tsx`
- Modify: `frontend/src/views/landing/Page.tsx`
- Modify: `frontend/src/views/landing/landing.css`
- Modify: `frontend/src/app/globals.css` (перенести `.lp-body`; перенести и сузить `.lp-sec h2, .lp-end h2`; удалить `.lp-sec`, `.lp-honest*`)

**Interfaces:**
- Produces: `<TrustScene />` — без пропов. Фон-путешествие сюда не пробрасывается: сцена
  целиком живёт на светлой палитре, обратный кроссфейд к тёмной — забота `FinaleScene`
  (задача 11), не этой сцены (см. спеку: переход происходит в переходной зоне между
  Trust и Finale, а не внутри читаемого текста Trust).

Анимация здесь нарочно тише, чем в остальных сценах — это серьёзный текст (read-only
ключи, честность про непроверенные биржи), не эффектный.

- [ ] **Шаг 1: `TrustScene.tsx`**

```tsx
'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { Wrap } from '@/shared/ui/Wrap';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';

const HONEST_KEYS = ['honest1', 'honest2', 'honest3'] as const;

/** Сцена 06: read-only ключи + честность про непроверенные биржи — тихий reveal. */
export function TrustScene() {
  const t = useTranslations('landing');
  const root = useRef<HTMLElement>(null);
  const blocksRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      registerGsap();
      if (prefersReducedMotion()) return;

      const blocks = blocksRef.current ? gsap.utils.toArray<HTMLElement>('.ls-trust-block', blocksRef.current) : [];
      if (blocks.length === 0) return;

      gsap.set(blocks, { opacity: 0, y: 20 });
      gsap.timeline({
        scrollTrigger: { trigger: root.current, start: 'top 75%', end: 'top 25%', scrub: 1 },
      }).to(blocks, { opacity: 1, y: 0, duration: 1, ease: 'power1.out', stagger: 0.3 });
    },
    { scope: root },
  );

  return (
    <section className="ls-trust ls-light" ref={root}>
      <Wrap>
        <div ref={blocksRef}>
          <div className="ls-trust-block">
            <h2>{t('keysTitle')}</h2>
            <p className="lp-body">{t('keysBody')}</p>
          </div>

          <div className="ls-trust-block">
            <h2>{t('honestTitle')}</h2>
            <ul className="lp-honest">
              {HONEST_KEYS.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          </div>
        </div>
      </Wrap>
    </section>
  );
}
```

- [ ] **Шаг 2: CSS сцены + перенос `.lp-body`, `.lp-honest*`**

Добавить в `landing.css`:

```css
/* ── честно (сцена 06) ─────────────────────────────────────────── */
.ls-trust {
  padding: var(--s6) 0;
}
.ls-trust-block + .ls-trust-block {
  margin-top: var(--s5);
}
.ls-trust h2 {
  font-family: var(--font-mono);
  font-size: var(--t-xs);
  font-weight: 400;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-3);
  margin: 0 0 var(--s3);
}
.lp-body {
  max-width: 68ch;
  margin: 0;
  color: var(--ink-2);
  font-size: var(--t-s);
  line-height: 1.6;
}
.lp-honest {
  display: grid;
  gap: var(--s3);
  max-width: 68ch;
  margin: 0;
  padding: 0;
  list-style: none;
}
.lp-honest li {
  border-left: 1px solid var(--hair);
  padding-left: var(--s3);
  color: var(--ink-2);
  font-size: var(--t-s);
  line-height: 1.6;
}
```

- [ ] **Шаг 3: Перенести-сузить заголовочное правило, удалить `.lp-sec`/`.lp-honest*` из globals.css**

В `globals.css` было составное правило `.lp-sec h2, .lp-end h2 { ... }`. После этой
задачи `.lp-sec` (сама секция-обёртка) больше не используется нигде (steps, sections-grid,
keys и honest — все четыре уже мигрировали) — удалить правило `.lp-sec` целиком и
responsive `.lp-sec { padding: var(--s4) 0; }`. Составной селектор заголовка сузить до
одного `.lp-end h2` (у `.lp-end` до задачи 11 остаётся живым) — **изменить**, не удалять:

```diff
-  .lp-sec h2,
-  .lp-end h2 {
+  .lp-end h2 {
     margin: 0 0 var(--s4);
     font-family: var(--font-mono);
     font-size: var(--t-xs);
     font-weight: 400;
     letter-spacing: 0.1em;
     text-transform: uppercase;
     color: var(--ink-3);
   }
```

Удалить `.lp-honest`, `.lp-honest li` из globals.css (тело один в один переехало в
landing.css на шаге 2). `.lp-body` — удалить из globals.css (переехало туда же); он
по-прежнему нужен старому `.lp-end .lp-body` до задачи 11 — рабочим он останется, так как
правило теперь живёт в landing.css, который импортирован в Page.tsx и действует на всю
страницу так же глобально, как раньше действовал из globals.css.

- [ ] **Шаг 4: Смонтировать, убрать старые секции**

`<TrustScene />` — снова сиблинг `<Wrap page>`. Обе старые секции (keys и honest)
удаляются изнутри всё ещё открытого `<Wrap page>`, в котором после этой задачи остаётся
только `.lp-end` — она закрывает Wrap в задаче 11.

```diff
 import { ProductDemoScene } from './components/ProductDemoScene';
+import { TrustScene } from './components/TrustScene';

           <ProductDemoScene />
+          <TrustScene />

         <Wrap page>
-          <section className="lp-sec">
-            <h2>{t('keysTitle')}</h2>
-            <p className="lp-body">{t('keysBody')}</p>
-          </section>

-          <section className="lp-sec">
-            <h2>{t('honestTitle')}</h2>
-            <ul className="lp-honest">
-              <li>{t('honest1')}</li>
-              <li>{t('honest2')}</li>
-              <li>{t('honest3')}</li>
-            </ul>
-          </section>

           <section className="lp-end">
```

- [ ] **Шаг 5: Проверить типы**

Run: `cd frontend && npx tsc --noEmit`

- [ ] **Шаг 6: Проверить в браузере**

Прокрутить до блока честности: оба подблока (ключи, три пункта) проявляются тихо —
без пина, лёгкий y+opacity, без резких эффектов. Текст читается на светлом фоне (не белый
на белом) независимо от того, тёмная или светлая тема выбрана переключателем в шапке.

- [ ] **Шаг 7: Commit**

```bash
git add frontend/src/views/landing/components/TrustScene.tsx frontend/src/views/landing/Page.tsx frontend/src/views/landing/landing.css frontend/src/app/globals.css
git commit -m "feat(landing): сцена 06 — честно"
```

---

### Task 11: FinaleScene (сцена 07) — обратный кроссфейд, CTA, дозачистка CSS

**Files:**
- Create: `frontend/src/views/landing/components/FinaleScene.tsx`
- Modify: `frontend/src/views/landing/Page.tsx`
- Modify: `frontend/src/views/landing/landing.css`
- Modify: `frontend/src/app/globals.css` (удалить `.lp-end*`, `.lp-cta`, `.lp-note`)

**Interfaces:**
- Produces: `<FinaleScene lightLayerRef={RefObject<HTMLDivElement | null>} />` — принимает тот же реф, что и `IntroScene`, и гасит его `opacity` обратно к 0 (символично закрывая фон-путешествие).

- [ ] **Шаг 1: `FinaleScene.tsx`**

```tsx
'use client';

import { useRef, type RefObject } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { Button } from '@/shared/ui/Button';
import { VirexLogo } from '@/shared/ui/VirexLogo';
import { Wrap } from '@/shared/ui/Wrap';
import { registerGsap } from '../lib/gsapConfig';
import { prefersReducedMotion } from '../lib/reducedMotion';

/**
 * Сцена 07: финал. Возвращает фон к тёмной палитре (та же, что в остальном
 * продукте) и показывает знак статично, без повторной сборки — это payoff
 * истории, а не ещё одна демонстрация того же трюка.
 */
export function FinaleScene({ lightLayerRef }: { lightLayerRef: RefObject<HTMLDivElement | null> }) {
  const t = useTranslations('landing');
  const root = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      registerGsap();

      if (prefersReducedMotion()) {
        if (lightLayerRef.current) gsap.set(lightLayerRef.current, { opacity: 0 });
        return;
      }

      const content = contentRef.current ? gsap.utils.toArray<HTMLElement>('.ls-finale-item', contentRef.current) : [];
      gsap.set(content, { opacity: 0, y: 16 });

      const tl = gsap.timeline({
        scrollTrigger: { trigger: root.current, start: 'top 90%', end: 'top 30%', scrub: 1 },
      });

      if (lightLayerRef.current) {
        tl.to(lightLayerRef.current, { opacity: 0, duration: 1, ease: 'power1.inOut' }, 0);
      }
      tl.to(content, { opacity: 1, y: 0, duration: 1, ease: 'power2.out', stagger: 0.25 }, 0.2);
    },
    { scope: root },
  );

  return (
    <section className="ls-finale ls-dark" ref={root}>
      <Wrap>
        <div ref={contentRef}>
          <VirexLogo className="ls-finale-logo ls-finale-item" aria-hidden />
          <h2 className="ls-finale-item">{t('endTitle')}</h2>
          <p className="lp-body ls-finale-item">{t('endBody')}</p>
          <div className="lp-cta ls-finale-item">
            <Link href="/login?mode=register">
              <Button variant="solid">{t('ctaStart')}</Button>
            </Link>
            <span className="lp-note">{t('ctaNote')}</span>
          </div>
          <Link href="/login" className="lp-login ls-finale-item">
            {t('signIn')}
          </Link>
        </div>
      </Wrap>
    </section>
  );
}
```

- [ ] **Шаг 2: CSS сцены, перенос `.lp-cta`/`.lp-note`**

Добавить в `landing.css`:

```css
/* ── финал (сцена 07) ──────────────────────────────────────────── */
.ls-finale {
  padding: var(--s6) 0 var(--s5);
}
.ls-finale-logo {
  width: 64px;
  height: 64px;
  margin-bottom: var(--s4);
}
.ls-finale h2 {
  font-size: var(--t-l);
  font-weight: 400;
  margin: 0 0 var(--s3);
}
.ls-finale .lp-body {
  margin-bottom: var(--s4);
}
.ls-finale .lp-login {
  display: inline-block;
  margin-top: var(--s3);
}
.lp-cta {
  display: flex;
  align-items: center;
  gap: var(--s3);
  flex-wrap: wrap;
}
.lp-note {
  color: var(--ink-3);
  font-size: var(--t-s);
}
```

- [ ] **Шаг 3: Финальная зачистка globals.css**

К этому моменту в секции «ГЛАВНАЯ» `globals.css` из старого набора остаётся только
`.lp-end`, `.lp-end .lp-body`, `.lp-end h2` (сужен в задаче 10) и responsive `.lp-end {
padding: var(--s4) 0 var(--s5); }`. Удалить все четыре — весь `.lp-*`, что относился к
старой композиции секций, теперь либо удалён, либо перенесён в `landing.css`. В
globals.css в секции «ГЛАВНАЯ» должно остаться **ничего**: заголовок-комментарий секции
можно удалить вместе с последним правилом, если после удаления он повис в одиночестве.

Проверить (по всему файлу, не только по памяти о предыдущих задачах):

```bash
cd frontend && grep -n "\.lp-" src/app/globals.css
```

Expected: пусто — ни одного совпадения.

- [ ] **Шаг 4: Смонтировать, удалить старую секцию, неиспользуемые импорты**

`.lp-end` было последней секцией внутри старого `<Wrap page>` — после её удаления Wrap
остаётся пустым и убирается тоже, целиком, тем же диффом. `<FinaleScene />` — сиблинг
наравне со всеми остальными сценами, как и они, оборачивает своё содержимое в `Wrap`
сама.

```diff
 import { TrustScene } from './components/TrustScene';
+import { FinaleScene } from './components/FinaleScene';

           <TrustScene />
+          <FinaleScene lightLayerRef={lightLayerRef} />
-
-        <Wrap page>
-          <section className="lp-end">
-            <h2>{t('endTitle')}</h2>
-            <p className="lp-body">{t('endBody')}</p>
-            <div className="lp-cta">
-              <Link href="/login?mode=register">
-                <Button variant="solid">{t('ctaStart')}</Button>
-              </Link>
-              <Link href="/login" className="lp-login">
-                {t('signIn')}
-              </Link>
-            </div>
-          </section>
-        </Wrap>
       </main>
```

`Button`, `Link` в `Page.tsx` теперь используются только внутри `FinaleScene` — удалить их
импорты из `Page.tsx`, если после удаления секции они там больше не нужны нигде (проверить
`grep -n "Button\|Link" frontend/src/views/landing/Page.tsx`).

- [ ] **Шаг 5: Проверить типы**

Run: `cd frontend && npx tsc --noEmit`
Expected: без ошибок, без неиспользуемых импортов.

- [ ] **Шаг 6: Проверить в браузере**

Прокрутить всю страницу до конца: после честного блока фон плавно темнеет обратно,
проявляется знак (статично, без повторной сборки), заголовок, текст, кнопка «Создать
аккаунт», подпись, ссылка «Войти», футер. Обе кнопки кликабельны и ведут на `/login`
соответствующим режимом.

- [ ] **Шаг 7: Commit**

```bash
git add frontend/src/views/landing/components/FinaleScene.tsx frontend/src/views/landing/Page.tsx frontend/src/views/landing/landing.css frontend/src/app/globals.css
git commit -m "feat(landing): сцена 07 — финал, обратный кроссфейд, зачистка CSS"
```

---

### Task 12: Финальная проверка

**Files:** нет изменений кода — только команды и (при находках) точечные правки в
файлах, созданных/изменённых в задачах 1–11.

- [ ] **Шаг 1: Полный билд**

```bash
cd frontend
npx next build
```

Expected: билд проходит без ошибок. Это крупная правка (новые зависимости и
конфигурация) — билд гоняется без отдельного вопроса, по глобальному правилу проекта.

- [ ] **Шаг 2: Lint и полный прогон тестов**

```bash
cd frontend
npm run lint
npx vitest run
```

Expected: без новых ошибок линта (существующие ошибки вне лендинга, если есть, — не
предмет этой задачи), все тесты зелёные, включая паритет ключей ru/en и брейкпоинты
из задачи 1.

- [ ] **Шаг 3: Убедиться, что мёртвый CSS не остался**

```bash
cd frontend
grep -rn "lp-splash\|lp-hero\|lp-grid\|lp-card\|lp-end\|lp-honest\|lp-steps\|lp-step " src/app/globals.css
```

Expected: пусто.

- [ ] **Шаг 4: Playwright — проход по сценарию**

Через `playwright-skill` (дев-сервер `npm run dev` в `frontend/`, порт 8090) прогнать по
`http://localhost:8090/`:

1. Скролл вперёд от самого верха до конца страницы одним долгим жестом — все сцены
   проигрываются по порядку, ни одна не проваливается и не залипает.
2. Скролл назад из самого конца до верха — реверс каждой сцены визуально корректен
   (логотип пересобирается, кривая «стирается», цвета возвращаются).
3. `refresh` (F5) на скролл-позиции примерно в середине страницы (внутри
   `ProductDemoScene`) — сцена оказывается в корректном статическом состоянии, а не
   сломанной на середине анимации.
4. Resize: 1440×900 → 1024×768 (планшет) → 390×844 (мобильный) без перезагрузки —
   раскладка не ломается, ScrollTrigger пересчитывается (проверить, что пин не остаётся
   «залипшим» не на своём месте после ресайза).
5. Эмуляция `prefers-reduced-motion: reduce` — страница показывает весь контент сразу,
   без пина и scrub, Lenis не создаётся (нет сглаженного скролла).
6. Обе темы через `ThemeToggle` в проявившейся шапке — сцены светлой половины истории
   остаются светлыми, тёмной — тёмными, независимо от выбора темы (проверка самого
   механизма `.ls-light`/`.ls-dark`, см. задачу 4).
7. Проверить консоль браузера на ошибки/warning от GSAP, ScrollTrigger или Lenis — не
   должно быть.

- [ ] **Шаг 5: Отчитаться**

Зафиксировать результат (что прогнано, что нашлось и было исправлено, финальный статус
build/lint/test/Playwright) в сообщении пользователю. Ничего не коммитить на этом шаге,
если предыдущие шаги не потребовали точечных правок — задачи 1–11 уже закоммичены по
отдельности.

---

## Самопроверка плана

**Покрытие спеки.** Все восемь сцен — задачи 5–11 (00+01 вместе в задаче 5, 02 в
задаче 6). Lenis+GSAP интеграция — задача 2. Логотип без изменения геометрии — задача 3.
`data-candle` вместо индекса — задача 3. matchMedia-брейкпоинты, синхронные с CSS —
задача 1 (значения); JS-ветвление по ним в интро не потребовалось благодаря
`.ls-light`/`.ls-dark` и относительно простой геометрии — там, где реально нужно другое
поведение на мобильном (короче дистанции, меньше диагональных сдвигов), это CSS
`@media (max-width: 720px)` в соответствующей задаче. `prefers-reduced-motion` — во
каждой сцене отдельно (задачи 5–11), плюс Lenis (задача 2). Skip-ссылка — задача 7.
Фон-путешествие без переключения `data-theme` — задачи 4 (механизм), 6 (вперёд), 11
(назад). Только transform/opacity/clip-path/stroke-dashoffset — везде. Cleanup через
`useGSAP`/`scope` — везде. Итоговая проверка (build/lint/test/Playwright, обе темы,
resize, reverse, refresh) — задача 12.

**Плейсхолдеры.** Не найдено — каждый шаг несёт конкретный код/CSS/команду.

**Согласованность типов.** `lightLayerRef: RefObject<HTMLDivElement | null>` — одинаковая
сигнатура в `IntroScene` (задача 5/6) и `FinaleScene` (задача 11); `TrustScene` (задача 10)
сознательно без этого пропа. `registerGsap()`/`prefersReducedMotion()` — одна и та же
пара импортов и порядок вызова в каждой сцене. `data-candle` значения (`left`,
`left-center`, `center`, `right-center`, `right`) — одни и те же в задаче 3 (производитель)
и задаче 5 (потребитель).

**Реальные баги, найденные и исправленные при повторном чтении** (не косметика — без этих
правок сцена физически не выглядела бы так, как задумано):

- `.ls-void` и `.ls-logo-group` центровались `position:absolute` без единой заданной
  координаты — ничего не центровалось. Хуже: центрирование через
  `transform: translate(-50%,-50%)` конфликтовало бы с GSAP, который на первом же
  `gsap.set/to` перезаписывает inline `transform` целиком по своим x/y/scale и стёр бы
  ручной сдвиг. Исправлено на CSS grid с одной ячейкой (`grid-area: 1 / 1` на обоих) —
  центрирование не через `transform`, конфликтовать не с чем (задача 5).
- Смещения свечей при сборке были в пиксельных величинах (-260, -320…), а цель твина —
  `<path>` внутри SVG с `viewBox="0 0 100 100"`: GSAP считает x/y в локальной системе
  координат SVG, и эти числа улетали за пределы знака в 3–4 раза дальше, чем задумано.
  Пересчитано в единицы viewBox (70–100 — уже уверенно за рамками знака) (задача 5).
- `.ls-intro` красил себя непрозрачным `background`, который навсегда перекрывал бы
  `.ls-bg` — вспышка (сцена 02) физически никогда не стала бы видна: рисуется ниже по
  z-index, а не проступает сквозь секцию сама по себе. Убрано в задаче 6, когда
  появляется `.ls-bg`.
- Диффы `Page.tsx` в задачах 8–10 не показывали границу `<Wrap page>` явно, из-за чего
  новые сцены (сами оборачивающие себя в `Wrap`) читались бы как вложенные ещё и в
  старый внешний `Wrap` — двойные горизонтальные поля. Исправлено: явно показано, что
  каждая новая сцена — сиблинг `<Wrap page>`, а не её содержимое; в задаче 11 пустой
  `<Wrap page>` удаляется вместе с последней старой секцией.
- `<svg className="ls-demo-curve bleed">` тянул класс `.bleed`, чей эффект (кривая на
  всю ширину вьюпорта) в этой вёрстке не работает — кривая стоит внутри `Wrap` и
  бордера панели, а не рядом с ними: `.bleed svg` ждёт дочерний svg, а не сам себя.
  Класс убран, вся нужная стилизация уже была в собственном `.ls-demo-curve`.
- Импорт `buildEquityGeometry` из барrel-файла `@/widgets/equity-chart` тянул бы в
  бандл лендинга ещё и сам React-компонент `EquityChart` со своими зависимостями —
  заменено на прямой импорт из `model/geometry`.
- `dependencies: [lightLayerRef]` в паре `useGSAP` ничего не делало (реф — стабильный
  объект, его identity не меняется) и вводило в заблуждение по поводу того, зачем оно
  здесь — убрано.
