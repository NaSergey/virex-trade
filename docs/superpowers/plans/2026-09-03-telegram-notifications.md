# Настройка уведомлений в Telegram-боте — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Двенадцать типов уведомлений с персональными порогами, панель `/settings` внутри Telegram-бота и карточка привязки на странице настроек приложения.

**Architecture:** Реестр типов (`registry.ts`) — единственный источник правды о сигналах; настройки пользователя лежат JSON-полем `User.notifyPrefs` как отклонения от дефолтов реестра; фронт нарастания и cooldown вынесены в таблицу `NotificationState`, а не во флаги в памяти процесса. Чекеры (рыночные, сделочные, отчёт) вызывают `NotifierService`, который решает, слать ли, и зовёт `TelegramService` как транспорт.

**Tech Stack:** NestJS 10, Prisma 6 + PostgreSQL, Jest 29 (`ts-jest`, `rootDir: src`), Next.js App Router + FSD, next-intl, TanStack Query.

Спека: `docs/superpowers/specs/2026-09-03-telegram-notifications-design.md`.

## Global Constraints

- **Тесты — только чистые функции и подменённые зависимости.** Живой Telegram и живой Bybit в тестах не дёргаются: `fetch` и методы `TelegramService` подменяются, как в `src/exchanges/adapters/*.spec.ts`.
- **Комментарии в коде — по-русски, и объясняют «почему», а не «что».** Образец тона: `src/balance/trade-risk.service.spec.ts`, `src/telegram/telegram.service.ts`.
- **`callback_data` в Telegram ≤ 64 байт.** Ограничение уже соблюдается фильтром в `buildTagKeyboard`; каждая новая кнопка обязана иметь тест на длину.
- **Часовой пояс отчёта — константа МСК (UTC+3).** Поля таймзоны в `User` нет и в этой работе не появляется.
- **Рыночные данные — только BTCUSDT.** Все источники в проекте настроены на этот символ.
- **Миграции — через `npm run prisma:push`** (проект использует `db push`, не `migrate deploy`).
- **Ошибка отправки в Telegram никогда не роняет вызывающий цикл** — каждый вызов обёрнут в try/catch с `logger.warn`, как уже сделано в `trade-sync.service.ts:237`.
- **Фронтенд: никакой сырой разметки.** Только примитивы из `shared/ui`; цвета — классами из `globals.css`. Слой страниц — `src/views/`, не `src/pages/`.
- **Все пользовательские строки фронта — в обоих файлах локализации**: `frontend/src/shared/i18n/messages/ru.json` и `en.json`.

---

## Структура файлов

**Создаются (backend):**

| Файл | Ответственность |
|---|---|
| `src/notifications/registry.ts` | Реестр 12 типов: ключ, категория, заголовок, пресеты, дефолты, cooldown. Чистые данные + геттеры. |
| `src/notifications/prefs.ts` | Чистые функции над настройками: слияние с дефолтами, тумблер, перебор пресета, сериализация отклонений. |
| `src/notifications/prefs.spec.ts` | Тесты `prefs.ts`. |
| `src/notifications/prefs.service.ts` | Чтение/запись `User.notifyPrefs` через Prisma. |
| `src/notifications/notification-state.ts` | Чистая функция решения `decide()`: фронт нарастания + cooldown. |
| `src/notifications/notification-state.spec.ts` | Тесты `decide()`. |
| `src/notifications/notification-state.service.ts` | Чтение/запись таблицы `NotificationState`. |
| `src/notifications/quiet-hours.ts` | `isQuietNow()` — тихие часы 23:00–08:00 МСК. |
| `src/notifications/quiet-hours.spec.ts` | Тесты тихих часов. |
| `src/notifications/notifier.service.ts` | Единая точка отправки: проверяет включённость, тихие часы, состояние — и шлёт. |
| `src/notifications/prefs.module.ts` | Модуль без зависимостей от Telegram: `PrefsService` + `NotificationStateService`. |
| `src/notifications/notifications.module.ts` | Модуль чекеров: `NotifierService`, `MarketAlertsService`, `TradeAlertsService`, `WeeklyReportService`. |
| `src/notifications/market-metrics.ts` | Чистые метрики рыночных сигналов. |
| `src/notifications/market-metrics.spec.ts` | Тесты метрик. |
| `src/notifications/market-alerts.service.ts` | Тик раз в 5 минут, семь рыночных сигналов. |
| `src/notifications/trade-alerts.service.ts` | Закрытие позиции, переторговка, неудачная синхронизация. |
| `src/notifications/weekly-report.service.ts` | Недельный отчёт, понедельник 09:00 UTC. |
| `src/notifications/weekly-report.ts` | Чистая сборка текста отчёта из строк сделок. |
| `src/notifications/weekly-report.spec.ts` | Тесты сборки отчёта. |
| `src/telegram/ids.ts` | uuid ↔ base64url для `callback_data`. |
| `src/telegram/ids.spec.ts` | Тесты кодирования и длины. |
| `src/telegram/settings-panel.ts` | Рендер панели `/settings` и разбор её callback'ов. |
| `src/telegram/settings-panel.spec.ts` | Тесты рендера и длины `callback_data`. |

**Изменяются (backend):**

| Файл | Что меняется |
|---|---|
| `prisma/schema.prisma` | `User.notifyPrefs`, `User.notificationStates`, модель `NotificationState`. |
| `src/telegram/telegram.service.ts` | Публичные `sendText`/`chatIdOf`, команда `/settings`, ветки callback'ов панели и тегов закрытой сделки, приветствие после привязки. |
| `src/telegram/telegram.controller.ts` | `/api/telegram/status` отдаёт список включённых уведомлений. |
| `src/telegram/telegram.module.ts` | Импорт `PrefsModule`. |
| `src/analytics/analytics.module.ts` | Удаление `VolatilityAlertService`, экспорт `AnalyticsService`. |
| `src/trades/trades.module.ts` | Импорт `NotificationsModule`. |
| `src/trades/trade-sync.service.ts` | Вызовы `TradeAlertsService` вместо прямого `telegram.notifyPositionOpened`; сигнал неудачного прогона. |
| `src/market-events/market-events.module.ts` | Экспорт `MarketEventsService`. |
| `src/app.module.ts` | Регистрация `NotificationsModule`. |

**Удаляется:** `src/analytics/volatility-alert.service.ts`.

**Изменяются (frontend):**

| Файл | Что меняется |
|---|---|
| `src/views/settings/api/telegram-hooks.ts` | Тип `TelegramStatus` получает поле `notifications`. |
| `src/views/settings/components/TelegramCard.tsx` | Создаётся: карточка привязки. |
| `src/views/settings/Page.tsx` | Рендер карточки. |
| `src/shared/i18n/messages/ru.json`, `en.json` | Строки карточки. |

---

## Task 1: Реестр типов и чистые функции настроек

**Files:**
- Create: `backend/src/notifications/registry.ts`
- Create: `backend/src/notifications/prefs.ts`
- Test: `backend/src/notifications/prefs.spec.ts`

**Interfaces:**
- Consumes: ничего.
- Produces: `NotifKey`, `NotifCategory`, `NotifDef`, `NOTIF_DEFS`, `notifDef(key)`, `defsByCategory(cat)`, `CATEGORY_META`; `Prefs`, `defaultPrefs()`, `mergePrefs(stored)`, `toStored(prefs)`, `togglePref(prefs, key)`, `cyclePreset(prefs, key)`, `thresholdOf(prefs, key)`, `isEnabled(prefs, key)`.

- [ ] **Step 1: Написать реестр**

Создать `backend/src/notifications/registry.ts`:

```ts
/**
 * Реестр типов уведомлений — единственное место, где живёт знание о том,
 * какие сигналы бывают, как они называются и какие у них пороги. Панель бота,
 * чекеры и карточка в настройках читают отсюда: добавить сигнал должно
 * означать добавить запись, а не править четыре файла.
 */

export type NotifKey =
  | 'mkt.price1h'
  | 'mkt.vol1h'
  | 'mkt.volume'
  | 'mkt.fng'
  | 'mkt.ls'
  | 'mkt.book'
  | 'mkt.hour'
  | 'trade.opened'
  | 'trade.closed'
  | 'trade.overtrade'
  | 'report.weekly'
  | 'sys.sync';

export type NotifCategory = 'market' | 'trade' | 'report';

export interface NotifPreset {
  /** Число, с которым сравнивает чекер. Смысл зависит от сигнала. */
  value: number;
  /** Подпись на кнопке: «≥ 2%», «×2», «25/75». */
  label: string;
}

export interface NotifDef {
  key: NotifKey;
  category: NotifCategory;
  emoji: string;
  title: string;
  /** Пустой массив — у сигнала нет порога. */
  presets: NotifPreset[];
  /** Индекс в presets. 0 у сигналов без порога. */
  defaultPreset: number;
  defaultEnabled: boolean;
  /** Минимальный промежуток между двумя отправками этого сигнала. */
  cooldownMs: number;
  /** Событие, которое человек сам и вызвал, — тихие часы его не глушат. */
  ignoresQuietHours: boolean;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const CATEGORY_META: Record<NotifCategory, { emoji: string; title: string }> = {
  market: { emoji: '📈', title: 'Рынок' },
  trade: { emoji: '📊', title: 'Сделки' },
  report: { emoji: '🗓', title: 'Отчёты и сервис' },
};

export const NOTIF_DEFS: NotifDef[] = [
  {
    key: 'mkt.price1h',
    category: 'market',
    emoji: '📈',
    title: 'Движение цены 1ч',
    // value — модуль изменения свечи в процентах.
    presets: [
      { value: 1, label: '≥ 1%' },
      { value: 2, label: '≥ 2%' },
      { value: 3.5, label: '≥ 3.5%' },
    ],
    defaultPreset: 2,
    defaultEnabled: true,
    cooldownMs: 2 * HOUR,
    ignoresQuietHours: false,
  },
  {
    key: 'mkt.vol1h',
    category: 'market',
    emoji: '⚡',
    title: 'Волатильность 1ч',
    // value — во сколько раз размах часа превышает средний часовой за неделю.
    presets: [
      { value: 1.5, label: '×1.5' },
      { value: 2, label: '×2' },
      { value: 3, label: '×3' },
    ],
    defaultPreset: 1,
    defaultEnabled: false,
    cooldownMs: 2 * HOUR,
    ignoresQuietHours: false,
  },
  {
    key: 'mkt.volume',
    category: 'market',
    emoji: '📊',
    title: 'Объём',
    // value — насколько объём за сутки выше среднего за неделю, в процентах.
    presets: [
      { value: 25, label: '+25%' },
      { value: 50, label: '+50%' },
      { value: 100, label: '+100%' },
    ],
    defaultPreset: 1,
    defaultEnabled: false,
    cooldownMs: 2 * HOUR,
    ignoresQuietHours: false,
  },
  {
    key: 'mkt.fng',
    category: 'market',
    emoji: '😱',
    title: 'Fear & Greed',
    // value — нижняя граница; верхняя симметрична: 100 − value.
    presets: [
      { value: 40, label: '40/60' },
      { value: 25, label: '25/75' },
    ],
    defaultPreset: 1,
    defaultEnabled: false,
    cooldownMs: 12 * HOUR,
    ignoresQuietHours: false,
  },
  {
    key: 'mkt.ls',
    category: 'market',
    emoji: '⚖️',
    title: 'Перекос long/short',
    // value — доля лонгов в процентах; шорт-сторона симметрична.
    presets: [
      { value: 65, label: '65/35' },
      { value: 70, label: '70/30' },
      { value: 75, label: '75/25' },
    ],
    defaultPreset: 1,
    defaultEnabled: false,
    cooldownMs: 6 * HOUR,
    ignoresQuietHours: false,
  },
  {
    key: 'mkt.book',
    category: 'market',
    emoji: '📖',
    title: 'Раздвижка стакана',
    // value — во сколько раз раздвижка шире средней за неделю.
    presets: [
      { value: 1.5, label: '×1.5' },
      { value: 2, label: '×2' },
      { value: 3, label: '×3' },
    ],
    defaultPreset: 1,
    defaultEnabled: false,
    cooldownMs: 6 * HOUR,
    ignoresQuietHours: false,
  },
  {
    key: 'mkt.hour',
    category: 'market',
    emoji: '⏰',
    title: 'Волатильный час',
    // value: 0 — только час, 1 — час и слабый для лонга день недели.
    presets: [
      { value: 0, label: 'только час' },
      { value: 1, label: 'час + слабый день' },
    ],
    defaultPreset: 0,
    defaultEnabled: false,
    cooldownMs: 50 * 60_000,
    ignoresQuietHours: false,
  },
  {
    key: 'trade.opened',
    category: 'trade',
    emoji: '🆕',
    title: 'Открыта позиция',
    presets: [],
    defaultPreset: 0,
    defaultEnabled: true,
    cooldownMs: 0,
    ignoresQuietHours: true,
  },
  {
    key: 'trade.closed',
    category: 'trade',
    emoji: '🏁',
    title: 'Закрыта позиция',
    presets: [],
    defaultPreset: 0,
    defaultEnabled: true,
    cooldownMs: 0,
    ignoresQuietHours: true,
  },
  {
    key: 'trade.overtrade',
    category: 'trade',
    emoji: '🔥',
    title: 'Переторговка',
    // value — число закрытых сделок за сутки.
    presets: [
      { value: 5, label: '> 5 за сутки' },
      { value: 10, label: '> 10 за сутки' },
      { value: 20, label: '> 20 за сутки' },
    ],
    defaultPreset: 1,
    defaultEnabled: false,
    cooldownMs: DAY,
    ignoresQuietHours: false,
  },
  {
    key: 'report.weekly',
    category: 'report',
    emoji: '🗓',
    title: 'Отчёт за неделю',
    presets: [],
    defaultPreset: 0,
    defaultEnabled: true,
    cooldownMs: 0,
    ignoresQuietHours: true,
  },
  {
    key: 'sys.sync',
    category: 'report',
    emoji: '🛠',
    title: 'Сбой синхронизации',
    presets: [],
    defaultPreset: 0,
    defaultEnabled: true,
    cooldownMs: DAY,
    ignoresQuietHours: true,
  },
];

const BY_KEY = new Map<string, NotifDef>(NOTIF_DEFS.map((d) => [d.key, d]));

export const notifDef = (key: string): NotifDef | undefined => BY_KEY.get(key);

export const defsByCategory = (category: NotifCategory): NotifDef[] =>
  NOTIF_DEFS.filter((d) => d.category === category);

export const CATEGORIES: NotifCategory[] = ['market', 'trade', 'report'];
```

