# «Mind the Gap» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** вкладка «Игра» в учебнике английского — рогалик по линии метро: бои на словах (очередь карточек), сцены-диалоги, хранитель на грамматике курса; открытия, погода и задания дня.

**Architecture:** движок забега — чистые функции `views/english/game/model/` (состояние сериализуемо, случайность — генератор с состоянием внутри, побочное возвращается списком эффектов). Страница исполняет эффекты существующими мутациями учебника (`useSaveCard`, `useAnswer`, …), забег в процессе — в `localStorage`, законченный — в новую таблицу `english_runs`. Мета (открытия, рекорды, задания, уровни сцен) выводится из сыгранных забегов.

**Tech Stack:** Next.js App Router, react-query, vitest (фронт); NestJS + Prisma, jest (бэк); Web Speech API, Web Audio.

**Спека:** `docs/superpowers/specs/2026-11-04-english-game-design.md` — источник всех чисел и правил; план их не повторяет, а называет файлы, интерфейсы и проверки.

**Выполнение — гибрид** (глобальные правила владельца): код инлайн, тесты по TDD на каждой задаче, ревью свежим Sonnet в контрольных точках КТ1–КТ4, финальное ревью Opus по ветке (точек больше двух). Код в план не переписывается целиком: исполнитель — та же сессия, что писала спеку; план фиксирует имена, типы и тесты.

## Global Constraints

- Всё новое — в `frontend/src/views/english/game/` и `backend/src/english/` (раздел сносится целиком, README раздела обновить).
- Маршрут — `admin.<домен>/english/game`, файл `frontend/src/app/admin/(in)/english/game/page.tsx`.
- Тексты интерфейса — по-русски внутри вью, не в i18n. Классы CSS игры — `eg-`, файл `game/game.css`.
- Интервалы карточек — только через `review` из `model/srs.ts`; новых копий алгоритма нет.
- Оценку карточки решает первый ответ на неё в забеге; состояние карточки — из кэша на момент ответа.
- Без таймера с поражением; крит — только бонус.
- Противники и персонажи не рисуются; анимации — только `transform` и `opacity`; без свечений и градиентов.
- Нет распознавания речи — «Сказать», Немота, Диктор, Мегафон и задание «скажи» исключены.
- Баланс держит тест на 100 зёрнах; коридор — из спеки.
- `db push`: новая таблица и столбец, ничего не удаляется.
- Проверка фронта: `npx vitest run src/views/english`, `npx tsc --noEmit`, `npx eslint src/views/english`, перед КТ4 — `npx next build` (новый маршрут).

## Карта файлов

**Бэк**
- `backend/prisma/schema.prisma` — `EnglishRun`, `EnglishDay.game` (внутри меток `═══ english ═══`).
- `backend/src/english/dto/run.dto.ts` — `RunDto`.
- `backend/src/english/english.service.ts` — `runs()`, `saveRun()`, `game()`, `DayCounter` + `'game'`, `state()` отдаёт `game` у дней.
- `backend/src/english/english.controller.ts` — `GET runs`, `POST runs`, `POST game`.
- `backend/src/english/english.service.spec.ts` — тесты.

**Фронт — существующее**
- `views/english/api/hooks.ts` — `useRuns`, `useSaveRun`, `useGameDone`; `DayRow.game` в `bumpDay`.
- `views/english/model/activity.ts` — `DayRow.game`, `activityOf`.
- `views/english/model/today.ts` — `dayTitle` пишет «ответов в игре».
- `views/english/Layout.tsx` — вкладка «Игра» вторая; на время забега панель скрыта (`data-run` на `.en-app`).
- `views/english/english.css` — сетка панели на 7 вкладок.
- `views/english/TodayPage.tsx` — строка плана «Игра».
- `views/english/tools/export-texts.ts` — реплики сцен.
- `views/english/README.md` — таблица `english_runs` в сносе, игра в «Где что».

**Фронт — новое, `views/english/game/`**
- `model/rng.ts` — генератор с состоянием.
- `model/types.ts` — общие типы забега.
- `model/map.ts` — карта линии.
- `model/run-deck.ts` — колода забега и оценка карточки.
- `model/challenge.ts` — задания ударов и проверка ответов.
- `model/combat.ts` — урон, намерение, ход противника.
- `model/scene.ts` — ход сцены, переменные, уровни.
- `model/engine.ts` — `startRun`, `step`, итог и очки.
- `model/meta.ts` — открытия, рекорды, задания, серия, уровни тумана и сцен.
- `model/balance.test.ts` — прогон ботов.
- `content/` — `enemies.ts`, `bosses.ts`, `relics.ts` (находки и расходники), `characters.ts`, `weather.ts`, `quests.ts`, `scenes/{types,b1…b8,index}.ts`, `content.test.ts`.
- `useRun.ts` — забег страницы: `localStorage`, `dispatch`, исполнение эффектов.
- `sound.ts` — синтез звуков.
- `components/` — `Hub`, `LineMap`, `Fight`, `BossTurn`, `SceneView`, `Shop`, `Rest`, `Find`, `Reward`, `Results`, `StatusBar`, `Pause`, `Fog`.
- `GamePage.tsx`, `game.css`.

## Общие типы (задача 2 их создаёт, остальные пользуются)

