# Доделать страницу «Рынок» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подключить 4 неиспользуемых хука (`useMarketData`, `useFearAndGreed`, `useDeFiTVL`,
`useVolatility`) и новый `useCMC20` к странице «Рынок» — новая строка `MacroSnapshot` (общий
фон рынка) над `Positioning` и 4-я колонка «Волатильность» внутри уже существующей строки
коэффициентов `Positioning`.

**Architecture:** Данные тянет `Page.tsx` (как уже делает для `useMarketSentiment` и т. д.),
компоненты — презентационные, скелетоны на месте значения per-field. Индекс топ-20 подписан
честно («Индекс топ-20», не «CMC20») со значком-подсказкой — в проекте нет ключа CMC, эндпоинт
всегда отдаёт самодельный фолбэк.

**Tech Stack:** Next.js App Router, React Query (`@tanstack/react-query`), `next-intl`, vitest.

## Global Constraints

- Цвета — только классами из `globals.css` (`.pos`, `.neg`, …), не инлайновым `style`.
- Никакой сырой разметки для повторяющихся элементов — использовать `shared/ui` (`Skeleton`,
  `Tooltip`, `SectionHead`).
- RU/EN парность ключей в `frontend/src/shared/i18n/messages/{ru,en}.json` обязана проходить
  `frontend/src/shared/i18n/messages.test.ts`.
- Формат USD — только через `fmtUsdCompact` (`market/components/SentimentChart.tsx`); проценты
  со знаком — только через `fmtPctSigned` (`shared/lib/utils/format.ts`). Не заводить
  параллельных форматтеров.
- См. полный дизайн: `docs/superpowers/specs/2026-08-30-market-page-design.md`.

---

### Task 1: `fmtUsdCompact` — разряд триллионов

**Files:**
- Modify: `frontend/src/views/market/components/SentimentChart.tsx:21-26`
- Test: Create `frontend/src/views/market/components/SentimentChart.test.ts`

**Interfaces:**
- Produces: `fmtUsdCompact(v: number, locale: Locale = 'ru'): string` — сигнатура не меняется,
  только новая ветка `>= 1e12`. Позже используется в Task 6 для капитализации рынка (~$2–3
  трлн).

- [ ] **Step 1: Написать падающий тест**

Создать `frontend/src/views/market/components/SentimentChart.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fmtUsdCompact } from './SentimentChart';

describe('fmtUsdCompact', () => {
  it('formats trillions with a T suffix', () => {
    expect(fmtUsdCompact(2.3e12)).toBe('$2.3 T');
  });

  it('still formats billions with a B suffix (regression)', () => {
    expect(fmtUsdCompact(6.1e9)).toBe('$6.1 B');
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что первый тест падает**

Run: `cd frontend && npx vitest run src/views/market/components/SentimentChart.test.ts`
Expected: FAIL на `formats trillions with a T suffix` — фактический результат `"$2300.0 B"` (в
функции ещё нет ветки триллионов), второй тест уже проходит (текущее поведение и так верное).

- [ ] **Step 3: Добавить ветку триллионов**

В `frontend/src/views/market/components/SentimentChart.tsx` заменить:

```ts
/** $6.1B / $840M — компактные доллары для подписи. */
export function fmtUsdCompact(v: number, locale: Locale = 'ru'): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)} B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)} M`;
  return `$${Math.round(v).toLocaleString(locale === 'en' ? 'en-US' : 'ru-RU')}`;
}
```

на:

```ts
/** $2.3T / $6.1B / $840M — компактные доллары для подписи. */
export function fmtUsdCompact(v: number, locale: Locale = 'ru'): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)} T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)} B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)} M`;
  return `$${Math.round(v).toLocaleString(locale === 'en' ? 'en-US' : 'ru-RU')}`;
}
```

- [ ] **Step 4: Запустить тест и убедиться, что проходит**

Run: `cd frontend && npx vitest run src/views/market/components/SentimentChart.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/market/components/SentimentChart.ts frontend/src/views/market/components/SentimentChart.test.ts
git commit -m "feat(market): разряд триллионов в fmtUsdCompact"
```

(Обратите внимание: файл на самом деле `SentimentChart.tsx`, не `.ts` — в `git add` указывать
реальное расширение.)

---

### Task 2: `useCMC20` — хук под индекс топ-20

**Files:**
- Modify: `frontend/src/views/market/api/hooks.ts:61-73` (вставка после `useDeFiTVL`, перед
  `useMarketSentiment`)

**Interfaces:**
- Consumes: `apiFetch` из `@/shared/api/http` (уже импортирован в файле).
- Produces: `interface Cmc20Data { index: number; change24h: number }`, `useCMC20(): UseQueryResult<Cmc20Data>`
  — используется в Task 6 (`MacroSnapshot`) и Task 8 (`Page.tsx`).

Тест не пишется: остальные 4 хука в этом файле (`useMarketData`, `useFearAndGreed`,
`useDeFiTVL`, `useMarketSentiment`) — тонкие обёртки без тестов, тот же паттерн без
исключений.

- [ ] **Step 1: Добавить интерфейс и хук**

В `frontend/src/views/market/api/hooks.ts` после блока `useDeFiTVL` (перед
`export const useMarketSentiment`) вставить:

```ts
export interface Cmc20Data {
  index: number;
  change24h: number;
}

export const useCMC20 = () =>
  useQuery({
    queryKey: ['analyticsCmc20'],
    queryFn: async () => {
      const response = await apiFetch('/api/analytics/cmc20', { method: 'GET' });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response.json() as Promise<Cmc20Data>;
    },
    staleTime: 600_000,
    refetchInterval: 600_000,
  });

```

- [ ] **Step 2: Проверить типы**

Run: `cd frontend && npx tsc --noEmit`
Expected: без ошибок (хук пока нигде не используется — это нормально, TS не ругается на
неиспользуемый экспорт).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/market/api/hooks.ts
git commit -m "feat(market): хук useCMC20"
```

---

### Task 3: `fearGreedLabel` — перевод классификации

**Files:**
- Create: `frontend/src/views/market/lib/fearGreedLabel.ts`
- Test: Create `frontend/src/views/market/lib/fearGreedLabel.test.ts`

**Interfaces:**
- Consumes: ничего внешнего (чистая функция).
- Produces: `type TFunc = (key: string) => string`, `fearGreedLabel(classification: string, t: TFunc): string`
  — используется в Task 6 (`MacroSnapshot`), `t` там — `useTranslations('market')` из
  `next-intl` (сигнатура шире, чем `TFunc`, но совместима — `next-intl`'s `t` принимает
  строку и возвращает строку).

- [ ] **Step 1: Написать падающий тест**

Создать `frontend/src/views/market/lib/fearGreedLabel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fearGreedLabel } from './fearGreedLabel';

// Фейковый t(): возвращает сам ключ — тест проверяет, какой ключ выбрала
// функция, а не текст перевода из каталога (его сверяет messages.test.ts).
const t = (key: string) => key;

describe('fearGreedLabel', () => {
  it('maps each known alternative.me classification to its i18n key', () => {
    expect(fearGreedLabel('Extreme Fear', t)).toBe('fngExtremeFear');
    expect(fearGreedLabel('Fear', t)).toBe('fngFear');
    expect(fearGreedLabel('Neutral', t)).toBe('fngNeutral');
    expect(fearGreedLabel('Greed', t)).toBe('fngGreed');
    expect(fearGreedLabel('Extreme Greed', t)).toBe('fngExtremeGreed');
  });

  it('falls back to the raw classification when unrecognized', () => {
    expect(fearGreedLabel('Whatever', t)).toBe('Whatever');
  });
});
```

- [ ] **Step 2: Запустить и убедиться, что тест падает**

Run: `cd frontend && npx vitest run src/views/market/lib/fearGreedLabel.test.ts`
Expected: FAIL с «Cannot find module './fearGreedLabel'» (файла ещё нет)

- [ ] **Step 3: Написать реализацию**

Создать `frontend/src/views/market/lib/fearGreedLabel.ts`:

```ts
export type TFunc = (key: string) => string;

const FNG_LABEL_KEYS: Record<string, string> = {
  'Extreme Fear': 'fngExtremeFear',
  Fear: 'fngFear',
  Neutral: 'fngNeutral',
  Greed: 'fngGreed',
  'Extreme Greed': 'fngExtremeGreed',
};

/**
 * `classification` с alternative.me — фиксированный английский набор из пяти
 * значений. Незнакомое значение (API расширит набор) возвращает как есть —
 * нелокализованная строка лучше пустого места (тот же приём, что у
 * `habitLabel` в `overview/lib/habit-labels.ts`).
 */
export function fearGreedLabel(classification: string, t: TFunc): string {
  const key = FNG_LABEL_KEYS[classification];
  return key ? t(key) : classification;
}
```