- [ ] **Step 2: Написать падающий тест на настройки**

Создать `backend/src/notifications/prefs.spec.ts`:

```ts
import { NOTIF_DEFS } from './registry';
import {
  cyclePreset,
  defaultPrefs,
  isEnabled,
  mergePrefs,
  thresholdOf,
  togglePref,
  toStored,
} from './prefs';

describe('prefs', () => {
  it('дефолты берутся из реестра для всех ключей', () => {
    const p = defaultPrefs();
    expect(Object.keys(p.items)).toHaveLength(NOTIF_DEFS.length);
    expect(isEnabled(p, 'trade.opened')).toBe(true);
    expect(isEnabled(p, 'mkt.vol1h')).toBe(false);
    expect(p.quietHours).toBe(true);
  });

  it('порог отдаётся значением пресета, а не индексом', () => {
    // mkt.price1h по умолчанию стоит на третьем пресете — 3.5%.
    expect(thresholdOf(defaultPrefs(), 'mkt.price1h')).toBe(3.5);
  });

  it('у сигнала без порога thresholdOf отдаёт null', () => {
    expect(thresholdOf(defaultPrefs(), 'trade.opened')).toBeNull();
  });

  // Настройки хранятся как отклонения от дефолта: реестр может пополниться,
  // и сохранённый объект не должен решать за новые сигналы.
  it('mergePrefs накладывает сохранённое поверх дефолтов', () => {
    const p = mergePrefs({ items: { 'mkt.vol1h': { e: true, p: 2 } } });
    expect(isEnabled(p, 'mkt.vol1h')).toBe(true);
    expect(thresholdOf(p, 'mkt.vol1h')).toBe(3);
    expect(isEnabled(p, 'trade.opened')).toBe(true);
  });

  // Сигнал могли удалить из реестра, а строка в базе осталась. Панель, которая
  // на этом падает, оставляет человека без настроек вообще.
  it('mergePrefs игнорирует ключ, которого нет в реестре', () => {
    const p = mergePrefs({ items: { 'mkt.gone': { e: true, p: 0 } } });
    expect(Object.keys(p.items)).toHaveLength(NOTIF_DEFS.length);
    expect((p.items as Record<string, unknown>)['mkt.gone']).toBeUndefined();
  });

  it('mergePrefs переживает мусор вместо объекта', () => {
    expect(isEnabled(mergePrefs(null), 'trade.opened')).toBe(true);
    expect(isEnabled(mergePrefs('нет'), 'trade.opened')).toBe(true);
    expect(isEnabled(mergePrefs({ items: 7 }), 'trade.opened')).toBe(true);
  });

  it('индекс пресета за границами списка откатывается на дефолтный', () => {
    expect(thresholdOf(mergePrefs({ items: { 'mkt.price1h': { p: 99 } } }), 'mkt.price1h')).toBe(3.5);
  });

  it('togglePref переключает и не трогает соседей', () => {
    const p = togglePref(defaultPrefs(), 'mkt.vol1h');
    expect(isEnabled(p, 'mkt.vol1h')).toBe(true);
    expect(isEnabled(p, 'mkt.volume')).toBe(false);
    expect(isEnabled(togglePref(p, 'mkt.vol1h'), 'mkt.vol1h')).toBe(false);
  });

  it('cyclePreset идёт по кругу', () => {
    // mkt.vol1h: ×1.5 → ×2 → ×3 → ×1.5
    let p = mergePrefs({ items: { 'mkt.vol1h': { p: 0 } } });
    p = cyclePreset(p, 'mkt.vol1h');
    expect(thresholdOf(p, 'mkt.vol1h')).toBe(2);
    p = cyclePreset(p, 'mkt.vol1h');
    expect(thresholdOf(p, 'mkt.vol1h')).toBe(3);
    p = cyclePreset(p, 'mkt.vol1h');
    expect(thresholdOf(p, 'mkt.vol1h')).toBe(1.5);
  });

  it('cyclePreset ничего не делает сигналу без порога', () => {
    const p = cyclePreset(defaultPrefs(), 'trade.opened');
    expect(thresholdOf(p, 'trade.opened')).toBeNull();
  });

  // Хранить полную копию дефолтов значило бы заморозить их в базе: правка
  // дефолта в коде не доехала бы ни до кого из уже привязанных.
  it('toStored пишет только отклонения от дефолта', () => {
    expect(toStored(defaultPrefs())).toEqual({ items: {} });
    expect(toStored(togglePref(defaultPrefs(), 'mkt.vol1h'))).toEqual({
      items: { 'mkt.vol1h': { e: true } },
    });
  });

  it('toStored пишет quietHours, только когда он выключен', () => {
    const p = defaultPrefs();
    expect(toStored(p).quietHours).toBeUndefined();
    expect(toStored({ ...p, quietHours: false })).toMatchObject({ quietHours: false });
  });

  it('mergePrefs(toStored(p)) возвращает то же самое', () => {
    const p = cyclePreset(togglePref(defaultPrefs(), 'mkt.book'), 'mkt.ls');
    expect(mergePrefs(toStored(p))).toEqual(p);
  });
});
```

- [ ] **Step 3: Запустить тест и убедиться, что он падает**

```bash
cd backend && npx jest notifications/prefs
```

Ожидается: FAIL — `Cannot find module './prefs'`.

- [ ] **Step 4: Написать реализацию**

Создать `backend/src/notifications/prefs.ts`:

```ts
import { NOTIF_DEFS, NotifDef, NotifKey, notifDef } from './registry';

export interface PrefItem {
  enabled: boolean;
  /** Индекс в NotifDef.presets. */
  preset: number;
}

export interface Prefs {
  items: Record<string, PrefItem>;
  /** true — тихие часы соблюдаются. */
  quietHours: boolean;
}

/** Форма, в которой настройки лежат в User.notifyPrefs: только отклонения. */
export interface StoredPrefs {
  items: Record<string, { e?: boolean; p?: number }>;
  quietHours?: boolean;
}

const DEFAULT_QUIET_HOURS = true;

export const defaultPrefs = (): Prefs => ({
  items: Object.fromEntries(
    NOTIF_DEFS.map((d) => [d.key, { enabled: d.defaultEnabled, preset: d.defaultPreset }]),
  ),
  quietHours: DEFAULT_QUIET_HOURS,
});

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Индекс пресета, если он существует у этого сигнала; иначе — дефолтный. */
const safePreset = (def: NotifDef, raw: unknown): number => {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return def.defaultPreset;
  if (def.presets.length === 0) return 0;
  return raw >= 0 && raw < def.presets.length ? raw : def.defaultPreset;
};

/**
 * Накладывает сохранённое на дефолты реестра. Ключ, которого в реестре нет,
 * молча выбрасывается: сигнал могли удалить, а строка в базе осталась, и
 * падать из-за неё панель настроек не должна.
 */
export const mergePrefs = (stored: unknown): Prefs => {
  const base = defaultPrefs();
  if (!isObject(stored)) return base;
  const items = isObject(stored.items) ? stored.items : {};
  for (const [key, raw] of Object.entries(items)) {
    const def = notifDef(key);
    if (!def || !isObject(raw)) continue;
    base.items[key] = {
      enabled: typeof raw.e === 'boolean' ? raw.e : def.defaultEnabled,
      preset: safePreset(def, raw.p),
    };
  }
  if (typeof stored.quietHours === 'boolean') base.quietHours = stored.quietHours;
  return base;
};

/** Обратная операция: в базу уезжает только то, что отличается от дефолта. */
export const toStored = (prefs: Prefs): StoredPrefs => {
  const items: StoredPrefs['items'] = {};
  for (const def of NOTIF_DEFS) {
    const item = prefs.items[def.key];
    if (!item) continue;
    const diff: { e?: boolean; p?: number } = {};
    if (item.enabled !== def.defaultEnabled) diff.e = item.enabled;
    if (item.preset !== def.defaultPreset) diff.p = item.preset;
    if (Object.keys(diff).length > 0) items[def.key] = diff;
  }
  const out: StoredPrefs = { items };
  if (prefs.quietHours !== DEFAULT_QUIET_HOURS) out.quietHours = prefs.quietHours;
  return out;
};

export const isEnabled = (prefs: Prefs, key: NotifKey | string): boolean =>
  prefs.items[key]?.enabled ?? false;

/** Значение текущего пресета. null — у сигнала нет порога. */
export const thresholdOf = (prefs: Prefs, key: NotifKey | string): number | null => {
  const def = notifDef(key);
  if (!def || def.presets.length === 0) return null;
  const idx = prefs.items[key]?.preset ?? def.defaultPreset;
  return def.presets[idx]?.value ?? def.presets[def.defaultPreset].value;
};

/** Подпись текущего пресета для кнопки. null — порога нет. */
export const presetLabelOf = (prefs: Prefs, key: NotifKey | string): string | null => {
  const def = notifDef(key);
  if (!def || def.presets.length === 0) return null;
  const idx = prefs.items[key]?.preset ?? def.defaultPreset;
  return (def.presets[idx] ?? def.presets[def.defaultPreset]).label;
};

export const togglePref = (prefs: Prefs, key: NotifKey | string): Prefs => {
  const item = prefs.items[key];
  if (!item) return prefs;
  return { ...prefs, items: { ...prefs.items, [key]: { ...item, enabled: !item.enabled } } };
};

export const cyclePreset = (prefs: Prefs, key: NotifKey | string): Prefs => {
  const def = notifDef(key);
  const item = prefs.items[key];
  if (!def || !item || def.presets.length === 0) return prefs;
  const next = (item.preset + 1) % def.presets.length;
  return { ...prefs, items: { ...prefs.items, [key]: { ...item, preset: next } } };
};
```

- [ ] **Step 5: Запустить тест и убедиться, что он проходит**

```bash
cd backend && npx jest notifications/prefs
```

Ожидается: PASS, 13 тестов.

- [ ] **Step 6: Коммит**

```bash
git add backend/src/notifications/registry.ts backend/src/notifications/prefs.ts backend/src/notifications/prefs.spec.ts
git commit -m "feat(notifications): реестр типов уведомлений и настройки пользователя"
```

---

## Task 2: Схема БД и сервисы доступа

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/src/notifications/prefs.service.ts`
- Create: `backend/src/notifications/notification-state.ts`
- Create: `backend/src/notifications/notification-state.service.ts`
- Create: `backend/src/notifications/prefs.module.ts`
- Test: `backend/src/notifications/notification-state.spec.ts`

**Interfaces:**
- Consumes: `Prefs`, `mergePrefs`, `toStored`, `togglePref`, `cyclePreset` из Task 1.
- Produces: `decide(state, holds, now, cooldownMs) → { send: boolean; activeSince: Date | null }`; `PrefsService.get(userId): Promise<Prefs>`, `PrefsService.save(userId, prefs)`, `PrefsService.toggle(userId, key): Promise<Prefs>`, `PrefsService.cycle(userId, key): Promise<Prefs>`, `PrefsService.toggleQuietHours(userId): Promise<Prefs>`, `PrefsService.linkedUsers(): Promise<Array<{ id: string; chatId: string; prefs: Prefs }>>`; `NotificationStateService.check(userId, key, holds, cooldownMs, now): Promise<boolean>`, `NotificationStateService.markSent(userId, key, now)`, `NotificationStateService.canSendEvent(userId, key, cooldownMs, now): Promise<boolean>`; `PrefsModule`.

- [ ] **Step 1: Дописать схему**

В `backend/prisma/schema.prisma`, в модель `User`, после блока полей `telegram*`:

```prisma
  /// Отклонения от дефолтов реестра уведомлений (см. notifications/registry.ts).
  /// JSON, а не таблица: настроек дюжина, читаются всегда целиком и никогда не
  /// участвуют в выборках, а строки на пользователя стоили бы миграции на
  /// каждый новый сигнал.
  notifyPrefs Json?

  notificationStates NotificationState[]
