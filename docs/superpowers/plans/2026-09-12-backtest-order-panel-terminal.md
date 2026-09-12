# Панель ордера бектеста: слайдеры и размер в монете — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Приблизить панель ордера бектеста (`OrderPanel.tsx`) к виду и подсчёту `SimpleCalculator`
из E:\git\traders — слайдеры риска/стопа/тейка и размер позиции в монете рядом с USDT, — на
своих компонентах и токенах, без переноса графика, инструментов рисования и грид/DCA.

**Architecture:** Новый чистый контрол `Slider` (`shared/ui`, нативный `<input type="range">`
на токенах `globals.css`, без сторонней библиотеки) встаёт рядом с существующими `Input` в
`OrderPanel.tsx`. Диапазоны стопа/тейка и сумма риска в USDT — чистые функции в
`lib/money.ts`, крытые тестами; сам `OrderPanel` только читает их и рендерит.

**Tech Stack:** Next.js/React (frontend), Vitest (юнит-тесты `lib/money.ts`), next-intl (i18n).

## Global Constraints

- График (`ReplayChart.tsx`) не меняется: своё SVG, без инструментов рисования и контекстного
  меню — см. спеку `docs/superpowers/specs/2026-09-12-backtest-order-panel-terminal-design.md`.
- Грид/DCA-калькулятор не переносится — вне скоупа этого плана.
- Новых зависимостей не добавляется. `Slider` — нативный range, без библиотек.
- Риск: диапазон слайдера 0–10%, step 0.1 (как `RiskSection` в traders, независимо от баланса).
- Стоп/тейк: диапазон слайдера ±20% от цены, по правильную сторону, когда направление известно
  (открытая сделка); симметричный ±20% вокруг цены, когда направление ещё не выбрано (сделка не
  открыта) — уточнение из планирования: до открытия сделки `checkLevels` определяет сторону по
  самим уровням, а не наоборот, значит слайдер не вправе сузить диапазон одной стороной раньше,
  чем пользователь фактически выберет «Лонг»/«Шорт».
- Правка укладывается в «мелкое изменение» из глобальных правил пользователя: полный
  `next build` не гоняем, ограничиваемся `tsc`/точечной проверкой и ручной проверкой в
  дев-сервере.
- Копия — на русском (интерфейс продукта двуязычный, ru/en синхронно).

---

## Файлы

- Modify: `frontend/src/views/backtest/lib/money.ts` — добавить `riskAmount`, `levelSliderRange`.
- Modify: `frontend/src/views/backtest/lib/money.test.ts` — тесты на обе функции.
- Create: `frontend/src/shared/ui/Slider.tsx` — новый контрол.
- Modify: `frontend/src/app/globals.css` — стили `.slider` и `.size-preview` в секции
  «БЕКТЕСТ» (единственное текущее место использования, как у `.kv` в «НАСТРОЙКИ»).
- Modify: `frontend/src/views/backtest/components/OrderPanel.tsx` — слайдеры риска/стопа/тейка,
  карточка размера позиции с монетой.
- Modify: `frontend/src/shared/i18n/messages/ru.json`, `.../en.json` — ключ `sizeCoin`.

---

### Task 1: Чистые функции `riskAmount` и `levelSliderRange`

**Files:**
- Modify: `frontend/src/views/backtest/lib/money.ts`
- Test: `frontend/src/views/backtest/lib/money.test.ts`

**Interfaces:**
- Produces: `riskAmount(balance: number, riskPct: number): number | null`;
  `levelSliderRange(kind: 'stop' | 'take', price: number, direction: Direction | null): { min: number; max: number }`
  (`Direction` — уже импортированный в файле тип из `./fills`, значения `'long' | 'short'`).

- [ ] **Step 1: Дописать падающие тесты**

Добавить в конец `frontend/src/views/backtest/lib/money.test.ts` (после блока `describe('checkLevels', ...)`,
после текущей строки 62):

