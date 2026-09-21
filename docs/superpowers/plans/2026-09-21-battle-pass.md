# Battle Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Игрок получает XP за игры, копит сезонный уровень и забирает за уровни монеты; отдельно — ежедневная награда за заход, растущая до седьмого дня подряд; всё это видно на новой странице `/profile`.

**Architecture:** Новый модуль `backend/src/battlepass` — чистые функции (сезон, уровни, ежедневка) плюс сервис, который принимает клиент транзакции и начисляет XP из чужих транзакций, как `CoinsService`. Сезон вычисляется из календаря (квартал UTC), уровень выводится из XP, ежедневка выводится из журнала монет — новых источников правды заводится ровно два: прогресс сезона и журнал XP. На фронте — сущность `entities/battle-pass` и страница `views/profile`.

**Tech Stack:** NestJS + Prisma + PostgreSQL (backend, тесты — jest), Next.js App Router + FSD + React Query + next-intl (frontend, тесты — vitest).

**Спека:** `docs/superpowers/specs/2026-09-21-battle-pass-design.md` — читать перед началом, она объясняет «почему», этот план говорит «как».

## Global Constraints

- **Язык кода и комментариев** — как в проекте: комментарии по-русски, объясняют решение, а не пересказывают строку.
- **Слой страниц фронта — `frontend/src/views/`, не `src/pages/`** (`src/pages` трактуется как Pages Router и роняет `next build`). Проверять фронт `npx next build`, а не только `tsc`.
- **Страница `/profile` — обычная страница продукта, не игровая:** чёрное поле, скругления и палитра `--g-*` живут только внутри `/games`. Здесь — `PageHead`, `SectionHead`, `Button`, `KeyValue`, нулевой радиус, цвета классами из `globals.css`, никакого инлайнового `style` для цвета.
- **Никакой сырой разметки для повторяющихся элементов** — только `shared/ui`.
- **Блоки одной страницы живут в `views/<page>/components/`**, не в `widgets/`: в `widgets/` переезжает только то, что грепом подтверждено на двух страницах.
- **Монеты и XP меняются только в транзакции вызывающего**: методы `CoinsService` и `BattlePassService`, которые пишут, принимают `tx: Prisma.TransactionClient` и своей транзакции не открывают.
- **Тексты — в `frontend/src/shared/i18n/messages/ru.json` и `en.json`**, оба файла правятся вместе.
- **Все даты и границы суток — UTC.**
- Запуск тестов: backend — `cd backend && npx jest <путь>`, frontend — `cd frontend && npx vitest run <путь>`.
- **`prisma generate` на Windows падает с EPERM, пока запущен `nest start --watch`** — перед генерацией остановить dev-процессы backend.

---

### Task 1: Чистые функции сезона, уровней и ежедневки

Правила Battle Pass целиком: какой сейчас сезон, какой уровень у такого-то XP, сколько монет за уровень, какой сегодня день ежедневной награды. Ни базы, ни Nest — только функции и константы, поэтому и проверяются они первыми.

**Files:**
- Create: `backend/src/battlepass/battlepass.config.ts`
- Create: `backend/src/battlepass/season.ts`
- Create: `backend/src/battlepass/levels.ts`
- Create: `backend/src/battlepass/daily.ts`
- Test: `backend/src/battlepass/season.spec.ts`
- Test: `backend/src/battlepass/levels.spec.ts`
- Test: `backend/src/battlepass/daily.spec.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `MAX_LEVEL: number`, `XP_BASE: number`, `XP_STEP: number`, `REWARD_BASE: number`, `REWARD_TIER: number`, `DAILY_REWARD_COINS: readonly number[]`, `DAILY_CYCLE: number`
  - `seasonKey(date: Date): string`, `seasonBounds(key: string): { startsAt: Date; endsAt: Date }`
  - `xpToAdvance(fromLevel: number): number`, `xpForLevel(level: number): number`, `levelFromXp(xp: number): { level: number; xpIntoLevel: number; xpToNext: number }`, `rewardCoins(level: number): number`, `coinsBetween(fromLevel: number, toLevel: number): number`, `ladder(): LadderRow[]` где `LadderRow = { level: number; xp: number; coins: number }`
  - `dayKey(date: Date): string`, `startOfUtcDay(date: Date): Date`, `recentDayKeys(today: Date): string[]`, `dailyState(days: Set<string>, today: Date): DailyState` где `DailyState = { day: number; streak: number; claimedToday: boolean; coins: number; nextCoins: number; week: number[] }`

- [ ] **Step 1: Написать конфиг**

Создать `backend/src/battlepass/battlepass.config.ts`:

```ts
/**
 * Числа Battle Pass. Константы кода, а не переменные окружения: забытая
 * переменная означала бы либо молча изменившуюся цену уровня, либо бесплатные
 * монеты, — тот же довод, по которому константой задан курс доната.
 *
 * Кривую придётся править по живым данным, и править её нужно здесь, а не в
 * литералах по месту вызова.
 */

/** Последний уровень сезона. Выше него XP копится, но наград больше нет. */
export const MAX_LEVEL = 50;

/** XP за переход с первого уровня на второй. */
export const XP_BASE = 100;

/** На столько дорожает каждый следующий переход: 100, 120, 140, … */
export const XP_STEP = 20;

/**
 * Монет за уровень в первой десятке. Каждая следующая десятка прибавляет
 * столько же: 50 за уровни 2–10, 100 за 11–20 и так до 250 — весь трек ≈7400
 * монет за сезон.
 */
export const REWARD_BASE = 50;

/** Через сколько уровней награда поднимается на ступень. */
export const REWARD_TIER = 10;

/**
 * Ежедневная награда по дням подряд. За полную неделю ровно 1000 монет —
 * столько же даёт новый аккаунт и один приглашённый, и это не совпадение:
 * все три числа отвечают на вопрос «сколько монет стоит одно доброе дело».
 */
export const DAILY_REWARD_COINS = [50, 75, 100, 125, 150, 200, 300] as const;

/** Длина цикла ежедневных наград. После седьмого дня всё начинается заново. */
export const DAILY_CYCLE = DAILY_REWARD_COINS.length;
```

- [ ] **Step 2: Написать падающий тест сезона**

Создать `backend/src/battlepass/season.spec.ts`:

```ts
import { seasonBounds, seasonKey } from './season';

describe('seasonKey', () => {
  it('квартал считается по UTC, с единицы', () => {
    expect(seasonKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-Q1');
    expect(seasonKey(new Date('2026-03-31T23:59:59Z'))).toBe('2026-Q1');
    expect(seasonKey(new Date('2026-04-01T00:00:00Z'))).toBe('2026-Q2');
    expect(seasonKey(new Date('2026-09-21T12:00:00Z'))).toBe('2026-Q3');
    expect(seasonKey(new Date('2026-12-31T23:59:59Z'))).toBe('2026-Q4');
  });

  it('стык года — это смена сезона, а не его продолжение', () => {
    expect(seasonKey(new Date('2027-01-01T00:00:00Z'))).toBe('2027-Q1');
  });
});

describe('seasonBounds', () => {
  it('начало — первый миг квартала, конец — последний', () => {
    const q4 = seasonBounds('2026-Q4');
    expect(q4.startsAt.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(q4.endsAt.toISOString()).toBe('2026-12-31T23:59:59.999Z');
  });

  it('границы сезона принадлежат ему самому', () => {
    const { startsAt, endsAt } = seasonBounds('2026-Q1');
    expect(seasonKey(startsAt)).toBe('2026-Q1');
    expect(seasonKey(endsAt)).toBe('2026-Q1');
  });
});
```

- [ ] **Step 3: Запустить — убедиться, что падает**

Run: `cd backend && npx jest src/battlepass/season.spec.ts`
Expected: FAIL — `Cannot find module './season'`

- [ ] **Step 4: Реализовать `season.ts`**

```ts
/**
 * Сезон Battle Pass — календарный квартал UTC.
 *
 * Таблицы сезонов нет намеренно. Сезон, который кто-то должен создать заранее,
 * это ещё одно место, где забытая запись останавливает продукт: без строки
 * следующего квартала XP перестал бы начисляться молча. Квартал же известен из
 * календаря, и «сезон начался» — не событие, а смена ключа, по которому
 * пишется прогресс. Тот же приём, что у визитов в админке: выводится, а не
 * хранится.
 */

/** Ключ сезона: '2026-Q4'. */
export function seasonKey(date: Date): string {
  const year = date.getUTCFullYear();
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

/**
 * Границы сезона. `endsAt` — последний его миг, а не первый миг следующего:
 * это число показывается человеку как срок, и «до 1 января» вместо
 * «до 31 декабря» он прочитал бы как лишний день.
 */
export function seasonBounds(key: string): { startsAt: Date; endsAt: Date } {
  const [year, quarter] = key.split('-Q').map(Number);
  const firstMonth = (quarter - 1) * 3;
  return {
    startsAt: new Date(Date.UTC(year, firstMonth, 1)),
    endsAt: new Date(Date.UTC(year, firstMonth + 3, 1) - 1),
  };
}
```

- [ ] **Step 5: Запустить — убедиться, что проходит**

Run: `cd backend && npx jest src/battlepass/season.spec.ts`
Expected: PASS, 4 теста

- [ ] **Step 6: Написать падающий тест уровней**

Создать `backend/src/battlepass/levels.spec.ts`:

```ts
import { MAX_LEVEL, REWARD_BASE } from './battlepass.config';
import { coinsBetween, ladder, levelFromXp, rewardCoins, xpForLevel, xpToAdvance } from './levels';

describe('levelFromXp', () => {
  it('пустой счёт — первый уровень, до второго сто XP', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, xpIntoLevel: 0, xpToNext: 100 });
  });

  it('ровно на границе уровень уже новый', () => {
    expect(levelFromXp(100).level).toBe(2);
    expect(levelFromXp(99).level).toBe(1);
  });

  it('обратна xpForLevel на всём треке', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      expect(levelFromXp(xpForLevel(level)).level).toBe(level);
      if (level > 1) expect(levelFromXp(xpForLevel(level) - 1).level).toBe(level - 1);
    }
  });

  it('выше потолка уровень не растёт, и идти больше некуда', () => {
    expect(levelFromXp(xpForLevel(MAX_LEVEL) + 1_000_000)).toEqual({
      level: MAX_LEVEL,
      xpIntoLevel: 0,
      xpToNext: 0,
    });
  });

  it('отрицательный и дробный XP не ломают счёт', () => {
    expect(levelFromXp(-5).level).toBe(1);
    expect(levelFromXp(150.7).level).toBe(2);
  });
});

