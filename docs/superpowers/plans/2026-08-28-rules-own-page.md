# Правила — отдельная страница Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести правила (объявление + соблюдение) с Обзора и из Настроек на собственную страницу `/rules`, слив конфигурацию и факт соблюдения в один список вместо двух дублирующих друг друга.

**Architecture:** Пятый роут по существующему шаблону `app/(app)/<раздел>/page.tsx` → `views/<раздел>/Page.tsx`. Два новых компонента слоя `views/rules/components` (`RulesList` — список с конфигурацией+соблюдением, `AddRuleForm` — форма объявления), оба самодостаточны (сами вызывают хуки `@/features/rules`), страница — только композиция плюс `PeriodStrip`. Старые `RuleComplianceBlock` (Обзор) и `RulesSection` (Настройки) удаляются целиком.

**Tech Stack:** Next.js App Router, next-intl, @tanstack/react-query, vitest.

## Global Constraints

- Бэкенд (`RulesService`, `/api/rules*`, каталог метрик) не меняется — весь объём в этом плане фронтенд-only.
- Отметка нарушений в раскрытой строке журнала (`widgets/trades-table/TradeOrders.tsx`, `violatedRulesMap` в `views/overview/Page.tsx`) не трогается — отдельный механизм, использует `useCompliance` напрямую, а не через удаляемый `RuleComplianceBlock`.
- В проекте нет тестов на React-компоненты (`.test.tsx` в `frontend/src` отсутствуют) — верификация JSX-изменений через `npx tsc --noEmit`, тестами закрывается только чистая логика.
- Правка задевает 5+ файлов → по завершении гоняется полный `npx next build` (правило пользователя из `CLAUDE.md`, «крупное изменение»).
- Слой страниц FSD — `frontend/src/views/`, не `frontend/src/pages/`; страница маршрута — только `export { X as default } from '@/views/...'`.
- Цвета — классами из `globals.css` (`.muted`, `.pos`, `.neg`), не инлайновым `style` для цвета текста.

---

### Task 1: Хелперы форматирования правил + доля соблюдения

**Files:**
- Modify: `frontend/src/features/rules/lib/metric-labels.ts`
- Test: `frontend/src/features/rules/lib/metric-labels.test.ts`

**Interfaces:**
- Produces: `metricLabel(metricKey: string, t: (key: string) => string): string`, `operatorLabel(operator: 'lte' | 'gte', t: (key: string) => string): string`, `unitLabel(unit: string, t: (key: string) => string): string`, `compliancePct(followed: number, total: number): number` — все экспортируются из `@/features/rules/lib/metric-labels`, использует их Task 3 и Task 4.

Сейчас `getMetricLabel`/`getUnitLabel`/`getOperatorLabel` продублированы дословно в `views/overview/components/RuleCompliance.tsx` и `views/settings/components/RulesSection.tsx`. Оба файла удаляются в Task 7/8 — переносим общую часть логики в модуль, который уже заявляет ровно эту цель («Этот модуль сосредотачивает логику, чтобы избежать дублирования»), но пока даёт только сопоставление ключей, не сами t()-обёртки.

- [ ] **Step 1: Написать падающий тест на `compliancePct`**

Добавить в конец `frontend/src/features/rules/lib/metric-labels.test.ts` (после существующих `describe` блоков, тот же файл, тот же стиль):

```ts
import { compliancePct } from './metric-labels';

describe('compliancePct', () => {
  it('округляет долю соблюдения до целых процентов', () => {
    expect(compliancePct(23, 25)).toBe(92);
  });

  it('возвращает 0, когда за период нечего проверять', () => {
    expect(compliancePct(0, 0)).toBe(0);
  });

  it('100% при полном соблюдении', () => {
    expect(compliancePct(10, 10)).toBe(100);
  });
});
```

Добавить `compliancePct` в существующий `import { getMetricLabelKey, getUnitTypeForMetric, getSupportedMetricKeys, type MetricKey } from './metric-labels';` в начале файла (дописать через запятую).

- [ ] **Step 2: Убедиться, что тест падает**

Run: `cd frontend && npx vitest run src/features/rules/lib/metric-labels.test.ts`
Expected: FAIL — `compliancePct` не экспортируется из `./metric-labels`.

- [ ] **Step 3: Добавить хелперы в `metric-labels.ts`**

Дописать в конец `frontend/src/features/rules/lib/metric-labels.ts`:

```ts
/**
 * Человеческая подпись метрики. Обёртка над `getMetricLabelKey`, вызывающая
 * `t()` — сам маппинг ключей от языка не зависит, а вызов `t()` зависит.
 */
export function metricLabel(metricKey: string, t: (key: string) => string): string {
  return t(getMetricLabelKey(metricKey));
}

/** Подпись оператора правила: «не больше» / «не меньше». */
export function operatorLabel(operator: 'lte' | 'gte', t: (key: string) => string): string {
  return operator === 'lte' ? t('opLte') : t('opGte');
}

/**
 * Подпись единицы измерения. Неизвестный тип единицы (правило пережило
 * исчезновение метрики из каталога) возвращается как есть — лучше сырое
 * значение, чем пустая строка на месте единицы.
 */
export function unitLabel(unit: string, t: (key: string) => string): string {
  const map: Record<string, string> = { pct: t('unitPct'), x: t('unitX'), count: t('unitCount') };
  return map[unit] ?? unit;
}

/** Целая доля соблюдения в процентах; 0, если проверять было нечего. */
export function compliancePct(followed: number, total: number): number {
  return total > 0 ? Math.round((followed / total) * 100) : 0;
}
```

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cd frontend && npx vitest run src/features/rules/lib/metric-labels.test.ts`
Expected: PASS, все тесты зелёные.

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/rules/lib/metric-labels.ts frontend/src/features/rules/lib/metric-labels.test.ts
git commit -m "feat(rules): общие хелперы подписи и доли соблюдения"
```

---

### Task 2: i18n — новые ключи (вкладка «Правила», доля соблюдения)

**Files:**
- Modify: `frontend/src/shared/i18n/messages/ru.json`
- Modify: `frontend/src/shared/i18n/messages/en.json`

**Interfaces:**
- Produces: ключ `nav.rules` (использует Task 6, `TopNav`), ключ `rules.followedPct` (использует Task 3, `RulesList`).

Только добавление — старые ключи (`rules.settingsTitle`, `rules.overviewTitle`, `rules.followed`) остаются до Task 9, пока их ещё используют неудалённые компоненты.

- [ ] **Step 1: Добавить `nav.rules` в `ru.json`**

В секции `"nav"` (см. `frontend/src/shared/i18n/messages/ru.json:33-46`) добавить после `"lab": "Выборка",`:

```json
    "lab": "Выборка",
    "rules": "Правила",
```

- [ ] **Step 2: Добавить `nav.rules` в `en.json`**

Аналогично в `frontend/src/shared/i18n/messages/en.json`, после `"lab": "Lab",`:

```json
    "lab": "Lab",
    "rules": "Rules",
```

- [ ] **Step 3: Добавить `rules.followedPct` в `ru.json`**

В секции `"rules"` добавить после строки `"followed": "Соблюдено {followed} из {total}",`:

```json
    "followed": "Соблюдено {followed} из {total}",
    "followedPct": "{pct}% ({followed} из {total})",
```

- [ ] **Step 4: Добавить `rules.followedPct` в `en.json`**

Аналогично после `"followed": "{followed} of {total} followed",`:

```json
    "followed": "{followed} of {total} followed",
    "followedPct": "{pct}% ({followed} of {total})",
```

- [ ] **Step 5: Проверить, что JSON валиден**