```ts
// game/model/types.ts
export type Mode = 'recognize' | 'listen' | 'recall' | 'speak' | 'order' | 'dictate';
export type StationKind = 'fight' | 'elite' | 'scene' | 'shop' | 'rest' | 'find' | 'boss';
export type WeatherId = 'clear' | 'rain' | 'smog' | 'fog' | 'wind' | 'holiday' | 'rush';
export type Outcome = 'win' | 'dead' | 'quit';

export interface Station { id: string; row: number; lane: 0 | 1 | 2; kind: StationKind; next: string[] }

/** Слово забега. `tag` — что о нём знает игрок до удара. */
export interface RunCard {
  id: string; en: string; ru: string; example?: [string, string]; group: string | null;
  tag: 'new' | 'due' | 'learning' | 'ahead' | 'filler';
  overdueDays: number;
}

/** Что ответ сделал с карточкой — оценку по таблице спеки считает `gradeFor` на свежем состоянии. */
export type Verdict = 'recall' | 'typo' | 'recognize' | 'wrong' | 'none';

export type Effect =
  | { kind: 'card'; cardId: string; verdict: Exclude<Verdict, 'none'> }
  | { kind: 'exercise'; itemId: string; unit: string; correct: boolean }
  | { kind: 'count'; counter: 'game' | 'phrases' }
  | { kind: 'word'; en: string; ru: string }
  | { kind: 'sound'; name: SoundName };

export type SoundName = 'hit' | 'crit' | 'wrong' | 'hurt' | 'heal' | 'coin' | 'win' | 'lose' | 'step';

export interface ModeTally { right: number; wrong: number }
/** Статистика забега — уходит в `english_runs.stats` (версия 1). */
export interface RunStats {
  v: 1;
  modes: Record<Mode, ModeTally>;
  boss: ModeTally & { beaten: boolean; reached: boolean };
  revenge: number; maxCombo: number; newWords: number; elites: number; cleanFights: number;
  damage: number; recalled: number; recognized: number;
  scenes: { id: string; level: 1 | 2 | 3; stars: 0 | 1 | 2 | 3 }[];
  mistakes: string[];          // id карточек
  bossMistakes: string[];      // id упражнений
}
```

`RunState`, `Screen`, `Action` — в `engine.ts` (задача 7), с полями ниже; всё сериализуемо (`JSON.stringify` → `parse` даёт равное состояние).

```ts
export interface RunState {
  v: 1; id: string; rng: number; startedAt: number; day: string;
  weather: WeatherId; fog: number; character: CharacterId; speech: boolean;
  map: Station[]; at: string | null;
  hp: number; maxHp: number; shield: number; coins: number; combo: number;
  sharpen: Partial<Record<Mode, number>>; relics: RelicId[]; items: ItemId[];
  deck: RunCard[]; graded: string[]; returns: { id: string; turn: number; left: number }[];
  turn: number; sinceNew: number; boss: BossPlan; scenesRecent: string[];
  screen: Screen; stats: RunStats; score: number; outcome: Outcome | null;
}
export type Screen =
  | { kind: 'map' }
  | { kind: 'fight'; fight: Fight }
  | { kind: 'reward'; coins: number; options: RewardOption[] }
  | { kind: 'shop'; offers: Offer[] }
  | { kind: 'rest'; review: RunCard[] | null; healed: number }
  | { kind: 'find'; relics: RelicId[] }
  | { kind: 'scene'; scene: SceneRun }
  | { kind: 'bossIntro' }
  | { kind: 'end' };
export type Action =
  | { type: 'go'; station: string }
  | { type: 'mode'; mode: Mode; now: number }
  | { type: 'answer'; value: string | number | number[]; now: number }
  | { type: 'exercise'; correct: boolean; now: number }
  | { type: 'dontKnow'; now: number }
  | { type: 'next'; now: number }
  | { type: 'item'; index: number; now: number }
  | { type: 'reward'; index: number; mode?: Mode }
  | { type: 'buy'; index: number; mode?: Mode }
  | { type: 'rest'; choice: 'sleep' | 'train' | 'review'; mode?: Mode }
  | { type: 'pick'; relic: RelicId }
  | { type: 'reply'; value: string | number | number[]; now: number }
  | { type: 'reveal' }
  | { type: 'quit'; now: number };
export function step(s: RunState, a: Action): { state: RunState; effects: Effect[] };
```

---

### Задача 1: бэкенд забегов и счётчик игры (КТ1 после неё)

**Files:**
- Modify: `backend/prisma/schema.prisma`, `backend/src/english/english.service.ts`, `backend/src/english/english.controller.ts`, `backend/src/english/english.service.spec.ts`
- Create: `backend/src/english/dto/run.dto.ts`
- Modify (фронт): `views/english/api/hooks.ts`, `views/english/model/activity.ts`, `views/english/model/today.ts`, `views/english/model/activity.test.ts`, `views/english/README.md`

**Interfaces:**
- Produces: `GET /api/admin/english/runs` → `RunRow[]`; `POST /api/admin/english/runs` (`RunDto`) → `{ ok: true }`; `POST /api/admin/english/game` (`{ day }`) → `{ ok: true }`.
- Produces (фронт): `useRuns(): UseQueryResult<RunRow[]>`, `useSaveRun(): UseMutation<void, RunRow>`, `useGameDone(): UseMutation<void, void>`; `DayRow.game: number`.