describe('xpToAdvance', () => {
  it('каждый следующий переход дороже предыдущего на шаг', () => {
    expect(xpToAdvance(1)).toBe(100);
    expect(xpToAdvance(2)).toBe(120);
    expect(xpToAdvance(49)).toBe(1060);
  });
});

describe('rewardCoins', () => {
  it('ступень на каждую десятку уровней', () => {
    expect(rewardCoins(2)).toBe(REWARD_BASE);
    expect(rewardCoins(10)).toBe(REWARD_BASE);
    expect(rewardCoins(11)).toBe(REWARD_BASE * 2);
    expect(rewardCoins(MAX_LEVEL)).toBe(REWARD_BASE * 5);
  });
});

describe('coinsBetween', () => {
  it('складывает награды за уровни, которые ещё не забраны', () => {
    expect(coinsBetween(0, 3)).toBe(rewardCoins(2) + rewardCoins(3));
    expect(coinsBetween(2, 3)).toBe(rewardCoins(3));
  });

  it('за первый уровень награды нет — её не за что давать', () => {
    expect(coinsBetween(0, 1)).toBe(0);
  });

  it('забирать нечего, если забрано всё', () => {
    expect(coinsBetween(7, 7)).toBe(0);
    expect(coinsBetween(9, 7)).toBe(0);
  });
});

describe('ladder', () => {
  it('лестница начинается со второго уровня и кончается потолком', () => {
    const rows = ladder();
    expect(rows[0].level).toBe(2);
    expect(rows[rows.length - 1].level).toBe(MAX_LEVEL);
    expect(rows).toHaveLength(MAX_LEVEL - 1);
  });

  it('в строке стоит порог уровня, а не стоимость перехода', () => {
    expect(ladder()[0].xp).toBe(xpForLevel(2));
  });
});
```

- [ ] **Step 7: Запустить — убедиться, что падает**

Run: `cd backend && npx jest src/battlepass/levels.spec.ts`
Expected: FAIL — `Cannot find module './levels'`

- [ ] **Step 8: Реализовать `levels.ts`**

```ts
import { MAX_LEVEL, REWARD_BASE, REWARD_TIER, XP_BASE, XP_STEP } from './battlepass.config';

/**
 * Уровни сезона и награды за них.
 *
 * Уровень нигде не хранится — он функция от XP. Правило начисления это
 * соглашение, а не факт о человеке, и сохранённый уровень пришлось бы
 * пересчитывать задним числом при любой правке кривой. Тот же довод, что у
 * рейтинга турниров.
 */

export interface LadderRow {
  level: number;
  /** Сколько XP нужно накопить за сезон, чтобы уровень стал этим. */
  xp: number;
  coins: number;
}

/** Сколько XP нужно, чтобы уйти с этого уровня на следующий. */
export const xpToAdvance = (fromLevel: number): number => XP_BASE + XP_STEP * (fromLevel - 1);

/** Порог уровня — сумма всех переходов до него. */
export function xpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToAdvance(l);
  return total;
}

/**
 * Уровень и место внутри него. Перебором по той же формуле, что рисует
 * лестницу: пятьдесят шагов дешевле любой попытки решить это в закрытом виде,
 * а главное — не разойдётся с лестницей при правке кривой.
 */
export function levelFromXp(xp: number): { level: number; xpIntoLevel: number; xpToNext: number } {
  let rest = Math.max(0, Math.floor(xp));
  let level = 1;
  while (level < MAX_LEVEL) {
    const need = xpToAdvance(level);
    if (rest < need) return { level, xpIntoLevel: rest, xpToNext: need - rest };
    rest -= need;
    level += 1;
  }
  // Потолок: XP дальше копится, но идти больше некуда, и полосу прогресса
  // некуда двигать — она полна.
  return { level: MAX_LEVEL, xpIntoLevel: 0, xpToNext: 0 };
}

/** Монет за достижение уровня. За первый награды нет: её не за что давать. */
export const rewardCoins = (level: number): number =>
  level < 2 ? 0 : REWARD_BASE * (1 + Math.floor((level - 1) / REWARD_TIER));

/** Сколько монет ждёт того, кто забрал награды до `fromLevel`, а стоит на `toLevel`. */
export function coinsBetween(fromLevel: number, toLevel: number): number {
  let sum = 0;
  for (let l = Math.max(2, fromLevel + 1); l <= toLevel; l++) sum += rewardCoins(l);
  return sum;
}

/** Весь трек сезона — его рисует фронт, и считает его сервер (см. спеку). */
export function ladder(): LadderRow[] {
  const rows: LadderRow[] = [];
  for (let level = 2; level <= MAX_LEVEL; level++) {
    rows.push({ level, xp: xpForLevel(level), coins: rewardCoins(level) });
  }
  return rows;
}
```

- [ ] **Step 9: Запустить — убедиться, что проходит**

Run: `cd backend && npx jest src/battlepass/levels.spec.ts`
Expected: PASS

- [ ] **Step 10: Написать падающий тест ежедневки**

Создать `backend/src/battlepass/daily.spec.ts`:

```ts
import { DAILY_REWARD_COINS } from './battlepass.config';
import { dailyState, dayKey, recentDayKeys, startOfUtcDay } from './daily';

const TODAY = new Date('2026-09-21T10:00:00Z');
const days = (...keys: string[]) => new Set(keys);

describe('dayKey', () => {
  it('дата UTC, без времени', () => {
    expect(dayKey(new Date('2026-09-21T23:59:59Z'))).toBe('2026-09-21');
  });
});

describe('startOfUtcDay', () => {
  it('срезает время до полуночи UTC', () => {
    expect(startOfUtcDay(TODAY).toISOString()).toBe('2026-09-21T00:00:00.000Z');
  });
});

describe('recentDayKeys', () => {
  it('восемь дат: сегодня и семь предыдущих', () => {
    const keys = recentDayKeys(TODAY);
    expect(keys).toHaveLength(8);
    expect(keys[0]).toBe('2026-09-21');
    expect(keys[7]).toBe('2026-09-14');
  });
});

describe('dailyState', () => {
  it('первый заход: день первый, награда не забрана', () => {
    expect(dailyState(days(), TODAY)).toEqual({
      day: 1,
      streak: 0,
      claimedToday: false,
      coins: DAILY_REWARD_COINS[0],
      nextCoins: DAILY_REWARD_COINS[1],
      week: [...DAILY_REWARD_COINS],
    });
  });

  it('забрал сегодня — стрик считает и сегодняшний день', () => {
    const state = dailyState(days('2026-09-21'), TODAY);
    expect(state.claimedToday).toBe(true);
    expect(state.day).toBe(1);
    expect(state.streak).toBe(1);
  });

  it('три дня подряд до сегодня — сегодня четвёртый', () => {
    const state = dailyState(days('2026-09-20', '2026-09-19', '2026-09-18'), TODAY);
    expect(state.day).toBe(4);
    expect(state.coins).toBe(DAILY_REWARD_COINS[3]);
    expect(state.claimedToday).toBe(false);
  });

  it('пропущенный день возвращает к первому', () => {
    const state = dailyState(days('2026-09-19', '2026-09-18'), TODAY);
    expect(state.day).toBe(1);
    expect(state.streak).toBe(0);
  });

  it('полная неделя подряд — сегодня цикл начинается заново', () => {
    const week = days(
      '2026-09-20',
      '2026-09-19',
      '2026-09-18',
      '2026-09-17',
      '2026-09-16',
      '2026-09-15',
      '2026-09-14',
    );
    const state = dailyState(week, TODAY);
    expect(state.day).toBe(1);
    expect(state.coins).toBe(DAILY_REWARD_COINS[0]);
  });

  it('седьмой день — самая крупная награда, а завтра снова первая', () => {
    const six = days('2026-09-20', '2026-09-19', '2026-09-18', '2026-09-17', '2026-09-16', '2026-09-15');
    const state = dailyState(six, TODAY);
    expect(state.day).toBe(7);
    expect(state.coins).toBe(DAILY_REWARD_COINS[6]);
    expect(state.nextCoins).toBe(DAILY_REWARD_COINS[0]);
  });
});
```

- [ ] **Step 11: Запустить — убедиться, что падает**

Run: `cd backend && npx jest src/battlepass/daily.spec.ts`
Expected: FAIL — `Cannot find module './daily'`

- [ ] **Step 12: Реализовать `daily.ts`**

```ts
import { DAILY_CYCLE, DAILY_REWARD_COINS } from './battlepass.config';

/**
 * Ежедневная награда за заход.
 *
 * Своего состояния у неё нет: награда — это строка журнала монет с
 * `refId = 'YYYY-MM-DD'`, и всё остальное выводится из набора таких дат.
 * Отдельная таблица со счётчиком стрика была бы вторым источником того же
 * знания — и первым, что разойдётся с журналом после отката или ручной правки.
 */

export interface DailyState {
  /** День цикла, который забирается сегодня: с первого по седьмой. */
  day: number;
  /** Сколько дней подряд человек заходил, включая сегодня, если уже забрал. */
  streak: number;
  claimedToday: boolean;
  /** Монет за сегодняшний день. */
  coins: number;
  /** Монет за завтрашний, если он не будет пропущен. */
  nextCoins: number;
  /**
   * Суммы всего цикла — их рисует ряд из семи клеток. Едут с сервера, а не
   * повторяются в браузере: второй список тех же чисел разошёлся бы с первым
   * при первой же правке щедрости.
   */
  week: number[];
}

const DAY_MS = 86_400_000;

/** Дата UTC как ключ награды. */
export const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

export const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/**
 * Ключи, по которым спрашивается журнал: сегодня и семь предыдущих дней.
 * Выборка по известным ключам ограничена по построению — в отличие от
 * «последних семи строк», которые в истории с пропусками отвечают на другой
 * вопрос. Дальше восьми смотреть незачем: цикл замыкается на седьмом дне.
 */
export function recentDayKeys(today: Date): string[] {
  const start = startOfUtcDay(today).getTime();
  return Array.from({ length: DAILY_CYCLE + 1 }, (_, i) => dayKey(new Date(start - i * DAY_MS)));
}