Run: `cd frontend && node -e "JSON.parse(require('fs').readFileSync('src/shared/i18n/messages/ru.json','utf8')); JSON.parse(require('fs').readFileSync('src/shared/i18n/messages/en.json','utf8')); console.log('ok')"`
Expected: `ok`, без исключений.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/shared/i18n/messages/ru.json frontend/src/shared/i18n/messages/en.json
git commit -m "i18n(rules): вкладка «Правила» и подпись доли соблюдения"
```

---

### Task 3: Компонент `RulesList`

**Files:**
- Create: `frontend/src/views/rules/components/RulesList.tsx`

**Interfaces:**
- Consumes: `useRules()`, `useCompliance(days: number)`, `useUpsertRule()`, `useDeleteRule()`, `type RuleRow` — все из `@/features/rules` (barrel `frontend/src/features/rules/index.ts`, уже экспортирует всё перечисленное). `metricLabel`, `operatorLabel`, `unitLabel`, `compliancePct` из `@/features/rules/lib/metric-labels` (Task 1).
- Produces: `RulesList({ days: number })` — используется в Task 5 (`views/rules/Page.tsx`).

Сливает то, что раньше было двумя разными представлениями одних и тех же правил: список объявленных (`RulesSection`, конфигурация — метрика/порог/активность/удаление) и блок соблюдения (`RuleCompliance`, только факт — доля/непроверенные). Строка правила показывает оба сразу.

- [ ] **Step 1: Создать файл**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useCompliance, useDeleteRule, useRules, useUpsertRule, type RuleRow } from '@/features/rules';
import { metricLabel, operatorLabel, unitLabel, compliancePct } from '@/features/rules/lib/metric-labels';
import { EmptyState } from '@/shared/ui/EmptyState';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Lookup, KeyValue } from '@/shared/ui/Lookup';
import { Button } from '@/shared/ui/Button';

interface RulesListProps {
  /** Дни периода, за который считается соблюдение (из `usePeriodFilter().effectiveDays`). */
  days: number;
}

/**
 * Список объявленных правил: конфигурация и соблюдение за период — в одной
 * строке на правило.
 *
 * Раньше это были два раздела на двух разных страницах с разным набором
 * данных на одно и то же правило: тут — только факт (доля, непроверенные),
 * там — только конфигурация (порог, активность, удаление). Слияние убирает
 * дублирование, а не просто переносит оба списка рядом.
 */
export function RulesList({ days }: RulesListProps) {
  const t = useTranslations('rules');
  const { data: rulesData, isLoading: rulesLoading, error: rulesError } = useRules();
  const { data: complianceData, isLoading: complianceLoading, error: complianceError } = useCompliance(days);
  const upsert = useUpsertRule();
  const deleteRule = useDeleteRule();

  const metrics = rulesData?.metrics ?? [];
  const rules = rulesData?.rules ?? [];
  const complianceByMetric = new Map(complianceData?.rules.map((c) => [c.metric, c]));

  const isLoading = rulesLoading || complianceLoading;
  const error = rulesError ?? complianceError;

  const handleToggleActive = async (rule: RuleRow) => {
    try {
      await upsert.mutateAsync({
        metric: rule.metric,
        operator: rule.operator,
        threshold: rule.threshold,
        active: !rule.active,
      });
    } catch {
      // Ошибка показана через ErrorNote
    }
  };

  const handleDelete = (metric: string) => {
    void deleteRule.mutate(metric);
  };

  if (isLoading) {
    return (
      <div>
        <Skeleton />
        <div style={{ marginTop: 'var(--s2)' }}>
          <Skeleton width="70%" />
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorNote error={error} fallback={t('loadFailed')} />;
  }

  if (rules.length === 0) {
    return (
      <EmptyState title={t('noRules')}>{t('noRulesLede')}</EmptyState>
    );
  }

  return (
    <div>
      <ErrorNote error={deleteRule.error} fallback={t('deleteFailed')} />
      <Lookup one>
        {rules.map((rule) => {
          const metricDef = metrics.find((m) => m.key === rule.metric);
          const isUnknown = !metricDef;
          const unitLabelStr = metricDef ? unitLabel(metricDef.unit, t) : '';

          const compliance = complianceByMetric.get(rule.metric);
          const followed = compliance?.followed ?? 0;
          const violated = compliance?.violated ?? 0;
          const unchecked = compliance?.unchecked ?? 0;
          const total = followed + violated;
          const hasData = total > 0;
          const pct = compliancePct(followed, total);

          const isDeleting = deleteRule.isPending && deleteRule.variables === rule.metric;

          return (
            <div key={rule.id} style={{ opacity: isUnknown ? 0.6 : 1 }}>
              <KeyValue
                label={
                  isUnknown ? (
                    t('unknownMetric')
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s1)' }}>
                      <span>{metricLabel(rule.metric, t)}</span>
                      <span className="muted">
                        {operatorLabel(rule.operator, t)} {rule.threshold} {unitLabelStr}
                      </span>
                    </div>
                  )
                }
                control
              >
                <div style={{ display: 'flex', gap: 'var(--s2)', alignItems: 'center' }}>
                  {!isUnknown && (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--s1)' }}>
                        {rule.active && hasData && (
                          <span className="pos n">{t('followedPct', { pct, followed, total })}</span>
                        )}
                        {rule.active && !hasData && (
                          <span className="muted" style={{ fontSize: '0.875rem' }}>
                            {t('noTradesInPeriod')}
                          </span>
                        )}
                        {rule.active && unchecked > 0 && (
                          <span className="muted" style={{ fontSize: '0.75rem' }}>
                            {t('unchecked', { count: unchecked })}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="none"
                        tight
                        aria-pressed={rule.active}
                        disabled={isDeleting}
                        onClick={() => void handleToggleActive(rule)}
                      >
                        {rule.active ? '✓' : '◯'}
                      </Button>
                    </>
                  )}
                  <Button
                    variant="risk"
                    onClick={() => handleDelete(rule.metric)}
                    disabled={isDeleting}
                    style={{ fontSize: '0.875rem' }}
                  >
                    {t('remove')}
                  </Button>
                </div>
              </KeyValue>
            </div>
          );
        })}
      </Lookup>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: без ошибок. Компонент пока нигде не импортирован — считается «unused export», это не ошибка типов.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/rules/components/RulesList.tsx
git commit -m "feat(rules): компонент RulesList — конфигурация и соблюдение в одной строке"
```