- [ ] **Step 4: Запустить тест и убедиться, что проходит**

Run: `cd frontend && npx vitest run src/views/market/lib/fearGreedLabel.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/market/lib/fearGreedLabel.ts frontend/src/views/market/lib/fearGreedLabel.test.ts
git commit -m "feat(market): перевод классификации Fear & Greed"
```

---

### Task 4: i18n-ключи

**Files:**
- Modify: `frontend/src/shared/i18n/messages/ru.json:373` (внутри блока `"market"`, после
  `weekdayFooterNote`)
- Modify: `frontend/src/shared/i18n/messages/en.json:373` (тот же блок)

**Interfaces:**
- Produces: 11 новых ключей в namespace `market` — используются в Task 6 (`MacroSnapshot`) и
  Task 7 (`Positioning`): `macroTitle`, `marketCap`, `top20Index`, `top20IndexHint`,
  `fngExtremeFear`, `fngFear`, `fngNeutral`, `fngGreed`, `fngExtremeGreed`,
  `currentVolatility`, `volatilityElevated`.

- [ ] **Step 1: Добавить ключи в ru.json**

В `frontend/src/shared/i18n/messages/ru.json` строку

```json
    "weekdayFooterNote": "Доля дней, закрывшихся выше открытия, и средний ход за {days} дней. Отклонение от 50 % на такой выборке — намёк, а не закономерность."
  },
```

(закрывающая блок `"market"`) заменить на:

```json
    "weekdayFooterNote": "Доля дней, закрывшихся выше открытия, и средний ход за {days} дней. Отклонение от 50 % на такой выборке — намёк, а не закономерность.",
    "macroTitle": "Общий фон рынка",
    "marketCap": "Капитализация",
    "top20Index": "Индекс топ-20",
    "top20IndexHint": "Средневзвешенная по капитализации цена топ-20 монет CoinGecko — не официальный индекс CoinMarketCap (платный ключ CMC в проекте не настроен). Ориентир общего движения рынка, а не «пункты» биржевого индекса.",
    "fngExtremeFear": "Крайний страх",
    "fngFear": "Страх",
    "fngNeutral": "Нейтрально",
    "fngGreed": "Жадность",
    "fngExtremeGreed": "Крайняя жадность",
    "currentVolatility": "Волатильность",
    "volatilityElevated": "выше нормы"
  },
```

- [ ] **Step 2: Добавить те же ключи в en.json**

В `frontend/src/shared/i18n/messages/en.json` строку

```json
    "weekdayFooterNote": "Share of days that closed above open, and the average move, over {days} days. A deviation from 50 % on a sample this size is a hint, not a pattern."
  },
```

(закрывающая блок `"market"`) заменить на:

```json
    "weekdayFooterNote": "Share of days that closed above open, and the average move, over {days} days. A deviation from 50 % on a sample this size is a hint, not a pattern.",
    "macroTitle": "Overall market backdrop",
    "marketCap": "Market cap",
    "top20Index": "Top-20 index",
    "top20IndexHint": "Market-cap-weighted average price of the top 20 CoinGecko coins — not an official CoinMarketCap index (no CMC key is configured in this project). A gauge of overall market movement, not exchange-index \"points\".",
    "fngExtremeFear": "Extreme fear",
    "fngFear": "Fear",
    "fngNeutral": "Neutral",
    "fngGreed": "Greed",
    "fngExtremeGreed": "Extreme greed",
    "currentVolatility": "Volatility",
    "volatilityElevated": "above normal"
  },
```

- [ ] **Step 3: Проверить парность ключей**