```prisma
/// Законченный забег игры «Mind the Gap»: из них выводятся открытия, рекорды,
/// задания дня и уровни сцен (спека docs/superpowers/specs/2026-11-04-english-game-design.md).
model EnglishRun {
  /// id выдаёт клиент: повтор отправки не задваивает забег.
  id         String   @id
  startedAt  DateTime
  finishedAt DateTime
  character  String
  fog        Int
  outcome    String
  depth      Int
  score      Int
  stats      Json
  @@index([finishedAt])
  @@map("english_runs")
}
```
`EnglishDay`: `game Int @default(0)` — ответы в игре, не сдвинувшие карточку и не записанные упражнением.

```ts
// RunRow — и ответ GET, и тело POST (даты — ISO).
export interface RunRow {
  id: string; startedAt: string; finishedAt: string; character: string;
  fog: number; outcome: 'win' | 'dead' | 'quit'; depth: number; score: number; stats: RunStats;
}
```
`RunDto`: `id` — `^[a-z0-9]{8,40}$`; даты — ISO; `character` ≤ 20; `fog` 0–8; `outcome` из трёх; `depth` 0–10; `score` 0–100000; `stats` — объект, `JSON.stringify` ≤ 16 384 символов (иначе 400).

- [ ] **Step 1: тесты сервиса** — в `english.service.spec.ts`: `saveRun` зовёт `englishRun.createMany({ data: [...], skipDuplicates: true })` с датами `Date`; `saveRun` со `stats` больше 16 КБ → `BadRequestException`; `runs()` — `findMany({ orderBy: { finishedAt: 'desc' }, take: 1000 })` и даты наружу ISO; `game('2026-11-04')` → `englishDay.upsert` с `game: 1` / `{ increment: 1 }`; `state()` отдаёт `game` у дня.
- [ ] **Step 2:** `cd backend && npx jest src/english` — падают.
- [ ] **Step 3:** схема, `npx prisma generate` (остановить `nest watch`, если держит движок — память `prisma_generate_eperm_windows`), DTO, сервис, контроллер. `DayCounter` += `'game'`.
- [ ] **Step 4:** тесты зелёные; `npx tsc --noEmit -p backend`.
- [ ] **Step 5: фронт.** Тест `activity.test.ts`: `activityOf({…, game: 3})` учитывает игру; `dayTitle` — «3 ответа в игре». `DayRow.game`, `bumpDay` (`game: 0` в пустой строке), хуки (`useRuns` — ключ `['english', 'runs']`, `staleTime` 30 с; `useSaveRun` — `onSuccess` кладёт строку в кэш, если её там нет; `useGameDone` — `useStateMutation` + `bumpDay({ game: 1 })`). `toState` — `game ?? 0`.
- [ ] **Step 6:** `npx vitest run src/views/english/model` зелёные; README: `english_runs` в `DROP TABLE`, строка про игру в «Где что».
- [ ] **Step 7: commit** `feat(english): забеги игры — таблица, эндпоинты, счётчик дня`.
- [ ] **КТ1 (B — контракт бэк↔фронт):** ревьюер сверяет DTO и `RunRow`, идемпотентность, счётчик дня, README.

### Задача 2: типы, генератор и данные игры

**Files:**
- Create: `game/model/types.ts`, `game/model/rng.ts`, `game/model/rng.test.ts`, `game/content/{enemies,bosses,relics,characters,weather,quests}.ts`, `game/content/content.test.ts`

**Interfaces:**
- Produces: типы из раздела «Общие типы»; `next(state: number): [value: number, state: number]` (mulberry32 с внешним состоянием), `seedOf(text: string): number`, `pick<T>(rng, list): [T, rng]`, `shuffleR<T>(rng, list): [T[], rng]`, `intR(rng, lo, hi): [number, rng]`.
- `ENEMIES: EnemyDef[]` — `{ id, name, rows: [lo, hi], weak?: Mode, resist?: Mode, trait?: 'fast' | 'drain', speech?: true }`; `ELITES: EliteDef[]` — `{ id, name, modes: Mode[], rule: string }`; `enemyStats(row, fog): { hp, atk, every }`, `eliteStats(row, fog)`, `BOSS_STATS`.
- `BOSSES: BossDef[]` — `{ block: 1..8, name, grammar: string }`; `blockOf(sectionId): number` по файлам `b1…b8` (`BLOCK_UNITS` — id разделов каждого блока, собирается из `content/units/*` через `lessons`/`words`/`exercises`).
- `RELICS: Record<RelicId, { name, text, unlock: UnlockId | null, speech?: true }>`, `ITEMS: Record<ItemId, { name, text, price: [lo, hi] }>`.
- `CHARACTERS: Record<CharacterId, { name, hp, relic: RelicId, perk: string, unlock: UnlockId | null, speech?: true }>`.
- `WEATHER: Record<WeatherId, { name, text }>`; `QUESTS: QuestDef[]` — `{ id, group: 'learn' | 'play' | 'scene', text, target, metric: QuestMetric, speech?: true, needsNew?: true }`.
- `UnlockId` — `'bossBeaten' | 'voice20' | 'voice30' | 'revenge20' | 'scenes3' | 'scenes5' | 'runs10' | 'reachedBoss' | 'combo12' | 'quests15'`.