```

В конец файла добавить модель:

```prisma
/// Состояние одного сигнала у одного пользователя. Сигналы шлются по фронту
/// нарастания, и держать этот фронт в памяти процесса нельзя: перезапуск api
/// означал бы повторную рассылку всем сразу — ровно то, что делал
/// VolatilityAlertService своими двумя булевыми полями на всех пользователей.
model NotificationState {
  id     String @id @default(uuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// NotifKey из реестра.
  key    String
  /// Не null, пока условие держится. Обнуляется, когда метрика вернулась под
  /// порог, — тогда следующий всплеск снова считается событием.
  activeSince DateTime?
  lastSentAt  DateTime?

  @@unique([userId, key])
  @@map("notification_states")
}
```

- [ ] **Step 2: Применить схему**

```bash
cd backend && npm run prisma:push && npm run prisma:generate
```

Ожидается: `Your database is now in sync with your Prisma schema` и сгенерированный клиент.

- [ ] **Step 3: Написать падающий тест на решение об отправке**

Создать `backend/src/notifications/notification-state.spec.ts`:

```ts
import { decide } from './notification-state';

const HOUR = 3_600_000;
const T0 = new Date('2026-09-03T10:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

describe('decide', () => {
  it('условие не держится — не шлём и гасим фронт', () => {
    expect(decide({ activeSince: T0, lastSentAt: T0 }, false, at(HOUR), 2 * HOUR)).toEqual({
      send: false,
      activeSince: null,
    });
  });

  it('первый раз держится — шлём', () => {
    expect(decide(null, true, T0, 2 * HOUR)).toEqual({ send: true, activeSince: T0 });
  });

  // Метрика может держаться выше порога сутками. Сигнал — про событие
  // «стало», а не про состояние «есть».
  it('держится второй тик подряд — молчим', () => {
    expect(decide({ activeSince: T0, lastSentAt: T0 }, true, at(5 * 60_000), 2 * HOUR)).toEqual({
      send: false,
      activeSince: T0,
    });
  });

  // Дребезг у самого порога: метрика прыгает туда-сюда каждые пять минут, и
  // без cooldown каждый прыжок был бы новым событием.
  it('новый фронт внутри cooldown — молчим, но фронт отмечаем', () => {
    const t = at(30 * 60_000);
    expect(decide({ activeSince: null, lastSentAt: T0 }, true, t, 2 * HOUR)).toEqual({
      send: false,
      activeSince: t,
    });
  });

  it('новый фронт после cooldown — шлём', () => {
    const t = at(3 * HOUR);
    expect(decide({ activeSince: null, lastSentAt: T0 }, true, t, 2 * HOUR)).toEqual({
      send: true,
      activeSince: t,
    });
  });

  it('нулевой cooldown не мешает следующему фронту', () => {
    const t = at(60_000);
    expect(decide({ activeSince: null, lastSentAt: T0 }, true, t, 0)).toEqual({
      send: true,
      activeSince: t,
    });
  });
});
```

- [ ] **Step 4: Запустить тест и убедиться, что он падает**

```bash
cd backend && npx jest notifications/notification-state
```

Ожидается: FAIL — `Cannot find module './notification-state'`.

- [ ] **Step 5: Написать чистую функцию решения**

Создать `backend/src/notifications/notification-state.ts`:

```ts
export interface StateRow {
  activeSince: Date | null;
  lastSentAt: Date | null;
}

export interface Decision {
  send: boolean;
  /** Каким должен стать activeSince после этого тика. */
  activeSince: Date | null;
}

/**
 * Решение об отправке сигнала с порогом: слать на переходе «не держалось →
 * держится», не чаще cooldown.
 *
 * Фронт отмечается даже тогда, когда отправку съел cooldown. Иначе метрика,
 * зависшая чуть выше порога, выстрелила бы ровно в момент истечения cooldown —
 * то есть по таймеру, а не по событию.
 */
export const decide = (
  state: StateRow | null,
  holds: boolean,
  now: Date,
  cooldownMs: number,
): Decision => {
  if (!holds) return { send: false, activeSince: null };
  if (state?.activeSince) return { send: false, activeSince: state.activeSince };
  const last = state?.lastSentAt?.getTime();
  const cooled = last == null || now.getTime() - last >= cooldownMs;
  return { send: cooled, activeSince: now };
};
```

- [ ] **Step 6: Запустить тест и убедиться, что он проходит**

```bash
cd backend && npx jest notifications/notification-state
```

Ожидается: PASS, 6 тестов.

- [ ] **Step 7: Написать сервисы доступа к базе**

Создать `backend/src/notifications/prefs.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotifKey } from './registry';
import { Prefs, cyclePreset, mergePrefs, togglePref, toStored } from './prefs';

@Injectable()
export class PrefsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<Prefs> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notifyPrefs: true },
    });
    return mergePrefs(user?.notifyPrefs);
  }

  async save(userId: string, prefs: Prefs): Promise<Prefs> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { notifyPrefs: toStored(prefs) as unknown as Prisma.InputJsonValue },
    });
    return prefs;
  }

  async toggle(userId: string, key: NotifKey | string): Promise<Prefs> {
    return this.save(userId, togglePref(await this.get(userId), key));
  }

  async cycle(userId: string, key: NotifKey | string): Promise<Prefs> {
    return this.save(userId, cyclePreset(await this.get(userId), key));
  }

  async toggleQuietHours(userId: string): Promise<Prefs> {
    const prefs = await this.get(userId);
    return this.save(userId, { ...prefs, quietHours: !prefs.quietHours });
  }

  /** Все, у кого привязан чат, вместе с их настройками — один запрос на тик. */
  async linkedUsers(): Promise<Array<{ id: string; chatId: string; prefs: Prefs }>> {
    const rows = await this.prisma.user.findMany({
      where: { telegramChatId: { not: null } },
      select: { id: true, telegramChatId: true, notifyPrefs: true },
    });
    return rows.map((r) => ({
      id: r.id,
      chatId: r.telegramChatId as string,
      prefs: mergePrefs(r.notifyPrefs),
    }));
  }
}
```

Создать `backend/src/notifications/notification-state.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { decide } from './notification-state';

@Injectable()
export class NotificationStateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Прогоняет один тик сигнала с порогом через фронт нарастания и cooldown,
   * записывает новое состояние и отвечает, надо ли слать.
   */
  async check(
    userId: string,
    key: string,
    holds: boolean,
    cooldownMs: number,
    now: Date = new Date(),
  ): Promise<boolean> {
    const row = await this.prisma.notificationState.findUnique({
      where: { userId_key: { userId, key } },
    });
    const verdict = decide(row ?? null, holds, now, cooldownMs);
    const lastSentAt = verdict.send ? now : (row?.lastSentAt ?? null);
    await this.prisma.notificationState.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, activeSince: verdict.activeSince, lastSentAt },
      update: { activeSince: verdict.activeSince, lastSentAt },
    });
    return verdict.send;
  }

  /**
   * Для событийных сигналов, у которых нет «условия»: их фронт — сам факт
   * события, и проверяется только cooldown.
   */
  async canSendEvent(
    userId: string,
    key: string,
    cooldownMs: number,
    now: Date = new Date(),
  ): Promise<boolean> {
    if (cooldownMs <= 0) return true;
    const row = await this.prisma.notificationState.findUnique({
      where: { userId_key: { userId, key } },
    });
    const last = row?.lastSentAt?.getTime();
    return last == null || now.getTime() - last >= cooldownMs;
  }

  async markSent(userId: string, key: string, now: Date = new Date()): Promise<void> {
    await this.prisma.notificationState.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, lastSentAt: now },
      update: { lastSentAt: now },
    });
  }
}
```

Создать `backend/src/notifications/prefs.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrefsService } from './prefs.service';
import { NotificationStateService } from './notification-state.service';

/**
 * Настройки и состояние сигналов — отдельным модулем от чекеров нарочно.
 * Панель `/settings` живёт в TelegramModule и должна читать настройки, а
 * чекеры должны звать TelegramService для отправки: положи всё в один модуль —
 * получишь цикл импортов и forwardRef на ровном месте.
 *
 * PrismaModule объявлен @Global, поэтому импортировать его не нужно.
 */
@Module({
  providers: [PrefsService, NotificationStateService],
  exports: [PrefsService, NotificationStateService],
})
export class PrefsModule {}
```

- [ ] **Step 8: Проверить, что проект собирается**

```bash
cd backend && npx tsc --noEmit -p tsconfig.json
```

Ожидается: без ошибок.

- [ ] **Step 9: Коммит**

```bash
git add backend/prisma/schema.prisma backend/src/notifications/
git commit -m "feat(notifications): notifyPrefs, NotificationState и сервисы доступа"
```

---

## Task 3: Тихие часы и NotifierService

**Files:**
- Create: `backend/src/notifications/quiet-hours.ts`
- Test: `backend/src/notifications/quiet-hours.spec.ts`
- Create: `backend/src/notifications/notifier.service.ts`
- Modify: `backend/src/telegram/telegram.service.ts`
- Modify: `backend/src/telegram/telegram.module.ts`

**Interfaces:**
- Consumes: `PrefsService`, `NotificationStateService` (Task 2); `notifDef`, `isEnabled`, `thresholdOf` (Task 1).
- Produces: `isQuietNow(now): boolean`, `MSK_OFFSET_MS`; `TelegramService.sendText(chatId, text, replyMarkup?): Promise<boolean>`, `TelegramService.chatIdOf(userId): Promise<string | null>`; `NotifierService.maybeSend(userId, key, holds, build): Promise<boolean>`, `NotifierService.sendEvent(userId, key, text, replyMarkup?): Promise<boolean>`.

- [ ] **Step 1: Написать падающий тест на тихие часы**

Создать `backend/src/notifications/quiet-hours.spec.ts`:

```ts
import { isQuietNow } from './quiet-hours';