export function dailyState(days: Set<string>, today: Date): DailyState {
  const start = startOfUtcDay(today).getTime();

  // Считаем назад от ВЧЕРА, а не от сегодня: день цикла не должен меняться
  // оттого, забрал человек награду или ещё только смотрит на кнопку.
  let previous = 0;
  while (previous < DAILY_CYCLE && days.has(dayKey(new Date(start - (previous + 1) * DAY_MS)))) {
    previous += 1;
  }

  // Полная неделя позади — сегодня первый день нового цикла.
  const day = (previous % DAILY_CYCLE) + 1;
  const claimedToday = days.has(dayKey(today));

  return {
    day,
    streak: claimedToday ? previous + 1 : previous,
    claimedToday,
    coins: DAILY_REWARD_COINS[day - 1],
    nextCoins: DAILY_REWARD_COINS[day % DAILY_CYCLE],
    week: [...DAILY_REWARD_COINS],
  };
}
```

- [ ] **Step 13: Запустить весь набор задачи**

Run: `cd backend && npx jest src/battlepass`
Expected: PASS, три файла, ~20 тестов

- [ ] **Step 14: Коммит**

```bash
cd E:/git/virex-trader
git add backend/src/battlepass
git commit --only backend/src/battlepass -m "feat(battlepass): сезон, уровни и ежедневка чистыми функциями" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Схема базы и реестр источников XP

Две новые таблицы и реестр, по которому начисляется XP. Реестр — единственный источник правды о том, за что дают опыт: новая игра подключается записью, а не правкой четырёх файлов.

**Files:**
- Modify: `backend/prisma/schema.prisma` (модель `User` — две обратные связи; новые модели в конце файла)
- Modify: `backend/src/coins/coins.service.ts:6-14` (типы `CoinTxKind`)
- Create: `backend/src/battlepass/xp-registry.ts`
- Test: `backend/src/battlepass/xp-registry.spec.ts`

**Interfaces:**
- Consumes: ничего из Task 1.
- Produces:
  - Prisma-модели `BattlePassProgress` (составной id `[userId, season]` → `where: { userId_season: { userId, season } }`) и `BattlePassXpEvent`
  - `CoinTxKind` пополняется `'BATTLEPASS_REWARD' | 'DAILY_REWARD'`
  - `XpSource = 'game.tournament' | 'game.backtest' | 'game.table' | 'journal.tag'`
  - `XP_SOURCES: Record<XpSource, XpSourceDef>`, `XpSourceDef = { title: string; enabled: boolean; base: number; perOpponent?: number; dailyCap: number | null }`
  - `tournamentXp(participants: number, place: number): number`

- [ ] **Step 1: Написать падающий тест реестра**

Создать `backend/src/battlepass/xp-registry.spec.ts`:

```ts
import { tournamentXp, XP_SOURCES } from './xp-registry';

describe('tournamentXp', () => {
  it('база плюс надбавка за каждого обойдённого соперника', () => {
    expect(tournamentXp(10, 1)).toBe(100 + 25 * 9);
    expect(tournamentXp(10, 10)).toBe(100);
    expect(tournamentXp(2, 2)).toBe(100);
  });

  it('место вне состава не уводит начисление ниже базы', () => {
    expect(tournamentXp(2, 5)).toBe(100);
  });
});

describe('XP_SOURCES', () => {
  it('карточные столы заведены, но пока не начисляют', () => {
    expect(XP_SOURCES['game.table'].enabled).toBe(false);
  });

  it('у фармящихся источников есть дневной потолок', () => {
    expect(XP_SOURCES['game.tournament'].dailyCap).toBe(1000);
    expect(XP_SOURCES['game.backtest'].dailyCap).toBe(300);
  });

  it('разметка тегом потолка не требует — её сторожит ключ по сделке', () => {
    expect(XP_SOURCES['journal.tag'].dailyCap).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd backend && npx jest src/battlepass/xp-registry.spec.ts`
Expected: FAIL — `Cannot find module './xp-registry'`

- [ ] **Step 3: Реализовать реестр**

Создать `backend/src/battlepass/xp-registry.ts`:

```ts
/**
 * Реестр источников XP — единственный источник правды о том, за что дают опыт.
 * Приём тот же, что у реестра уведомлений: добавить игру значит добавить
 * запись, а не править четыре файла.
 *
 * Числа живут здесь, форма формулы — по месту вызова: контекст («сколько было
 * участников», «какое место») знает только вызывающий, и тащить его сюда
 * значило бы описывать в реестре каждую будущую игру заранее.
 */

export type XpSource = 'game.tournament' | 'game.backtest' | 'game.table' | 'journal.tag';

export interface XpSourceDef {
  /** Заголовок для API; фронт переводит по ключу с откатом на него. */
  title: string;
  /** Начисляется ли сейчас. false — запись есть, кода начисления ещё нет. */
  enabled: boolean;
  /** База начисления за одно событие. */
  base: number;
  /** Надбавка за каждого обойдённого соперника. Есть только у турнира. */
  perOpponent?: number;
  /**
   * Потолок XP из этого источника за сутки UTC. null — потолка нет.
   *
   * Потолок здесь не украшение: турнир заводится на два своих аккаунта с
   * нулевым взносом, а сессия бектеста создаётся и завершается за секунды.
   * Без потолка трек набивается за вечер и перестаёт что-либо значить.
   */
  dailyCap: number | null;
}

export const XP_SOURCES: Record<XpSource, XpSourceDef> = {
  'game.tournament': {
    title: 'Турнир по торговле',
    enabled: true,
    base: 100,
    perOpponent: 25,
    dailyCap: 1000,
  },
  'game.backtest': { title: 'Сессия бектеста', enabled: true, base: 50, dailyCap: 300 },
  // Правил блэкджека и покера ещё нет — инфраструктура столов есть, игры нет.
  // Запись стоит здесь, чтобы её подключение было одной строкой `enabled: true`.
  'game.table': { title: 'Карточный стол', enabled: false, base: 0, dailyCap: null },
  // Потолок не нужен: ключ (userId, source, refId = id сделки) даёт XP один раз
  // на сделку навсегда, а число сделок человек не печатает.
  'journal.tag': { title: 'Разметка сделки тегом', enabled: true, base: 15, dailyCap: null },
};

/**
 * XP за турнир: база плюс надбавка за каждого, кого обошёл. Размер турнира
 * входит в цену победы — тот же довод, что в рейтинге игры: обыграть девятерых
 * весомее, чем одного.
 */
export function tournamentXp(participants: number, place: number): number {
  const def = XP_SOURCES['game.tournament'];
  return def.base + (def.perOpponent ?? 0) * Math.max(0, participants - place);
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `cd backend && npx jest src/battlepass/xp-registry.spec.ts`
Expected: PASS

- [ ] **Step 5: Добавить виды транзакций монет**

В `backend/src/coins/coins.service.ts` дополнить тип:

```ts
export type CoinTxKind =
  | 'DONATION'
  | 'TOURNAMENT_FEE'
  | 'TOURNAMENT_BONUS'
  | 'TOURNAMENT_REFUND'
  | 'TOURNAMENT_PRIZE'
  | 'GAME_BUYIN'
  | 'GAME_CASHOUT'
  | 'REFERRAL_BONUS'
  | 'BATTLEPASS_REWARD'
  | 'DAILY_REWARD';
```

- [ ] **Step 6: Добавить модели в схему**

В `backend/prisma/schema.prisma`, в модель `User`, рядом с `coinTransactions`:

```prisma
  /// Battle Pass: прогресс по сезонам и журнал начисленного XP.
  battlePassProgress BattlePassProgress[]
  battlePassXpEvents BattlePassXpEvent[]
```

В doc-комментарий `CoinTransaction` дописать новые виды к перечислению
(`BATTLEPASS_REWARD` — награда за уровень, `DAILY_REWARD` — ежедневная за заход).

В конец файла добавить:

```prisma
/// Прогресс Battle Pass за один сезон. Уровень не хранится — он функция от xp
/// (см. battlepass/levels.ts): правило начисления это соглашение, а не факт о
/// человеке, и сохранённый уровень пришлось бы пересчитывать задним числом при
/// любой его правке. Тот же довод, что у рейтинга турниров.
model BattlePassProgress {
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// Ключ сезона: '2026-Q4'. Календарный квартал UTC, см. battlepass/season.ts.
  season       String
  xp           Int      @default(0)
  /// До какого уровня награды забраны. Забирают подряд и всё сразу: награда
  /// одного вида — монеты, и выбирать, какую монету получить раньше, незачем.
  claimedLevel Int      @default(0)
  updatedAt    DateTime @updatedAt

  @@id([userId, season])
  @@map("battle_pass_progress")
}

/// Журнал начисленного XP — по строке на событие. Нужен ровно за тем же, за чем
/// CoinTransaction: чтобы «откуда взялось» имело ответ и чтобы одно событие не
/// было оплачено дважды, сколько бы раз его ни разобрали.
model BattlePassXpEvent {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  /// Сезон, в который начисление попало. Для выборки, не для ключа.
  season    String
  /// Ключ реестра: 'game.tournament', 'game.backtest', ...
  source    String
  /// Id того, за что начислено: турнира, сессии, сделки.
  refId     String
  /// Фактически начисленное — может быть 0, если упёрлись в дневной потолок.
  /// Строка нужна и в этом случае: она и есть отметка «событие разобрано».
  xp        Int
  createdAt DateTime @default(now())

  /// Ключ НЕ включает сезон: турнир, доигранный в последнюю минуту квартала и
  /// финализированный в первую минуту следующего, — одно событие.
  @@unique([userId, source, refId], map: "bp_xp_once")
  @@index([userId, season])
  @@index([userId, source, createdAt])
  @@map("battle_pass_xp_events")
}
```

- [ ] **Step 7: Сгенерировать клиент и накатить схему**

Остановить запущенные `nest start --watch` (иначе `prisma generate` упадёт с EPERM на Windows: движок держит файл), затем:

```bash
cd E:/git/virex-trader/backend
npx prisma generate
npx prisma db push
```

Expected: `generate` — `Generated Prisma Client`; `db push` — созданы две таблицы, данные не теряются (только добавление).

- [ ] **Step 8: Проверить, что backend компилируется**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json`
Expected: без ошибок

- [ ] **Step 9: Коммит**

```bash
cd E:/git/virex-trader
git add backend/prisma/schema.prisma backend/src/coins/coins.service.ts backend/src/battlepass
git commit --only backend/prisma/schema.prisma backend/src/coins/coins.service.ts backend/src/battlepass -m "feat(battlepass): таблицы прогресса и журнала XP, реестр источников" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `BattlePassService.award` и `state`

Начисление XP из чужой транзакции и чтение состояния. Здесь два условия, на которых всё держится: одно событие начисляется один раз, и повторный вызов **не роняет** транзакцию вызывающего.

**Files:**
- Create: `backend/src/battlepass/battlepass.service.ts`
- Create: `backend/src/battlepass/battlepass.module.ts`
- Test: `backend/src/battlepass/battlepass.service.spec.ts`

**Interfaces:**
- Consumes: `seasonKey`, `seasonBounds` (Task 1), `levelFromXp`, `coinsBetween`, `ladder` (Task 1), `XP_SOURCES`, `XpSource` (Task 2), `startOfUtcDay`, `recentDayKeys`, `dailyState`, `dayKey` (Task 1), `CoinsService` (существует).
- Produces:
  - `BattlePassService.award(tx: Prisma.TransactionClient, userId: string, source: XpSource, refId: string, xp: number, now?: Date): Promise<void>`
  - `BattlePassService.state(userId: string, now?: Date): Promise<BattlePassState>` где
    `BattlePassState = { season: { key: string; endsAt: Date }; xp: number; level: number; xpIntoLevel: number; xpToNext: number; claimedLevel: number; pendingCoins: number; levels: { level: number; xp: number; coins: number; state: 'claimed' | 'ready' | 'locked' }[]; daily: DailyState }`
  - `BattlePassModule` (экспортирует `BattlePassService`)

- [ ] **Step 1: Написать падающий тест**

Создать `backend/src/battlepass/battlepass.service.spec.ts`:

```ts
import { BattlePassService } from './battlepass.service';
import { XP_SOURCES } from './xp-registry';