---

### Task 4: Компонент `AddRuleForm`

**Files:**
- Create: `frontend/src/views/rules/components/AddRuleForm.tsx`

**Interfaces:**
- Consumes: `useRules()`, `useUpsertRule()` из `@/features/rules`. `metricLabel` из `@/features/rules/lib/metric-labels` (Task 1). `Field`, `Input`, `Select`, `FieldGroup` из `@/shared/ui/Field`; `Seg` из `@/shared/ui/Seg`.
- Produces: `AddRuleForm()` (без пропсов, самодостаточен) — используется в Task 5.

Форма объявления правила, перенесённая из `RulesSection` почти дословно (та же логика подстановки умолчаний метрики, та же валидация) — меняется только источник подписи метрики (общий хелпер вместо локальной функции).

- [ ] **Step 1: Создать файл**

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { Field, Input, Select, FieldGroup } from '@/shared/ui/Field';
import { Seg } from '@/shared/ui/Seg';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { useRules, useUpsertRule } from '@/features/rules';
import { metricLabel } from '@/features/rules/lib/metric-labels';

/**
 * Форма объявления нового правила.
 *
 * Список метрик — те, на которых правила ещё нет: правило на метрику
 * существует не больше одного (`upsert` на бэкенде идёт по паре
 * userId+metric, см. `backend/src/rules/rules.service.ts`).
 */