// МСК = UTC+3, тихо с 23:00 до 08:00 МСК = с 20:00 до 05:00 UTC.
describe('isQuietNow', () => {
  it('день по МСК — не тихо', () => {
    expect(isQuietNow(new Date('2026-09-03T09:00:00Z'))).toBe(false); // 12:00 МСК
  });

  it('поздний вечер по МСК — тихо', () => {
    expect(isQuietNow(new Date('2026-09-03T20:30:00Z'))).toBe(true); // 23:30 МСК
  });

  it('ночь через полночь UTC — тихо', () => {
    expect(isQuietNow(new Date('2026-09-04T01:00:00Z'))).toBe(true); // 04:00 МСК
  });

  it('ровно 08:00 МСК — уже не тихо', () => {
    expect(isQuietNow(new Date('2026-09-04T05:00:00Z'))).toBe(false);
  });

  it('ровно 23:00 МСК — уже тихо', () => {
    expect(isQuietNow(new Date('2026-09-03T20:00:00Z'))).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
cd backend && npx jest notifications/quiet-hours
```

Ожидается: FAIL — `Cannot find module './quiet-hours'`.

- [ ] **Step 3: Написать реализацию тихих часов**

Создать `backend/src/notifications/quiet-hours.ts`:

```ts
/**
 * Тихие часы — 23:00–08:00 по Москве. Пояс зашит константой: поля таймзоны у
 * пользователя нет, а заводить его ради одного окна и одного отчёта рано.
 * Часовой пояс без перехода на летнее время, поэтому сдвига достаточно.
 */
export const MSK_OFFSET_MS = 3 * 3_600_000;

const QUIET_FROM_HOUR = 23;
const QUIET_TO_HOUR = 8;

export const mskHour = (now: Date): number =>
  new Date(now.getTime() + MSK_OFFSET_MS).getUTCHours();

export const isQuietNow = (now: Date = new Date()): boolean => {
  const h = mskHour(now);
  // Окно перешагивает полночь, поэтому это ИЛИ, а не диапазон.
  return h >= QUIET_FROM_HOUR || h < QUIET_TO_HOUR;
};
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
cd backend && npx jest notifications/quiet-hours
```

Ожидается: PASS, 5 тестов.

- [ ] **Step 5: Открыть транспорт в TelegramService**

В `backend/src/telegram/telegram.service.ts` добавить два публичных метода сразу после `getBotUsername()`:

```ts
  /**
   * Отправка готового текста в чат. Публичная точка входа для всех чекеров:
   * `api` остаётся приватной, чтобы никто не слал мимо NotifierService и его
   * проверок включённости.
   */
  async sendText(chatId: string, text: string, replyMarkup?: object): Promise<boolean> {
    if (!this.enabled) return false;
    const res = await this.api('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    return res != null;
  }

  async chatIdOf(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true },
    });
    return user?.telegramChatId ?? null;
  }
```

- [ ] **Step 6: Написать NotifierService**

Создать `backend/src/notifications/notifier.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { TelegramService } from '../telegram/telegram.service';
import { NotificationStateService } from './notification-state.service';
import { PrefsService } from './prefs.service';
import { isEnabled, thresholdOf } from './prefs';
import { NotifKey, notifDef } from './registry';
import { isQuietNow } from './quiet-hours';

export interface Outgoing {
  text: string;
  replyMarkup?: object;
}

/**
 * Единственное место, где принимается решение «слать или нет». Чекеры считают
 * метрику и отдают текст; включённость, тихие часы, фронт нарастания и
 * cooldown — здесь. Иначе каждый новый сигнал заново переписывал бы те же
 * четыре проверки, и какую-нибудь из них однажды забыл бы.
 */
@Injectable()
export class NotifierService {
  private readonly logger = new Logger(NotifierService.name);

  constructor(
    private readonly prefs: PrefsService,
    private readonly state: NotificationStateService,
    private readonly telegram: TelegramService,
  ) {}

  /** Порог текущего пресета — чекеру, чтобы посчитать условие. */
  async thresholdFor(userId: string, key: NotifKey): Promise<number | null> {
    return thresholdOf(await this.prefs.get(userId), key);
  }

  /**
   * Сигнал с условием: `holds` — держится ли метрика выше порога прямо сейчас.
   * `build` вызывается только если отправка разрешена, чтобы не собирать текст
   * (и не ходить за данными) впустую.
   */
  async maybeSend(
    userId: string,
    key: NotifKey,
    holds: boolean,
    build: () => Outgoing,
  ): Promise<boolean> {
    const def = notifDef(key);
    if (!def) return false;
    const prefs = await this.prefs.get(userId);
    if (!isEnabled(prefs, key)) return false;

    const now = new Date();
    const send = await this.state.check(userId, key, holds, def.cooldownMs, now);
    if (!send) return false;
    if (prefs.quietHours && !def.ignoresQuietHours && isQuietNow(now)) return false;

    return this.deliver(userId, build());
  }

  /**
   * Событийный сигнал: событие уже произошло, условия нет. Проверяются
   * включённость, тихие часы и cooldown.
   */
  async sendEvent(userId: string, key: NotifKey, out: Outgoing): Promise<boolean> {
    const def = notifDef(key);
    if (!def) return false;
    const prefs = await this.prefs.get(userId);
    if (!isEnabled(prefs, key)) return false;

    const now = new Date();
    if (prefs.quietHours && !def.ignoresQuietHours && isQuietNow(now)) return false;
    if (!(await this.state.canSendEvent(userId, key, def.cooldownMs, now))) return false;

    const ok = await this.deliver(userId, out);
    if (ok) await this.state.markSent(userId, key, now);
    return ok;
  }

  private async deliver(userId: string, out: Outgoing): Promise<boolean> {
    try {
      const chatId = await this.telegram.chatIdOf(userId);
      if (!chatId) return false;
      return await this.telegram.sendText(chatId, out.text, out.replyMarkup);
    } catch (e) {
      // Провал доставки не должен ронять цикл синхронизации или тик чекера.
      this.logger.warn(`отправка уведомления не удалась: ${e}`);
      return false;
    }
  }
}
```

- [ ] **Step 7: Подключить PrefsModule к TelegramModule**

Заменить содержимое `backend/src/telegram/telegram.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PrefsModule } from '../notifications/prefs.module';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

// PrismaModule is @Global, so PrismaService is available without importing it.
@Module({
  imports: [PrefsModule],
  controllers: [TelegramController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
```

- [ ] **Step 8: Проверить типы**

```bash
cd backend && npx tsc --noEmit -p tsconfig.json && npx jest notifications
```

Ожидается: типы без ошибок, все тесты `notifications/*` проходят.

- [ ] **Step 9: Коммит**

```bash
git add backend/src/notifications/ backend/src/telegram/
git commit -m "feat(notifications): тихие часы и NotifierService как единая точка отправки"
```

---

## Task 4: Панель /settings в боте

**Files:**
- Create: `backend/src/telegram/ids.ts`
- Test: `backend/src/telegram/ids.spec.ts`
- Create: `backend/src/telegram/settings-panel.ts`
- Test: `backend/src/telegram/settings-panel.spec.ts`
- Modify: `backend/src/telegram/telegram.service.ts`

**Interfaces:**
- Consumes: `Prefs`, `presetLabelOf`, `isEnabled` (Task 1); `PrefsService` (Task 2).
- Produces: `packId(uuid): string`, `unpackId(short): string`; `rootPanel(prefs): { text: string; reply_markup: object }`, `categoryPanel(prefs, category)`, `parsePanelCallback(data): PanelAction | null`.

- [ ] **Step 1: Написать падающий тест на упаковку id**

Создать `backend/src/telegram/ids.spec.ts`:

```ts
import { packId, unpackId } from './ids';

const UUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

describe('packId', () => {
  it('сжимает uuid до 22 символов', () => {
    expect(packId(UUID)).toHaveLength(22);
  });

  it('распаковка возвращает исходный uuid', () => {
    expect(unpackId(packId(UUID))).toBe(UUID);
  });

  // callback_data у Telegram ограничен 64 байтами, а кнопка тега закрытой
  // сделки несёт два uuid: в сыром виде это 76 байт и кнопка просто не уходит.
  it('кнопка тега закрытой сделки укладывается в 64 байта', () => {
    const data = `ct|${packId(UUID)}|${packId('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')}`;
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
  });

  it('мусор вместо короткого id даёт пустую строку, а не исключение', () => {
    expect(unpackId('не-id')).toBe('');
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
cd backend && npx jest telegram/ids
```

Ожидается: FAIL — `Cannot find module './ids'`.

- [ ] **Step 3: Написать упаковку id**

Создать `backend/src/telegram/ids.ts`:

```ts
/**
 * uuid в callback_data и обратно. Telegram даёт под callback_data 64 байта, а
 * пара «сделка + тег» в текстовом виде занимает 76 — кнопка просто не уходит.
 * base64url от шестнадцати байт даёт 22 символа вместо 36.
 */
const HEX32 = /^[0-9a-f]{32}$/i;

export const packId = (uuid: string): string =>
  Buffer.from(uuid.replace(/-/g, ''), 'hex').toString('base64url');

export const unpackId = (short: string): string => {
  let hex: string;
  try {
    hex = Buffer.from(short, 'base64url').toString('hex');
  } catch {
    return '';
  }
  if (!HEX32.test(hex)) return '';
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
};
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
cd backend && npx jest telegram/ids
```

Ожидается: PASS, 4 теста.

- [ ] **Step 5: Написать падающий тест на панель**

Создать `backend/src/telegram/settings-panel.spec.ts`:

```ts
import { defaultPrefs, togglePref } from '../notifications/prefs';
import { NOTIF_DEFS } from '../notifications/registry';
import { categoryPanel, parsePanelCallback, rootPanel } from './settings-panel';

type Button = { text: string; callback_data: string };
const buttons = (markup: { inline_keyboard: Button[][] }): Button[] =>
  markup.inline_keyboard.flat();

describe('rootPanel', () => {
  it('показывает три категории и переключатель тихих часов', () => {
    const panel = rootPanel(defaultPrefs());
    const texts = buttons(panel.reply_markup).map((b) => b.text);
    expect(texts.some((t) => t.includes('Рынок'))).toBe(true);
    expect(texts.some((t) => t.includes('Сделки'))).toBe(true);
    expect(texts.some((t) => t.includes('Отчёты'))).toBe(true);
    expect(texts.some((t) => t.includes('Тихие часы'))).toBe(true);
  });

  it('считает включённые в категории', () => {
    // По умолчанию из семи рыночных включён один — mkt.price1h.
    const panel = rootPanel(defaultPrefs());
    expect(buttons(panel.reply_markup).some((b) => b.text.includes('1 из 7'))).toBe(true);
  });

  it('счётчик реагирует на переключение', () => {
    const panel = rootPanel(togglePref(defaultPrefs(), 'mkt.vol1h'));
    expect(buttons(panel.reply_markup).some((b) => b.text.includes('2 из 7'))).toBe(true);
  });
});

describe('categoryPanel', () => {
  it('рисует по кнопке на сигнал плюс кнопки порогов', () => {
    const panel = categoryPanel(defaultPrefs(), 'market');
    const data = buttons(panel.reply_markup).map((b) => b.callback_data);
    expect(data).toContain('nt|mkt.vol1h');
    expect(data).toContain('nv|mkt.vol1h');
    expect(data).toContain('nb');
  });

  it('у сигнала без порога кнопки порога нет', () => {
    const panel = categoryPanel(defaultPrefs(), 'trade');
    const data = buttons(panel.reply_markup).map((b) => b.callback_data);
    expect(data).toContain('nt|trade.opened');
    expect(data).not.toContain('nv|trade.opened');
  });

  it('включённый сигнал помечен галочкой, выключенный — нет', () => {
    const panel = categoryPanel(defaultPrefs(), 'market');
    const btns = buttons(panel.reply_markup);
    expect(btns.find((b) => b.callback_data === 'nt|mkt.price1h')?.text).toContain('✅');
    expect(btns.find((b) => b.callback_data === 'nt|mkt.vol1h')?.text).toContain('⬜');
  });

  it('кнопка порога подписана текущим пресетом', () => {
    const panel = categoryPanel(defaultPrefs(), 'market');
    const btn = buttons(panel.reply_markup).find((b) => b.callback_data === 'nv|mkt.price1h');
    expect(btn?.text).toContain('≥ 3.5%');
  });
});

// Ограничение Telegram, из-за которого buildTagKeyboard уже вынужден
// фильтровать кнопки: превышение не ошибка, кнопка просто не работает.
describe('длина callback_data', () => {
  it('все кнопки панели укладываются в 64 байта', () => {
    const panels = [
      rootPanel(defaultPrefs()),
      ...(['market', 'trade', 'report'] as const).map((c) => categoryPanel(defaultPrefs(), c)),
    ];
    for (const p of panels) {
      for (const b of buttons(p.reply_markup)) {
        expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64);
      }
    }
  });

  it('ключи реестра сами по себе не длиннее допустимого', () => {
    for (const def of NOTIF_DEFS) {
      expect(Buffer.byteLength(`nt|${def.key}`)).toBeLessThanOrEqual(64);
    }
  });
});

describe('parsePanelCallback', () => {
  it('разбирает открытие категории', () => {
    expect(parsePanelCallback('ns|market')).toEqual({ kind: 'category', category: 'market' });
  });

  it('разбирает тумблер и порог', () => {
    expect(parsePanelCallback('nt|mkt.vol1h')).toEqual({ kind: 'toggle', key: 'mkt.vol1h' });
    expect(parsePanelCallback('nv|mkt.vol1h')).toEqual({ kind: 'preset', key: 'mkt.vol1h' });
  });

  it('разбирает тихие часы и возврат', () => {
    expect(parsePanelCallback('nq')).toEqual({ kind: 'quiet' });
    expect(parsePanelCallback('nb')).toEqual({ kind: 'root' });
  });

  it('чужое и мусорное не разбирает', () => {
    expect(parsePanelCallback('pt|BTCUSDT|long|x')).toBeNull();
    expect(parsePanelCallback('ns|нетакой')).toBeNull();
    expect(parsePanelCallback('nt|mkt.gone')).toBeNull();
    expect(parsePanelCallback('')).toBeNull();
  });
});
```

- [ ] **Step 6: Запустить тест и убедиться, что он падает**

```bash
cd backend && npx jest telegram/settings-panel
```

Ожидается: FAIL — `Cannot find module './settings-panel'`.

- [ ] **Step 7: Написать панель**

Создать `backend/src/telegram/settings-panel.ts`:

```ts
import { Prefs, isEnabled, presetLabelOf } from '../notifications/prefs';
import {
  CATEGORIES,
  CATEGORY_META,
  NotifCategory,
  defsByCategory,
  notifDef,
} from '../notifications/registry';

/**
 * Панель `/settings`. Два уровня — категории и сигналы внутри категории:
 * двенадцать тумблеров вместе со строками порогов в одном сообщении
 * превращаются в простыню, в которой не найти нужное.
 *
 * Префиксы callback_data короткие (`ns`, `nt`, `nv`, `nq`, `nb`) по той же
 * причине, по которой они короткие у кнопок тегов: 64 байта — это весь бюджет.
 */

interface Button {
  text: string;
  callback_data: string;
}

export interface Panel {
  text: string;
  reply_markup: { inline_keyboard: Button[][] };
}

export type PanelAction =
  | { kind: 'root' }
  | { kind: 'category'; category: NotifCategory }
  | { kind: 'toggle'; key: string }
  | { kind: 'preset'; key: string }
  | { kind: 'quiet' };

const mark = (on: boolean) => (on ? '✅' : '⬜');

export const rootPanel = (prefs: Prefs): Panel => {
  const rows: Button[][] = CATEGORIES.map((category) => {
    const defs = defsByCategory(category);
    const on = defs.filter((d) => isEnabled(prefs, d.key)).length;
    const meta = CATEGORY_META[category];
    return [
      {
        text: `${meta.emoji} ${meta.title} · ${on} из ${defs.length}`,
        callback_data: `ns|${category}`,
      },
    ];
  });
  rows.push([
    {
      text: `${mark(prefs.quietHours)} Тихие часы 23:00–08:00`,
      callback_data: 'nq',
    },
  ]);
  return {
    text: '<b>Уведомления</b>\nВыбери раздел, чтобы включить или выключить сигналы.',
    reply_markup: { inline_keyboard: rows },
  };
};

export const categoryPanel = (prefs: Prefs, category: NotifCategory): Panel => {
  const meta = CATEGORY_META[category];
  const rows: Button[][] = [];
  for (const def of defsByCategory(category)) {
    const on = isEnabled(prefs, def.key);
    rows.push([
      { text: `${mark(on)} ${def.emoji} ${def.title}`, callback_data: `nt|${def.key}` },
    ]);
    const label = presetLabelOf(prefs, def.key);
    // Порог показывается только у включённого сигнала: у выключенного он
    // ничего не значит и только удлиняет список.
    if (label && on) {
      rows.push([{ text: `порог: ${label} ▸`, callback_data: `nv|${def.key}` }]);
    }
  }
  rows.push([{ text: '◀ Назад', callback_data: 'nb' }]);
  return {
    text: `<b>${meta.emoji} ${meta.title}</b>`,
    reply_markup: { inline_keyboard: rows },
  };
};

const isCategory = (v: string): v is NotifCategory =>
  (CATEGORIES as string[]).includes(v);

export const parsePanelCallback = (data: string): PanelAction | null => {
  const [kind, arg] = String(data ?? '').split('|');
  if (kind === 'nb') return { kind: 'root' };
  if (kind === 'nq') return { kind: 'quiet' };
  if (kind === 'ns') return arg && isCategory(arg) ? { kind: 'category', category: arg } : null;
  if (kind === 'nt') return arg && notifDef(arg) ? { kind: 'toggle', key: arg } : null;
  if (kind === 'nv') return arg && notifDef(arg) ? { kind: 'preset', key: arg } : null;
  return null;
};
```

- [ ] **Step 8: Запустить тест и убедиться, что он проходит**

```bash
cd backend && npx jest telegram/settings-panel
```

Ожидается: PASS, 13 тестов.

- [ ] **Step 9: Подключить панель к боту**

В `backend/src/telegram/telegram.service.ts`:

1) добавить импорты сверху:

```ts
import { PrefsService } from '../notifications/prefs.service';
import { categoryPanel, parsePanelCallback, rootPanel } from './settings-panel';
```

2) добавить `PrefsService` в конструктор:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly prefs: PrefsService,
  ) {}
```

3) в `handleMessage`, перед разбором `/start`, добавить ветку команды:

```ts
    if (/^\/settings\b/.test(text)) {
      const user = await this.prisma.user.findUnique({ where: { telegramChatId: chatId } });
      if (!user) {
        await this.api('sendMessage', {
          chat_id: chatId,
          text: 'Сначала привяжи аккаунт: открой настройки в приложении и нажми «Подключить Telegram».',
        });
        return;
      }
      const panel = rootPanel(await this.prefs.get(user.id));
      await this.api('sendMessage', {
        chat_id: chatId,
        text: panel.text,
        parse_mode: 'HTML',
        reply_markup: panel.reply_markup,
      });
      return;
    }
```

4) в `handleCallback`, сразу после получения `user` и до разбора `cb.data` на теги, добавить ветку панели:

```ts
    const panelAction = parsePanelCallback(String(cb.data ?? ''));
    if (panelAction) {
      let prefs = await this.prefs.get(user.id);
      if (panelAction.kind === 'toggle') prefs = await this.prefs.toggle(user.id, panelAction.key);
      if (panelAction.kind === 'preset') prefs = await this.prefs.cycle(user.id, panelAction.key);
      if (panelAction.kind === 'quiet') prefs = await this.prefs.toggleQuietHours(user.id);

      // Экран остаётся тот же, на котором нажали: тумблер не должен
      // выкидывать человека из категории обратно в корень.
      const panel =
        panelAction.kind === 'category'
          ? categoryPanel(prefs, panelAction.category)
          : panelAction.kind === 'root' || panelAction.kind === 'quiet'
            ? rootPanel(prefs)
            : categoryPanel(prefs, notifDef(panelAction.key)!.category);

      if (messageId != null) {
        await this.api('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: panel.text,
          parse_mode: 'HTML',
          reply_markup: panel.reply_markup,
        });
      }
      await answer();
      return;
    }
```

5) добавить импорт `notifDef`:

```ts
import { notifDef } from '../notifications/registry';
```