const NOW = new Date('2026-09-21T10:00:00Z');
const SEASON = '2026-Q3';

/**
 * Поддельная база ведёт себя как Postgres ровно в тех двух местах, ради
 * которых тесты и написаны: `createMany` со `skipDuplicates` не бросает на
 * конфликте, а возвращает `count: 0`, и `aggregate` складывает то, что уже
 * начислено за сегодня.
 */
function fakeDb() {
  const events: { userId: string; season: string; source: string; refId: string; xp: number; createdAt: Date }[] = [];
  const progress = new Map<string, { userId: string; season: string; xp: number; claimedLevel: number }>();
  const key = (userId: string, season: string) => `${userId}:${season}`;

  const tx = {
    battlePassXpEvent: {
      createMany: jest.fn(async ({ data }: any) => {
        const rows = Array.isArray(data) ? data : [data];
        let count = 0;
        for (const row of rows) {
          const exists = events.some(
            (e) => e.userId === row.userId && e.source === row.source && e.refId === row.refId,
          );
          if (exists) continue;
          events.push({ ...row, createdAt: row.createdAt ?? NOW });
          count += 1;
        }
        return { count };
      }),
      aggregate: jest.fn(async ({ where }: any) => {
        const since = where.createdAt?.gte?.getTime() ?? 0;
        const sum = events
          .filter((e) => e.userId === where.userId && e.source === where.source && e.createdAt.getTime() >= since)
          .reduce((acc, e) => acc + e.xp, 0);
        return { _sum: { xp: sum } };
      }),
    },
    battlePassProgress: {
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const k = key(where.userId_season.userId, where.userId_season.season);
        const row = progress.get(k);
        if (!row) {
          const created = { claimedLevel: 0, ...create };
          progress.set(k, created);
          return created;
        }
        row.xp += update.xp?.increment ?? 0;
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) => progress.get(key(where.userId_season.userId, where.userId_season.season)) ?? null),
    },
  };

  return { tx, events, progress, key };
}

const service = (prisma: unknown = {}) => new BattlePassService(prisma as never, {} as never);

describe('BattlePassService.award', () => {
  it('пишет событие и двигает прогресс сезона', async () => {
    const db = fakeDb();
    await service().award(db.tx as never, 'u1', 'game.backtest', 's1', 50, NOW);

    expect(db.events).toHaveLength(1);
    expect(db.events[0]).toMatchObject({ userId: 'u1', season: SEASON, source: 'game.backtest', xp: 50 });
    expect(db.progress.get(db.key('u1', SEASON))?.xp).toBe(50);
  });

  it('повтор того же события не начисляет второй раз и не бросает', async () => {
    const db = fakeDb();
    await service().award(db.tx as never, 'u1', 'game.backtest', 's1', 50, NOW);
    await expect(service().award(db.tx as never, 'u1', 'game.backtest', 's1', 50, NOW)).resolves.toBeUndefined();

    expect(db.events).toHaveLength(1);
    expect(db.progress.get(db.key('u1', SEASON))?.xp).toBe(50);
  });

  it('дневной потолок режет начисление и оставляет отметку с нулём', async () => {
    const db = fakeDb();
    const cap = XP_SOURCES['game.backtest'].dailyCap!;
    // Шесть сессий по 50 — это 300, весь дневной потолок.
    for (let i = 0; i < cap / 50; i++) {
      await service().award(db.tx as never, 'u1', 'game.backtest', `s${i}`, 50, NOW);
    }
    await service().award(db.tx as never, 'u1', 'game.backtest', 'over', 50, NOW);

    expect(db.progress.get(db.key('u1', SEASON))?.xp).toBe(cap);
    expect(db.events[db.events.length - 1]).toMatchObject({ refId: 'over', xp: 0 });
  });

  it('потолок одного источника не отнимает XP у другого', async () => {
    const db = fakeDb();
    for (let i = 0; i < 6; i++) await service().award(db.tx as never, 'u1', 'game.backtest', `s${i}`, 50, NOW);
    await service().award(db.tx as never, 'u1', 'journal.tag', 't1', 15, NOW);

    expect(db.progress.get(db.key('u1', SEASON))?.xp).toBe(315);
  });

  it('выключенный источник не начисляет и не оставляет следов', async () => {
    const db = fakeDb();
    await service().award(db.tx as never, 'u1', 'game.table', 'seat1', 100, NOW);

    expect(db.events).toHaveLength(0);
  });
});