Run: `cd frontend && npx vitest run src/shared/i18n/messages.test.ts`
Expected: PASS — тест уже существует и сверяет набор ключей RU/EN построчно.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/shared/i18n/messages/ru.json frontend/src/shared/i18n/messages/en.json
git commit -m "feat(market): i18n-ключи для макро-строки и волатильности"
```

---

### Task 5: CSS — `.coef-4` и `.coef-sub`

**Files:**
- Modify: `frontend/src/app/globals.css:650-666` (сразу после блока `.coef-v`)

**Interfaces:**
- Produces: класс-модификатор `.coef-4` (4 колонки вместо 3, ставится вместе с `.coef`) и
  класс `.coef-sub` (мелкая подпись под значением плитки) — используются в Task 6
  (`MacroSnapshot`) и Task 7 (`Positioning`).

- [ ] **Step 1: Добавить правила**

В `frontend/src/app/globals.css` после блока:

```css
  .coef-v {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: var(--t-xl);
    letter-spacing: -0.03em;
    line-height: 1.1;
    margin-top: var(--s1);
  }
```

вставить:

```css
  /* 4 колонки вместо 3 — макро-строка и 4-й коэффициент у Positioning
     (волатильность). Мобильная раскладка `.coef` в 1 колонку объявлена ниже
     внутри media-запроса и общая для обеих разрядностей — трогать не нужно. */
  .coef-4 {
    grid-template-columns: repeat(4, 1fr);
  }
  /* Подпись под значением плитки коэффициентов: словесная классификация
     Fear & Greed, знак суточного изменения. Не `.foot` — тот держит сноску
     под целой таблицей (max-width на строку текста, отступ между несколькими
     сносками подряд), а не подпись внутри одной плитки. */
  .coef-sub {
    font-size: var(--t-xs);
    color: var(--ink-2);
    margin-top: 2px;
  }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "feat(market): CSS для 4-колоночных коэффициентов"
```

---

### Task 6: `MacroSnapshot` — новая строка общего фона рынка

**Files:**
- Create: `frontend/src/views/market/components/MacroSnapshot.tsx`

**Interfaces:**
- Consumes: `MarketData`, `FearGreedData`, `DeFiTVLData`, `Cmc20Data` (типы из
  `../api/hooks`), `fmtUsdCompact` (`./SentimentChart`), `fearGreedLabel` (`../lib/fearGreedLabel`),
  `fmtPctSigned` (`@/shared/lib/utils/format`), `Skeleton` (`@/shared/ui/Skeleton`), `Tooltip`
  (`@/shared/ui/Tooltip`), `useLocaleControl` (`@/shared/i18n`), классы `.coef`, `.coef-4`,
  `.coef-v`, `.coef-sub`, `.lbl`, `.hint` (Task 5 и уже существующие).
- Produces: `MacroSnapshot(props): JSX.Element` — используется в Task 8 (`Page.tsx`). Пропсы:
  `market?: MarketData`, `marketLoading?: boolean`, `fearGreed?: FearGreedData`,
  `fearGreedLoading?: boolean`, `cmc20?: Cmc20Data`, `cmc20Loading?: boolean`,
  `defiTvl?: DeFiTVLData`, `defiTvlLoading?: boolean`.

Без теста — презентационный компонент, тот же принцип, что у `Positioning`/`HourlyVolatility`/
`WeekdayOdds` (ни один не покрыт тестом).

- [ ] **Step 1: Написать компонент**

Создать `frontend/src/views/market/components/MacroSnapshot.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Tooltip } from '@/shared/ui/Tooltip';
import { useLocaleControl } from '@/shared/i18n';
import { fmtPctSigned } from '@/shared/lib/utils/format';
import { fmtUsdCompact } from './SentimentChart';
import { fearGreedLabel } from '../lib/fearGreedLabel';
import type { MarketData, FearGreedData, DeFiTVLData, Cmc20Data } from '../api/hooks';

/**
 * Общий фон рынка — не про выбранный инструмент (тот показывает
 * `Positioning` ниже), а про рынок целиком: настроение, капитализация,
 * самодельный индекс топ-20 и объём, запертый в DeFi.
 *
 * Каждая цифра — свой независимый запрос (хуки вызывает `Page.tsx`): одна
 * медленная плитка (DeFiLlama, без кеша на бэкенде) не должна держать три
 * готовые. «Нет данных» показано и на загрузке, и на ошибке запроса —
 * отдельного вида под ошибку нет ни у одного виджета этой страницы.
 */