6) заменить текст успешной привязки в конце `handleMessage`:

```ts
    await this.api('sendMessage', {
      chat_id: chatId,
      text: [
        '✅ Готово!',
        '',
        'Сразу включены: карточка открытой позиции с кнопками тегов, итог закрытой сделки, отчёт за неделю и сообщение о сбое синхронизации. Из рыночных — резкое движение цены BTC за час.',
        '',
        'Всё остальное и пороги — в /settings.',
      ].join('\n'),
    });
```

7) в ответе на голый `/start` заменить «на странице статистики» на «на странице настроек»:

```ts
        text: 'Привет! Чтобы привязать аккаунт, нажми «Подключить Telegram» на странице настроек в приложении и открой ссылку оттуда.',
```

- [ ] **Step 10: Проверить типы и прогнать все тесты бэкенда**

```bash
cd backend && npx tsc --noEmit -p tsconfig.json && npx jest
```

Ожидается: типы без ошибок, все тесты зелёные.

- [ ] **Step 11: Коммит**

```bash
git add backend/src/telegram/
git commit -m "feat(telegram): панель /settings с тумблерами и пресетами порогов"
```

---

## Task 5: Метрики рыночных сигналов

**Files:**
- Create: `backend/src/notifications/market-metrics.ts`
- Test: `backend/src/notifications/market-metrics.spec.ts`

**Interfaces:**
- Consumes: `HourlyBucket`, `WeekdayBucket` из `market-events/market-events.service.ts`.
- Produces: `HourCandle`, `parseKline(list)`, `hourMovePct(c)`, `rangePct(c)`, `rangeRatio(last, baseline)`, `bookSpreadPct(s)`, `spreadRatio(last, baseline)`, `fngHolds(value, low)`, `lsHolds(buyPct, threshold)`, `topQuartileHours(hourly)`, `weakWeekdays(weekday)`.

- [ ] **Step 1: Написать падающий тест**

Создать `backend/src/notifications/market-metrics.spec.ts`:

```ts
import {
  HourCandle,
  bookSpreadPct,
  fngHolds,
  hourMovePct,
  lsHolds,
  parseKline,
  rangePct,
  rangeRatio,
  spreadRatio,
  topQuartileHours,
  weakWeekdays,
} from './market-metrics';

const candle = (o: number, h: number, l: number, c: number, t = 1e6): HourCandle => ({
  open: o,
  high: h,
  low: l,
  close: c,
  turnover: t,
});

describe('parseKline', () => {
  // Bybit отдаёт свечи строками и от новых к старым — обе особенности уже
  // приходилось учитывать в getVolatility, и обе легко забыть.
  it('переводит строки в числа и сортирует от старых к новым', () => {
    const raw = [
      ['1700003600000', '2', '3', '1', '2.5', '10', '100'],
      ['1700000000000', '1', '2', '0.5', '1.5', '10', '50'],
    ];
    const out = parseKline(raw);
    expect(out).toHaveLength(2);
    expect(out[0].open).toBe(1);
    expect(out[1].open).toBe(2);
    expect(out[1].turnover).toBe(100);
  });

  it('пустой ответ даёт пустой список, а не исключение', () => {
    expect(parseKline(undefined)).toEqual([]);
  });
});

describe('hourMovePct', () => {
  it('считает модуль изменения свечи', () => {
    expect(hourMovePct(candle(100, 105, 99, 103))).toBeCloseTo(3);
    expect(hourMovePct(candle(100, 105, 95, 97))).toBeCloseTo(3);
  });

  it('нулевой open даёт 0, а не Infinity', () => {
    expect(hourMovePct(candle(0, 1, 0, 1))).toBe(0);
  });
});

describe('rangeRatio', () => {
  it('делит размах свечи на средний размах базы', () => {
    // Свеча: (110−100)/100 = 10%. База: две по 2% и 4% → среднее 3%.
    const base = [candle(100, 102, 100, 101), candle(100, 104, 100, 103)];
    expect(rangeRatio(candle(100, 110, 100, 105), base)).toBeCloseTo(10 / 3);
  });

  it('пустая база даёт null — сравнивать не с чем', () => {
    expect(rangeRatio(candle(100, 110, 100, 105), [])).toBeNull();
  });

  it('rangePct считает размах, а не направление', () => {
    // Свеча с длинными тенями и нулевым телом всё равно волатильна.
    expect(rangePct(candle(100, 106, 96, 100))).toBeCloseTo(10);
  });
});

describe('bookSpreadPct и spreadRatio', () => {
  it('раздвижка — разность центров сторон, нормированная ценой', () => {
    expect(bookSpreadPct({ price: 100, bidCenter: 99, askCenter: 101 })).toBeCloseTo(2);
  });

  it('spreadRatio сравнивает со средней по базе', () => {
    const base = [
      { price: 100, bidCenter: 99.5, askCenter: 100.5 },
      { price: 100, bidCenter: 99.5, askCenter: 100.5 },
    ];
    expect(spreadRatio({ price: 100, bidCenter: 99, askCenter: 101 }, base)).toBeCloseTo(2);
  });

  it('нулевая база даёт null, а не Infinity', () => {
    const base = [{ price: 100, bidCenter: 100, askCenter: 100 }];
    expect(spreadRatio({ price: 100, bidCenter: 99, askCenter: 101 }, base)).toBeNull();
  });
});

describe('fngHolds', () => {
  // value пресета — нижняя граница, верхняя симметрична: 25 → 25/75.
  it('срабатывает на обоих концах', () => {
    expect(fngHolds(20, 25)).toBe(true);
    expect(fngHolds(80, 25)).toBe(true);
  });

  it('в середине не срабатывает', () => {
    expect(fngHolds(50, 25)).toBe(false);
  });

  it('на самой границе срабатывает', () => {
    expect(fngHolds(25, 25)).toBe(true);
    expect(fngHolds(75, 25)).toBe(true);
  });
});

describe('lsHolds', () => {
  it('срабатывает на перекосе в любую сторону', () => {
    expect(lsHolds(72, 70)).toBe(true);
    expect(lsHolds(28, 70)).toBe(true);
    expect(lsHolds(55, 70)).toBe(false);
  });
});

describe('topQuartileHours', () => {
  it('отбирает четверть часов с наибольшей волатильностью', () => {
    const hourly = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      samples: 100,
      winRateLongPct: 50,
      avgChangePct: 0,
      avgVolatilityPct: hour, // 0..23, верхняя четверть — 18..23
    }));
    const top = topQuartileHours(hourly);
    expect(top).toHaveLength(6);
    expect(top).toContain(23);
    expect(top).not.toContain(17);
  });

  // Часы без данных нельзя объявлять спокойными: их просто нечем оценить.
  it('часы без выборки не попадают в отбор', () => {
    const hourly = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      samples: hour === 23 ? 0 : 100,
      winRateLongPct: 50,
      avgChangePct: 0,
      avgVolatilityPct: hour,
    }));
    expect(topQuartileHours(hourly)).not.toContain(23);
  });
});

describe('weakWeekdays', () => {
  it('отбирает дни с винрейтом лонга ниже 50%', () => {
    const weekday = Array.from({ length: 7 }, (_, wd) => ({
      weekday: wd,
      days: 100,
      upDays: 50,
      winRateLongPct: wd === 2 ? 44 : 52,
      avgChangePct: 0,
    }));
    expect(weakWeekdays(weekday)).toEqual([2]);
  });

  it('день без выборки не считается слабым', () => {
    const weekday = Array.from({ length: 7 }, (_, wd) => ({
      weekday: wd,
      days: wd === 3 ? 0 : 100,
      upDays: 0,
      winRateLongPct: 0,
      avgChangePct: 0,
    }));
    expect(weakWeekdays(weekday)).not.toContain(3);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
cd backend && npx jest notifications/market-metrics
```

Ожидается: FAIL — `Cannot find module './market-metrics'`.

- [ ] **Step 3: Написать метрики**

Создать `backend/src/notifications/market-metrics.ts`:

```ts
import { HourlyBucket, WeekdayBucket } from '../market-events/market-events.service';

/**
 * Чистые метрики рыночных сигналов. Отдельным файлом от сервиса, потому что
 * это единственная часть, которую можно проверить тестом без сети, — и
 * единственная, в которой возможна содержательная ошибка.
 */

export interface HourCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  turnover: number;
}

/**
 * Bybit отдаёт kline строками и от новых к старым: [start, o, h, l, c, v, turnover].
 * Обе особенности уже учтены в AnalyticsService.getVolatility — здесь тот же
 * разбор, вынесенный отдельно, чтобы не дублировать сортировку в каждом чекере.
 */
export const parseKline = (list: unknown): HourCandle[] => {
  if (!Array.isArray(list)) return [];
  return list
    .slice()
    .sort((a: any, b: any) => Number(a[0]) - Number(b[0]))
    .map((k: any) => ({
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      turnover: parseFloat(k[6]),
    }));
};

/** Модуль изменения свечи в процентах: «на сколько увело за час». */
export const hourMovePct = (c: HourCandle): number =>
  c.open > 0 ? (Math.abs(c.close - c.open) / c.open) * 100 : 0;

/**
 * Размах свечи в процентах. Не то же, что движение: свеча, которую сводило на
 * пять процентов в обе стороны и вернуло в открытие, волатильна, хотя её
 * изменение равно нулю.
 */
export const rangePct = (c: HourCandle): number =>
  c.open > 0 ? ((c.high - c.low) / c.open) * 100 : 0;

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Во сколько раз размах последней свечи выше среднего по базе. */
export const rangeRatio = (last: HourCandle, baseline: HourCandle[]): number | null => {
  if (baseline.length === 0) return null;
  const base = mean(baseline.map(rangePct));
  if (base <= 0) return null;
  return rangePct(last) / base;
};

export interface BookPoint {
  price: number;
  bidCenter: number;
  askCenter: number;
}

/**
 * Раздвижка книги: расстояние между средневзвешенными центрами сторон,
 * нормированное ценой. Глубины в снимке нет, поэтому «ликвидность упала»
 * меряется именно так — объём уехал от лучших котировок.
 */
export const bookSpreadPct = (s: BookPoint): number =>
  s.price > 0 ? ((s.askCenter - s.bidCenter) / s.price) * 100 : 0;

export const spreadRatio = (last: BookPoint, baseline: BookPoint[]): number | null => {
  if (baseline.length === 0) return null;
  const base = mean(baseline.map(bookSpreadPct));
  if (base <= 0) return null;
  return bookSpreadPct(last) / base;
};

/** Индекс страха и жадности на краю: low — нижняя граница, верхняя симметрична. */
export const fngHolds = (value: number, low: number): boolean =>
  value <= low || value >= 100 - low;

/** Перекос long/short: threshold — доля лонгов, шорт-сторона симметрична. */
export const lsHolds = (buyPct: number, threshold: number): boolean =>
  buyPct >= threshold || buyPct <= 100 - threshold;

/** Четверть часов суток с наибольшей средней волатильностью. */
export const topQuartileHours = (hourly: HourlyBucket[]): number[] => {
  const withData = hourly.filter((h) => h.samples > 0);
  const count = Math.max(1, Math.round(withData.length / 4));
  return withData
    .slice()
    .sort((a, b) => b.avgVolatilityPct - a.avgVolatilityPct)
    .slice(0, count)
    .map((h) => h.hour);
};

/**
 * Дни недели, в которые лонг исторически закрывался в плюс реже, чем в
 * половине случаев. Порог именно 50%, а не нижний квартиль: «слабый» здесь
 * значит «монетка не в твою пользу», а не «слабее остальных дней».
 */
export const weakWeekdays = (weekday: WeekdayBucket[]): number[] =>
  weekday.filter((w) => w.days > 0 && w.winRateLongPct < 50).map((w) => w.weekday);
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
cd backend && npx jest notifications/market-metrics
```

Ожидается: PASS, 18 тестов.

- [ ] **Step 5: Коммит**

```bash
git add backend/src/notifications/market-metrics.ts backend/src/notifications/market-metrics.spec.ts
git commit -m "feat(notifications): метрики рыночных сигналов"
```

---

## Task 6: MarketAlertsService вместо VolatilityAlertService

**Files:**
- Create: `backend/src/notifications/market-alerts.service.ts`
- Create: `backend/src/notifications/notifications.module.ts`
- Delete: `backend/src/analytics/volatility-alert.service.ts`
- Modify: `backend/src/analytics/analytics.module.ts`
- Modify: `backend/src/market-events/market-events.module.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/telegram/telegram.service.ts`

**Interfaces:**
- Consumes: `NotifierService` (Task 3), `PrefsService` (Task 2), метрики (Task 5), `AnalyticsService.getVolatility/getFearAndGreed/getLongShortRatio`, `MarketEventsService.getHourlyStats/getCorrelation`.
- Produces: `MarketAlertsService` (без публичного API — работает по таймеру), `NotificationsModule`.

- [ ] **Step 1: Открыть нужные сервисы наружу**

В `backend/src/analytics/analytics.module.ts` — убрать удаляемый сервис и экспортировать `AnalyticsService`:

```ts
import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { LiquiditySnapshotService } from './liquidity-snapshot.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, LiquiditySnapshotService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
```

В `backend/src/market-events/market-events.module.ts` добавить `exports: [MarketEventsService]` в декоратор `@Module`, сохранив существующие `controllers` и `providers`.

Удалить файл:

```bash
git rm backend/src/analytics/volatility-alert.service.ts
```

- [ ] **Step 2: Написать MarketAlertsService**

Создать `backend/src/notifications/market-alerts.service.ts`:

```ts
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import { MarketEventsService } from '../market-events/market-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { isEnabled, thresholdOf } from './prefs';
import { PrefsService } from './prefs.service';
import { NotifierService } from './notifier.service';
import {
  HourCandle,
  bookSpreadPct,
  fngHolds,
  hourMovePct,
  lsHolds,
  parseKline,
  rangePct,
  rangeRatio,
  spreadRatio,
  topQuartileHours,
  weakWeekdays,
} from './market-metrics';

const SYMBOL = 'BTCUSDT';
const TICK_MS = 5 * 60_000;
const BASELINE_HOURS = 7 * 24;
/** Сколько снимков стакана берём за базу: снимок раз в 15 минут → неделя. */
const BOOK_BASELINE_POINTS = 7 * 24 * 4;
/** За сколько минут до начала часа предупреждаем о нём. */
const HOUR_LEAD_MIN = 10;

const fmtUsdCompact = (v: number): string => {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toFixed(0)}`;
};