Все числа — из таблиц спеки.

- [ ] **Step 1: тесты** `rng.test.ts`: одно зерно — одна последовательность; `next` чистая (состояние не мутирует); `shuffleR` — перестановка. `content.test.ts`: у каждого противника ряды в 1–9; `enemyStats(5, 0)` = `{ hp: 22, atk: 4, every: 4 }`, `enemyStats(5, 1)` — здоровье ×1,15 с округлением; восемь хранителей с блоками 1–8; `blockOf('u04') === 2`, `blockOf('sp') === 1`, каждый раздел `COURSE` с упражнениями в каком-то блоке; 16 находок, из них 8 открыты с начала; у каждого персонажа стартовая находка существует; 7 погод; задания — по 3+ в каждой группе.
- [ ] **Step 2:** `npx vitest run src/views/english/game` — падают.
- [ ] **Step 3:** файлы данных и `rng.ts`.
- [ ] **Step 4:** зелёные.
- [ ] **Step 5: commit** `feat(english): данные игры — противники, хранители, находки, погода`.

### Задача 3: карта линии

**Files:** Create `game/model/map.ts`, `game/model/map.test.ts`

**Interfaces:**
- Consumes: `rng.ts`, `Station`.
- Produces: `buildMap(rng: number, opts: { weather: WeatherId; fog: number }): [Station[], number]`; `reachable(map, from: string | null): string[]` (станции, куда можно пойти: `null` — ряд 1).

Правила — раздел «Карта забега» спеки; погода «Праздник» — вес сцены ×2, «Час пик» — бой ×1,5 и скамейка ×0,5; туман ≥ 4 — элиты с ряда 3. id станции — `r<ряд>l<путь>`.

- [ ] **Step 1: тесты** на 200 зёрнах: ряд 1 — два боя; ряд 9 — `rest` и `shop`; ряд 10 — один `boss`; в рядах 3 и 6 есть `scene`; элиты только в рядах 4–8 (с туманом 4 — 3–8), не больше одной в ряду, хотя бы одна на карте; из каждой станции рядов 1–9 есть переход, каждая станция рядов 2–10 достижима из ряда 1; переходы только к соседним путям (|Δlane| ≤ 1); соседние по переходу небоевые станции разного типа; одно зерно — одна карта.
- [ ] **Step 2:** падают. **Step 3:** генерация (пути строятся пересекающимися тропами по трём линиям, тип — по весам с повтором при нарушении правил, до 50 попыток на ряд, затем бой). **Step 4:** зелёные.
- [ ] **Step 5: commit** `feat(english): карта линии забега`.

### Задача 4: колода забега и оценка карточки

**Files:** Create `game/model/run-deck.ts`, `game/model/run-deck.test.ts`

**Interfaces:**
- Consumes: `catalog`, `deckOf`, `queue`, `DeckCard` (`model/deck.ts`), `review`, `CardState`, `Grade` (`model/srs.ts`), `rng.ts`.
- Produces:
  - `buildRunDeck(input: { deck: DeckCard[]; states: ReadonlyMap<string, CardState>; now: number; newLimit: number }, rng: number): [RunCard[], number]` — порядок из спеки, до 60, новых ≤ 6 и ≤ остатка лимита.
  - `gradeFor(verdict: Verdict, state: CardState | undefined, now: number): Grade | null` — таблица спеки; `null` — карточку не трогать.
  - `nextCard(s: { deck: RunCard[]; returns: …; turn: number; sinceNew: number }): { card: RunCard; from: 'deck' | 'return' } | null` — возврат, чей ход настал, раньше колоды; новое — не чаще раза в 4 хода (иначе берётся первое не новое).
  - `queueReturn(returns, id, turn, rng): [returns, rng]` — через 3–5 ходов, `left` = 2 → 1 → 0 (больше не возвращается).
  - `typoDistance(a: string, b: string): number` — Дамерау–Левенштейн по нормализованным строкам; `isTypo(given, target)` — 1 правка от 5 букв, 2 — от 9.
  - `fogCount(deck, states, now): number` — карточек со сроком (строка тумана хаба).

- [ ] **Step 1: тесты.** `gradeFor`: новая + `recall` → 2; новая + `recognize` → 1; повтор со сроком + `recognize` → `null`; повтор + `wrong` → 0; срок не наступил + `recall` → `null`; `known` → `null`; `typo` → 1. `buildRunDeck`: просроченные первыми по сроку; новых не больше 6 и остатка лимита (лимит 20, сегодня уже 18 → 2); добор до 60 тегом `ahead`/`filler`; `known` нет. `nextCard`: возврат с наступившим ходом раньше колоды; новое не чаще раза в 4 хода. `isTypo('hosue','house')` — да; `isTypo('cat','cut')` — нет; `isTypo('beautiful','beautifull')` — да.
- [ ] **Step 2–4:** падают → реализация → зелёные.
- [ ] **Step 5: commit** `feat(english): колода забега и честная оценка карточки`.

### Задача 5: задания ударов и бой