describe('BattlePassService.state', () => {
  it('пустой прогресс — первый уровень, забирать нечего', async () => {
    const prisma = {
      battlePassProgress: { findUnique: jest.fn(async () => null) },
      coinTransaction: { findMany: jest.fn(async () => []) },
    };
    const state = await service(prisma).state('u1', NOW);

    expect(state.season.key).toBe(SEASON);
    expect(state.level).toBe(1);
    expect(state.pendingCoins).toBe(0);
    expect(state.levels[0]).toMatchObject({ level: 2, state: 'locked' });
    expect(state.daily.day).toBe(1);
  });

  it('достигнутые, но не забранные уровни помечены и посчитаны', async () => {
    const prisma = {
      battlePassProgress: { findUnique: jest.fn(async () => ({ userId: 'u1', season: SEASON, xp: 300, claimedLevel: 1 })) },
      coinTransaction: { findMany: jest.fn(async () => [{ refId: '2026-09-21' }]) },
    };
    const state = await service(prisma).state('u1', NOW);

    // 300 XP = 100 + 120 и остаток 80 → третий уровень.
    expect(state.level).toBe(3);
    expect(state.pendingCoins).toBe(100);
    expect(state.levels.find((l) => l.level === 2)?.state).toBe('ready');
    expect(state.levels.find((l) => l.level === 4)?.state).toBe('locked');
    expect(state.daily.claimedToday).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd backend && npx jest src/battlepass/battlepass.service.spec.ts`
Expected: FAIL — `Cannot find module './battlepass.service'`

- [ ] **Step 3: Реализовать сервис (часть первая: `award` и `state`)**

Создать `backend/src/battlepass/battlepass.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CoinsService } from '../coins/coins.service';
import { PrismaService } from '../prisma/prisma.service';
import { dailyState, recentDayKeys, startOfUtcDay } from './daily';
import { coinsBetween, ladder, levelFromXp } from './levels';
import { seasonBounds, seasonKey } from './season';
import { XP_SOURCES, type XpSource } from './xp-registry';

/**
 * Battle Pass: опыт за игры, сезонные уровни и награды за них.
 *
 * Метод, который пишет XP, принимает клиент транзакции, а не открывает свою, —
 * как `CoinsService`. Опыт начисляется только вместе с тем, ради чего его
 * тронули: отдельная транзакция означала бы состояние, где турнир
 * финализирован и призы выплачены, а опыта за него нет.
 */
@Injectable()
export class BattlePassService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coins: CoinsService,
  ) {}

  /**
   * Начислить XP за событие. Повторный вызов с тем же `(userId, source, refId)`
   * не начисляет ничего и, главное, НЕ роняет транзакцию вызывающего: событие
   * уже разобрано, и ронять из-за этого финал турнира с выплатами нельзя.
   *
   * Отсюда `createMany({ skipDuplicates })`, а не `create` с перехватом P2002:
   * в PostgreSQL упавший оператор переводит всю транзакцию в прерванное
   * состояние, и пойманная ошибка её уже не спасёт. `skipDuplicates` —
   * это `ON CONFLICT DO NOTHING`: конфликт не поднимает ошибку вовсе, а
   * `count === 0` и есть признак повтора.
   */
  async award(
    tx: Prisma.TransactionClient,
    userId: string,
    source: XpSource,
    refId: string,
    xp: number,
    now: Date = new Date(),
  ): Promise<void> {
    const def = XP_SOURCES[source];
    if (!def?.enabled) return;

    const season = seasonKey(now);
    const granted = await this.withinDailyCap(tx, userId, source, xp, now);

    const written = await tx.battlePassXpEvent.createMany({
      data: [{ userId, season, source, refId, xp: granted }],
      skipDuplicates: true,
    });
    if (written.count === 0) return;
    if (granted === 0) return;

    await tx.battlePassProgress.upsert({
      where: { userId_season: { userId, season } },
      create: { userId, season, xp: granted },
      update: { xp: { increment: granted } },
    });
  }

  /** Сколько из запрошенного помещается в сегодняшний потолок источника. */
  private async withinDailyCap(
    tx: Prisma.TransactionClient,
    userId: string,
    source: XpSource,
    xp: number,
    now: Date,
  ): Promise<number> {
    const wanted = Math.max(0, Math.floor(xp));
    const cap = XP_SOURCES[source].dailyCap;
    if (cap == null || wanted === 0) return wanted;

    const today = await tx.battlePassXpEvent.aggregate({
      where: { userId, source, createdAt: { gte: startOfUtcDay(now) } },
      _sum: { xp: true },
    });
    const used = today._sum.xp ?? 0;
    return Math.max(0, Math.min(wanted, cap - used));
  }

  /** Всё, что показывает страница профиля. Ничего не пишет. */
  async state(userId: string, now: Date = new Date()) {
    const season = seasonKey(now);
    const [progress, claimedDays] = await Promise.all([
      this.prisma.battlePassProgress.findUnique({ where: { userId_season: { userId, season } } }),
      this.prisma.coinTransaction.findMany({
        where: { userId, kind: 'DAILY_REWARD', refId: { in: recentDayKeys(now) } },
        select: { refId: true },
      }),
    ]);

    const xp = progress?.xp ?? 0;
    const claimedLevel = progress?.claimedLevel ?? 0;
    const { level, xpIntoLevel, xpToNext } = levelFromXp(xp);

    return {
      season: { key: season, endsAt: seasonBounds(season).endsAt },
      xp,
      level,
      xpIntoLevel,
      xpToNext,
      claimedLevel,
      pendingCoins: coinsBetween(claimedLevel, level),
      levels: ladder().map((row) => ({
        ...row,
        state: row.level <= claimedLevel ? 'claimed' : row.level <= level ? 'ready' : 'locked',
      })),
      daily: dailyState(new Set(claimedDays.map((r) => r.refId)), now),
    };
  }
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `cd backend && npx jest src/battlepass/battlepass.service.spec.ts`
Expected: PASS, 7 тестов

- [ ] **Step 5: Создать модуль**

Создать `backend/src/battlepass/battlepass.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CoinsModule } from '../coins/coins.module';
import { BattlePassService } from './battlepass.service';

/**
 * Battle Pass. Сервис экспортируется: XP начисляется в транзакциях чужих
 * модулей — турнира, бектеста, тегов, — и своей транзакции не открывает.
 *
 * Фоновых сервисов здесь нет: сезон вычисляется из календаря, сброс — смена
 * ключа, награды забирает сам человек. В разделении api/worker ничего не
 * меняется.
 *
 * PrismaModule глобальный, поэтому здесь не импортируется.
 */
@Module({
  imports: [CoinsModule],
  providers: [BattlePassService],
  exports: [BattlePassService],
})
export class BattlePassModule {}
```

- [ ] **Step 6: Проверить компиляцию**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json`
Expected: без ошибок

- [ ] **Step 7: Коммит**

```bash
cd E:/git/virex-trader
git add backend/src/battlepass
git commit --only backend/src/battlepass -m "feat(battlepass): начисление XP из чужой транзакции и чтение состояния" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Забрать награды — `claim` и `claimDaily`

Две операции, которые платят монетами. Обе обязаны быть защищены от двойного клика: награда за уровень — compare-and-set по `claimedLevel`, ежедневная — уникальным ключом журнала монет.

**Files:**
- Create: `backend/src/battlepass/battlepass-errors.ts`
- Modify: `backend/src/battlepass/battlepass.service.ts` (два новых метода)
- Modify: `backend/src/battlepass/battlepass.service.spec.ts` (новые describe-блоки)

**Interfaces:**
- Consumes: `CoinsService.credit(tx, userId, amount, kind, refId)`, `rewardCoins`, `coinsBetween`, `levelFromXp`, `dailyState`, `dayKey`, `recentDayKeys`.
- Produces:
  - `BattlePassService.claim(userId: string, now?: Date): Promise<{ claimedLevel: number; coins: number; balance: number }>`
  - `BattlePassService.claimDaily(userId: string, now?: Date): Promise<{ streak: number; day: number; coins: number; balance: number }>`
  - `nothingToClaim(): ConflictException` (код `BP_NOTHING_TO_CLAIM`), `dailyAlreadyClaimed(): ConflictException` (код `BP_DAILY_CLAIMED`)

- [ ] **Step 1: Написать падающий тест**

Дописать в `backend/src/battlepass/battlepass.service.spec.ts`:

```ts
/**
 * База для claim: прогресс с CAS-обновлением, журнал монет с уникальным ключом
 * (userId, kind, refId) и баланс. Транзакция — тот же объект: интерактивная
 * `$transaction` вызывает колбэк со своим клиентом, и подменять его нечем.
 */
function fakeClaimDb(row: { xp: number; claimedLevel: number } | null, daily: string[] = []) {
  const progress = row ? { userId: 'u1', season: SEASON, ...row } : null;
  const journal: { kind: string; refId: string; delta: number }[] = daily.map((d) => ({
    kind: 'DAILY_REWARD',
    refId: d,
    delta: 0,
  }));
  let balance = 0;

  const tx = {
    battlePassProgress: {
      findUnique: jest.fn(async () => progress),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (!progress || progress.claimedLevel !== where.claimedLevel) return { count: 0 };
        progress.claimedLevel = data.claimedLevel;
        return { count: 1 };
      }),
    },
    coinTransaction: {
      findMany: jest.fn(async ({ where }: any) =>
        journal.filter((r) => r.kind === where.kind && where.refId.in.includes(r.refId)),
      ),
      create: jest.fn(async ({ data }: any) => {
        if (journal.some((r) => r.kind === data.kind && r.refId === data.refId)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        journal.push(data);
        return data;
      }),
    },
    user: {
      update: jest.fn(async ({ data }: any) => {
        balance += data.coinBalance?.increment ?? 0;
        return { coinBalance: balance };
      }),
      findUnique: jest.fn(async () => ({ coinBalance: balance })),
    },
  };

  const prisma = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
  return { prisma, tx, journal, progressRow: () => progress, balanceOf: () => balance };
}

describe('BattlePassService.claim', () => {
  it('забирает все достигнутые уровни разом, по строке журнала на уровень', async () => {
    const db = fakeClaimDb({ xp: 300, claimedLevel: 0 });
    const coins = new CoinsService(db.prisma as never);
    const res = await new BattlePassService(db.prisma as never, coins).claim('u1', NOW);

    expect(res).toMatchObject({ claimedLevel: 3, coins: 100 });
    expect(db.journal.filter((r) => r.kind === 'BATTLEPASS_REWARD')).toHaveLength(2);
    expect(db.journal.map((r) => r.refId)).toEqual(expect.arrayContaining(['2026-Q3:2', '2026-Q3:3']));
    expect(db.progressRow()?.claimedLevel).toBe(3);
  });

  it('второй раз забрать нечего', async () => {
    const db = fakeClaimDb({ xp: 300, claimedLevel: 3 });
    const coins = new CoinsService(db.prisma as never);
    const e = await rejection(new BattlePassService(db.prisma as never, coins).claim('u1', NOW));

    expect(e.response.code).toBe('BP_NOTHING_TO_CLAIM');
    expect(db.journal).toHaveLength(0);
  });

  it('без прогресса сезона забирать нечего', async () => {
    const db = fakeClaimDb(null);
    const coins = new CoinsService(db.prisma as never);
    const e = await rejection(new BattlePassService(db.prisma as never, coins).claim('u1', NOW));

    expect(e.response.code).toBe('BP_NOTHING_TO_CLAIM');
  });

  it('прогресс, сдвинувшийся между чтением и записью, отменяет выдачу', async () => {
    const db = fakeClaimDb({ xp: 300, claimedLevel: 0 });
    // Гонка: пока шло чтение, другой запрос уже забрал награды.
    db.tx.battlePassProgress.updateMany = jest.fn(async () => ({ count: 0 }));
    const coins = new CoinsService(db.prisma as never);
    const e = await rejection(new BattlePassService(db.prisma as never, coins).claim('u1', NOW));

    expect(e.response.code).toBe('BP_NOTHING_TO_CLAIM');
  });
});

describe('BattlePassService.claimDaily', () => {
  it('первый заход даёт награду первого дня', async () => {
    const db = fakeClaimDb(null);
    const coins = new CoinsService(db.prisma as never);
    const res = await new BattlePassService(db.prisma as never, coins).claimDaily('u1', NOW);

    expect(res).toMatchObject({ day: 1, streak: 1, coins: 50 });
    expect(db.journal).toEqual([expect.objectContaining({ kind: 'DAILY_REWARD', refId: '2026-09-21' })]);
  });

  it('четвёртый день подряд даёт награду четвёртого дня', async () => {
    const db = fakeClaimDb(null, ['2026-09-20', '2026-09-19', '2026-09-18']);
    const coins = new CoinsService(db.prisma as never);
    const res = await new BattlePassService(db.prisma as never, coins).claimDaily('u1', NOW);

    expect(res).toMatchObject({ day: 4, streak: 4, coins: 125 });
  });

  it('второй раз за сутки — отказ, а не вторая выплата', async () => {
    const db = fakeClaimDb(null, ['2026-09-21']);
    const coins = new CoinsService(db.prisma as never);
    const e = await rejection(new BattlePassService(db.prisma as never, coins).claimDaily('u1', NOW));

    expect(e.response.code).toBe('BP_DAILY_CLAIMED');
    expect(db.journal).toHaveLength(1);
  });
});
```

В начало файла добавить импорт `import { CoinsService } from '../coins/coins.service';` и хелпер
отказа — тот же, что в спеке турниров (`tournaments.service.spec.ts:204`), потому что проверяется
код ошибки, а не её текст:

```ts
async function rejection(p: Promise<unknown>): Promise<any> {
  return p.then(
    () => {
      throw new Error('ожидался отказ');
    },
    (e) => e,
  );
}
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd backend && npx jest src/battlepass/battlepass.service.spec.ts`
Expected: FAIL — `this.bp.claim is not a function` / `claim does not exist`

- [ ] **Step 3: Создать файл ошибок**

Создать `backend/src/battlepass/battlepass-errors.ts`:

```ts
import { ConflictException } from '@nestjs/common';

/**
 * Коды ошибок раздела — строками, как у турниров и столов: фронт разбирает
 * код, а не текст, и перевод сообщения не должен ломать обработку.
 */
export const nothingToClaim = () =>
  new ConflictException({ message: 'Забирать нечего', code: 'BP_NOTHING_TO_CLAIM' });

export const dailyAlreadyClaimed = () =>
  new ConflictException({ message: 'Награда за сегодня уже получена', code: 'BP_DAILY_CLAIMED' });
```

- [ ] **Step 4: Реализовать `claim`**

Дописать в `backend/src/battlepass/battlepass.service.ts` (импорты: `dayKey` из `./daily`, `rewardCoins` из `./levels`, ошибки из `./battlepass-errors`):

```ts
  /**
   * Забрать всё, что накопилось. Одним действием и подряд: награда одного вида
   * — монеты, и выбирать, какую монету получить раньше, незачем.
   *
   * Защита от двойного клика — compare-and-set в самом UPDATE (`claimedLevel`
   * равен прочитанному), тот же приём, что у списания монет: два запроса иначе
   * выдали бы награду дважды, и ни один не был бы неправ по отдельности.
   */
  async claim(userId: string, now: Date = new Date()) {
    const season = seasonKey(now);
    return this.prisma.$transaction(async (tx) => {
      const progress = await tx.battlePassProgress.findUnique({
        where: { userId_season: { userId, season } },
      });
      if (!progress) throw nothingToClaim();

      const { level } = levelFromXp(progress.xp);
      const coins = coinsBetween(progress.claimedLevel, level);
      if (coins <= 0) throw nothingToClaim();

      const moved = await tx.battlePassProgress.updateMany({
        where: { userId, season, claimedLevel: progress.claimedLevel },
        data: { claimedLevel: level },
      });
      if (moved.count !== 1) throw nothingToClaim();

      // Строка журнала на уровень, а не одна на клик: одно событие — одна
      // строка, и уникальный ключ журнала тогда сторожит каждый уровень.
      for (let l = Math.max(2, progress.claimedLevel + 1); l <= level; l++) {
        await this.coins.credit(tx, userId, rewardCoins(l), 'BATTLEPASS_REWARD', `${season}:${l}`);
      }

      const user = await tx.user.findUnique({ where: { id: userId }, select: { coinBalance: true } });
      return { claimedLevel: level, coins, balance: user?.coinBalance ?? 0 };
    });
  }
```

- [ ] **Step 5: Реализовать `claimDaily`**

```ts
  /**
   * Ежедневная награда за заход. Своего состояния не имеет: и «забрал ли
   * сегодня», и «какой день подряд» выводятся из строк журнала монет.
   *
   * Гонку двух вкладок ловит уникальный ключ журнала `(userId, kind, refId)`, а
   * не проверка выше по коду: проверка отвечает за понятный отказ, ключ — за
   * то, что второй выплаты не будет. Перехват P2002 стоит СНАРУЖИ транзакции:
   * в PostgreSQL упавший оператор прерывает её целиком, и продолжать там
   * нечего — только перевести ошибку в отказ.
   */
  async claimDaily(userId: string, now: Date = new Date()) {
    const today = dayKey(now);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.coinTransaction.findMany({
          where: { userId, kind: 'DAILY_REWARD', refId: { in: recentDayKeys(now) } },
          select: { refId: true },
        });
        const state = dailyState(new Set(claimed.map((r) => r.refId)), now);
        if (state.claimedToday) throw dailyAlreadyClaimed();

        await this.coins.credit(tx, userId, state.coins, 'DAILY_REWARD', today);
        const user = await tx.user.findUnique({ where: { id: userId }, select: { coinBalance: true } });
        return { day: state.day, streak: state.streak + 1, coins: state.coins, balance: user?.coinBalance ?? 0 };
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw dailyAlreadyClaimed();
      throw e;
    }
  }
```

- [ ] **Step 6: Запустить — убедиться, что проходит**

Run: `cd backend && npx jest src/battlepass`
Expected: PASS, все файлы модуля

- [ ] **Step 7: Коммит**

```bash
cd E:/git/virex-trader
git add backend/src/battlepass
git commit --only backend/src/battlepass -m "feat(battlepass): выдача наград за уровни и ежедневная награда" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: HTTP-эндпоинты

Три адреса: прочитать состояние, забрать награды уровней, забрать ежедневную. Тел запросов нет, поэтому и DTO нет.

**Files:**
- Create: `backend/src/battlepass/battlepass.controller.ts`
- Modify: `backend/src/battlepass/battlepass.module.ts` (добавить `controllers`)
- Modify: `backend/src/app.module.ts` (импорт `BattlePassModule` в список)

**Interfaces:**
- Consumes: `BattlePassService.state/claim/claimDaily` (Tasks 3–4), `JwtAuthGuard`, `CurrentUser` (существуют).
- Produces: `GET /api/battlepass`, `POST /api/battlepass/claim`, `POST /api/battlepass/daily`.

- [ ] **Step 1: Написать контроллер**

Создать `backend/src/battlepass/battlepass.controller.ts`:

```ts
import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BattlePassService } from './battlepass.service';

/**
 * Battle Pass пользователя. Лестницу уровней отдаёт сервер, а не считает фронт:
 * правило начисления одно, и второй его реализации в браузере быть не должно —
 * они разойдутся при первой же правке кривой.
 */
@UseGuards(JwtAuthGuard)
@Controller('api/battlepass')
export class BattlePassController {
  constructor(private readonly battlePass: BattlePassService) {}

  @Get()
  state(@CurrentUser('userId') userId: string) {
    return this.battlePass.state(userId);
  }

  @Post('claim')
  claim(@CurrentUser('userId') userId: string) {
    return this.battlePass.claim(userId);
  }

  @Post('daily')
  daily(@CurrentUser('userId') userId: string) {
    return this.battlePass.claimDaily(userId);
  }
}
```

- [ ] **Step 2: Подключить контроллер к модулю**

В `backend/src/battlepass/battlepass.module.ts` добавить импорт и поле:

```ts
import { BattlePassController } from './battlepass.controller';
...
@Module({
  imports: [CoinsModule],
  controllers: [BattlePassController],
  providers: [BattlePassService],
  exports: [BattlePassService],
})
```

- [ ] **Step 3: Зарегистрировать модуль в приложении**

В `backend/src/app.module.ts` добавить `import { BattlePassModule } from './battlepass/battlepass.module';` и `BattlePassModule,` в массив `imports` — после `GamesModule`.

- [ ] **Step 4: Проверить, что приложение поднимается**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json && npx jest src/battlepass`
Expected: компиляция без ошибок, тесты проходят

- [ ] **Step 5: Коммит**

```bash
cd E:/git/virex-trader
git add backend/src/battlepass backend/src/app.module.ts
git commit --only backend/src/battlepass backend/src/app.module.ts -m "feat(battlepass): эндпоинты состояния и выдачи наград" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Точки начисления XP

Три места, где игра заканчивается и XP становится заслуженным. В каждом начисление идёт **в той же транзакции**, что и само событие.

**Files:**
- Modify: `backend/src/tournaments/tournaments.service.ts:44-48` (конструктор) и блок финала около строки 460
- Modify: `backend/src/tournaments/tournaments.module.ts` (импорт `BattlePassModule`)
- Modify: `backend/src/tournaments/tournaments.service.spec.ts` (конструктор в хелпере)
- Modify: `backend/src/backtest/backtest.service.ts:136-141` (конструктор) и `finish` около строки 318
- Modify: `backend/src/backtest/backtest.module.ts` (импорт `BattlePassModule`)
- Modify: `backend/src/tags/tags.service.ts:23-26` (конструктор) и `setTradeTags` около строки 383
- Modify: `backend/src/tags/tags.module.ts` (импорт `BattlePassModule`)

**Interfaces:**
- Consumes: `BattlePassService.award` (Task 3), `tournamentXp`, `XP_SOURCES` (Task 2).
- Produces: ничего нового наружу.

- [ ] **Step 1: Написать падающий тест турнира**

В `backend/src/tournaments/tournaments.service.spec.ts` в хелпер `harness` (место сборки сервиса —
около строки 188, рядом с моками `coins` и `live`) добавить сбор начислений:

```ts
  // XP начисляется в той же транзакции, что места и призы, — собираем вызовы
  // так же, как charges/credits у монет.
  const awards: { userId: string; source: string; refId: string; xp: number }[] = [];
  const battlePass = {
    award: jest.fn(async (_tx: unknown, userId: string, source: string, refId: string, xp: number) => {
      awards.push({ userId, source, refId, xp });
    }),
  };
```

заменить сборку сервиса и возврат хелпера на:

```ts
  const service = new TournamentsService(prisma as never, coins as never, live as never, battlePass as never);
  return { service, prisma, coins, live, battlePass, tournaments, participants, charges, credits, sessions, awards };
```

Затем дописать тест в `describe('TournamentsService.finalize')`, рядом с «проставляет места и
выплачивает фонд победителю» (около строки 630), — он пользуется тем же хелпером `runTournament`,
который в этом describe уже есть:

```ts
  it('финал начисляет XP каждому участнику по его месту', async () => {
    const h = await runTournament();

    await h.service.finalize(h.tournaments.get('tn1'));

    // Турнир на двоих: победитель обошёл одного соперника (100 + 25), второй —
    // никого (100). Размер турнира входит в цену победы, см. xp-registry.
    expect(h.awards).toContainEqual({ userId: 'u2', source: 'game.tournament', refId: 'tn1', xp: 125 });
    expect(h.awards).toContainEqual({ userId: 'u1', source: 'game.tournament', refId: 'tn1', xp: 100 });
  });

  it('второй финал не начисляет XP повторно', async () => {
    const h = await runTournament();

    await h.service.finalize(h.tournaments.get('tn1'));
    await h.service.finalize({ ...h.tournaments.get('tn1'), status: 'running' });

    expect(h.awards).toHaveLength(2);
  });
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd backend && npx jest src/tournaments/tournaments.service.spec.ts`
Expected: FAIL — `awards` пуст

- [ ] **Step 3: Начислять XP в финале турнира**

В `backend/src/tournaments/tournaments.service.ts` добавить четвёртый параметр конструктора:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly coins: CoinsService,
    private readonly live: LiveMarketService,
    private readonly battlePass: BattlePassService,
  ) {}
```

и в цикле финала, сразу после `this.coins.credit(...)`:

```ts
        // XP за турнир — в той же транзакции, что место и приз: разойтись эти
        // три записи не должны. Размер турнира входит в цену победы, см.
        // battlepass/xp-registry.ts.
        await this.battlePass.award(
          tx,
          row.userId,
          'game.tournament',
          tournament.id,
          tournamentXp(ranked.length, row.place),
        );
```

Импорты: `BattlePassService` из `../battlepass/battlepass.service`, `tournamentXp` из `../battlepass/xp-registry`.

В `tournaments.module.ts` добавить `BattlePassModule` в `imports`.

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `cd backend && npx jest src/tournaments`
Expected: PASS

- [ ] **Step 5: Начислять XP за завершённую сессию бектеста**

В `backend/src/backtest/backtest.service.ts` добавить пятый параметр конструктора:

```ts
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly marketData: MarketDataService,
    protected readonly synthetic: SyntheticMarketService,
    protected readonly live: LiveMarketService,
    protected readonly battlePass: BattlePassService,
  ) {}
```

В методе `finish`, сразу после `const session = await tx.backtestSession.update(...)`:

```ts
      // XP только за свою сессию: турнирная кончается вместе с турниром и
      // оплачена источником game.tournament. Сюда такая сессия и не доходит —
      // `finish` отказывает ей выше, — но источник начисления должен быть
      // назван в одном месте, а не выводиться из порядка проверок.
      await this.battlePass.award(tx, userId, 'game.backtest', id, XP_SOURCES['game.backtest'].base);
```

В `backtest.module.ts` добавить `BattlePassModule` в `imports`.

- [ ] **Step 6: Проверить, что тесты бектеста не сломались**

Run: `cd backend && npx jest src/backtest`
Expected: PASS. Если где-то `new BacktestService(...)` собирается руками — добавить пятым аргументом `{ award: jest.fn() } as never`.

- [ ] **Step 7: Начислять XP за разметку сделки**

В `backend/src/tags/tags.service.ts` добавить третий параметр конструктора:

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataVersion: DataVersionService,
    private readonly battlePass: BattlePassService,
  ) {}
