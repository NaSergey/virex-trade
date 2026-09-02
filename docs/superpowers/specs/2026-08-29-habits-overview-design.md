# Цена привычек на Обзоре

## Проблема

`HabitsService.scan()` ([backend/src/trades/habits.service.ts](../../../backend/src/trades/habits.service.ts))
и эндпоинт `GET /trades/habits`
([trades.controller.ts:140-151](../../../backend/src/trades/trades.controller.ts))
уже полностью считают статистически честную диагностику поведения без единого
тега: отыгрыш после убытка, переторговка, разгон размера, пересиженные позиции,
лонг/шорт-перекос, час/день/сессия входа, положение относительно EMA200,
режим тренда 4Ч, волатильность, объём, положение в диапазоне, — с
пермутационным тестом, поправкой Бенджамini–Хохберга, проверкой на выбросы и
OOS-подтверждением, всё в долларах (`cost`). Готово с 2 августа. На фронтенде
на этот эндпоинт нет ни одной ссылки — для пользователя фичи не существует.

Ровно то, что нужно, чтобы дать ценность **до** того, как человек поставил
первый тег: система уже «что-то знает про него» на второй минуте после
подключения ключей.

Два реальных припятствия, из-за которых это не просто «дорисовать таблицу»:

1. `label`/`advice` в `Candidate`/`Habit` — готовые русские фразы
   (например `Входы по ${WD[d]}`,
   [habits.service.ts:324-333](../../../backend/src/trades/habits.service.ts)),
   а не ключи локализации. У приложения есть переключатель EN/RU — отдать эти
   строки как есть в английском интерфейсе нельзя.
2. Каждая привычка уже несёт `lab: Record<string,string> | null` — набор
   фильтров «Выборки» для этого среза
   (`{ direction: 'long' }`, `{ hourFrom: '0', hourTo: '3' }`, `{ tags: id }`
   и т.п.) — очевидный кандидат на клик-переход в Аналитику. Но
   `useLabFilters` ([useLabFilters.ts](../../../frontend/src/views/analytics/model/useLabFilters.ts))
   инициализирует состояние всегда пустым (`useState(() => emptyLabFilters(0))`,
   строка 38) и никогда не читает URL — переход по ссылке ничего не
   отфильтрует.

## Решение

### 1. Бэкенд: `kind` + `params` рядом с `label`/`advice`

В `Habit` и `Candidate` ([habits.service.ts:49-81](../../../backend/src/trades/habits.service.ts))
добавляются два поля:

```ts
kind: HabitKind; // 12 значений, см. таблицу ниже
params: Record<string, string | number> | null;
```

`label`/`advice` **остаются** без изменений — это не рефактор существующей
логики, а добавочные поля. Так безопаснее и дешевле: не нужно трогать 20
мест, где эти строки собираются в `candidates()`
([habits.service.ts:244-475](../../../backend/src/trades/habits.service.ts)),
и старые тесты `habits.service.spec.ts` не ломаются.

`HabitKind` и `params` по каждому виду кандидата:

| kind | params | откуда (строка в habits.service.ts) |
|---|---|---|
| `tilt` | `{}` | 254 |
| `overtrading` | `{ nth: OVERTRADE_NTH }` | 262 |
| `size_up` | `{ mult: SIZE_UP_MULT }` | 270 |
| `size_up_after_loss` | `{}` | 278 |
| `hold_long` | `{}` | 286 |
| `dir` | `{ direction: 'long' \| 'short' }` | 294, 302 |
| `hour` | `{ hourFrom: number, hourTo: number }` | 312-321 |
| `weekday` | `{ weekday: 0..6 }` | 325-333 |
| `session` | `{ session: 'asia'\|'london'\|'ny'\|'night' }` | 342-350 |
| `trend4h` | `{ trend: 'trend_up'\|'trend_down'\|'range' }` | 358-366 |
| `ema200` | `{ side: 'above'\|'below' }` | 371-384 |
| `atr` | `{ level: 'high'\|'low' }` | 387-401 |
| `vol` | `{ level: 'high'\|'low' }` | 404-417 |
| `range4h` | `{ bucket: 'low'\|'mid'\|'high' }` | 426-438 |
| `tag` | `{ tagName: string }` | 454-461 |
| `symbol` | `{ symbol: string }` | 463-472 |

Поведенческие виды (`tilt`, `overtrading`, `size_up`, `size_up_after_loss`,
`hold_long`) не имеют `lab` (уже `null` в коде) — в блоке на Обзоре это
некликабельные строки, и это нормально: там нет измерения «Выборки», в
которое можно провалиться.

### 2. Фронтенд: словарь подписей

Новый `frontend/src/views/overview/lib/habit-labels.ts`, по образцу удалённого
`metric-labels.ts` (см. `git show fecc760~1:frontend/src/features/rules/lib/metric-labels.ts`):

```ts
export function habitLabel(h: Habit, t: TFunc): string   // свитч по h.kind + h.params, иначе h.label
export function habitAdvice(h: Habit, t: TFunc): string  // то же для h.advice
export function habitSearchParams(lab: Habit['lab']): URLSearchParams | null
```

Незнакомый `kind` (старая версия фронта поверх новой версии бэкенда, или
наоборот) — откат на сырые `label`/`advice` с бэкенда, а не пустая строка или
падение. Тот же принцип, что уже был в `metric-labels.ts`
(«лучше сырое значение, чем пустая строка»).