**Files:** Create `game/model/challenge.ts`, `game/model/combat.ts`, тесты обоих.

**Interfaces:**
- Consumes: `buildQuiz` (`model/quiz.ts`), `isCorrect`, `normalize` (`model/check.ts`), `alignWords`, `alignScore` (`model/align.ts`), `scramble` логикой через `shuffleR`, `isTypo`.
- Produces:
  - `type Challenge = { mode: Mode; prompt: string; audio: string | null; options?: string[]; answer: number | string; bank?: string[]; length?: number; first?: string }` и `makeChallenge(card: RunCard, mode: Mode, pool: RunCard[], rng, opts: { firstLetter: boolean }): [Challenge, number]`. `order` — пример карточки (`example[0]`), без примера → `recall`. `dictate` — `prompt` пустой, `audio` = слово.
  - `judge(ch: Challenge, value: string | number | number[]): 'right' | 'typo' | 'wrong'`; `speak` — верно, если распознанное содержит слово эталона (`alignScore` ≥ 0,8 для фраз, точное совпадение нормализованного для одного слова среди слов распознанного).
  - `damageOf(i: { mode: Mode; combo: number; crit: boolean; weak?: Mode; resist?: Mode; sharpen: number; relics: RelicId[]; weather: WeatherId; character: CharacterId; boss: boolean; exerciseType?: Exercise['type']; typo: boolean; revenge: boolean }): number`.
  - `critWindow(mode, relics, weather, fog): number` (мс), `comboMult(combo): number`, `BASE: Record<Mode, number>`, `EXERCISE_DAMAGE`.
  - `enemyTurn(f: Fight, event: 'right' | 'wrong'): { fight: Fight; hit: number }` — правило намерения из спеки (верный — счётчик −1, на нуле удар; неверный — удар сразу и сброс); `absorb(hp, shield, hit, relics, fight): { hp, shield, blocked }` (Зонт — первый удар боя, Шарф — −1).

- [ ] **Step 1: тесты.** `damageOf`: `recall`, серия 0, без крита = 5; серия 4 → ×2 = 10; крит ×1,5; слабость ×1,5, стойкость ×0,5, минимум 1; Туман — крит у `recall` ×2; опечатка — половина; Мегафон +3 к `speak`; Студент по хранителю ×1,5; заточка +1 к базе. `enemyTurn`: `every` 4 — три верных без удара, четвёртый — удар и сброс; неверный — удар сразу; Смог `fast` — раз в 3. `absorb`: Зонт гасит первый удар боя, второй проходит; щит раньше здоровья. `judge`: выбор по индексу; ввод через `isCorrect`; опечатка; `order` по индексам банка; `speak` «a house» для `house` — верно. `makeChallenge`: 4 варианта без повторов, верный среди них; Карандаш — `first`.
- [ ] **Step 2–4:** падают → реализация → зелёные.
- [ ] **Step 5: commit** `feat(english): удары, урон и намерение противника`.

### Задача 6: ход сцены

**Files:** Create `game/content/scenes/types.ts`, `game/content/scenes/index.ts` (пока с одной сценой-образцом `hostel-hello` в `b1.ts`), `game/model/scene.ts`, `game/model/scene.test.ts`

**Interfaces:**
```ts
export interface Scene {
  id: string; unit: string; title: string;
  place: { en: string; ru: string }; npc: { name: string; role: string }; goal: string;
  vars?: Record<string, string[]>;
  steps: SceneStep[];
  phrases: [string, string][];
}
export type SceneStep =
  | { npc: string; ru: string }
  | { reply: SceneOption[]; accept?: string[] };
export interface SceneOption { en: string; ru: string; ok?: true; why?: string; react?: string; distract?: string }
export interface SceneRun {
  id: string; level: 1 | 2 | 3; vars: Record<string, string>; step: number;
  patience: number; mistakes: number; tries: number; struck: number[];
  options: SceneOption[] | null; bank: string[] | null; revealed: boolean;
  log: { who: 'npc' | 'me'; en: string; ru?: string; why?: string; ok?: boolean }[];
  done: null | 'ok' | 'fail';
}
```
- Produces: `fill(text, vars)`; `combos(scene, text): string[]` (все сочетания переменных в строке); `startScene(scene, level, rng, opts: { patience: number; guide: boolean }): [SceneRun, rng]`; `replyScene(run, scene, value, opts): { run: SceneRun; correct: boolean }`; `starsOf(run): 0 | 1 | 2 | 3`; `sceneLevels(runs: RunRow[]): Map<string, { level: 1|2|3; best: number[]; lastAt: number }>`; `pickScene(scenes, open: Set<string>, levels, recent: string[], rng): [Scene | null, rng]`.

- [ ] **Step 1: тесты.** `fill` подставляет `{price}`; `combos` перебирает 2 переменных (3 × 2 = 6); `distract`-вариант строит неверные с другими значениями; уровень 1 — неверный вычёркивается, терпение −1, шаг тот же; уровень 2 — банк слов верной реплики, две неудачи → верная показана, ошибка засчитана; уровень 3 — 80 % слов по выравниванию; Путеводитель — первая ошибка терпение не тратит; терпение 0 → `fail`; звёзды 3/2/1; `sceneLevels`: 2★ на уровне 1 → уровень 2, 1★ — нет, потолок 3; `pickScene` не берёт закрытые и сыгранные в двух последних забегах, пока есть другие.
- [ ] **Step 2–4:** падают → реализация → зелёные.
- [ ] **Step 5: commit** `feat(english): движок сцен — уровни, терпение, переменные`.