```

В `setTradeTags` заменить батч-транзакцию на интерактивную (иначе в неё нечем передать начисление):

```ts
    await this.prisma.$transaction(async (tx) => {
      await tx.tradeTag.deleteMany({ where: { tradeId } });
      if (unique.length === 0) return;
      await tx.tradeTag.createMany({ data: unique.map((tagId) => ({ tradeId, tagId })) });
      // XP за разметку — один раз на сделку навсегда (ключ по tradeId), сколько
      // бы раз её ни переразмечали. Снятие всех тегов разметкой не считается.
      await this.battlePass.award(tx, userId, 'journal.tag', tradeId, XP_SOURCES['journal.tag'].base);
    });
```

В `tags.module.ts` добавить `BattlePassModule` в `imports`.

- [ ] **Step 8: Прогнать весь backend**

Run: `cd backend && npx jest`
Expected: PASS. Упавшие спеки с ручной сборкой `TagsService`/`TournamentsService` — дополнить новым аргументом-моком `{ award: jest.fn() } as never`, не меняя проверяемого поведения.

- [ ] **Step 9: Коммит**

```bash
cd E:/git/virex-trader
git add backend/src
git commit --only backend/src -m "feat(battlepass): XP за турнир, сессию бектеста и разметку сделки" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Фронт — сущность `battle-pass`