/**
 * Семь рыночных сигналов по BTC, один тик на все. Заменяет
 * VolatilityAlertService: тот держал фронт нарастания в двух булевых полях
 * процесса, одинаковых для всех пользователей, — с персональными порогами
 * такой фронт неверен, а после перезапуска ещё и рассылался заново.
 *
 * Данные тянутся один раз на тик и раздаются всем пользователям: пороги у всех
 * разные, а рынок один.
 */
@Injectable()
export class MarketAlertsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MarketAlertsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly analytics: AnalyticsService,
    private readonly marketEvents: MarketEventsService,
    private readonly prisma: PrismaService,
    private readonly prefs: PrefsService,
    private readonly notifier: NotifierService,
  ) {}

  onApplicationBootstrap() {
    this.tick().catch((e) => this.logger.warn(`первый тик рыночных сигналов не прошёл: ${e}`));
    this.timer = setInterval(() => {
      this.tick().catch((e) => this.logger.warn(`тик рыночных сигналов не прошёл: ${e}`));
    }, TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const users = await this.prefs.linkedUsers();
      if (users.length === 0) return;
      // Считаем, что нужно, только если хоть кому-то это включено: тик не
      // должен ходить в шесть внешних API ради выключенных сигналов.
      const wanted = (key: string) => users.some((u) => isEnabled(u.prefs, key));

      const candles = wanted('mkt.price1h') || wanted('mkt.vol1h') ? await this.candles() : [];
      const last = candles.at(-1) ?? null;
      const baseline = candles.slice(0, -1);

      for (const user of users) {
        await this.priceMove(user.id, last);
        await this.volatility(user.id, last, baseline);
      }
      if (wanted('mkt.volume')) await this.volume(users.map((u) => u.id));
      if (wanted('mkt.fng')) await this.fearAndGreed(users.map((u) => u.id));
      if (wanted('mkt.ls')) await this.longShort(users.map((u) => u.id));
      if (wanted('mkt.book')) await this.book(users.map((u) => u.id));
      if (wanted('mkt.hour')) await this.volatileHour(users.map((u) => u.id));
    } finally {
      this.running = false;
    }
  }

  /** Часовые свечи берём напрямую с биржи: hourly_prices отстаёт до получаса. */
  private async candles(): Promise<HourCandle[]> {
    try {
      const res = await fetch(
        `https://api.bybit.com/v5/market/kline?category=linear&symbol=${SYMBOL}&interval=60&limit=${BASELINE_HOURS + 1}`,
      );
      if (!res.ok) throw new Error(`kline ${res.status}`);
      const json = await res.json();
      return parseKline(json.result?.list);
    } catch (e) {
      this.logger.warn(`свечи BTC недоступны: ${e}`);
      return [];
    }
  }

  private async priceMove(userId: string, last: HourCandle | null): Promise<void> {
    if (!last) return;
    const threshold = await this.notifier.thresholdFor(userId, 'mkt.price1h');
    if (threshold == null) return;
    const move = hourMovePct(last);
    const up = last.close >= last.open;
    await this.notifier.maybeSend(userId, 'mkt.price1h', move >= threshold, () => ({
      text: [
        `${up ? '🟢' : '🔴'} BTC ${up ? '+' : '−'}${move.toFixed(2)}% за час`,
        `Цена: <b>${last.close.toFixed(0)}</b>`,
      ].join('\n'),
    }));
  }

  private async volatility(
    userId: string,
    last: HourCandle | null,
    baseline: HourCandle[],
  ): Promise<void> {
    if (!last) return;
    const threshold = await this.notifier.thresholdFor(userId, 'mkt.vol1h');
    if (threshold == null) return;
    const ratio = rangeRatio(last, baseline);
    if (ratio == null) return;
    await this.notifier.maybeSend(userId, 'mkt.vol1h', ratio >= threshold, () => ({
      text: [
        `⚡ Волатильность BTC ×${ratio.toFixed(1)} к обычному часу`,
        `Размах часа: <b>${rangePct(last).toFixed(2)}%</b>`,
      ].join('\n'),
    }));
  }

  private async volume(userIds: string[]): Promise<void> {
    const snap = await this.analytics.getVolatility(SYMBOL).catch(() => null);
    if (!snap) return;
    const side =
      snap.dominantSide === 'buy'
        ? '🟢 перевес в покупку'
        : snap.dominantSide === 'sell'
          ? '🔴 перевес в продажу'
          : '⚪ без явного перевеса';
    for (const userId of userIds) {
      const threshold = await this.notifier.thresholdFor(userId, 'mkt.volume');
      if (threshold == null) continue;
      await this.notifier.maybeSend(
        userId,
        'mkt.volume',
        snap.volumeChangePct >= threshold,
        () => ({
          text: [
            '📊 Объём BTC выше обычного',
            `Сутки: <b>${fmtUsdCompact(snap.volume24hUsd)}</b> (+${snap.volumeChangePct.toFixed(1)}% к среднему за неделю)`,
            side,
          ].join('\n'),
        }),
      );
    }
  }

  private async fearAndGreed(userIds: string[]): Promise<void> {
    const fng = await this.analytics.getFearAndGreed().catch(() => null);
    if (!fng) return;
    for (const userId of userIds) {
      const threshold = await this.notifier.thresholdFor(userId, 'mkt.fng');
      if (threshold == null) continue;
      await this.notifier.maybeSend(userId, 'mkt.fng', fngHolds(fng.value, threshold), () => ({
        text: `😱 Fear & Greed: <b>${fng.value}</b> — ${fng.classification}`,
      }));
    }
  }

  private async longShort(userIds: string[]): Promise<void> {
    // getLongShortRatio бросает HttpException — для фонового тика это просто
    // «в этот раз без сигнала».
    const data = await this.analytics.getLongShortRatio(SYMBOL).catch(() => null);
    const point = data?.points.at(-1);
    if (!point) return;
    const buyPct = point.buyRatio * 100;
    for (const userId of userIds) {
      const threshold = await this.notifier.thresholdFor(userId, 'mkt.ls');
      if (threshold == null) continue;
      await this.notifier.maybeSend(userId, 'mkt.ls', lsHolds(buyPct, threshold), () => ({
        text: [
          '⚖️ Перекос позиций на Bybit',
          `Лонги: <b>${buyPct.toFixed(1)}%</b> · шорты: ${(100 - buyPct).toFixed(1)}%`,
        ].join('\n'),
      }));
    }
  }

  private async book(userIds: string[]): Promise<void> {
    const rows = await this.prisma.liquiditySnapshot.findMany({
      where: { symbol: SYMBOL },
      orderBy: { ts: 'desc' },
      take: BOOK_BASELINE_POINTS,
      select: { price: true, bidCenter: true, askCenter: true },
    });
    const last = rows[0];
    if (!last || rows.length < 2) return;
    const ratio = spreadRatio(last, rows.slice(1));
    if (ratio == null) return;
    for (const userId of userIds) {
      const threshold = await this.notifier.thresholdFor(userId, 'mkt.book');
      if (threshold == null) continue;
      await this.notifier.maybeSend(userId, 'mkt.book', ratio >= threshold, () => ({
        text: [
          `📖 Стакан BTC разъехался: ×${ratio.toFixed(1)} к обычному`,
          `Раздвижка: <b>${bookSpreadPct(last).toFixed(3)}%</b> от цены`,
        ].join('\n'),
      }));
    }
  }

  private async volatileHour(userIds: string[]): Promise<void> {
    const now = new Date();
    const minutes = now.getUTCMinutes();
    // Сигнал предупреждающий, поэтому он живёт последние десять минут часа.
    const holds = minutes >= 60 - HOUR_LEAD_MIN;
    const nextHour = (now.getUTCHours() + 1) % 24;

    const [{ hourly }, { weekday }] = await Promise.all([
      this.marketEvents.getHourlyStats(),
      this.marketEvents.getCorrelation(),
    ]);
    const top = topQuartileHours(hourly);
    const weak = weakWeekdays(weekday);
    const hourIsTop = top.includes(nextHour);

    for (const userId of userIds) {
      const mode = await this.notifier.thresholdFor(userId, 'mkt.hour');
      if (mode == null) continue;
      await this.notifier.maybeSend(userId, 'mkt.hour', holds && hourIsTop, () => {
        const lines = [
          `⏰ Через ${HOUR_LEAD_MIN} минут начинается ${String(nextHour).padStart(2, '0')}:00 UTC`,
          'Исторически один из самых волатильных часов суток.',
        ];
        // mode = 1 — «час + слабый день»: строка про день добавляется к тому
        // же сообщению, отдельным сигналом день не ходит.
        if (mode === 1 && weak.includes(now.getUTCDay())) {
          lines.push('Сегодня лонг закрывается в плюс реже, чем в половине случаев.');
        }
        return { text: lines.join('\n') };
      });
    }
  }
}
```

- [ ] **Step 3: Собрать модуль уведомлений**

Создать `backend/src/notifications/notifications.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { MarketEventsModule } from '../market-events/market-events.module';
import { TelegramModule } from '../telegram/telegram.module';
import { PrefsModule } from './prefs.module';
import { NotifierService } from './notifier.service';
import { MarketAlertsService } from './market-alerts.service';

@Module({
  imports: [PrefsModule, TelegramModule, AnalyticsModule, MarketEventsModule],
  providers: [NotifierService, MarketAlertsService],
  exports: [NotifierService],
})
export class NotificationsModule {}
```

В `backend/src/app.module.ts` добавить импорт и запись в `imports` после `MarketEventsModule`:

```ts
import { NotificationsModule } from './notifications/notifications.module';
```

- [ ] **Step 4: Убрать осиротевшие методы уведомлений из TelegramService**

Из `backend/src/telegram/telegram.service.ts` удалить методы `notifyVolatilitySpike` и `notifyVolumeSpike` вместе с хелпером `fmtUsdCompact` — их единственный вызывающий удалён, а тексты теперь собирает `MarketAlertsService`.

- [ ] **Step 5: Проверить сборку и тесты**

```bash
cd backend && npx tsc --noEmit -p tsconfig.json && npx jest
```

Ожидается: типы без ошибок (в частности, нигде не осталось ссылок на `VolatilityAlertService`), все тесты зелёные.

- [ ] **Step 6: Коммит**

```bash
git add -A backend/src
git commit -m "feat(notifications): семь рыночных сигналов с персональными порогами"
```

---

## Task 7: Сигналы по сделкам

**Files:**
- Create: `backend/src/notifications/trade-alerts.service.ts`
- Modify: `backend/src/notifications/notifications.module.ts`
- Modify: `backend/src/trades/trade-sync.service.ts`
- Modify: `backend/src/trades/trades.module.ts`
- Modify: `backend/src/telegram/telegram.service.ts`

**Interfaces:**
- Consumes: `NotifierService` (Task 3), `packId`/`unpackId` (Task 4), `TelegramService.buildTagKeyboard` (существующий, станет публичным).
- Produces: `TradeAlertsService.positionOpened(userId, pos: OpenedPositionInfo): Promise<void>`, `TradeAlertsService.tradesClosed(userId, insertedAfter: Date): Promise<void>`, `TradeAlertsService.overtradeCheck(userId): Promise<void>`, `TradeAlertsService.syncOutcome(userId, ok: boolean): Promise<void>`.

- [ ] **Step 1: Написать TradeAlertsService**

Создать `backend/src/notifications/trade-alerts.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenedPositionInfo, TelegramService } from '../telegram/telegram.service';
import { packId } from '../telegram/ids';
import { NotifierService } from './notifier.service';

/** Сколько подряд неудачных прогонов синхронизации считаем поломкой. */
const SYNC_FAILURES_BEFORE_ALERT = 3;
/**
 * Насколько свежей должна быть закрытая сделка, чтобы о ней уведомлять.
 * Первое подключение биржи заливает историю за год — без этого окна человек
 * получил бы сотни сообщений о сделках, закрытых задолго до установки бота.
 */
const CLOSED_TRADE_MAX_AGE_MS = 24 * 3_600_000;
/** Больше — и вместо потока карточек уходит одна сводка. */
const CLOSED_TRADE_BURST = 5;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (v: number) => `${v >= 0 ? '+' : '−'}$${Math.abs(v).toFixed(2)}`;