### Задача 7: движок забега

**Files:** Create `game/model/engine.ts`, `game/model/engine.test.ts`

**Interfaces:**
- Consumes: всё из задач 2–6; `Exercise`, `EXERCISES`, `COURSE`, `currentSection`, `openUnits`.
- Produces: `RunState`, `Screen`, `Action`, `Fight`, `BossPlan`, `RewardOption`, `Offer`; `startRun(input: { id: string; seed: number; now: number; day: string; character: CharacterId; fog: number; speech: boolean; deck: DeckCard[]; states: ReadonlyMap<string, CardState>; newLimit: number; lessons: ReadonlySet<string>; scenes: { open: Set<string>; levels: ReturnType<typeof sceneLevels>; recent: string[] } }): RunState`; `step(s, a)`; `scoreOf(s)`; `depthOf(s)`; `toRunRow(s, now): RunRow`; `currentExercise(s): Exercise | null`; `currentScene(s): Scene | null`.

Поведение — разделы спеки «Бой», «Хранитель», «Сцены», «Лавка, скамейка, находка», «Итог». Ключевые моменты:
- `go` только в `reachable`; приход на станцию строит экран (бой — противник ряда по `ENEMIES` и речи; элита — из `ELITES`; хранитель — сначала `bossIntro`).
- В бою: фаза `intro` у нового слова (ход не тратится) → `choose` → `mode` строит задание (у элиты — только её удары, у хранителя удара нет: `next` выдаёт упражнение по фазе) → `answer`/`exercise`/`dontKnow` → `result` → `next`. Эффекты: `card` (первый ответ на карточку, `verdict` по таблице: `recall`/`speak` верно → `recall`, опечатка → `typo`, `recognize`/`listen` верно → `recognize`, неверно и «Не помню» → `wrong`; `speak` без «Не помню» после двух попыток — `none`; `order`/`dictate` и повторные — `none`), `count: game` для ответов без `card`, `exercise` у хранителя, звуки.
- `speak`: первая неудача — `tries` 1, задание остаётся; вторая — неверно.
- Возвраты: неверное слово → `queueReturn`; верный ответ на возврате → `stats.revenge++`.
- Убит противник: награда (`reward`), у элиты — `find` с двумя находками и 15 шиллингов, у хранителя — `end` с `outcome: 'win'`. Здоровье 0 — `end` с `dead`.
- `quit` с любого экрана — `end` с `quit`.
- Сцена: `reply` → `replyScene`; конец — награда шиллингами, на 3★ — `find`; провал — −4 здоровья; эффект `count: phrases` на голосовом ответе уровня 3, иначе `count: game`; `stats.scenes` пополняется.
- Скамейка `review` — подзабег из ошибок (`RunCard[]` до 6), ответы вводом через `answer`, +3 здоровья за верное, без `card`-эффектов.
- Счёт — `scoreOf` по формуле спеки.

- [ ] **Step 1: тесты** (зерно фиксировано, колода — 30 искусственных карточек): `startRun` даёт карту и полное здоровье персонажа; `go` на недостижимую — состояние не меняется; бой: новое слово → `intro`, `next` → `choose`; `mode: recall` + верный ответ → урон 5, эффект `card/recall`; второй ответ на ту же карточку — без `card`; неверный → удар противника и `card/wrong`, слово в возвратах; «Не помню» в `speak` → `card/wrong`; две неудачи `speak` → без `card`; убийство → `reward`; выбор награды → `map`; хранитель: `bossIntro` → `next` → упражнение фазы 1 (`choice`), `exercise` неверно → эффект `exercise` с `correct: false`; смерть → `end`, `outcome: 'dead'`; `quit`; `JSON.parse(JSON.stringify(s))` после каждого шага даёт тот же следующий шаг (сериализуемость); `toRunRow` — `depth`, `score`, `stats.v === 1`.
- [ ] **Step 2–4:** падают → реализация → зелёные.
- [ ] **Step 5: commit** `feat(english): движок забега`.

### Задача 8: мета — открытия, задания, погода, рекорды

**Files:** Create `game/model/meta.ts`, `game/model/meta.test.ts`

**Interfaces:**
- Consumes: `RunRow`, контент задачи 2, `sceneLevels`, `localDay`, `shiftDay`, `seedOf`.
- Produces: `totals(runs): Totals` (`voice`, `revenge`, `scenes3` — разных сцен на 3★, `runs`, `reachedBoss`, `bossBeaten`, `bestCombo`, `quests` — выполненных заданий всего); `unlocked(runs): Set<UnlockId>`; `availableRelics(runs, speech): RelicId[]`; `availableCharacters(runs, speech): CharacterId[]`; `maxFog(runs): number` (победа на N открывает N+1, после первой победы — 1); `weatherOf(day: string): WeatherId` (зерно — дата, не как вчера); `questsOf(day, runs, speech, newLeft): QuestDef[]` (по одному из групп, учебное — чаще по навыку с наименьшей долей за 7 дней); `questProgress(q, todayStats: RunStats[]): number`; `gameStreak(runs, today): number`; `goldDays(runs, today, 14): ('none' | 'played' | 'gold')[]`; `records(runs): { best: Map<number, number>; depth; wins; combo; runs; recalled }`.