Типы ответа и три хука React Query. Отдельная сущность, а не часть страницы: баланс монет и индикатор в шапке зависят от тех же данных.

**Files:**
- Create: `frontend/src/entities/battle-pass/api/types.ts`
- Create: `frontend/src/entities/battle-pass/api/hooks.ts`
- Create: `frontend/src/entities/battle-pass/index.ts`

**Interfaces:**
- Consumes: `apiJson` из `@/shared/api/http`, эндпоинты Task 5.
- Produces:
  - `BattlePassState`, `LevelRow`, `DailyState` (типы)
  - `useBattlePass(): UseQueryResult<BattlePassState>`
  - `useClaimRewards(): UseMutationResult<...>`
  - `useClaimDaily(): UseMutationResult<...>`
  - `battlePassKey` (для инвалидации из других мест)

- [ ] **Step 1: Написать типы**

Создать `frontend/src/entities/battle-pass/api/types.ts`:

```ts
/** Состояние клетки лестницы наград. */
export type LevelState = 'claimed' | 'ready' | 'locked';

export interface LevelRow {
  level: number;
  /** Порог уровня в XP за сезон. */
  xp: number;
  coins: number;
  state: LevelState;
}

export interface DailyState {
  /** День цикла, который забирается сегодня: 1–7. */
  day: number;
  streak: number;
  claimedToday: boolean;
  coins: number;
  nextCoins: number;
  /** Суммы всего цикла — ряд из семи клеток рисует их, а не свою копию. */
  week: number[];
}

export interface BattlePassState {
  season: { key: string; endsAt: string };
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpToNext: number;
  claimedLevel: number;
  /** Сколько монет ждёт кнопки «Забрать». */
  pendingCoins: number;
  levels: LevelRow[];
  daily: DailyState;
}
```

- [ ] **Step 2: Написать хуки**

Создать `frontend/src/entities/battle-pass/api/hooks.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiJson } from '@/shared/api/http';
import type { BattlePassState } from './types';

export const battlePassKey = ['battlepass'] as const;

/**
 * Состояние Battle Pass. Без опроса по интервалу: XP меняется только от
 * собственных действий человека — доигранного турнира, законченной сессии,
 * размеченной сделки, — и точки, где это происходит, сбрасывают ключ сами.
 */
export const useBattlePass = () =>
  useQuery({ queryKey: battlePassKey, queryFn: () => apiJson<BattlePassState>('/api/battlepass') });

const post = (path: string) => apiJson<{ coins: number; balance: number }>(path, { method: 'POST' });

/** После выдачи меняются и прогресс, и баланс монет в шапке. */
function useClaimMutation(path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post(path),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: battlePassKey });
      void qc.invalidateQueries({ queryKey: ['coins'] });
    },
  });
}

export const useClaimRewards = () => useClaimMutation('/api/battlepass/claim');
export const useClaimDaily = () => useClaimMutation('/api/battlepass/daily');
```

- [ ] **Step 3: Написать публичный вход сущности**

Создать `frontend/src/entities/battle-pass/index.ts`:

```ts
export { battlePassKey, useBattlePass, useClaimDaily, useClaimRewards } from './api/hooks';
export type { BattlePassState, DailyState, LevelRow, LevelState } from './api/types';
```

- [ ] **Step 4: Проверить типы**

Run: `cd frontend && npx tsc --noEmit`
Expected: без ошибок

- [ ] **Step 5: Коммит**

```bash
cd E:/git/virex-trader
git add frontend/src/entities/battle-pass
git commit --only frontend/src/entities/battle-pass -m "feat(battlepass): клиент Battle Pass на фронте" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Страница `/profile`

Герой, полоса уровня, ежедневная награда и лестница наград сезона. Обычная страница продукта: те же `shared/ui`, нулевой радиус, цвета классами.

**Files:**
- Create: `frontend/src/app/(app)/profile/page.tsx`
- Create: `frontend/src/views/profile/Page.tsx`
- Create: `frontend/src/views/profile/components/HeroCard.tsx`
- Create: `frontend/src/views/profile/components/XpBar.tsx`
- Create: `frontend/src/views/profile/components/DailyReward.tsx`
- Create: `frontend/src/views/profile/components/RewardTrack.tsx`
- Modify: `frontend/src/app/globals.css` (блок стилей профиля в конце файла)
- Modify: `frontend/src/shared/i18n/messages/ru.json`, `frontend/src/shared/i18n/messages/en.json` (раздел `profile`)

**Interfaces:**
- Consumes: `useBattlePass`, `useClaimDaily`, `useClaimRewards`, типы (Task 7); `PageHead`, `SectionHead`, `Button`, `Wrap`, `Skeleton`, `ErrorNote` из `shared/ui`; `useAuth` из `@/features/auth`.
- Produces: страница по адресу `/profile`.

- [ ] **Step 1: Завести тексты**

В `frontend/src/shared/i18n/messages/ru.json` добавить раздел верхнего уровня:

```json
  "profile": {
    "title": "Профиль",
    "lede": "Опыт за игры, уровень сезона и награды за него",
    "level": "Уровень {level}",
    "toNext": "{xp} XP до {level}-го",
    "maxed": "Трек сезона пройден полностью",
    "seasonEnds": "Сезон до {date}",
    "seasonNote": "С новым сезоном уровень начинается заново, а незабранные награды сгорают",
    "hero": "Герой",
    "heroSoon": "Модели героев в работе",
    "daily": "Ежедневная награда",
    "dailyLede": "Каждый день подряд даёт больше предыдущего, до седьмого",
    "dailyClaim": "Забрать {coins}",
    "dailyDone": "Награда за сегодня получена",
    "dailyStreak": "{days} дн. подряд",
    "day": "День {day}",
    "track": "Награды сезона",
    "claim": "Забрать {coins}",
    "claimNone": "Забирать нечего",
    "claimed": "Забрано",
    "ready": "Готово к выдаче",
    "locked": "Нужно {xp} XP",
    "loadFailed": "Не удалось загрузить профиль",
    "empty": "Сыграйте турнир или проведите сессию бектеста — и здесь появится первый уровень"
  },
```

В `en.json` — тот же набор ключей по-английски (`"title": "Profile"`, `"level": "Level {level}"`, `"toNext": "{xp} XP to level {level}"`, `"seasonEnds": "Season ends {date}"` и так далее).

- [ ] **Step 2: Написать полосу уровня**

Создать `frontend/src/views/profile/components/XpBar.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import type { BattlePassState } from '@/entities/battle-pass';

/**
 * Полоса уровня. Заполнение — доля XP, набранного внутри текущего уровня:
 * общая сумма за сезон ничего не сказала бы о том, сколько осталось идти.
 */