const humanDuration = (fromMs: number, toMs: number): string => {
  const min = Math.max(0, Math.round((toMs - fromMs) / 60_000));
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} ч ${min % 60} мин` : `${Math.floor(h / 24)} д ${h % 24} ч`;
};

/**
 * Сигналы, связанные со сделками пользователя. Вызывается из TradeSyncService:
 * синхронизация — единственное место, которое знает, что позиция появилась,
 * закрылась или что биржа перестала отвечать.
 */
@Injectable()
export class TradeAlertsService {
  private readonly logger = new Logger(TradeAlertsService.name);
  /** Счётчик неудач синхронизации на пользователя, в памяти процесса. */
  private readonly syncFailures = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: NotifierService,
    private readonly telegram: TelegramService,
  ) {}

  async positionOpened(userId: string, pos: OpenedPositionInfo): Promise<void> {
    const dir = pos.direction === 'long' ? '🟢 LONG' : '🔴 SHORT';
    const lev = pos.leverage ? ` · ${esc(pos.leverage)}x` : '';
    const vol = pos.size
      ? `Объём: ${esc(pos.size)}${pos.avgPrice ? ` @ ${esc(pos.avgPrice)}` : ''}`
      : null;
    const keyboard = await this.telegram.buildTagKeyboard(userId, pos.symbol, pos.direction);
    const hasTags = keyboard.inline_keyboard.length > 0;

    await this.notifier.sendEvent(userId, 'trade.opened', {
      text: [
        '🆕 Открыта позиция',
        `<b>${esc(pos.symbol)}</b> ${dir}${lev}`,
        ...(vol ? [vol] : []),
        '',
        hasTags
          ? 'Отметь причины входа — кнопки переключают теги:'
          : 'Тегов пока нет — создай их на странице тегов, следующая позиция придёт с кнопками.',
      ].join('\n'),
      ...(hasTags ? { replyMarkup: keyboard } : {}),
    });
  }

  /**
   * Сделки, вставленные текущим прогоном синхронизации. Свежесть проверяется
   * по closedAt, а не по факту вставки: бэкфилл истории — это тоже вставка.
   */
  async tradesClosed(userId: string, insertedAfter: Date): Promise<void> {
    const trades = await this.prisma.trade.findMany({
      where: {
        userId,
        createdAt: { gte: insertedAfter },
        closedAt: { gte: new Date(Date.now() - CLOSED_TRADE_MAX_AGE_MS) },
      },
      orderBy: { closedAt: 'asc' },
      include: { tags: true },
    });
    if (trades.length === 0) return;

    if (trades.length > CLOSED_TRADE_BURST) {
      const total = trades.reduce((s, t) => s + t.closedPnl, 0);
      await this.notifier.sendEvent(userId, 'trade.closed', {
        text: [
          `🏁 Закрыто сделок: <b>${trades.length}</b>`,
          `Итог: <b>${money(total)}</b>`,
          '',
          'Разметить их тегами можно в журнале приложения.',
        ].join('\n'),
      });
      return;
    }

    for (const trade of trades) {
      const dir = trade.direction === 'long' ? '🟢 LONG' : '🔴 SHORT';
      const fees = trade.openFee + trade.closeFee;
      const held = trade.openedAt
        ? humanDuration(trade.openedAt.getTime(), trade.closedAt.getTime())
        : null;
      // Клавиатура нужна только неразмеченной сделке: теги позиции уже
      // перенесены на неё синхронизацией, и переспрашивать про них незачем.
      const keyboard =
        trade.tags.length === 0 ? await this.closedTagKeyboard(userId, trade.id) : null;

      await this.notifier.sendEvent(userId, 'trade.closed', {
        text: [
          `🏁 Закрыта позиция ${trade.closedPnl >= 0 ? '✅' : '❌'}`,
          `<b>${esc(trade.symbol)}</b> ${dir}`,
          `Итог: <b>${money(trade.closedPnl)}</b> · комиссии: $${fees.toFixed(2)}`,
          ...(held ? [`В позиции: ${held}`] : []),
          ...(keyboard ? ['', 'Сделка без тегов — отметь причину входа:'] : []),
        ].join('\n'),
        ...(keyboard ? { replyMarkup: keyboard } : {}),
      });
    }
  }

  private async closedTagKeyboard(userId: string, tradeId: string) {
    const tags = await this.prisma.tag.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    if (tags.length === 0) return null;
    const buttons = tags.map((t) => ({
      text: t.name,
      callback_data: `ct|${packId(tradeId)}|${packId(t.id)}`,
    }));
    const rows: Array<typeof buttons> = [];
    for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
    return { inline_keyboard: rows };
  }

  /** Переторговка: считаем закрытые за последние сутки. */
  async overtradeCheck(userId: string): Promise<void> {
    const threshold = await this.notifier.thresholdFor(userId, 'trade.overtrade');
    if (threshold == null) return;
    const count = await this.prisma.trade.count({
      where: { userId, closedAt: { gte: new Date(Date.now() - 24 * 3_600_000) } },
    });
    await this.notifier.maybeSend(userId, 'trade.overtrade', count > threshold, () => ({
      text: [
        `🔥 За сутки закрыто сделок: <b>${count}</b>`,
        `Твой порог — ${threshold}. Стоит посмотреть, что это были за входы.`,
      ].join('\n'),
    }));
  }

  /**
   * Отмечает исход прогона синхронизации. Сигнал уходит после трёх неудач
   * подряд: у адаптеров нет общего типа ошибки авторизации, и отличать
   * «ключ отозван» от «сеть моргнула» разбором чужих строк — способ, который
   * ломается молча. Три подряд говорят то же самое и без парсинга.
   */
  async syncOutcome(userId: string, ok: boolean): Promise<void> {
    if (ok) {
      this.syncFailures.delete(userId);
      return;
    }
    const failures = (this.syncFailures.get(userId) ?? 0) + 1;
    this.syncFailures.set(userId, failures);
    if (failures < SYNC_FAILURES_BEFORE_ALERT) return;

    await this.notifier.sendEvent(userId, 'sys.sync', {
      text: [
        '🛠 Синхронизация с биржей не проходит',
        `Неудачных попыток подряд: <b>${failures}</b>.`,
        'Проверь, живы ли API-ключи на бирже и не истёк ли их срок.',
      ].join('\n'),
    });
  }
}
```

- [ ] **Step 2: Открыть `buildTagKeyboard` и добавить ветку тегов закрытой сделки**

В `backend/src/telegram/telegram.service.ts`:

1) сменить `private async buildTagKeyboard(` на `async buildTagKeyboard(`;

2) удалить метод `notifyPositionOpened` — его текст переехал в `TradeAlertsService.positionOpened`;

3) в `handleCallback`, после ветки панели и до разбора `pt|`, добавить ветку тега закрытой сделки:

```ts
    const [ctKind, shortTrade, shortTag] = String(cb.data ?? '').split('|');
    if (ctKind === 'ct') {
      const tradeId = unpackId(shortTrade ?? '');
      const tagId = unpackId(shortTag ?? '');
      const trade = tradeId
        ? await this.prisma.trade.findFirst({ where: { id: tradeId, userId: user.id } })
        : null;
      const tag = tagId
        ? await this.prisma.tag.findFirst({ where: { id: tagId, userId: user.id } })
        : null;
      if (!trade || !tag) {
        await answer('Сделка или тег не найдены');
        return;
      }
      const existing = await this.prisma.tradeTag.findUnique({
        where: { tradeId_tagId: { tradeId: trade.id, tagId: tag.id } },
      });
      if (existing) {
        await this.prisma.tradeTag.delete({
          where: { tradeId_tagId: { tradeId: trade.id, tagId: tag.id } },
        });
      } else {
        await this.prisma.tradeTag.create({ data: { tradeId: trade.id, tagId: tag.id } });
      }
      await answer(existing ? `− ${tag.name}` : `✓ ${tag.name}`);
      return;
    }
```

4) добавить импорт:

```ts
import { unpackId } from './ids';
```

- [ ] **Step 3: Подключить сервис к модулям**

В `backend/src/notifications/notifications.module.ts` добавить `TradeAlertsService` в `providers` и в `exports`.

В `backend/src/trades/trades.module.ts` добавить `NotificationsModule` в `imports`.

- [ ] **Step 4: Переключить синхронизацию на TradeAlertsService**

В `backend/src/trades/trade-sync.service.ts`:

1) заменить в конструкторе зависимость `private readonly telegram: TelegramService` на `private readonly tradeAlerts: TradeAlertsService` и поправить импорты (`OpenedPositionInfo` по-прежнему берётся из `../telegram/telegram.service`);

2) в `trackOpenPositions` заменить вызов уведомления:

```ts
      try {
        await this.tradeAlerts.positionOpened(userId, p);
      } catch (e) {
        this.logger.warn(`telegram notify failed: ${e}`);
      }
```

3) в `syncUserUnlocked` запомнить момент начала прогона и сообщить об исходе. Заменить блок вокруг `persist`:

```ts
    const runStartedAt = new Date();
    const inserted = await this.persist(userId, exchange, closed.items);
    await this.tradeAlerts.syncOutcome(userId, !closed.partial);
    if (inserted > 0) {
      this.logger.log(`synced ${inserted} new trade(s) for user ${userId}`);
```

4) в самом конце `syncUserUnlocked`, перед `return inserted`, добавить сигналы по закрытым сделкам и переторговке — после того как теги уже перенесены на новые сделки, иначе карточка уйдёт с кнопками для сделки, которая на самом деле размечена:

```ts
    try {
      await this.tradeAlerts.tradesClosed(userId, runStartedAt);
      await this.tradeAlerts.overtradeCheck(userId);
    } catch (e) {
      this.logger.warn(`trade alerts failed: ${e}`);
    }
```

5) обернуть вызов `adapter.fetchClosedTrades` в try/catch, чтобы падение биржи считалось неудачным прогоном, а не глотало сигнал:

```ts
    let closed: Awaited<ReturnType<typeof adapter.fetchClosedTrades>>;
    try {
      closed = await adapter.fetchClosedTrades(creds, {
        startMs: now - weeks * WEEK_MS,
        endMs: now,
      });
    } catch (e) {
      await this.tradeAlerts.syncOutcome(userId, false);
      throw e;
    }
```

- [ ] **Step 5: Проверить сборку и тесты**

```bash
cd backend && npx tsc --noEmit -p tsconfig.json && npx jest
```

Ожидается: типы без ошибок, все тесты зелёные (включая существующий `trades/trade-sync.stoploss.spec.ts`).

- [ ] **Step 6: Коммит**

```bash
git add -A backend/src
git commit -m "feat(notifications): сигналы по сделкам — открытие, закрытие с тегами, переторговка, сбой синхронизации"
```

---

## Task 8: Недельный отчёт

**Files:**
- Create: `backend/src/notifications/weekly-report.ts`
- Test: `backend/src/notifications/weekly-report.spec.ts`
- Create: `backend/src/notifications/weekly-report.service.ts`
- Modify: `backend/src/notifications/notifications.module.ts`

**Interfaces:**
- Consumes: `NotifierService` (Task 3), `MSK_OFFSET_MS` (Task 3).
- Produces: `WeekRange`, `lastWeekRange(now)`, `buildWeeklyReport(current, previous)`; `WeeklyReportService`.

- [ ] **Step 1: Написать падающий тест**

Создать `backend/src/notifications/weekly-report.spec.ts`:

```ts
import { buildWeeklyReport, lastWeekRange, ReportTrade } from './weekly-report';

const trade = (pnl: number, over: Partial<ReportTrade> = {}): ReportTrade => ({
  closedPnl: pnl,
  stopLoss: null,
  tagNames: [],
  ...over,
});

describe('lastWeekRange', () => {
  // Отчёт уходит в понедельник 09:00 UTC и покрывает прошедшие пн–вс.
  it('в понедельник берёт прошлую неделю целиком', () => {
    const r = lastWeekRange(new Date('2026-09-07T09:00:00Z')); // понедельник
    expect(r.from.toISOString()).toBe('2026-08-31T00:00:00.000Z');
    expect(r.to.toISOString()).toBe('2026-09-07T00:00:00.000Z');
  });
});

describe('buildWeeklyReport', () => {
  it('считает PnL, число сделок и винрейт', () => {
    const text = buildWeeklyReport([trade(100), trade(-40), trade(20)], []);
    expect(text).toContain('+$80.00');
    expect(text).toContain('3');
    expect(text).toContain('67%');
  });

  it('показывает лучший и худший тег', () => {
    const text = buildWeeklyReport(
      [trade(100, { tagNames: ['пробой'] }), trade(-60, { tagNames: ['контртренд'] })],
      [],
    );
    expect(text).toContain('пробой');
    expect(text).toContain('контртренд');
  });

  // Сделка входит в каждый свой тег целиком — то же правило, что в statsByTag.
  it('сделка с двумя тегами засчитывается обоим целиком', () => {
    const text = buildWeeklyReport([trade(100, { tagNames: ['a', 'b'] })], []);
    expect(text).toContain('+$100.00');
  });

  it('считает долю сделок с объявленным стопом', () => {
    const text = buildWeeklyReport([trade(10, { stopLoss: 100 }), trade(-10)], []);
    expect(text).toContain('50%');
  });

  it('сравнивает с прошлой неделей', () => {
    const text = buildWeeklyReport([trade(100)], [trade(40)]);
    expect(text).toContain('Неделей раньше: +$40.00');
  });

  it('без сделок отдаёт короткое сообщение, а не таблицу нулей', () => {
    const text = buildWeeklyReport([], []);
    expect(text).toContain('Сделок за неделю не было');
    expect(text).not.toContain('Винрейт');
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
cd backend && npx jest notifications/weekly-report
```

Ожидается: FAIL — `Cannot find module './weekly-report'`.

- [ ] **Step 3: Написать сборку отчёта**

Создать `backend/src/notifications/weekly-report.ts`:

```ts
export interface ReportTrade {
  closedPnl: number;
  stopLoss: number | null;
  tagNames: string[];
}

export interface WeekRange {
  from: Date;
  to: Date;
}

const WEEK_MS = 7 * 24 * 3_600_000;

/** Прошедшие понедельник–воскресенье относительно момента отправки. */
export const lastWeekRange = (now: Date): WeekRange => {
  const to = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  return { from: new Date(to.getTime() - WEEK_MS), to };
};

const money = (v: number) => `${v >= 0 ? '+' : '−'}$${Math.abs(v).toFixed(2)}`;

/**
 * PnL по тегам не делится между тегами: сделка целиком засчитывается каждому
 * своему тегу — то же правило, что в statsByTag. Деление поровну обессмыслило
 * бы число, а «лучший тег» превратило бы в «тег, который реже ходит в паре».
 */
const byTag = (trades: ReportTrade[]): Array<{ name: string; pnl: number }> => {
  const sums = new Map<string, number>();
  for (const t of trades) {
    for (const name of t.tagNames) sums.set(name, (sums.get(name) ?? 0) + t.closedPnl);
  }
  return [...sums.entries()]
    .map(([name, pnl]) => ({ name, pnl }))
    .sort((a, b) => b.pnl - a.pnl);
};

export const buildWeeklyReport = (current: ReportTrade[], previous: ReportTrade[]): string => {
  if (current.length === 0) {
    return ['🗓 <b>Итоги недели</b>', '', 'Сделок за неделю не было.'].join('\n');
  }

  const pnl = current.reduce((s, t) => s + t.closedPnl, 0);
  const wins = current.filter((t) => t.closedPnl > 0).length;
  const winRate = Math.round((wins / current.length) * 100);
  const withStop = current.filter((t) => t.stopLoss != null).length;
  const stopShare = Math.round((withStop / current.length) * 100);
  const tags = byTag(current);

  const lines = [
    '🗓 <b>Итоги недели</b>',
    '',
    `Результат: <b>${money(pnl)}</b>`,
    `Сделок: ${current.length} · Винрейт: ${winRate}%`,
    `Со стопом на входе: ${stopShare}%`,
  ];

  if (tags.length > 0) {
    lines.push('', `Лучший тег: ${tags[0].name} (${money(tags[0].pnl)})`);
    // Худший показываем, только если он не тот же самый: у одного тега за
    // неделю «лучший и худший — один и тот же» читается как насмешка.
    if (tags.length > 1) {
      const worst = tags[tags.length - 1];
      lines.push(`Худший тег: ${worst.name} (${money(worst.pnl)})`);
    }
  }

  if (previous.length > 0) {
    const prevPnl = previous.reduce((s, t) => s + t.closedPnl, 0);
    lines.push('', `Неделей раньше: ${money(prevPnl)} на ${previous.length} сделках`);
  }

  return lines.join('\n');
};
```