- [ ] **Step 1: тесты.** Пустые забеги — открыто только стартовое, `maxFog` 0; победа на 0 → 1, на 1 → 2; `voice` 20 открывает Мегафон, 30 — Диктора; без речи Диктора и Мегафона нет; `weatherOf` детерминирован и не равен вчерашнему на 60 днях подряд; `questsOf` — три разных группы, без речи нет «скажи», `newLeft` < 5 — нет «познакомься»; `questProgress` складывает забеги дня; `gameStreak`: сегодня не играл — серия до вчера; `goldDays` — золото, когда все три выполнены.
- [ ] **Step 2–4:** падают → реализация → зелёные.
- [ ] **Step 5: commit** `feat(english): мета игры — открытия, погода, задания, серия`.

### Задача 9: баланс прогоном ботов (КТ2 после неё)

**Files:** Create `game/model/balance.test.ts`; Modify числа в `content/enemies.ts`, `content/bosses.ts`, `model/combat.ts` по итогам.

**Interfaces:**
- Consumes: `startRun`, `step`, `currentExercise`, `currentScene`.
- Produces: `simulate(seed: number, p: number): { win: boolean; actions: number }` (внутри теста): бот идёт по карте (сцена > бой > находка > элита при здоровье > 60 % > лавка > скамейка), выбирает удары смесью (40 % `recall`, 25 % `recognize`, 20 % `listen`, 15 % `speak`), отвечает верно с вероятностью p (своим генератором), в сценах — уровень 1, награды — здоровье при здоровье < 50 %, иначе заточка `recall`.

- [ ] **Step 1:** тест: 100 зёрен, туман 0 — `p = 0,9` побеждает в 55–85 %, `p = 0,7` — меньше 35 %, медиана действий 45–65.
- [ ] **Step 2:** прогнать, записать фактические числа.
- [ ] **Step 3:** подогнать стартовые числа (здоровье и удар противников, `every`, урон хранителя) до коридора; изменённые числа — и в спеку.
- [ ] **Step 4:** зелёный.
- [ ] **Step 5: commit** `test(english): баланс игры прогоном ботов`.
- [ ] **КТ2 (A — данные карточек владельца и ядро):** ревьюер сверяет `gradeFor` и эффекты движка с таблицей спеки (карточку трогает только первый ответ, `recognize` не продлевает выученное, голос без «Не помню» не трогает), сериализуемость, правила карты и бой против спеки.

### Задача 10: двадцать четыре сцены (КТ3 после неё)

**Files:** Create `game/content/scenes/b1.ts`…`b8.ts` (по три сцены); Modify `game/content/scenes/index.ts`, `game/content/content.test.ts`, `views/english/tools/export-texts.ts`

Сцены пишет субагент Sonnet по списку спеки и образцу `hostel-hello`: 5–6 ответов игрока; у шага ответа ровно один верный, два неверных — грамматическая ошибка и мимо смысла/грубость, у каждого неверного `why` по-русски и `react` собеседника; переменные — до 6 значений, до 12 сочетаний на реплику; лексика — уровень блока, готовые обороты допустимы; тексты свои, не из книги. `unit` — `sp`, `u04`, `u07`, `u10`, `u13`, `u16`, `u19`, `u22`.

- [ ] **Step 1: тесты материала** в `content.test.ts`: 24 сцены, id уникальны; `unit` есть в `COURSE`; у каждого `reply` ровно один `ok`, у остальных `why` и `react`; `distract` ссылается на существующую переменную; `combos` каждой строки ≤ 12; с начала (`openUnits` пустого прогресса) открыты три; `accept` и `en` верных нормализуются в непустую строку; ключевых фраз 2–3.
- [ ] **Step 2:** субагент пишет `b1`…`b8`; тесты зелёные.
- [ ] **Step 3:** `export-texts` добавляет реплики собеседника (`combos`), `react`, верные ответы (`combos`) и ключевые фразы; прогон выгрузки — без ошибок, число строк растёт.
- [ ] **Step 4: commit** `feat(english): 24 сцены игры`.
- [ ] **КТ3 (B — материал, на котором учится владелец):** ревьюер (Sonnet) читает все сцены: естественность английского, верность переводов и `why`, уровень лексики по блоку, нет ли двух верных вариантов.

### Задача 11: страница игры (КТ4 после неё)

**Files:**
- Create: `game/useRun.ts`, `game/sound.ts`, `game/components/*`, `game/GamePage.tsx`, `game/game.css`, `frontend/src/app/admin/(in)/english/game/page.tsx`
- Modify: `views/english/Layout.tsx`, `views/english/english.css`, `views/english/TodayPage.tsx`