export function MacroSnapshot({
  market,
  marketLoading,
  fearGreed,
  fearGreedLoading,
  cmc20,
  cmc20Loading,
  defiTvl,
  defiTvlLoading,
}: {
  market?: MarketData;
  marketLoading?: boolean;
  fearGreed?: FearGreedData;
  fearGreedLoading?: boolean;
  cmc20?: Cmc20Data;
  cmc20Loading?: boolean;
  defiTvl?: DeFiTVLData;
  defiTvlLoading?: boolean;
}) {
  const t = useTranslations('market');
  const { locale } = useLocaleControl();
  const lastTvl = defiTvl?.tvl.at(-1)?.tvl;

  const cell = (loading: boolean | undefined, node: React.ReactNode) =>
    loading ? <Skeleton as="span" flush height={16} width="58%" /> : node;

  return (
    <div className="coef coef-4" style={{ borderTop: 0 }}>
      <div>
        <div className="lbl">Fear & Greed</div>
        <div className="coef-v">{cell(fearGreedLoading, fearGreed ? fearGreed.value : '—')}</div>
        <div className="coef-sub">
          {cell(fearGreedLoading, fearGreed ? fearGreedLabel(fearGreed.classification, t) : '')}
        </div>
      </div>
      <div>
        <div className="lbl">{t('marketCap')}</div>
        <div className="coef-v">
          {cell(marketLoading, market ? fmtUsdCompact(market.marketCap, locale) : '—')}
        </div>
        <div className={`coef-sub${market ? ` ${market.marketCapChange24h >= 0 ? 'pos' : 'neg'}` : ''}`}>
          {cell(marketLoading, market ? fmtPctSigned(market.marketCapChange24h, 1) : '')}
        </div>
      </div>
      <div>
        <div className="lbl">
          {t('top20Index')}
          <Tooltip text={t('top20IndexHint')}>
            <span className="hint" tabIndex={0}>
              !
            </span>
          </Tooltip>
        </div>
        <div className="coef-v">{cell(cmc20Loading, cmc20 ? fmtUsdCompact(cmc20.index, locale) : '—')}</div>
        <div className={`coef-sub${cmc20 ? ` ${cmc20.change24h >= 0 ? 'pos' : 'neg'}` : ''}`}>
          {cell(cmc20Loading, cmc20 ? fmtPctSigned(cmc20.change24h, 1) : '')}
        </div>
      </div>
      <div>
        <div className="lbl">DeFi TVL</div>
        <div className="coef-v">
          {cell(defiTvlLoading, lastTvl != null ? fmtUsdCompact(lastTvl, locale) : '—')}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Проверить типы**

Run: `cd frontend && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/market/components/MacroSnapshot.tsx
git commit -m "feat(market): компонент MacroSnapshot — общий фон рынка"
```

---

### Task 7: `Positioning` — 4-я колонка «Волатильность»

**Files:**
- Modify: `frontend/src/views/market/components/Positioning.tsx`

**Interfaces:**
- Consumes: `VolatilityData` (тип из `../api/hooks`), классы `.coef-4`, `.coef-sub` (Task 5).
- Produces: `Positioning(props): JSX.Element` с расширенными пропсами — используется в Task 8.
  Новые пропсы: `volatility?: VolatilityData`, `volatilityLoading?: boolean` (добавляются к уже
  существующим `data?: MarketSentimentData`, `isLoading?: boolean`).

Без теста — тот же принцип, что и у Task 6.

- [ ] **Step 1: Расширить пропсы и импорт типа**

В `frontend/src/views/market/components/Positioning.tsx` заменить:

```tsx
import type { MarketSentimentData } from '../api/hooks';
import { useLocaleControl } from '@/shared/i18n';
```

на:

```tsx
import type { MarketSentimentData, VolatilityData } from '../api/hooks';
import { useLocaleControl } from '@/shared/i18n';
```

и заменить:

```tsx
export function Positioning({ data, isLoading }: { data?: MarketSentimentData; isLoading?: boolean }) {
```

на:

```tsx
export function Positioning({
  data,
  isLoading,
  volatility,
  volatilityLoading,
}: {
  data?: MarketSentimentData;
  isLoading?: boolean;
  volatility?: VolatilityData;
  volatilityLoading?: boolean;
}) {
```

- [ ] **Step 2: Добавить 4-ю колонку и переключить строку на `coef-4`**

Заменить:

```tsx
      <div className="coef" style={{ borderTop: 0 }}>
        <div>
          <div className="lbl">Long / Short</div>
          <div className="coef-v">{coef(longShort ? longShort.toFixed(2) : '—')}</div>
        </div>
        <div>
          <div className="lbl">{t('openInterest')}</div>
          <div className="coef-v">
            {coef(latest && latest.openInterestUsd > 0 ? fmtUsdCompact(latest.openInterestUsd, locale) : '—')}
          </div>
        </div>
        <div>
          <div className="lbl">{t('longShare')}</div>
          <div className="coef-v">{coef(latest ? `${(latest.buyRatio * 100).toFixed(1)} %` : '—')}</div>
        </div>
      </div>
```

на:

```tsx
      <div className="coef coef-4" style={{ borderTop: 0 }}>
        <div>
          <div className="lbl">Long / Short</div>
          <div className="coef-v">{coef(longShort ? longShort.toFixed(2) : '—')}</div>
        </div>
        <div>
          <div className="lbl">{t('openInterest')}</div>
          <div className="coef-v">
            {coef(latest && latest.openInterestUsd > 0 ? fmtUsdCompact(latest.openInterestUsd, locale) : '—')}
          </div>
        </div>
        <div>
          <div className="lbl">{t('longShare')}</div>
          <div className="coef-v">{coef(latest ? `${(latest.buyRatio * 100).toFixed(1)} %` : '—')}</div>
        </div>
        <div>
          <div className="lbl">{t('currentVolatility')}</div>
          <div className={`coef-v${volatility?.elevated ? ' neg' : ''}`}>
            {volatilityLoading ? (
              <Skeleton as="span" flush height={16} width="58%" />
            ) : volatility ? (
              `${volatility.currentVolPct.toFixed(2)} %`
            ) : (
              '—'
            )}
          </div>
          {volatility?.elevated && <div className="coef-sub neg">{t('volatilityElevated')}</div>}
        </div>
      </div>
```

(Четвёртая плитка не переиспользует локальный `coef()` — тот скрывает и подпись под условие
`isLoading` всей секции, а волатильность грузится отдельным запросом со своим
`volatilityLoading`; поэтому загрузка/данные/прочерк расписаны прямо в JSX, тем же порядком
веток, что и в `coef()`.)

- [ ] **Step 3: Проверить типы**

Run: `cd frontend && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/market/components/Positioning.tsx
git commit -m "feat(market): волатильность — 4-я колонка у Positioning"
```

---

### Task 8: `Page.tsx` — подключить хуки и оба блока

**Files:**
- Modify: `frontend/src/views/market/Page.tsx`

**Interfaces:**
- Consumes: `useMarketData`, `useFearAndGreed`, `useCMC20`, `useDeFiTVL`, `useVolatility` (из
  `./api/hooks`), `MacroSnapshot` (Task 6), обновлённый `Positioning` (Task 7), `SectionHead`
  (уже импортирован).

- [ ] **Step 1: Расширить импорты**

Заменить:

```tsx
import { useMarketSentiment } from './api/hooks';
import { useHourlyStats, useMarketCorrelation } from './api/market-events-hooks';
import { Wrap } from '@/shared/ui/Wrap';
import { Seg } from '@/shared/ui/Seg';
import { SectionHead } from '@/shared/ui/SectionHead';
import { Positioning } from './components/Positioning';
import { HourlyVolatility } from './components/HourlyVolatility';
import { WeekdayOdds } from './components/WeekdayOdds';
```

на:

```tsx
import { useMarketSentiment, useMarketData, useFearAndGreed, useCMC20, useDeFiTVL, useVolatility } from './api/hooks';
import { useHourlyStats, useMarketCorrelation } from './api/market-events-hooks';
import { Wrap } from '@/shared/ui/Wrap';
import { Seg } from '@/shared/ui/Seg';
import { SectionHead } from '@/shared/ui/SectionHead';
import { MacroSnapshot } from './components/MacroSnapshot';
import { Positioning } from './components/Positioning';
import { HourlyVolatility } from './components/HourlyVolatility';
import { WeekdayOdds } from './components/WeekdayOdds';
```

- [ ] **Step 2: Вызвать новые хуки**

Заменить:

```tsx
  const { data: sentimentData, isLoading: sentimentLoading } = useMarketSentiment(symbol);
  const { data: hourly, isLoading: hourlyLoading } = useHourlyStats(historyDays);
  const { data: corr, isLoading: corrLoading } = useMarketCorrelation(historyDays);
```

на:

```tsx
  const { data: sentimentData, isLoading: sentimentLoading } = useMarketSentiment(symbol);
  const { data: volatility, isLoading: volatilityLoading } = useVolatility(symbol);
  const { data: hourly, isLoading: hourlyLoading } = useHourlyStats(historyDays);
  const { data: corr, isLoading: corrLoading } = useMarketCorrelation(historyDays);
  const { data: marketData, isLoading: marketLoading } = useMarketData();
  const { data: fearGreed, isLoading: fearGreedLoading } = useFearAndGreed();
  const { data: cmc20, isLoading: cmc20Loading } = useCMC20();
  const { data: defiTvl, isLoading: defiTvlLoading } = useDeFiTVL();
```

(`useVolatility(symbol)` стоит рядом с `useMarketSentiment(symbol)` — тот же инструмент, тот
же переключатель; остальные четыре — общие на рынок, без параметра.)

- [ ] **Step 3: Вставить `MacroSnapshot` над двухколоночной сеткой**

Заменить:

```tsx
  return (
    <Wrap page style={{ paddingTop: 'var(--s4)' }}>
      <div className="asym">
        <div>
          <SectionHead title={t('positioningTitle')}>
            <Seg options={SYMBOLS} value={symbol} onChange={setSymbol} ariaLabel={t('instrumentAriaLabel')} />
          </SectionHead>
          <Positioning data={sentimentData} isLoading={sentimentLoading} />
```

на:

```tsx
  return (
    <Wrap page style={{ paddingTop: 'var(--s4)' }}>
      <SectionHead title={t('macroTitle')} />
      <MacroSnapshot
        market={marketData}
        marketLoading={marketLoading}
        fearGreed={fearGreed}
        fearGreedLoading={fearGreedLoading}
        cmc20={cmc20}
        cmc20Loading={cmc20Loading}
        defiTvl={defiTvl}
        defiTvlLoading={defiTvlLoading}
      />

      <div className="asym" style={{ marginTop: 'var(--s5)' }}>
        <div>
          <SectionHead title={t('positioningTitle')}>
            <Seg options={SYMBOLS} value={symbol} onChange={setSymbol} ariaLabel={t('instrumentAriaLabel')} />
          </SectionHead>
          <Positioning
            data={sentimentData}
            isLoading={sentimentLoading}
            volatility={volatility}
            volatilityLoading={volatilityLoading}
          />
```

- [ ] **Step 4: Обновить комментарий над компонентом**

Заменить последнее предложение комментария-документации над `MarketPage`:

```tsx
 * Каждый переключатель стоит на линейке того раздела, которым управляет
 * (инструмент — у «Позиционирования», глубина истории — у «Волатильности по
 * часам»), а не общей парой над всей страницей: до того, к чему они относятся,
 * было два экрана вниз.
 */
```

на:

```tsx
 * Каждый переключатель стоит на линейке того раздела, которым управляет
 * (инструмент — у «Позиционирования», глубина истории — у «Волатильности по
 * часам»), а не общей парой над всей страницей: до того, к чему они относятся,
 * было два экрана вниз.
 *
 * `MacroSnapshot` сверху — общий фон рынка, не привязанный к выбранному
 * инструменту (в отличие от всего, что ниже), поэтому стоит вне `.asym` и
 * вне переключателя инструмента.
 */
```

- [ ] **Step 5: Проверить типы**

Run: `cd frontend && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/market/Page.tsx
git commit -m "feat(market): подключить MacroSnapshot и волатильность на странице"
```

---

### Task 9: Итоговая проверка

**Files:** нет новых — только запуск полного набора проверок перед мержем (5+ файлов и новый
`.tsx`-компонент в этой задаче — по правилам проекта прогоняется полный билд без отдельного
запроса).

- [ ] **Step 1: Полный прогон тестов**

Run: `cd frontend && npx vitest run`
Expected: все наборы PASS, включая новые `SentimentChart.test.ts`, `fearGreedLabel.test.ts` и
`messages.test.ts`.

- [ ] **Step 2: Полная сборка**

Run: `cd frontend && npx next build`
Expected: сборка проходит без ошибок типов и без предупреждений о неиспользуемых экспортах,
роут `/market` присутствует в выводе.

- [ ] **Step 3: Если что-то упало — исправить и повторить Step 1–2 перед тем, как переходить к
  finishing-a-development-branch.**