```ts
describe('riskAmount', () => {
  it('процент от депозита, не зависит от стопа', () => {
    expect(riskAmount(10_000, 1)).toBe(100);
  });

  it('без депозита или без риска — числа нет', () => {
    expect(riskAmount(0, 1)).toBeNull();
    expect(riskAmount(10_000, 0)).toBeNull();
    expect(riskAmount(10_000, NaN)).toBeNull();
  });
});

describe('levelSliderRange', () => {
  it('направление ещё не выбрано — симметрично вокруг цены', () => {
    expect(levelSliderRange('stop', 100, null)).toEqual({ min: 80, max: 120 });
    expect(levelSliderRange('take', 100, null)).toEqual({ min: 80, max: 120 });
  });

  it('лонг: стоп снизу, тейк сверху', () => {
    expect(levelSliderRange('stop', 100, 'long')).toEqual({ min: 80, max: 100 });
    expect(levelSliderRange('take', 100, 'long')).toEqual({ min: 100, max: 120 });
  });

  it('шорт — зеркально', () => {
    expect(levelSliderRange('stop', 100, 'short')).toEqual({ min: 100, max: 120 });
    expect(levelSliderRange('take', 100, 'short')).toEqual({ min: 80, max: 100 });
  });
});
```

Обновить импорт в начале файла (строка 2):

```ts
import { checkLevels, formatR, fromScreen, levelSliderRange, previewSize, riskAmount, toInput, toScreen, unrealizedPnl } from './money';
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd frontend && npx vitest run src/views/backtest/lib/money.test.ts`
Expected: FAIL — `riskAmount`/`levelSliderRange` не экспортированы из `./money`.

- [ ] **Step 3: Реализовать функции**

Добавить в конец `frontend/src/views/backtest/lib/money.ts` (после `checkLevels`, после текущей
строки 53):

```ts
/**
 * Риск в USDT по проценту от депозита — не зависит от стопа, в отличие от
 * `previewSize`: слайдер риска обязан показывать сумму сразу, даже пока стоп
 * ещё не введён (`previewSize` без стопа вернёт null целиком).
 */
export function riskAmount(balance: number, riskPct: number): number | null {
  if (!(balance > 0) || !(riskPct > 0)) return null;
  return (balance * riskPct) / 100;
}

/**
 * Диапазон слайдера стопа/тейка — по правильную сторону от цены, ±20%.
 *
 * Пока сделка не открыта, направление ещё не выбрано: пользователь вправе
 * поставить стоп по любую сторону цены — сторону в итоге определяют сами
 * уровни через `checkLevels`, когда он нажмёт «Лонг» или «Шорт», а не
 * наоборот. Поэтому без направления диапазон симметричный вокруг цены, а не
 * заранее сужен в одну сторону.
 */
export function levelSliderRange(
  kind: 'stop' | 'take',
  price: number,
  direction: Direction | null,
): { min: number; max: number } {
  const lo = price * 0.8;
  const hi = price * 1.2;
  if (direction == null) return { min: lo, max: hi };
  const long = direction === 'long';
  const belowSide = kind === 'stop' ? long : !long;
  return belowSide ? { min: lo, max: price } : { min: price, max: hi };
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cd frontend && npx vitest run src/views/backtest/lib/money.test.ts`
Expected: PASS, все тесты файла зелёные.

- [ ] **Step 5: Коммит**

```bash
git add frontend/src/views/backtest/lib/money.ts frontend/src/views/backtest/lib/money.test.ts
git commit -m "feat(backtest): riskAmount и levelSliderRange для слайдеров панели ордера

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Компонент `Slider`

**Files:**
- Create: `frontend/src/shared/ui/Slider.tsx`
- Modify: `frontend/src/app/globals.css`

**Interfaces:**
- Consumes: ничего из предыдущих задач (чистый UI-контрол).
- Produces: `Slider` — `{ value: number; min: number; max: number; step?: number; onChange: (value: number) => void; className?: string; disabled?: boolean; 'aria-label'?: string }`,
  импортируется как `import { Slider } from '@/shared/ui/Slider';`.

- [ ] **Step 1: Создать компонент**

Создать `frontend/src/shared/ui/Slider.tsx`:

```tsx
'use client';