export function AddRuleForm() {
  const t = useTranslations('rules');
  const { data } = useRules();
  const upsert = useUpsertRule();

  const metrics = data?.metrics ?? [];
  const rules = data?.rules ?? [];
  const usedMetricKeys = new Set(rules.map((r) => r.metric));
  const availableMetrics = metrics.filter((m) => !usedMetricKeys.has(m.key));

  const [selectedMetricKey, setSelectedMetricKey] = useState<string>('');
  const [operator, setOperator] = useState<'lte' | 'gte'>('lte');
  const [threshold, setThreshold] = useState<string>('');

  // Когда выбирают метрику, подставляют её умолчания — у метрик разный
  // масштаб (проценты депозита, разы плеча, штуки сделок), и пустое поле
  // заставило бы угадывать порядок величины до первого результата.
  const handleMetricChange = (metricKey: string) => {
    setSelectedMetricKey(metricKey);
    const metric = metrics.find((m) => m.key === metricKey);
    if (metric) {
      setOperator(metric.defaultOperator);
      setThreshold(String(metric.defaultThreshold));
    }
  };

  const handleSave = async () => {
    if (!selectedMetricKey || !threshold.trim()) return;
    const thresholdNum = Number(threshold);
    if (isNaN(thresholdNum)) return;

    try {
      await upsert.mutateAsync({ metric: selectedMetricKey, operator, threshold: thresholdNum });
      setSelectedMetricKey('');
      setOperator('lte');
      setThreshold('');
    } catch {
      // Ошибка показана через ErrorNote
    }
  };

  const ready = selectedMetricKey && threshold.trim() && !isNaN(Number(threshold));

  return (
    <div style={{ marginTop: 'var(--s4)' }}>
      <h3>{t('add')}</h3>

      <Field label={t('metricLabel')} htmlFor="rule-metric-select">
        <Select
          id="rule-metric-select"
          full
          value={selectedMetricKey}
          onChange={(e) => handleMetricChange(e.target.value)}
        >
          <option value="">{t('metricLabel')}</option>
          {availableMetrics.map((m) => (
            <option key={m.key} value={m.key}>
              {metricLabel(m.key, t)}
            </option>
          ))}
        </Select>
      </Field>

      {selectedMetricKey && (
        <>
          <FieldGroup label={t('operatorLabel')}>
            <Seg
              options={[
                { value: 'lte', label: t('opLte') },
                { value: 'gte', label: t('opGte') },
              ]}
              value={operator}
              onChange={(op) => setOperator(op)}
              ariaLabel={t('operatorLabel')}
            />
          </FieldGroup>

          <Field label={t('thresholdLabel')} htmlFor="rule-threshold">
            <div style={{ display: 'flex', gap: 'var(--s1)' }}>
              <Input
                id="rule-threshold"
                full
                type="number"
                step="any"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder={t('thresholdLabel')}
              />
              <span className="muted" style={{ whiteSpace: 'nowrap', lineHeight: '2.4rem' }}>
                {metrics.find((m) => m.key === selectedMetricKey)?.unit}
              </span>
            </div>
          </Field>

          <ErrorNote error={upsert.error} fallback={t('saveFailed')} />
          <Button
            variant="solid"
            style={{ marginTop: 'var(--s3)' }}
            disabled={upsert.isPending || !ready}
            onClick={() => void handleSave()}
          >
            {upsert.isPending ? t('saving') : t('save')}
          </Button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/rules/components/AddRuleForm.tsx
git commit -m "feat(rules): компонент AddRuleForm — форма объявления, перенесена из Настроек"
```

---

### Task 5: Страница `/rules`

**Files:**
- Create: `frontend/src/views/rules/Page.tsx`
- Create: `frontend/src/app/(app)/rules/page.tsx`

**Interfaces:**
- Consumes: `RulesList` (Task 3), `AddRuleForm` (Task 4), `usePeriodFilter`/`PeriodStrip` из `@/features/period-filter`, `Wrap` из `@/shared/ui/Wrap`.
- Produces: `RulesPage()` — реэкспортируется файлом роута как `default`, используется Task 6 не напрямую, а через переход по адресу `/rules`.

- [ ] **Step 1: Создать `views/rules/Page.tsx`**

```tsx
'use client';

import { Wrap } from '@/shared/ui/Wrap';
import { usePeriodFilter, PeriodStrip } from '@/features/period-filter';
import { RulesList } from './components/RulesList';
import { AddRuleForm } from './components/AddRuleForm';

/**
 * Правила: числовые ограничения, которые пользователь объявил себе, и то,
 * насколько получается их соблюдать по факту сделок.
 *
 * Раньше объявление жило в Настройках (страница описывала себя как
 * «подключение биржевых аккаунтов, и только оно» — правила туда не подходили
 * по собственному описанию), а соблюдение — на Обзоре, отдельным блоком между
 * сводом и кривой P&L, с другим набором данных на то же самое правило. Здесь
 * — один список: конфигурация и факт в одной строке.
 */
export function RulesPage() {
  const period = usePeriodFilter();

  return (
    <Wrap page>
      <PeriodStrip spaced period={period} />
      <div className="set">
        <RulesList days={period.effectiveDays} />
        <AddRuleForm />
      </div>
    </Wrap>
  );
}
```

- [ ] **Step 2: Создать файл роута**

```tsx
/**
 * Правила — /rules
 *
 * Файл роута — только объявление адреса. Сама страница живёт в слое `views`
 * (`src/views`, не `src/pages`: `src/pages` — служебный каталог Pages Router,
 * и Next пытался бы собрать каждый файл оттуда как отдельный роут).
 */
export { RulesPage as default } from '@/views/rules/Page';
```

Путь: `frontend/src/app/(app)/rules/page.tsx`.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/views/rules/Page.tsx" "frontend/src/app/(app)/rules/page.tsx"
git commit -m "feat(rules): страница /rules"
```

---

### Task 6: Вкладка «Правила» в верхней рейке

**Files:**
- Modify: `frontend/src/widgets/top-nav/TopNav.tsx:14-22`

**Interfaces:**
- Consumes: ключ `nav.rules` (Task 2), маршрут `/rules` (Task 5).

- [ ] **Step 1: Добавить `'rules'` в тип `Tab` и в `NAV`**

В `frontend/src/widgets/top-nav/TopNav.tsx` заменить:

```ts
type Tab = 'overview' | 'tags' | 'lab' | 'analytics' | 'settings';

const NAV: { id: Tab; labelKey: 'overview' | 'tags' | 'lab' | 'analytics' | 'settings' }[] = [
  { id: 'overview', labelKey: 'overview' },
  { id: 'tags', labelKey: 'tags' },
  { id: 'lab', labelKey: 'lab' },
  { id: 'analytics', labelKey: 'analytics' },
  { id: 'settings', labelKey: 'settings' },
];
```

на:

```ts
type Tab = 'overview' | 'tags' | 'lab' | 'rules' | 'analytics' | 'settings';

const NAV: { id: Tab; labelKey: 'overview' | 'tags' | 'lab' | 'rules' | 'analytics' | 'settings' }[] = [
  { id: 'overview', labelKey: 'overview' },
  { id: 'tags', labelKey: 'tags' },
  { id: 'lab', labelKey: 'lab' },
  { id: 'rules', labelKey: 'rules' },
  { id: 'analytics', labelKey: 'analytics' },
  { id: 'settings', labelKey: 'settings' },
];
```

Вкладка встаёт после Выборки — так же, как в маршруте `/rules` она стоит между `/lab` и `/analytics`.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

- [ ] **Step 3: Ручная проверка (dev-сервер)**

Run: `cd frontend && npm run dev -- -p 8090`, открыть `http://localhost:8090/overview`, проверить рейку в шапке: пункт «Правила» между «Выборка» и «Рынок», клик по нему открывает `/rules` со списком (пока пустым, если правил не заведено) и формой добавления снизу. Остановить dev-сервер (Ctrl+C) после проверки.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/widgets/top-nav/TopNav.tsx
git commit -m "feat(rules): вкладка «Правила» в верхней рейке"
```

---

### Task 7: Убрать блок правил с Обзора

**Files:**
- Modify: `frontend/src/views/overview/Page.tsx`
- Delete: `frontend/src/views/overview/components/RuleCompliance.tsx`

**Interfaces:**
- Consumes: ничего нового.
- Убирается: импорт и использование компонента `RuleCompliance` (алиас `RuleComplianceBlock`) из `./components/RuleCompliance`. Импорт `useCompliance`/`type RuleCompliance` из `@/features/rules` **остаётся** — он нужен `violatedRulesMap` (отметка нарушений в журнале), это другой механизм.

- [ ] **Step 1: Убрать импорт блока**

В `frontend/src/views/overview/Page.tsx` удалить строку:

```ts
import { RuleCompliance as RuleComplianceBlock } from './components/RuleCompliance';
```

Строку `import { useCompliance, type RuleCompliance } from '@/features/rules';` — оставить как есть.

- [ ] **Step 2: Убрать сам блок из разметки**

Удалить из `frontend/src/views/overview/Page.tsx`:

```tsx
      {/* Блок соблюдения правил показывается после свода, но до кривой: соблюдение
          это про поведение, и оно должно попадаться на глаза раньше, чем результат
          в виде кривой доходности. */}
      <Wrap style={{ marginTop: 'var(--s4)' }}>
        <RuleComplianceBlock days={effectiveDays} />
      </Wrap>

```

(весь блок между рейкой периода и заглушкой/кривой холста — включая комментарий и оборачивающий `<Wrap>`).

- [ ] **Step 3: Удалить файл старого компонента**

```bash
rm frontend/src/views/overview/components/RuleCompliance.tsx
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: без ошибок — `useCompliance`/`RuleCompliance` (тип) по-прежнему используются в `violatedRulesMap`, `RuleComplianceBlock` нигде не остался.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/overview/Page.tsx
git rm frontend/src/views/overview/components/RuleCompliance.tsx
git commit -m "refactor(rules): убрать блок соблюдения с Обзора — переехал на /rules"
```

---

### Task 8: Убрать раздел правил из Настроек

**Files:**
- Modify: `frontend/src/views/settings/Page.tsx`
- Delete: `frontend/src/views/settings/components/RulesSection.tsx`

**Interfaces:**
- Consumes: ничего.

- [ ] **Step 1: Убрать импорт**

В `frontend/src/views/settings/Page.tsx` удалить строку:

```ts
import { RulesSection } from './components/RulesSection';
```

- [ ] **Step 2: Убрать использование**

Удалить из разметки (между блоком подключения биржи и `<ConfirmDialog>`):

```tsx

      <RulesSection />
```

- [ ] **Step 3: Удалить файл**

```bash
rm frontend/src/views/settings/components/RulesSection.tsx
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/settings/Page.tsx
git rm frontend/src/views/settings/components/RulesSection.tsx
git commit -m "refactor(rules): убрать раздел правил из Настроек — переехал на /rules"
```

---

### Task 9: i18n — удалить осиротевшие ключи

**Files:**
- Modify: `frontend/src/shared/i18n/messages/ru.json`
- Modify: `frontend/src/shared/i18n/messages/en.json`

**Interfaces:**
- Consumes: подтверждение, что Task 7 и 8 выполнены (иначе ключи ещё используются).

`rules.settingsTitle` и `rules.overviewTitle` были заголовками двух удалённых компонентов (`RulesSection`/`RuleCompliance`) — на `/rules` собственного заголовка над списком нет (страница уже названа пунктом навигации, тот же принцип, что на «Тегах»). `rules.followed` заменён на `rules.followedPct` в Task 3.

- [ ] **Step 1: Проверить, что ключи больше нигде не используются**

Run: `cd frontend && grep -rn "settingsTitle\|settingsLede\|overviewTitle\|t('followed'" src --include=*.tsx`
Expected: пусто (после Task 7 и 8 оба компонента, что их использовали, удалены).

- [ ] **Step 2: Удалить ключи из `ru.json`**

В `frontend/src/shared/i18n/messages/ru.json`, секция `"rules"`, удалить строки:

```json
  "settingsTitle": "Правила",
  "settingsLede": "Объявите числовое правило — сервис сверит его по вашим сделкам.",
```
и
```json
  "overviewTitle": "Соблюдение правил",
```
и
```json
  "followed": "Соблюдено {followed} из {total}",
```

`settingsLede` уходит вместе с `settingsTitle` — обе были леде-подписью удалённой секции в Настройках, `AddRuleForm` собственной леде-подписи не имеет (форма самообъяснима: подпись поля + список метрик).

- [ ] **Step 3: Удалить те же ключи из `en.json`**

Аналогично: `settingsTitle`, `settingsLede`, `overviewTitle`, `followed`.

- [ ] **Step 4: Проверить, что JSON валиден**

Run: `cd frontend && node -e "JSON.parse(require('fs').readFileSync('src/shared/i18n/messages/ru.json','utf8')); JSON.parse(require('fs').readFileSync('src/shared/i18n/messages/en.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/shared/i18n/messages/ru.json frontend/src/shared/i18n/messages/en.json
git commit -m "i18n(rules): удалить ключи заголовков удалённых компонентов"
```

---

### Task 10: Полная верификация

**Files:** нет изменений — только проверка.

**Interfaces:** нет.

- [ ] **Step 1: Полный набор тестов фронтенда**

Run: `cd frontend && npx vitest run`
Expected: все тесты зелёные, включая три новых из Task 1.

- [ ] **Step 2: Полный typecheck**

Run: `cd frontend && npx tsc --noEmit -p tsconfig.json`
Expected: без ошибок.

- [ ] **Step 3: Полная сборка**

Run: `cd frontend && npx next build`
Expected: `✓ Compiled successfully`, без ошибок сборки. Правило пользователя из `CLAUDE.md` («крупное изменение — 5+ файлов») требует полного билда именно здесь, не после каждой задачи.

- [ ] **Step 4: Ручной проход по пути пользователя**

Run: `cd frontend && npm run dev -- -p 8090`. Открыть `http://localhost:8090`:
1. `/overview` — блока соблюдения правил больше нет, страница заканчивается разбивками по времени и журналом.
2. `/settings` — раздела «Правила» под подключением биржи больше нет.
3. `/rules` — список (или пустое состояние, если правил нет) + форма «Добавить правило» снизу. Завести правило, проверить: появляется строкой в списке, переключатель активности и удаление работают, при наличии сделок в периоде показывается доля соблюдения в процентах.

Остановить dev-сервер (Ctrl+C).

- [ ] **Step 5: Финальный отчёт**

Если все шаги прошли — задача выполнена, отдельного коммита этот таск не требует (нечего коммитить, кроме уже закоммиченного в Task 1–9).