export function XpBar({ state }: { state: BattlePassState }) {
  const t = useTranslations('profile');
  const span = state.xpIntoLevel + state.xpToNext;
  const filled = span > 0 ? Math.round((state.xpIntoLevel / span) * 100) : 100;

  return (
    <div className="xpbar">
      <div className="xpbar-head">
        <strong>{t('level', { level: state.level })}</strong>
        <span className="muted">
          {state.xpToNext > 0 ? t('toNext', { xp: state.xpToNext, level: state.level + 1 }) : t('maxed')}
        </span>
      </div>
      <div
        className="xpbar-rail"
        role="progressbar"
        aria-valuenow={filled}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('level', { level: state.level })}
      >
        <span className="xpbar-fill" style={{ width: `${filled}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Написать карточку героя**

Создать `frontend/src/views/profile/components/HeroCard.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import type { BattlePassState } from '@/entities/battle-pass';
import { XpBar } from './XpBar';

/**
 * Герой и уровень. Модели героев ещё рисуются, и место под них занимается
 * сейчас — чтобы страница не переезжала, когда они появятся. Заглушка —
 * силуэт с номером уровня, а не «картинка скоро»: пустой прямоугольник
 * читался бы поломкой.
 */
export function HeroCard({ state, name }: { state: BattlePassState; name: string }) {
  const t = useTranslations('profile');

  return (
    <div className="hero-card">
      <div className="hero-slot" aria-hidden>
        <span className="hero-level">{state.level}</span>
      </div>
      <div className="hero-side">
        <div className="hero-name">{name}</div>
        <p className="muted hero-soon">{t('heroSoon')}</p>
        <XpBar state={state} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Написать блок ежедневной награды**

Создать `frontend/src/views/profile/components/DailyReward.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useClaimDaily, type DailyState } from '@/entities/battle-pass';
import { Button } from '@/shared/ui/Button';
import { SectionHead } from '@/shared/ui/SectionHead';

/**
 * Семь клеток недели. Пройденные помечены, сегодняшняя выделена, будущие
 * приглушены: смысл блока в том, что завтра дадут больше, и ряд обязан
 * показывать это раньше, чем человек прочитает подпись.
 */
export function DailyReward({ daily }: { daily: DailyState }) {
  const t = useTranslations('profile');
  const claim = useClaimDaily();

  return (
    <section>
      <SectionHead title={t('daily')}>
        <span className="muted">{t('dailyStreak', { days: daily.streak })}</span>
      </SectionHead>
      <p className="lede">{t('dailyLede')}</p>
      <ol className="daily-row">
        {daily.week.map((coins, i) => {
          const day = i + 1;
          const done = day < daily.day || (day === daily.day && daily.claimedToday);
          const today = day === daily.day;
          return (
            <li key={day} className={`daily-cell${done ? ' is-done' : ''}${today ? ' is-today' : ''}`}>
              <span className="daily-day">{t('day', { day })}</span>
              <span className="daily-coins">{coins}</span>
            </li>
          );
        })}
      </ol>
      {daily.claimedToday ? (
        <p className="muted">{t('dailyDone')}</p>
      ) : (
        <Button onClick={() => claim.mutate()} disabled={claim.isPending}>
          {t('dailyClaim', { coins: daily.coins })}
        </Button>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Написать лестницу наград**

Создать `frontend/src/views/profile/components/RewardTrack.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useClaimRewards, type BattlePassState } from '@/entities/battle-pass';
import { useLocaleControl } from '@/shared/i18n';
import { Button } from '@/shared/ui/Button';
import { SectionHead } from '@/shared/ui/SectionHead';

/**
 * Лестница сезона. Одна кнопка на всё доступное, а не кнопка на каждой клетке:
 * награда одного вида — монеты, и выбирать, какую монету получить раньше,
 * незачем.
 *
 * Срок сезона стоит здесь же, а не в подсказке: незабранные награды сгорают
 * вместе с сезоном, и человек, потерявший монеты из-за незамеченной даты, прав.
 */
export function RewardTrack({ state }: { state: BattlePassState }) {
  const t = useTranslations('profile');
  const { locale } = useLocaleControl();
  const claim = useClaimRewards();

  // Дата — через toLocaleDateString с локалью продукта, как в shared/lib/utils/period.ts,
  // а не через `useFormatter` next-intl: у того зону пришлось бы выбирать осознанно
  // (см. комментарий в LocaleProvider), а здесь нужен просто день конца квартала.
  const endsAt = new Date(state.season.endsAt).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
  });

  return (
    <section>
      <SectionHead title={t('track')}>
        <span className="muted">{t('seasonEnds', { date: endsAt })}</span>
      </SectionHead>
      <p className="lede">{t('seasonNote')}</p>
      <Button onClick={() => claim.mutate()} disabled={state.pendingCoins === 0 || claim.isPending}>
        {state.pendingCoins > 0 ? t('claim', { coins: state.pendingCoins }) : t('claimNone')}
      </Button>
      <ol className="track">
        {state.levels.map((row) => (
          <li key={row.level} className={`track-cell is-${row.state}`}>
            <span className="track-level">{row.level}</span>
            <span className="track-coins">{row.coins}</span>
            <span className="track-note muted">
              {row.state === 'claimed' ? t('claimed') : row.state === 'ready' ? t('ready') : t('locked', { xp: row.xp })}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 6: Написать страницу**

Создать `frontend/src/views/profile/Page.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useBattlePass } from '@/entities/battle-pass';
import { useAuth } from '@/features/auth';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { PageHead } from '@/shared/ui/PageHead';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Wrap } from '@/shared/ui/Wrap';
import { DailyReward } from './components/DailyReward';
import { HeroCard } from './components/HeroCard';
import { RewardTrack } from './components/RewardTrack';

/**
 * Профиль игрока: герой, уровень сезона, ежедневная награда и лестница наград.
 *
 * Страница обычная, не игровая: чёрное поле, скругления и палитра раздела игр
 * живут только внутри `/games`, а профиль — про учётную запись.
 */
export function ProfilePage() {
  const t = useTranslations('profile');
  const { user } = useAuth();
  const battlePass = useBattlePass();

  return (
    <Wrap>
      <PageHead title={t('title')} lede={t('lede')} />
      {battlePass.isPending && <Skeleton height={120} />}
      {/* ErrorNote сам ничего не рисует, пока ошибки нет, — условие ему не нужно. */}
      <ErrorNote error={battlePass.error} fallback={t('loadFailed')} />
      {battlePass.data && (
        <>
          <HeroCard state={battlePass.data} name={user?.name || user?.email || ''} />
          <DailyReward daily={battlePass.data.daily} />
          <RewardTrack state={battlePass.data} />
        </>
      )}
    </Wrap>
  );
}
```

`ErrorNote` принимает `error` и обязательный `fallback` (не children), `Skeleton` — `width`/`height`
(не children): сигнатуры сверены с `frontend/src/shared/ui/`. Менять сами компоненты ради этой
страницы не нужно.

- [ ] **Step 7: Завести адрес**

Создать `frontend/src/app/(app)/profile/page.tsx`:

```tsx
/**
 * Профиль — /profile
 *
 * Файл роута — только объявление адреса. Сама страница живёт в слое `views`
 * (`src/views`, не `src/pages`: `src/pages` — служебный каталог Pages Router).
 */
export { ProfilePage as default } from '@/views/profile/Page';
```

- [ ] **Step 8: Добавить стили**

В конец `frontend/src/app/globals.css` добавить блок (нулевой радиус, цвета — существующие имена темы; при необходимости сверить их с началом файла):

```css
/* ── ПРОФИЛЬ И BATTLE PASS ─────────────────────────────────────────────── */

.hero-card { display: grid; grid-template-columns: 160px 1fr; gap: 16px; margin-bottom: 24px; }
.hero-slot { aspect-ratio: 3 / 4; border: 1px solid var(--hair); display: grid; place-items: center; }
.hero-level { font-size: 48px; font-variant-numeric: tabular-nums; }
.hero-name { font-weight: 600; }
.hero-soon { margin: 2px 0 12px; }

.xpbar-head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
.xpbar-rail { height: 8px; background: var(--hair); }
.xpbar-fill { display: block; height: 100%; background: var(--ink); }

.daily-row, .track { display: grid; gap: 8px; list-style: none; padding: 0; margin: 12px 0; }
.daily-row { grid-template-columns: repeat(7, 1fr); }
.track { grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); }
.daily-cell, .track-cell { border: 1px solid var(--hair); padding: 8px; display: grid; gap: 2px; }
.daily-cell.is-done, .track-cell.is-claimed { opacity: 0.5; }
.daily-cell.is-today, .track-cell.is-ready { outline: 2px solid var(--ink); }
.track-cell.is-locked { opacity: 0.6; }
.daily-day, .track-level { font-size: 12px; }
.daily-coins, .track-coins { font-variant-numeric: tabular-nums; font-weight: 600; }

@media (max-width: 640px) {
  .hero-card { grid-template-columns: 1fr; }
  .daily-row { grid-template-columns: repeat(4, 1fr); }
}
```

- [ ] **Step 9: Собрать фронт**

Run: `cd frontend && npx next build`
Expected: сборка проходит, в списке маршрутов есть `/profile`

- [ ] **Step 10: Коммит**

```bash
cd E:/git/virex-trader
git add "frontend/src/app/(app)/profile" frontend/src/views/profile frontend/src/app/globals.css frontend/src/shared/i18n/messages
git commit --only "frontend/src/app/(app)/profile" frontend/src/views/profile frontend/src/app/globals.css frontend/src/shared/i18n/messages -m "feat(battlepass): страница профиля с уровнем, ежедневкой и лестницей наград" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Вход в профиль из шапки и общая проверка

Пункт меню и точка-индикатор: награда, которой не видно, не награда.

**Files:**
- Modify: `frontend/src/widgets/top-nav/TopNav.tsx` (пункт меню и класс кнопки профиля)
- Modify: `frontend/src/shared/i18n/messages/ru.json`, `en.json` (`nav.battlePass`)
- Modify: `frontend/src/app/globals.css` (точка-индикатор)

**Interfaces:**
- Consumes: `useBattlePass` (Task 7), страница `/profile` (Task 8).
- Produces: ничего нового наружу.

- [ ] **Step 1: Добавить подпись пункта**

В обоих файлах сообщений в раздел `nav` добавить `"battlePass": "Battle Pass"` (одинаково в `ru.json` и `en.json` — название не переводится).

- [ ] **Step 2: Добавить пункт в меню профиля**

В `frontend/src/widgets/top-nav/TopNav.tsx`, рядом с пунктом «Настройки»:

```tsx
              {/* Прогресс — переход по адресу, а не окно: у профиля есть свой
                  адрес, и меню обязано его отдавать. Подпись — «Battle Pass», а
                  не «Профиль»: кнопка, открывающая это меню, уже так называется,
                  и два «Профиля» подряд ничего не различали бы. */}
              <KeyValue label={t('battlePass')} control valueClassName="">
                <Link className="btn bare" href="/profile" onClick={() => setMenuOpen(false)}>
                  {tc('open')}
                </Link>
              </KeyValue>
```

- [ ] **Step 3: Показать точку, когда есть что забрать**

В том же файле, в теле компонента:

```tsx
  // Награда, которой не видно, — не награда: точка на кнопке профиля
  // появляется, когда ждут либо уровни, либо сегодняшняя ежедневная.
  const battlePass = useBattlePass();
  const hasRewards = Boolean(
    battlePass.data && (battlePass.data.pendingCoins > 0 || !battlePass.data.daily.claimedToday),
  );
```

и на кнопке профиля:

```tsx
            className={`acct${hasRewards ? ' has-dot' : ''}`}
```

Импорт: `import { useBattlePass } from '@/entities/battle-pass';`

- [ ] **Step 4: Добавить стиль точки**

В `frontend/src/app/globals.css`, в блок профиля:

```css
.acct.has-dot { position: relative; }
.acct.has-dot::after {
  content: '';
  position: absolute;
  top: 2px;
  right: 2px;
  width: 6px;
  height: 6px;
  background: var(--ink);
}
```

- [ ] **Step 5: Собрать фронт и прогнать тесты**

Run:
```bash
cd E:/git/virex-trader/frontend && npx next build && npx vitest run
cd E:/git/virex-trader/backend && npx jest
```
Expected: сборка проходит, оба набора тестов зелёные

- [ ] **Step 6: Проверить руками путь целиком**

Поднять окружение (`start.bat`), войти под демо-аккаунтом, затем:
1. открыть `/profile` — виден первый уровень, ежедневная награда доступна, лестница заперта;
2. нажать «Забрать» у ежедневной — баланс в шапке вырос, кнопка сменилась на «Награда за сегодня получена», повторное нажатие невозможно;
3. завершить сессию бектеста — на `/profile` прибавилось 50 XP;
4. дойти до второго уровня и нажать «Забрать» в лестнице — монеты начислены, клетка стала «Забрано».

- [ ] **Step 7: Коммит**

```bash
cd E:/git/virex-trader
git add frontend/src
git commit --only frontend/src -m "feat(battlepass): вход в профиль из шапки и точка о неполученной награде" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Что план сознательно не делает

Повторяет раздел «Сознательно не делаем» спеки: премиум-трека, косметики, выбора героя, функциональных бонусов за уровень, истории прошлых сезонов и публичного показа уровня в этом плане нет. XP задним числом за уже сыгранное не начисляется.