import type { ChangeEvent, CSSProperties } from 'react';
import { cn } from '@/shared/lib/utils/css';

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

/**
 * Ползунок числового значения в диапазоне — свой, без сторонней библиотеки:
 * нативный `<input type="range">` даёт клавиатуру и доступность из коробки,
 * а перекрашивается токенами продукта через псевдоэлементы track/thumb —
 * единого кросс-браузерного способа стилизовать range нет, отсюда отдельные
 * правила под webkit и moz в globals.css.
 *
 * Заполненная часть трека рисуется градиентом до текущего значения — при
 * min≠0 или max≠100 браузер сам не показывает, докуда дотянут ползунок.
 */
export function Slider({ value, min, max, step = 1, onChange, className, disabled, ...rest }: SliderProps) {
  const range = max - min;
  const pct = range > 0 ? ((value - min) / range) * 100 : 0;
  const onInput = (e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value));

  return (
    <input
      type="range"
      className={cn('slider', className)}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onInput}
      disabled={disabled}
      style={{ '--slider-pct': `${pct}%` } as CSSProperties}
      {...rest}
    />
  );
}
```

- [ ] **Step 2: Добавить стили**

В `frontend/src/app/globals.css`, в секции `/* ═══════════════ БЕКТЕСТ ═══════════════ */`
(после текущей строки `.order-actions .btn { flex: 1; }`), добавить:

```css
  /* Ползунок значения (Slider из shared/ui) — единственное текущее место
     использования; токены свои, кросс-браузерная стилизация range только
     через псевдоэлементы track/thumb. */
  .slider {
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    height: 2px;
    margin: var(--s2) 0;
    background: linear-gradient(to right, var(--ink) 0 var(--slider-pct), var(--hair) var(--slider-pct) 100%);
    cursor: pointer;
  }
  .slider:disabled { opacity: 0.4; cursor: default; }
  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 10px;
    height: 10px;
    background: var(--ink);
    border: 0;
  }
  .slider::-moz-range-thumb {
    width: 10px;
    height: 10px;
    background: var(--ink);
    border: 0;
    border-radius: 0;
  }
  .slider::-moz-range-track { background: transparent; }
```

- [ ] **Step 3: Точечная проверка типов**

Run: `cd frontend && npx tsc --noEmit`
Expected: без новых ошибок (мелкая правка — полный `next build` не требуется по глобальным
правилам пользователя).

- [ ] **Step 4: Коммит**

```bash
git add frontend/src/shared/ui/Slider.tsx frontend/src/app/globals.css
git commit -m "feat(ui): компонент Slider — нативный range на токенах продукта

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Ключ i18n `sizeCoin`

**Files:**
- Modify: `frontend/src/shared/i18n/messages/ru.json`
- Modify: `frontend/src/shared/i18n/messages/en.json`

**Interfaces:**
- Produces: перевод `backtest.sizeCoin`, читается в Task 4 через `t('sizeCoin')`.

- [ ] **Step 1: Добавить ключ в ru.json**

В `frontend/src/shared/i18n/messages/ru.json`, в объекте `"backtest"`, сразу после строки
`"notionalLabel": "Объём",` (текущая строка 497), добавить:

```json
    "sizeCoin": "Размер",
```

- [ ] **Step 2: Добавить ключ в en.json**

В `frontend/src/shared/i18n/messages/en.json`, в объекте `"backtest"`, сразу после строки
`"notionalLabel": "Notional",` (текущая строка 764), добавить:

```json
    "sizeCoin": "Size",
```

- [ ] **Step 3: Проверить, что JSON валиден**