- [ ] **Step 4: Запустить тест и убедиться, что он проходит**

```bash
cd backend && npx jest notifications/weekly-report
```

Ожидается: PASS, 7 тестов.

- [ ] **Step 5: Написать сервис отправки**

Создать `backend/src/notifications/weekly-report.service.ts`:

```ts
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotifierService } from './notifier.service';
import { PrefsService } from './prefs.service';
import { isEnabled } from './prefs';
import { ReportTrade, buildWeeklyReport, lastWeekRange } from './weekly-report';

/** Понедельник, 09:00 UTC = 12:00 МСК. */
const SEND_WEEKDAY = 1;
const SEND_UTC_HOUR = 9;
const TICK_MS = 10 * 60_000;
const WEEK_MS = 7 * 24 * 3_600_000;

/**
 * Отчёт шлётся раз в неделю по таймеру с шагом в десять минут, а не по cron:
 * зависимостей планировщика в проекте нет, а от повторной отправки внутри
 * часа защищает cooldown самого сигнала (`report.weekly` — сутки).
 */
@Injectable()
export class WeeklyReportService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WeeklyReportService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly prefs: PrefsService,
    private readonly notifier: NotifierService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => {
      this.tick().catch((e) => this.logger.warn(`недельный отчёт не отправлен: ${e}`));
    }, TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(now: Date = new Date()): Promise<void> {
    if (now.getUTCDay() !== SEND_WEEKDAY || now.getUTCHours() !== SEND_UTC_HOUR) return;

    const range = lastWeekRange(now);
    const users = await this.prefs.linkedUsers();
    for (const user of users) {
      if (!isEnabled(user.prefs, 'report.weekly')) continue;
      const [current, previous] = await Promise.all([
        this.tradesOf(user.id, range.from, range.to),
        this.tradesOf(user.id, new Date(range.from.getTime() - WEEK_MS), range.from),
      ]);
      await this.notifier.sendEvent(user.id, 'report.weekly', {
        text: buildWeeklyReport(current, previous),
      });
    }
  }

  private async tradesOf(userId: string, from: Date, to: Date): Promise<ReportTrade[]> {
    const rows = await this.prisma.trade.findMany({
      where: { userId, closedAt: { gte: from, lt: to } },
      select: {
        closedPnl: true,
        stopLoss: true,
        tags: { select: { tag: { select: { name: true } } } },
      },
    });
    return rows.map((r) => ({
      closedPnl: r.closedPnl,
      stopLoss: r.stopLoss,
      tagNames: r.tags.map((t) => t.tag.name),
    }));
  }
}
```

- [ ] **Step 6: Подключить к модулю**

В `backend/src/notifications/notifications.module.ts` добавить `WeeklyReportService` в `providers`.

- [ ] **Step 7: Проверить сборку и тесты**

```bash
cd backend && npx tsc --noEmit -p tsconfig.json && npx jest
```

Ожидается: типы без ошибок, все тесты зелёные.

- [ ] **Step 8: Коммит**

```bash
git add -A backend/src
git commit -m "feat(notifications): недельный отчёт по понедельникам"
```

---

## Task 9: Карточка Telegram на странице настроек

**Files:**
- Modify: `backend/src/telegram/telegram.service.ts`
- Modify: `backend/src/telegram/telegram.controller.ts`
- Modify: `frontend/src/views/settings/api/telegram-hooks.ts`
- Create: `frontend/src/views/settings/components/TelegramCard.tsx`
- Modify: `frontend/src/views/settings/Page.tsx`
- Modify: `frontend/src/shared/i18n/messages/ru.json`, `frontend/src/shared/i18n/messages/en.json`

**Interfaces:**
- Consumes: `PrefsService` (Task 2), реестр (Task 1), существующие хуки `useTelegramStatus`/`useTelegramLink`/`useTelegramUnlink`/`useTelegramTest`.
- Produces: поле `notifications: Array<{ key: string; title: string }>` в ответе `/api/telegram/status`; компонент `TelegramCard`.

- [ ] **Step 1: Отдать список включённого в статусе**

В `backend/src/telegram/telegram.service.ts` заменить метод `status`:

```ts
  async status(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const prefs = await this.prefs.get(userId);
    return {
      success: true,
      enabled: this.enabled,
      linked: !!user?.telegramChatId,
      botUsername: this.enabled ? await this.getBotUsername() : null,
      // Список только для чтения: редактируется он в боте, и второй копии
      // переключателей на фронте нет намеренно.
      notifications: NOTIF_DEFS.filter((d) => isEnabled(prefs, d.key)).map((d) => ({
        key: d.key,
        title: `${d.emoji} ${d.title}`,
      })),
    };
  }
```

Добавить импорты:

```ts
import { NOTIF_DEFS } from '../notifications/registry';
import { isEnabled } from '../notifications/prefs';
```

- [ ] **Step 2: Расширить тип на фронте**

В `frontend/src/views/settings/api/telegram-hooks.ts` дополнить интерфейс:

```ts
interface TelegramStatus {
  success: boolean;
  enabled: boolean; // bot token configured server-side
  linked: boolean; // this user's chat is linked
  botUsername: string | null;
  /** Включённые сигналы — только для показа; правятся они в боте. */
  notifications: Array<{ key: string; title: string }>;
}
```

- [ ] **Step 3: Добавить строки локализации**

В `frontend/src/shared/i18n/messages/ru.json`, в объект `settings`:

```json
    "telegramTitle": "Telegram",
    "telegramDisabled": "Бот не настроен на сервере.",
    "telegramNotLinked": "Уведомления о сделках и рынке приходят в Telegram. Привяжи чат — займёт полминуты.",
    "telegramLinkAction": "Подключить Telegram",
    "telegramOpenBot": "Открыть бота",
    "telegramLinkHint": "Открой ссылку и нажми «Start». Ссылка действует 15 минут.",
    "telegramLinked": "Чат привязан.",
    "telegramEnabledList": "Сейчас включено:",
    "telegramNothingEnabled": "Сейчас всё выключено.",
    "telegramSettingsHint": "Набери /settings в боте, чтобы включить сигналы и задать пороги.",
    "telegramTest": "Отправить тест",
    "telegramTestSent": "Отправлено — проверь чат.",
    "telegramUnlink": "Отвязать",
```

В `frontend/src/shared/i18n/messages/en.json`, в объект `settings`:

```json
    "telegramTitle": "Telegram",
    "telegramDisabled": "The bot is not configured on the server.",
    "telegramNotLinked": "Trade and market alerts arrive in Telegram. Linking a chat takes half a minute.",
    "telegramLinkAction": "Connect Telegram",
    "telegramOpenBot": "Open the bot",
    "telegramLinkHint": "Open the link and press Start. It stays valid for 15 minutes.",
    "telegramLinked": "Chat linked.",
    "telegramEnabledList": "Currently on:",
    "telegramNothingEnabled": "Everything is off right now.",
    "telegramSettingsHint": "Type /settings in the bot to switch alerts on and set thresholds.",
    "telegramTest": "Send a test",
    "telegramTestSent": "Sent — check the chat.",
    "telegramUnlink": "Unlink",
```

- [ ] **Step 4: Написать компонент карточки**

Создать `frontend/src/views/settings/components/TelegramCard.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui/Button';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  useTelegramLink,
  useTelegramStatus,
  useTelegramTest,
  useTelegramUnlink,
} from '../api/telegram-hooks';

/**
 * Привязка чата и список включённых уведомлений. Переключателей здесь нет
 * намеренно: настройка живёт в боте, а второе место редактирования того же
 * состояния — это второй набор багов.
 */
export function TelegramCard() {
  const t = useTranslations('settings');
  const { data, isLoading } = useTelegramStatus();
  const link = useTelegramLink();
  const unlink = useTelegramUnlink();
  const test = useTelegramTest();

  if (isLoading) return <Skeleton height={120} />;
  if (!data?.enabled) {
    return (
      <>
        <h2>{t('telegramTitle')}</h2>
        <p className="muted">{t('telegramDisabled')}</p>
      </>
    );
  }

  if (!data.linked) {
    return (
      <>
        <h2>{t('telegramTitle')}</h2>
        <p className="muted">{t('telegramNotLinked')}</p>
        {link.data?.url ? (
          <>
            {/* Обычная ссылка, а не Button: примитив рендерит только <button>,
                а подменять его тег ради одного места — портить примитив. */}
            <p>
              <a href={link.data.url} target="_blank" rel="noreferrer">
                {t('telegramOpenBot')}
              </a>
            </p>
            <p className="foot">{t('telegramLinkHint')}</p>
          </>
        ) : (
          <Button variant="solid" disabled={link.isPending} onClick={() => link.mutate()}>
            {t('telegramLinkAction')}
          </Button>
        )}
      </>
    );
  }

  return (
    <>
      <h2>{t('telegramTitle')}</h2>
      <p className="muted">{t('telegramLinked')}</p>
      {data.notifications.length > 0 ? (
        <>
          <p className="muted">{t('telegramEnabledList')}</p>
          <ul>
            {data.notifications.map((n) => (
              <li key={n.key}>{n.title}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="muted">{t('telegramNothingEnabled')}</p>
      )}
      <p className="foot">{t('telegramSettingsHint')}</p>
      <Button disabled={test.isPending} onClick={() => test.mutate()}>
        {test.isSuccess ? t('telegramTestSent') : t('telegramTest')}
      </Button>
      <Button disabled={unlink.isPending} onClick={() => unlink.mutate()}>
        {t('telegramUnlink')}
      </Button>
    </>
  );
}
```

- [ ] **Step 5: Отрисовать карточку на странице**

В `frontend/src/views/settings/Page.tsx` импортировать компонент и вставить его после блока подключённой биржи, до `DisconnectZone`:

```tsx
import { TelegramCard } from './components/TelegramCard';
```

```tsx
      <TelegramCard />
```

- [ ] **Step 6: Проверить сборку фронта**

```bash
cd frontend && npx next build
```

Ожидается: сборка проходит. Именно `next build`, а не только `tsc`: поломки слоя страниц dev-сервер и линтер не показывают.

- [ ] **Step 7: Проверить бэкенд**

```bash
cd backend && npx tsc --noEmit -p tsconfig.json && npx jest
```

Ожидается: без ошибок, все тесты зелёные.

- [ ] **Step 8: Коммит**

```bash
git add -A backend/src frontend/src
git commit -m "feat(settings): карточка Telegram со списком включённых уведомлений"
```

---

## Task 10: Обновление документации проекта

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: всё сделанное выше.
- Produces: раздел про уведомления в описании проекта.

- [ ] **Step 1: Дописать раздел в CLAUDE.md**

После раздела «Аналитика пользователей для владельца» добавить:

```markdown
## Уведомления в Telegram

`backend/src/notifications` — двенадцать типов сигналов, включаются и настраиваются
командой `/settings` в самом боте. Карточка на странице настроек показывает привязку и
список включённого, но не редактирует его: второе место редактирования одного состояния —
это второй набор багов.

- **Реестр `registry.ts` — единственный источник правды о сигналах.** Панель бота, чекеры
  и `/api/telegram/status` читают его; добавить сигнал значит добавить запись, а не
  править четыре файла.
- **Настройки хранятся отклонениями от дефолта** в `User.notifyPrefs` (JSON). Дефолты
  живут в коде, поэтому их правка доезжает до уже привязанных, а новый тип сигнала не
  требует миграции данных.
- **Фронт нарастания и cooldown — в таблице `NotificationState`, а не в памяти процесса.**
  Предшественник (`VolatilityAlertService`) держал два булевых поля на всех пользователей
  сразу: с персональными порогами такой фронт неверен, а перезапуск api рассылал всё
  заново.
- **«Волатильность за 1ч» и «режим рынка» — разные метрики.** `AnalyticsService.getVolatility`
  меряет stdev часовых доходностей за сутки против недели; сигнал `mkt.vol1h` меряет размах
  одной свечи против среднего часового. Смешивать их нельзя.
- **Сигнал `mkt.book` меряет раздвижку стакана, а не глубину.** Глубины в
  `LiquiditySnapshot` нет — есть `bidCenter`/`askCenter`, и подписывать сигнал надо именно
  раздвижкой.
- **`sys.sync` срабатывает по трём неудачным прогонам подряд**, а не по разбору текста
  ошибки: общего типа ошибки авторизации у адаптеров нет, и угадывание по чужим строкам
  ломается молча.
```

- [ ] **Step 2: Коммит**

```bash
git add CLAUDE.md
git commit -m "docs: раздел про уведомления в Telegram"
```

---

## Проверка целиком

После Task 10 прогнать сквозной путь вручную:

1. `cd backend && npx jest` — все тесты зелёные.
2. `cd frontend && npx next build` — сборка проходит.
3. Поднять окружение (`start.bat`), открыть настройки, нажать «Подключить Telegram», открыть ссылку, нажать Start — приходит приветствие со списком включённого.
4. В боте `/settings` → «Рынок» → включить «Волатильность 1ч», переключить порог на ×1.5 — сообщение перерисовывается на месте, экран категории не схлопывается в корень.
5. Перезапустить `api` — повторной рассылки рыночных сигналов не происходит (проверка того, ради чего заведена `NotificationState`).
6. Выключить `trade.opened`, открыть позицию на бирже — карточка не приходит; включить обратно — приходит с кнопками тегов.
7. На странице настроек список включённого совпадает с тем, что показывает бот.