**Interfaces:**
- Consumes: `useEnglishState`, `useSaveCard`, `useAnswer`, `usePhraseDone`, `useGameDone`, `useAddWord`, `useRuns`, `useSaveRun`; `speak`, `listen`, `canListen`; `ExerciseView` (ход хранителя); `LessonView`-блоки (`Blocks`) для «Освежить правило»; движок и мета.
- Produces: `useRun(): { run: RunState | null; start(opts): void; dispatch(a: Action): void; discard(): void }` — состояние в `localStorage` `virex.english.game.run` (версия, битое — `null`), каждое `dispatch` пишет состояние и исполняет эффекты: `card` → `gradeFor(verdict, свежее состояние из кэша, now)` → `useSaveCard` (или ничего), `exercise` → `useAnswer`, `count` → `useGameDone`/`usePhraseDone`, `word` → `useAddWord`, `sound` → `sound.ts`. Экран `end` → `useSaveRun` с `toRunRow`; ошибка — строка в `virex.english.game.pending`, хаб досылает.

Состав экрана — раздел спеки «Экран „Игра“» и «Вид и звук». Детали:
- `Hub`: строка тумана (`fogCount`), «Начать / Продолжить», персонаж и туман — `Seg`, погода, задания с прогрессом (`questProgress` по забегам дня и текущему), полоса 14 дней, рекорды, коллекция (свёрнутые `details`), последние 5 забегов; первый вход — три строки сюжета.
- `LineMap`: SVG-схема, путь — `reachable`, пройденное сплошной линией.
- `Fight`: противник, намерение, `Fog` (слой зерна один раз в `canvas` → data URL, `opacity` = доля здоровья, сдвиг на попадании), метка слова, удары 2×2 с уроном (с учётом слабости), задание, полоса окна крита (`transform: scaleX`), результат (неверно — карточка целиком и «Дальше»), всплывающее число урона. Клавиши: 1–4, Enter, пробел, Esc. Поле ввода — `autoCapitalize="off" autoCorrect="off" spellCheck={false}`, клетки длины под полем.
- `BossTurn`: `ExerciseView` с ключом по упражнению, `onAnswer` → `exercise`; экран `bossIntro` — имя, грамматика, «Освежить правило» (блоки `rule` и `note` уроков блока).
- `SceneView`: табличка места, лента, ответ по уровню (варианты / банк слов / микрофон или ввод), терпение точками, итог с фразами и «+ в мои слова».
- `Shop`, `Rest`, `Find`, `Reward`, `Results` (раздел «Итог» спеки), `StatusBar`, `Pause` (продолжить, правила, звук, сдаться).
- Подсказки первого раза — `virex.english.game.tips` (набор id).
- `Layout`: вкладка «Игра» (`Gamepad2`) второй; при `data-run="1"` у `.en-app` панель скрыта (атрибут ставит `GamePage` через контекст-проп `Layout` — `EnglishLayout` читает `useSyncExternalStore` от простого стора `runActive` в `game/useRun.ts`).
- `english.css`: `repeat(7, …)` у панели; `TodayPage`: строка «Игра» — `заданий дня N из 3` / «туман: N слов», `done` — все три.
- `sound.ts`: Web Audio, ленивый контекст на первом жесте, `virex.english.game.sound` (вкл по умолчанию).

- [ ] **Step 1: тест** `useRun`-логики вынесенной функцией `applyEffects(effects, deps)` (`game/model/effects.ts` + тест): `card/recognize` по выученной карточке со сроком — `saveCard` не зовётся; по новой — зовётся с `review(null, 1, now)`; `exercise` → `answer` с тем же `itemId`; `count` → нужный счётчик.
- [ ] **Step 2:** падает → `effects.ts` → зелёный.
- [ ] **Step 3:** компоненты, страница, маршрут, вкладка, `Today`, CSS, звук.
- [ ] **Step 4:** `npx vitest run src/views/english`, `npx tsc --noEmit`, `npx eslint src/views/english src/app/admin`, `npx next build` — зелёные.
- [ ] **Step 5: commit** `feat(english): страница игры «Mind the Gap»`.
- [ ] **КТ4 (B — стык движка и мутаций):** ревьюер сверяет исполнение эффектов, сохранение и восстановление забега, досылку, скрытие панели, клавиши, мобильную раскладку по CSS.

### Задача 12: живой прогон и финал

- [ ] **Step 1:** `db push` локально (`cd backend && npx prisma db push`), поднять стек, Playwright в окне 390×844 под владельцем-админом локально: пройти забег до хранителя (подбирая ответы из состояния страницы), сцену, лавку, скамейку; перезагрузка посреди боя — забег продолжается; итог уходит в `english_runs`; «Сегодня» видит игру.
- [ ] **Step 2:** найденное — исправить, тесты зелёные, commit `fix(english): по живому прогону игры`.
- [ ] **Step 3:** CLAUDE.md — короткий раздел «Игра в учебнике» (что, где, правила, которые нельзя нарушать: честная оценка, первый ответ, без таймера с поражением, без рисованных персонажей); память проекта.
- [ ] **Step 4:** финальное ревью Opus по ветке; правки; commit.
- [ ] **Step 5:** доложить владельцу: что сделано, что не проверено (голос на телефоне, записи сцен не сгенерированы и не залиты — звучит голос браузера), шаги деплоя (`db push` на сервере делает деплой? — проверить `deploy/deploy.sh`; озвучка — `export-texts`, `audio.py`, `tar` на сервер).