Run: `cd frontend && node -e "JSON.parse(require('fs').readFileSync('src/shared/i18n/messages/ru.json','utf8')); JSON.parse(require('fs').readFileSync('src/shared/i18n/messages/en.json','utf8')); console.log('ok')"`
Expected: печатает `ok` без ошибок парсинга.

- [ ] **Step 4: Коммит**

```bash
git add frontend/src/shared/i18n/messages/ru.json frontend/src/shared/i18n/messages/en.json
git commit -m "i18n(backtest): ключ sizeCoin — подпись размера позиции в монете

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Слайдеры и размер в монете в `OrderPanel`

**Files:**
- Modify: `frontend/src/views/backtest/components/OrderPanel.tsx`
- Modify: `frontend/src/app/globals.css`

**Interfaces:**
- Consumes: `riskAmount`, `levelSliderRange` из Task 1 (`../lib/money`); `Slider` из Task 2
  (`@/shared/ui/Slider`); ключ `t('sizeCoin')` из Task 3; `formatQty` из
  `@/shared/lib/utils/format` (уже существует, сигнатура
  `formatQty(value: string | number | null | undefined): string`).
- Produces: без изменений публичного интерфейса `OrderPanel` — тот же набор пропсов, что и
  сейчас (см. текущую сигнатуру компонента), внутренняя вёрстка меняется.

- [ ] **Step 1: Заменить содержимое файла**

Заменить `frontend/src/views/backtest/components/OrderPanel.tsx` целиком на:

```tsx
'use client';