12 пар ключей `habits.label.<kind>` / `habits.advice.<kind>` в
`shared/i18n/messages/{en,ru}.json`, с интерполяцией параметров
(`t('habits.label.hour', { hourFrom, hourTo })` и т.д.). Для `dir` и `ema200`
подпись и совет зависят от значения параметра — не один ключ с ICU-select, а
два отдельных ключа на каждый (`habits.label.dir.long` / `.dir.short`,
`habits.label.ema200.above` / `.below`), тем же паттерном, что уже даёт
бэкенд для `session`/`trend4h`/`range4h` (отдельная запись словаря на
каждое значение, не параметризованная строка).

`tagName`/`symbol` подставляются как есть (не переводятся, как и остальные
пользовательские данные — тикеры, имена тегов).

### 3. Компонент на Обзоре

`useHabits(days, tz)` в `frontend/src/entities/trade/api/hooks.ts`, рядом с
`useTradeStats`/`useTimeStats` (тот же `LIVE`-пресет, тот же паттерн
`qs({...})` → `GET /api/trades/habits`).

`frontend/src/views/overview/components/HabitsBlock.tsx`, подключается в
[overview/Page.tsx](../../../frontend/src/views/overview/Page.tsx) сразу
после `<OpenPositions />` (строка 85), перед блоком «по дням/часам» (строка
87) — порядок чтения: сколько вышло → как набиралось → **что стоило денег** →
когда получается → из чего состоит.

Состояния:

- `status: 'need_more'` — `EmptyState` («нужно ещё N сделок, сейчас M»),
  как в остальных местах продукта с порогом уверенности.
- `status: 'ok'`, оба списка пусты — короткая заметка «пока не нашлось
  значимых закономерностей», не пустой блок без объяснения.
- `status: 'ok'`, есть данные — заголовок с `totalCost` (`Money`, красным при
  отрицательном), два списка:

  ```
  Цена привычек                                        −$412

  Дорого стоило
  ─────────────────────────────────────────────────────────
  Вход в течение часа после убытка      −$210   34% vs 51%  ●
  Входы 00:00–03:59                     −$96    29% vs 49%  ○
  Сделки по DOGEUSDT                    −$54    31% vs 50%  ●

  Работает
  ─────────────────────────────────────────────────────────
  Входы выше EMA200 (1H)                +$88    58% vs 47%  ●
  ```

  `●` confirmed, `○` likely — сплошная точка/подпись против приглушённой и
  пунктирного подчёркивания подписи, новый минимальный CSS (`.habit-row`,
  `.habit-conf`) в `globals.css`, без нового `shared/ui`-примитива: элемент
  используется на одной странице, порог «2+ страницы» из CLAUDE.md не
  достигнут.

  Подзаголовок списка («Дорого стоило» / «Работает») рендерится только если
  в этом списке есть хоть одна строка — пустой список без заголовка над ним,
  а не заголовок над пустотой.
  
  Строка кликабельна только если `habit.lab != null` (см. §1) — переход на
  `/analytics?${habitSearchParams(habit.lab)}`.

### 4. Дрилдаун: `useLabFilters` читает URL

`useLabFilters.ts` — лазy-инициализация `useState` читает
`useSearchParams()` (`next/navigation`) один раз при маунте вместо
безусловного `emptyLabFilters(0)`. `AnalyticsPage.tsx` не меняется: хук сам
себе клиентский, вызов `useSearchParams()` внутри него не требует прокидывать
что-то новое сквозь компонент страницы. Переход `/overview → /analytics`
размонтирует и создаёт заново дерево страницы в App Router, так что
`useState`-инициализатор отработает на чистом маунте.

Соответствие имён `lab` → `LabFilters` (единственное расхождение — `tags`):

| ключ в `habit.lab` | поле `LabFilters` | тип на входе → как кладём |
|---|---|---|
| `tags` | `tagIds` | `string` → `[value]` |
| `symbols` | `symbols` | `string` → `[value]` |
| `weekdays` | `weekdays` | `string` → `[Number(value)]` |
| `sessions` | `sessions` | `string` → `[value]` |
| `trend4h` | `trend4h` | `string` → `[value]` |
| `direction` | `direction` | как есть |
| `ema200` | `ema200` | как есть |
| `atr` | `atr` | как есть |
| `vol` | `vol` | как есть |
| `hourFrom`/`hourTo` | `hourFrom`/`hourTo` | `string` → `Number(value)` |
| `rangeTf`/`range` | `rangeTf`/`range` | как есть |

`days` в ссылку не кладём — период Аналитики остаётся тем, что там уже
выбран; см. «Риски» ниже.

## Что не меняется

- Конверт ответа `/trades/habits` (`status`, `positions`, `need`,
  `totalCost`, `habits`, `edges`, `all`) — как есть.
- `LabService`/`GET /api/trades/lab` и сама логика подсчёта в
  `habits.service.ts` (`behaviourFlags`, `candidates`, `evaluate`,
  пермутационный тест, BH) — не трогаем, только добавляем поля к уже
  вычисленному результату.
- Остальные toggle/reset/activeCount в `useLabFilters` — без изменений,
  добавляется только первичное чтение URL.

## Риски / на что смотреть при реализации

- **Период не совпадает.** Привычка посчитана за период Обзора
  (`effectiveDays`, передаётся в `useHabits`), а после перехода Аналитика
  фильтрует за свой текущий период — цифры под кликнутым срезом на новом
  экране могут не совпасть один в один с тем, что было на карточке. Это
  осознанный компромисс (см. вопрос про дрилдаун в чате), не баг: ссылка
  открывает *направление* для разбора, а не гарантирует идентичные числа.
- **`all: opts?.includeAll` не задействован.** Контроллер сейчас не передаёт
  `includeAll`, так что `all` всегда `[]` — блок работает со списками
  `habits`/`edges`, которые уже прошли фильтр значимости; не нужно заводить
  переключатель «показать все гипотезы» — это отдельная, не запрошенная
  фича.