import type { ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Field';
import { KeyValue } from '@/shared/ui/Lookup';
import { Money } from '@/shared/ui/Money';
import { Slider } from '@/shared/ui/Slider';
import { Tooltip } from '@/shared/ui/Tooltip';
import { formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import type { BacktestTrade, Direction } from '../api/types';
import { formatR, fromScreen, levelSliderRange, previewSize, riskAmount, toScreen, unrealizedPnl } from '../lib/money';

/** Поля панели — строками, как их набирает человек, и в экранных ценах. */
export interface Draft {
  risk: string;
  stop: string;
  take: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Вход, уровни и выход. Размер позиции показывается номиналом в USDT, плечом
 * и количеством монет — количество монет добавлено рядом с уже видимым
 * номиналом, а не самостоятельной строкой: при скрытой цене число монет
 * вместе с расстоянием до стопа выдало бы настоящий уровень цены, но рядом
 * с номиналом в USDT это уже не новая утечка.
 *
 * Риск и уровни правит слайдер поверх текстового поля: оба меняют один и тот
 * же черновик, поле остаётся источником точного числа тем, кому слайдер
 * недостаточно точен. Диапазон слайдера стопа/тейка симметричный вокруг
 * цены, пока сделка не открыта (направление ещё не выбрано), и сужается на
 * верную сторону, когда сделка уже идёт (`levelSliderRange`).
 */
export function OrderPanel({
  draft,
  onDraft,
  openTrade,
  scale,
  price,
  balance,
  disabled,
  canClose,
  hint,
  onOpen,
  onApply,
  onClose,
  onFinish,
}: {
  draft: Draft;
  onDraft: (d: Draft) => void;
  openTrade: BacktestTrade | null;
  scale: number;
  /** Настоящая цена последней показанной минутки. */
  price: number | null;
  balance: number;
  disabled: boolean;
  canClose: boolean;
  hint: string | null;
  onOpen: (direction: Direction) => void;
  onApply: () => void;
  onClose: () => void;
  onFinish: () => void;
}) {
  const t = useTranslations('backtest');
  const set = (key: keyof Draft) => (e: ChangeEvent<HTMLInputElement>) => onDraft({ ...draft, [key]: e.target.value });

  const stop = Number(draft.stop);
  const take = draft.take.trim() ? Number(draft.take) : null;
  const risk = Number(draft.risk);
  const direction = openTrade?.direction ?? null;
  const screenPrice = price != null ? toScreen(price, scale) : null;
  const stopRange = screenPrice != null ? levelSliderRange('stop', screenPrice, direction) : null;
  const takeRange = screenPrice != null ? levelSliderRange('take', screenPrice, direction) : null;

  const preview =
    !openTrade && price != null && stop > 0 ? previewSize(balance, risk, price, fromScreen(stop, scale)) : null;
  const pnl = openTrade && price != null ? unrealizedPnl(openTrade.direction, openTrade.entryPrice, price, openTrade.qty) : null;
  const riskUsd = riskAmount(balance, risk);

  return (
    <div className="order-panel">
      <p className="lbl">{t('orderType')}</p>

      <KeyValue label={t('balance')}>{formatPriceGrouped(balance)} USDT</KeyValue>

      {openTrade ? (
        <>
          <KeyValue label={t('positionLabel')} valueClassName="">
            <span className={`dir${openTrade.direction === 'short' ? ' short' : ''}`}>
              {t(`direction.${openTrade.direction}`)}
            </span>
          </KeyValue>
          <KeyValue label={t('entry')}>{formatPriceGrouped(toScreen(openTrade.entryPrice, scale))}</KeyValue>
          {pnl != null && (
            <KeyValue label={t('unrealized')} valueClassName={`n ${pnl >= 0 ? 'pos' : 'neg'}`}>
              <Money value={pnl} unit="USDT" />{' '}
              <Tooltip text={t('rHint')}>
                <span>{formatR(pnl / openTrade.riskUsdt)}</span>
              </Tooltip>
            </KeyValue>
          )}
        </>
      ) : (
        <Field label={t('risk')}>
          {(id) => (
            <>
              <Slider
                value={clamp(risk || 0, 0, 10)}
                min={0}
                max={10}
                step={0.1}
                onChange={(v) => onDraft({ ...draft, risk: String(v) })}
                aria-label={t('risk')}
              />
              <Input id={id} full inputMode="decimal" value={draft.risk} onChange={set('risk')} />
            </>
          )}
        </Field>
      )}

      {!openTrade && riskUsd != null && (
        <KeyValue label={t('riskAmountLabel')}>{formatPriceGrouped(riskUsd)} USDT</KeyValue>
      )}

      <Field label={t('stop')}>
        {(id) => (
          <>
            {stopRange && (
              <Slider
                value={clamp(stop || stopRange.min, stopRange.min, stopRange.max)}
                min={stopRange.min}
                max={stopRange.max}
                step={(stopRange.max - stopRange.min) / 200 || 1}
                onChange={(v) => onDraft({ ...draft, stop: String(v) })}
                aria-label={t('stop')}
              />
            )}
            <Input id={id} full inputMode="decimal" value={draft.stop} onChange={set('stop')} />
          </>
        )}
      </Field>
      <Field label={t('take')}>
        {(id) => (
          <>
            {takeRange && (
              <Slider
                value={clamp(take ?? takeRange.min, takeRange.min, takeRange.max)}
                min={takeRange.min}
                max={takeRange.max}
                step={(takeRange.max - takeRange.min) / 200 || 1}
                onChange={(v) => onDraft({ ...draft, take: String(v) })}
                aria-label={t('take')}
              />
            )}
            <Input id={id} full inputMode="decimal" value={draft.take} onChange={set('take')} />
          </>
        )}
      </Field>

      {!openTrade && preview && (
        <div className="size-preview">
          <KeyValue label={t('sizeCoin')}>{formatQty(preview.qty)}</KeyValue>
          <KeyValue label={t('notionalLabel')}>{formatPriceGrouped(preview.notional)} USDT</KeyValue>
        </div>
      )}
      {!openTrade && preview && <KeyValue label={t('leverageLabel')}>{preview.leverage.toFixed(1)}×</KeyValue>}

      {hint && <p className="neg">{hint}</p>}

      {openTrade ? (
        <>
          <Button onClick={onApply} disabled={disabled}>
            {t('apply')}
          </Button>
          <Button variant="risk" onClick={onClose} disabled={disabled || !canClose}>
            {t('closeMarket')}
          </Button>
        </>
      ) : (
        <div className="order-actions">
          <Button variant="long" onClick={() => onOpen('long')} disabled={disabled || balance <= 0}>
            {t('long')}
          </Button>
          <Button variant="short" onClick={() => onOpen('short')} disabled={disabled || balance <= 0}>
            {t('short')}
          </Button>
        </div>
      )}

      <div className="risk-zone">
        <Button variant="risk" onClick={onFinish} disabled={disabled}>
          {t('finish')}
        </Button>
      </div>
    </div>
  );
}
```

Ключевые отличия от прежнего файла: добавлены `stop`/`take`/`direction`/`screenPrice`/
`stopRange`/`takeRange`/`riskUsd`, `Slider` рядом с полями риска/стопа/тейка, строка
`riskAmountLabel` вынесена из блока `preview` и показывается всегда (была условием
`!openTrade && preview &&`, стала `!openTrade && riskUsd != null &&`), карточка
`.size-preview` с размером в монете добавлена перед строкой плеча.

- [ ] **Step 2: Стили карточки размера позиции**

В `frontend/src/app/globals.css`, в секции «БЕКТЕСТ», после блока стилей `.slider` из Task 2,
добавить:

```css
  /* Карточка предпросмотра размера — те же строки .kv (через KeyValue), что и
     остальная панель, просто обведены рамкой и подняты фоном: это готовый
     ответ «сколько купить», а не ещё одна строка среди прочих. */
  .size-preview {
    border: 1px solid var(--hair);
    background: var(--band);
    padding: 0 var(--s2);
  }
  .size-preview .kv:last-child { border-bottom: 0; }
```

- [ ] **Step 3: Точечная проверка типов**

Run: `cd frontend && npx tsc --noEmit`
Expected: без новых ошибок.

- [ ] **Step 4: Юнит-тесты модуля не сломались**

Run: `cd frontend && npx vitest run src/views/backtest`
Expected: PASS — `OrderPanel.tsx` тестов не имеет (как и другие UI-компоненты продукта), но
`lib/money.test.ts`, `lib/candles.test.ts`, `lib/advance.test.ts`, `lib/fills.test.ts`,
`lib/motion.test.ts` из того же каталога обязаны остаться зелёными.

- [ ] **Step 5: Ручная проверка в дев-сервере**

Run: `cd frontend && npm run dev` (или уже поднятый через `start.bat` docker-compose стек —
смотря что запущено), открыть активную сессию бектеста (`/backtest`, «Продолжить» на любой
активной сессии или «Начать» новую).

Проверить глазами:
- слайдер риска двигается синхронно с полем, число и сумма в USDT под ним меняются;
- слайдер стопа не даёт числу перескочить на неверную сторону цены, когда сделка уже открыта
  (диапазон обрезан на нужной стороне); до открытия сделки слайдер ходит по обе стороны цены;
- то же для тейка, зеркально;
- после ввода стопа появляется карточка с размером в монете и в USDT, оба числа не «—»;
- открытие сделки, применение уровней (`Применить уровни`), закрытие по рынку — не сломаны.

- [ ] **Step 6: Коммит**

```bash
git add frontend/src/views/backtest/components/OrderPanel.tsx frontend/src/app/globals.css
git commit -m "feat(backtest): слайдеры риска/стопа/тейка и размер позиции в монете

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Итог

После Task 4 панель ордера бектеста считает и выглядит как тикет терминала: риск слайдером с
суммой в USDT, стоп и тейк слайдерами по верной стороне цены, размер позиции сразу в монете и
в USDT. График и его инструменты не тронуты; грид/DCA остаётся отдельным будущим проектом (см.
спеку).
