# Бектест: живой график — план реализации

> **Для агентов-исполнителей:** ОБЯЗАТЕЛЬНЫЙ ПОДНАВЫК: используйте subagent-driven-development
> (рекомендуется) или executing-plans для выполнения плана по задачам. Шаги отмечены чекбоксами
> (`- [ ]`) для отслеживания.

**Цель:** сделать автопрокрутку бектеста непрерывной (цена движется минутными тиками, а не
скачками по свече ТФ) и сам график — интерактивным (зум колесом/пинчем, пан драгом, «живой край»
с возвратом одной кнопкой), не трогая сервер.

**Архитектура:** вся работа — на фронтенде, в `frontend/src/views/backtest/`. Общая проверка
срабатывания стопа/тейка выносится в чистую функцию `lib/advance.ts`, которой пользуются и «Шаг»,
и новый минутный тик автопрокрутки. Окно показа графика (какие свечи видны) становится
собственным состоянием `ReplayChart`, а не константой `useReplay`; чистая математика окна и
анимации цены — в новом `lib/motion.ts`.

**Стек:** Next.js App Router, React, TypeScript, vitest. Библиотек не добавляется — график, как и
весь остальной продукт, — своё SVG.

## Глобальные ограничения

- Никаких новых npm-зависимостей и правок серверного кода/схемы — только
  `frontend/src/views/backtest/**`, переводы и `globals.css`.
- Повторяющаяся разметка — только через `shared/ui` (`Button` и т.д.), не сырые `<button>`.
- Кнопка «Шаг» не меняется: мгновенный прыжок до закрытия свечи ТФ, без анимации.
- Скорость автопрокрутки (×1/×4/×16) — «минут симуляции в секунду», не зависит от таймфрейма.
- Граница истории для пана — **год от текущего момента сессии** (`cursor`), не от сегодняшней
  даты и не от начала данных 2018 года.
- Комментарии в коде — на русском, в стиле уже существующих файлов раздела (короткие, объясняют
  «почему», а не «что»).
- Это существенная правка (7+ файлов, новый паттерн взаимодействия) — по завершении плана
  прогнать `npx next build` в `frontend/`, а не только тесты.

---

## Файлы

- **Создать** `frontend/src/views/backtest/lib/advance.ts` — общая проверка продвижения курсора
  и срабатывания стопа/тейка (используется «Шагом» и тиком).
- **Создать** `frontend/src/views/backtest/lib/advance.test.ts`.
- **Создать** `frontend/src/views/backtest/lib/motion.ts` — путь цены внутри минутки
  (`glidePrice`) и математика окна показа (`indexAtOrAfter`, `resolveWindow`).
- **Создать** `frontend/src/views/backtest/lib/motion.test.ts`.
- **Изменить** `frontend/src/views/backtest/lib/candles.ts` — добавить `scaleCandle`.
- **Изменить** `frontend/src/views/backtest/lib/candles.test.ts` — тесты на `scaleCandle`.
- **Изменить** `frontend/src/views/backtest/model/useReplay.ts` — `tick()` рядом с `step()`,
  оба через `advanceTo`; интервал автопрокрутки зовёт `tick`; `glide`; подгрузка истории для
  пана; `candles` без обрезки до последних 120.
- **Изменить** `frontend/src/views/backtest/components/ReplayChart.tsx` — окно показа, пан, зум
  колесом и пинчем, кнопка «→ сейчас», анимация цены внутри минутки.
- **Изменить** `frontend/src/views/backtest/components/SessionScreen.tsx` — прокинуть новые
  пропсы, заменить инлайновое масштабирование на `scaleCandle`.
- **Изменить** `frontend/src/app/globals.css` — стили обёртки графика и кнопки «→ сейчас».
- **Изменить** `frontend/src/shared/i18n/messages/ru.json`, `en.json` — ключ подписи кнопки.

---

### Задача 1: `advanceTo` — общее продвижение курсора и проверка срабатывания

**Файлы:**
- Создать: `frontend/src/views/backtest/lib/advance.ts`
- Тест: `frontend/src/views/backtest/lib/advance.test.ts`

**Интерфейсы:**
- Использует: `findExit`, `type Direction`, `type Exit` из `./fills`; `type Candle` из `./candles`.
- Отдаёт: `advanceTo(input: AdvanceInput): AdvanceResult`, `type AdvanceResult = { reach: number;
  complete: boolean; exit: Exit | null }`, `type OpenPosition = { direction: Direction; stopLoss:
  number; takeProfit: number | null; entryTime: number }` — этими именами и полями пользуется
  Задача 2.

- [ ] **Шаг 1: Написать падающий тест**

```ts
// frontend/src/views/backtest/lib/advance.test.ts
import { describe, expect, it } from 'vitest';
import { advanceTo } from './advance';
import { MINUTE } from './candles';

const at = (n: number) => Date.UTC(2024, 2, 5, 12, 0) + n * MINUTE;

const mins = (from: number, n: number, price = 100) =>
  Array.from({ length: n }, (_, i) => ({ t: from + i * MINUTE, o: price, h: price + 1, l: price - 1, c: price }));

describe('advanceTo', () => {
  it('доходит до target, когда минутки загружены дальше', () => {
    const r = advanceTo({ from: at(0), target: at(5), minutes: mins(at(0), 10), loadedUntil: at(10), position: null });
    expect(r).toEqual({ reach: at(5), complete: true, exit: null });
  });

  it('останавливается на загруженном крае, если он раньше target', () => {
    const r = advanceTo({ from: at(0), target: at(5), minutes: mins(at(0), 3), loadedUntil: at(3), position: null });
    expect(r).toEqual({ reach: at(3), complete: false, exit: null });
  });

  it('без прогресса (from === target) — срабатывание не проверяется', () => {
    const r = advanceTo({
      from: at(5),
      target: at(5),
      minutes: mins(at(0), 10),
      loadedUntil: at(10),
      position: { direction: 'long', stopLoss: 90, takeProfit: null, entryTime: at(0) },
    });
    expect(r.exit).toBeNull();
  });

  it('стоп сработал внутри окна — exit возвращается', () => {
    const minutes = mins(at(0), 5, 100);
    minutes[2] = { ...minutes[2], l: 89 };
    const r = advanceTo({
      from: at(0),
      target: at(5),
      minutes,
      loadedUntil: at(5),
      position: { direction: 'long', stopLoss: 90, takeProfit: null, entryTime: at(0) },
    });
    expect(r.exit).toEqual({ reason: 'stop', price: 90, time: at(3) });
  });

  it('позиции нет — срабатывания не бывает, даже если цена его коснулась', () => {
    const minutes = mins(at(0), 5, 100);
    minutes[2] = { ...minutes[2], l: 1 };
    const r = advanceTo({ from: at(0), target: at(5), minutes, loadedUntil: at(5), position: null });
    expect(r.exit).toBeNull();
  });
});
```

- [ ] **Шаг 2: Проверить, что тест падает**

Run (из `frontend/`): `npx vitest run src/views/backtest/lib/advance.test.ts`
Expected: FAIL — `Cannot find module './advance'` (файла ещё нет).

- [ ] **Шаг 3: Реализация**

```ts
// frontend/src/views/backtest/lib/advance.ts
import type { Candle } from './candles';
import { findExit, type Direction, type Exit } from './fills';

/** Открытая позиция в виде, достаточном для проверки срабатывания. entryTime — в мс. */
export interface OpenPosition {
  direction: Direction;
  stopLoss: number;
  takeProfit: number | null;
  entryTime: number;
}

export interface AdvanceResult {
  /** До какого момента реально дошли — не дальше загруженных минуток. */
  reach: number;
  /** Дошли до target, а не встали раньше из-за нехватки минуток. */
  complete: boolean;
  exit: Exit | null;
}

/**
 * Продвигает момент сессии от `from` к `target`, попутно проверяя срабатывание
 * стопа/тейка открытой позиции по настоящим минуткам. Общая часть для «Шага»
 * (target — закрытие свечи ТФ) и минутного тика автопрокрутки (target — from + 1
 * минута): раздельные реализации однажды разошлись бы в проверке срабатывания,
 * и молча.
 */
export function advanceTo(p: {
  from: number;
  target: number;
  minutes: Candle[];
  loadedUntil: number | null;
  position: OpenPosition | null;
}): AdvanceResult {
  const reach = Math.min(p.target, p.loadedUntil ?? p.from);
  const complete = reach >= p.target;
  let exit: Exit | null = null;
  if (reach > p.from && p.position) {
    exit = findExit(p.position, p.minutes, Math.max(p.position.entryTime, p.from), reach);
  }
  return { reach, complete, exit };
}
```

- [ ] **Шаг 4: Проверить, что тест проходит**

Run: `npx vitest run src/views/backtest/lib/advance.test.ts`
Expected: PASS (5 тестов).

- [ ] **Шаг 5: Commit**

```bash
git add frontend/src/views/backtest/lib/advance.ts frontend/src/views/backtest/lib/advance.test.ts
git commit -m "feat(backtest): advanceTo — общая проверка продвижения и срабатывания"
```

---

### Задача 2: `useReplay` — минутный тик вместо прыжка на свечу ТФ

**Файлы:**
- Изменить: `frontend/src/views/backtest/model/useReplay.ts`

**Интерфейсы:**
- Использует: `advanceTo`, `type OpenPosition` из `../lib/advance` (Задача 1).
- Отдаёт: новое поле `Replay.glide: { minute: Candle; durationMs: number } | null` — потребляет
  Задача 8 (анимация в `ReplayChart`). Сигнатуры `step()` и остальных полей `Replay` не меняются.

Автоматических тестов на сам хук в разделе нет и не заводится этой задачей (async-эффекты и
таймеры уже сегодня не покрыты юнит-тестами — покрыта только чистая логика в `lib/`, которую
хук использует). Проверка — существующий набор тестов не ломается, и ручная проверка в браузере.

- [ ] **Шаг 1: Заменить импорты**

Файл: `frontend/src/views/backtest/model/useReplay.ts:1-17`

Было:
```ts
import { fetchCandles, saveCursor } from '../api/hooks';
import type { BacktestTrade, SessionDetail } from '../api/types';
import {
  DAY,
  MINUTE,
  bucketStart,
  currentBucket,
  lastPrice,
  loadedUntil,
  nextStop,
  visibleCandles,
  type Candle,
} from '../lib/candles';
import { findExit, type Exit } from '../lib/fills';
```

Стало:
```ts
import { fetchCandles, saveCursor } from '../api/hooks';
import type { BacktestTrade, SessionDetail } from '../api/types';
import { advanceTo } from '../lib/advance';
import {
  DAY,
  MINUTE,
  bucketStart,
  currentBucket,
  lastPrice,
  loadedUntil,
  nextStop,
  visibleCandles,
  type Candle,
} from '../lib/candles';
import type { Exit } from '../lib/fills';
```

(`findExit` больше не нужен здесь напрямую — его теперь зовёт `advanceTo`.)

- [ ] **Шаг 2: Добавить `glide` в интерфейс `Replay`**

Файл: `frontend/src/views/backtest/model/useReplay.ts` — интерфейс `Replay` (было на строках
38-55). Добавить поле после `candles`:

```ts
  /** В настоящих ценах. */
  candles: Candle[];
  /**
   * Минутка, которая только что «приземлилась» на автопрокрутке, и на сколько
   * мс её отрисовать — для плавного хода цены внутри тика. null на паузе и
   * после ручного «Шага»: там анимации нет по замыслу.
   */
  glide: { minute: Candle; durationMs: number } | null;
```

- [ ] **Шаг 3: Заменить `step` на `advance` + `step` + `tick`**

Файл: `frontend/src/views/backtest/model/useReplay.ts` — блок `step` целиком (было на строках
142-177):

Было:
```ts
  const step = useCallback(async () => {
    if (busy.current || endedRef.current) return;
    busy.current = true;
    setError(null);
    try {
      const from = cursorRef.current;
      const target = nextStop(from, tfRef.current);
      await ensureMinutes(target + LOOKAHEAD_MS);
      const reach = Math.min(target, loadedUntil(minutesRef.current) ?? from);
      if (reach > from) {
        const open = openRef.current;
        if (open && !closing.current.has(open.id)) {
          const exit = findExit(open, minutesRef.current, Math.max(Date.parse(open.entryTime), from), reach);
          if (exit) {
            closing.current.add(open.id);
            // Сработал уровень — автопрокрутка встаёт, чтобы исход не проскочил мимо глаз.
            setSpeed(null);
            onExitRef.current(open, exit);
          }
        }
        cursorRef.current = reach;
        setCursor(reach);
      }
      // Шаг не дошёл до цели — минутки кончились, дальше крутить нечего.
      if (reach < target) {
        endedRef.current = true;
        setEnded(true);
        setSpeed(null);
      }
    } catch (e) {
      setError(e);
      setSpeed(null);
    } finally {
      busy.current = false;
    }
  }, [ensureMinutes]);
```

Стало:
```ts
  /**
   * Общая механика продвижения: и мгновенный «Шаг» (target — закрытие свечи
   * ТФ), и минутный тик автопрокрутки (target — from + минута) идут через
   * одну проверку срабатывания (`advanceTo`) — раздельные реализации однажды
   * разошлись бы, и молча.
   */
  const advance = useCallback(
    async (target: number, onLanded?: (from: number, reach: number) => void) => {
      if (busy.current || endedRef.current) return;
      busy.current = true;
      setError(null);
      try {
        const from = cursorRef.current;
        await ensureMinutes(target + LOOKAHEAD_MS);
        const open = openRef.current;
        const position =
          open && !closing.current.has(open.id)
            ? { direction: open.direction, stopLoss: open.stopLoss, takeProfit: open.takeProfit, entryTime: Date.parse(open.entryTime) }
            : null;
        const { reach, complete, exit } = advanceTo({
          from,
          target,
          minutes: minutesRef.current,
          loadedUntil: loadedUntil(minutesRef.current),
          position,
        });
        if (reach > from) {
          if (exit && open) {
            closing.current.add(open.id);
            // Сработал уровень — автопрокрутка встаёт, чтобы исход не проскочил мимо глаз.
            setSpeed(null);
            onExitRef.current(open, exit);
          }
          cursorRef.current = reach;
          setCursor(reach);
          onLanded?.(from, reach);
        }
        // Не дошли до цели — минутки кончились, дальше крутить нечего.
        if (!complete) {
          endedRef.current = true;
          setEnded(true);
          setSpeed(null);
        }
      } catch (e) {
        setError(e);
        setSpeed(null);
      } finally {
        busy.current = false;
      }
    },
    [ensureMinutes],
  );

  /** Мгновенный прыжок до закрытия текущей свечи ТФ — без анимации, для ручного разбора. */
  const step = useCallback(() => advance(nextStop(cursorRef.current, tfRef.current)), [advance]);

  const [glide, setGlide] = useState<{ minute: Candle; durationMs: number } | null>(null);

  /**
   * Тик автопрокрутки — ровно одна настоящая минутка, не вся свеча ТФ:
   * скорость (шагов в секунду) стала «минут симуляции в секунду» и не зависит
   * от выбранного таймфрейма. `speedNow` — из замыкания эффекта интервала, а
   * не из состояния `speed`, чтобы длительность анимации не разошлась со
   * ставкой, на которой тик на самом деле случился.
   */
  const tick = useCallback(
    (speedNow: number) =>
      advance(cursorRef.current + MINUTE, (from) => {
        const landed = minutesRef.current.find((m) => m.t === from);
        // Минутки может не быть — дыра в истории биржи; тогда просто без анимации.
        if (landed) setGlide({ minute: landed, durationMs: 1000 / speedNow });
      }),
    [advance],
  );
```

- [ ] **Шаг 4: Автопрокрутка зовёт `tick`, не `step`**

Файл: `frontend/src/views/backtest/model/useReplay.ts` — блок интервала (было на строках 179-185):

Было:
```ts
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    if (!speed) return;
    const h = setInterval(() => void stepRef.current(), 1000 / speed);
    return () => clearInterval(h);
  }, [speed]);
```

Стало:
```ts
  const tickRef = useRef(tick);
  tickRef.current = tick;
  useEffect(() => {
    if (!speed) return;
    const h = setInterval(() => void tickRef.current(speed), 1000 / speed);
    return () => clearInterval(h);
  }, [speed]);
```

- [ ] **Шаг 5: Отдать `glide` из хука**

Файл: `frontend/src/views/backtest/model/useReplay.ts` — объект `return` (было на строках
211-224). Добавить поле `glide,` сразу после `candles,`.

- [ ] **Шаг 6: Прогнать существующие тесты раздела**

Run: `npx vitest run src/views/backtest`
Expected: PASS — `candles.test.ts`, `fills.test.ts`, `money.test.ts`, новый `advance.test.ts`,
ничего не сломано (эта задача не трогает их код, только `useReplay.ts`, у которого своих тестов
нет).

- [ ] **Шаг 7: Ручная проверка**

`cd frontend && npm run dev`, открыть `/backtest`, зайти в активную или новую сессию, включить
автопрокрутку на ×1 — курсор и свечи должны продолжать двигаться так же, как раньше (просто
более гранулярно), стоп/тейк открытой сделки — по-прежнему останавливать автопрокрутку при
срабатывании. `glide` пока ни на что не влияет визуально — это ожидаемо, он подключается в
Задаче 8.

- [ ] **Шаг 8: Commit**

```bash
git add frontend/src/views/backtest/model/useReplay.ts
git commit -m "feat(backtest): минутный тик автопрокрутки вместо прыжка на свечу ТФ"
```

---

### Задача 3: `glidePrice` — путь цены внутри минутки

**Файлы:**
- Создать: `frontend/src/views/backtest/lib/motion.ts`
- Тест: `frontend/src/views/backtest/lib/motion.test.ts`

**Интерфейсы:**
- Отдаёт: `glidePrice(o: number, h: number, l: number, c: number, phase: number): number` —
  потребляет Задача 8.

- [ ] **Шаг 1: Написать падающий тест**

```ts
// frontend/src/views/backtest/lib/motion.test.ts
import { describe, expect, it } from 'vitest';
import { glidePrice } from './motion';

describe('glidePrice', () => {
  it('концы точно совпадают с open и close', () => {
    expect(glidePrice(100, 105, 98, 102, 0)).toBe(100);
    expect(glidePrice(100, 105, 98, 102, 1)).toBe(102);
  });

  it('дальний от open экстремум проходится первым — здесь high', () => {
    // |105-100|=5 > |100-98|=2
    expect(glidePrice(100, 105, 98, 102, 1 / 3)).toBe(105);
    expect(glidePrice(100, 105, 98, 102, 2 / 3)).toBe(98);
  });

  it('если дальше low — сначала он', () => {
    // |103-100|=3 < |100-90|=10
    expect(glidePrice(100, 103, 90, 95, 1 / 3)).toBe(90);
    expect(glidePrice(100, 103, 90, 95, 2 / 3)).toBe(103);
  });

  it('фаза вне [0,1] обрезается', () => {
    expect(glidePrice(100, 105, 98, 102, -1)).toBe(100);
    expect(glidePrice(100, 105, 98, 102, 2)).toBe(102);
  });

  it('плоская минутка (o=h=l=c) не роняет счёт', () => {
    expect(glidePrice(100, 100, 100, 100, 0.5)).toBe(100);
  });
});
```

- [ ] **Шаг 2: Проверить, что тест падает**

Run: `npx vitest run src/views/backtest/lib/motion.test.ts`
Expected: FAIL — модуля `./motion` ещё нет.

- [ ] **Шаг 3: Реализация**

```ts
// frontend/src/views/backtest/lib/motion.ts

/**
 * Цена в фазе 0..1 внутри одной настоящей минутки: open → дальний от open
 * экстремум → второй экстремум → close, с плавным (smoothstep) переходом на
 * каждом стыке. Порядок обхода экстремумов — приближение: настоящего пути
 * тика биржа не хранит, есть только O/H/L/C.
 */
export function glidePrice(o: number, h: number, l: number, c: number, phase: number): number {
  const ph = Math.max(0, Math.min(1, phase));
  const far = Math.abs(h - o) >= Math.abs(o - l) ? h : l;
  const near = far === h ? l : h;
  const points = [o, far, near, c];
  const ease = (x: number) => x * x * (3 - 2 * x);
  const seg = ph * 3;
  const i = Math.min(2, Math.floor(seg));
  const localPh = ease(seg - i);
  return points[i] + (points[i + 1] - points[i]) * localPh;
}
```

- [ ] **Шаг 4: Проверить, что тест проходит**

Run: `npx vitest run src/views/backtest/lib/motion.test.ts`
Expected: PASS (5 тестов).

- [ ] **Шаг 5: Commit**

```bash
git add frontend/src/views/backtest/lib/motion.ts frontend/src/views/backtest/lib/motion.test.ts
git commit -m "feat(backtest): glidePrice — путь цены внутри минутки для анимации"
```

---

### Задача 4: `resolveWindow` — математика окна показа графика

**Файлы:**
- Изменить: `frontend/src/views/backtest/lib/motion.ts`
- Изменить: `frontend/src/views/backtest/lib/motion.test.ts`

**Интерфейсы:**
- Отдаёт: `indexAtOrAfter(candles, time): number`, `interface ViewState { count: number;
  anchorTime: number | null }`, `interface WindowBounds { minCount: number; maxCount: number }`,
  `resolveWindow(candles, view: ViewState, bounds: WindowBounds): { startIdx: number; endIdx:
  number; live: boolean }` — потребляют Задачи 6 и 7 в `ReplayChart`.

- [ ] **Шаг 1: Дописать падающие тесты**

Добавить в конец `frontend/src/views/backtest/lib/motion.test.ts`:

```ts
import { indexAtOrAfter, resolveWindow } from './motion';

describe('indexAtOrAfter', () => {
  const cs = [{ t: 10 }, { t: 20 }, { t: 30 }];
  it('находит первую подходящую', () => {
    expect(indexAtOrAfter(cs, 15)).toBe(1);
    expect(indexAtOrAfter(cs, 20)).toBe(1);
  });
  it('время раньше всех — индекс 0', () => {
    expect(indexAtOrAfter(cs, 0)).toBe(0);
  });
  it('время позже всех — длина массива', () => {
    expect(indexAtOrAfter(cs, 100)).toBe(3);
  });
});

describe('resolveWindow', () => {
  const cs = Array.from({ length: 50 }, (_, i) => ({ t: i * 60_000 }));
  const bounds = { minCount: 5, maxCount: 100 };

  it('живой режим (anchorTime=null) — окно у правого края', () => {
    expect(resolveWindow(cs, { count: 10, anchorTime: null }, bounds)).toEqual({ startIdx: 40, endIdx: 50, live: true });
  });

  it('якорь внутри диапазона — окно от него, не живое', () => {
    expect(resolveWindow(cs, { count: 10, anchorTime: 5 * 60_000 }, bounds)).toEqual({ startIdx: 5, endIdx: 15, live: false });
  });

  it('якорь у самого края — не уезжает за пределы массива', () => {
    const r = resolveWindow(cs, { count: 10, anchorTime: 49 * 60_000 }, bounds);
    expect(r.startIdx).toBe(40);
    expect(r.endIdx).toBe(50);
  });

  it('count зажимается границами', () => {
    const r = resolveWindow(cs, { count: 1000, anchorTime: null }, { minCount: 5, maxCount: 20 });
    expect(r.endIdx - r.startIdx).toBe(20);
  });
});
```

Импорт `glidePrice` в верхней части файла оставить как есть, добавить `indexAtOrAfter,
resolveWindow` в тот же (или отдельный) `import { ... } from './motion';`.

- [ ] **Шаг 2: Проверить, что тесты падают**

Run: `npx vitest run src/views/backtest/lib/motion.test.ts`
Expected: FAIL — `indexAtOrAfter`/`resolveWindow` не экспортированы.

- [ ] **Шаг 3: Реализация**

Добавить в `frontend/src/views/backtest/lib/motion.ts`:

```ts
/** Индекс первой свечи с t >= time; длина массива, если такой нет. Свечи упорядочены по t. */
export function indexAtOrAfter(candles: { t: number }[], time: number): number {
  let lo = 0;
  let hi = candles.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (candles[mid].t < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface ViewState {
  /** Сколько свечей показывать. */
  count: number;
  /** Время левого края окна; null — окно следует за правым краем (живой режим). */
  anchorTime: number | null;
}

export interface WindowBounds {
  minCount: number;
  maxCount: number;
}

/**
 * Где стоит окно просмотра: индексы в массиве свечей и следит ли оно за живым
 * краем. Якорь хранится временем, а не индексом — массив растёт слева при
 * догрузке истории для пана, и индекс от этого сместился бы, а время нет.
 */
export function resolveWindow(
  candles: { t: number }[],
  view: ViewState,
  bounds: WindowBounds,
): { startIdx: number; endIdx: number; live: boolean } {
  const total = candles.length;
  const count = Math.min(bounds.maxCount, Math.max(bounds.minCount, view.count));
  const maxStart = Math.max(0, total - count);
  const live = view.anchorTime == null;
  const startIdx = live ? maxStart : Math.min(indexAtOrAfter(candles, view.anchorTime), maxStart);
  return { startIdx, endIdx: Math.min(total, startIdx + count), live };
}
```

- [ ] **Шаг 4: Проверить, что тесты проходят**

Run: `npx vitest run src/views/backtest/lib/motion.test.ts`
Expected: PASS (все тесты файла).

- [ ] **Шаг 5: Commit**

```bash
git add frontend/src/views/backtest/lib/motion.ts frontend/src/views/backtest/lib/motion.test.ts
git commit -m "feat(backtest): resolveWindow — математика окна показа для пана и зума"
```

---

### Задача 5: `useReplay` — догрузка истории назад и полный ряд свечей

**Файлы:**
- Изменить: `frontend/src/views/backtest/model/useReplay.ts`

**Интерфейсы:**
- Отдаёт: новые поля `Replay.loadMoreHistory: () => Promise<void>`, `Replay.historyLoading:
  boolean` — потребляет Задача 6.
- `Replay.candles` перестаёт обрезаться до последних 120 — потребляет Задача 6 (окно теперь
  считает сам `ReplayChart`).

- [ ] **Шаг 1: Заменить константу `VISIBLE` на константы истории**

Было (строка 26):
```ts
/** Сколько свечей отдавать графику. */
const VISIBLE = 120;
```

Стало:
```ts
/** Дальше в прошлое пан не пускает — год от текущего момента сессии, не от сегодняшней даты. */
export const HISTORY_CAP_MS = 365 * DAY;
/** Кусок истории на одну догрузку при пане. */
const HISTORY_CHUNK = 500;
```

- [ ] **Шаг 2: Убрать обрезку в `candles`**

Было:
```ts
  const candles = useMemo(() => {
    const set = closed[tf];
    if (!set) return [];
    return visibleCandles({ closed: set.candles, anchor: set.anchor, minutes, tf, cursor }).slice(-VISIBLE);
  }, [closed, tf, minutes, cursor]);
```

Стало:
```ts
  const candles = useMemo(() => {
    const set = closed[tf];
    if (!set) return [];
    // Полный загруженный ряд, не только «последние 120»: окно показа теперь
    // выбирает сам ReplayChart (пан и зум), а не хук.
    return visibleCandles({ closed: set.candles, anchor: set.anchor, minutes, tf, cursor });
  }, [closed, tf, minutes, cursor]);
```

- [ ] **Шаг 3: Добавить догрузку истории**

Добавить после эффекта, загружающего `closed[tf]` (после блока, который заканчивается на
`}, [tf, closed]);`), перед `const candles = useMemo(...)`:

```ts
  const historyLoadingRef = useRef(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  /** На какой ТФ пан уже упёрся в границу года — чтобы не долбить сервер у края. */
  const historyExhausted = useRef<Record<number, boolean>>({});

  /**
   * Довесок истории для пана назад: следующий кусок закрытых свечей текущего
   * ТФ перед уже загруженными, не дальше года от текущего момента сессии.
   */
  const loadMoreHistory = useCallback(async () => {
    const set = closed[tf];
    if (!set || historyLoadingRef.current || historyExhausted.current[tf]) return;
    const earliest = set.candles[0]?.t ?? set.anchor;
    const floor = cursorRef.current - HISTORY_CAP_MS;
    if (earliest <= floor) {
      historyExhausted.current[tf] = true;
      return;
    }
    historyLoadingRef.current = true;
    setHistoryLoading(true);
    try {
      const chunk = await fetchCandles(tf, { to: earliest - 1, limit: HISTORY_CHUNK });
      const filtered = chunk.filter((c) => c.t >= floor);
      if (chunk.length < HISTORY_CHUNK || filtered.length < chunk.length) historyExhausted.current[tf] = true;
      if (filtered.length > 0) {
        setClosed((prev) => {
          const cur = prev[tf];
          if (!cur) return prev;
          return { ...prev, [tf]: { ...cur, candles: [...filtered, ...cur.candles] } };
        });
      }
    } catch (e) {
      setError(e);
    } finally {
      historyLoadingRef.current = false;
      setHistoryLoading(false);
    }
  }, [closed, tf]);
```

- [ ] **Шаг 4: Отдать новые поля из хука**

В интерфейсе `Replay` добавить после `glide`:
```ts
  /** Догрузить ещё истории назад для текущего ТФ — вызывает ReplayChart, приближаясь к краю. */
  loadMoreHistory: () => Promise<void>;
  historyLoading: boolean;
```

В объекте `return` добавить `loadMoreHistory, historyLoading,` (после `glide,`).

- [ ] **Шаг 5: Прогнать тесты раздела**

Run: `npx vitest run src/views/backtest`
Expected: PASS — эта задача не трогает протестированную чистую логику, только добавляет новое
поведение в хук.

- [ ] **Шаг 6: Commit**

```bash
git add frontend/src/views/backtest/model/useReplay.ts
git commit -m "feat(backtest): догрузка истории назад для пана, весь ряд свечей из хука"
```

---

### Задача 6: `ReplayChart` — окно показа, пан, кнопка «→ сейчас»

**Файлы:**
- Изменить: `frontend/src/views/backtest/components/ReplayChart.tsx`
- Изменить: `frontend/src/views/backtest/components/SessionScreen.tsx`
- Изменить: `frontend/src/app/globals.css`
- Изменить: `frontend/src/shared/i18n/messages/ru.json`, `en.json`

**Интерфейсы:**
- Использует: `resolveWindow`, `type ViewState` из `../lib/motion` (Задача 4); `loadMoreHistory`,
  `historyLoading` из `useReplay` (Задача 5).
- Новые пропсы `ReplayChart`: `liveLabel: string`, `onNeedHistory?: () => void`,
  `historyLoading?: boolean`. Пропсы `candles`, `levels`, `labelFor`, `levelLabel`, `onDragLevel`
  — без изменений сигнатуры.

- [ ] **Шаг 1: Переписать `ReplayChart.tsx`**

Полное содержимое файла:

```tsx
'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import { Button } from '@/shared/ui/Button';
import { resolveWindow, type ViewState } from '../lib/motion';
import type { Candle } from '../lib/candles';

const W = 720;
const H = 380;
const PR = 72; // полоса цен справа
const PT = 14;
const PB = 24;
const PW = W - PR;
const DEFAULT_COUNT = 120;
const MIN_COUNT = 20;
const MAX_COUNT = 400;
/** Насколько близко к загруженному краю пан просит родителя догрузить историю. */
const EDGE_THRESHOLD = 15;
const TICKS = 5;

export type LevelKind = 'entry' | 'stop' | 'take';

export interface Level {
  kind: LevelKind;
  price: number;
  draggable: boolean;
}

const LEVEL_COLOR: Record<LevelKind, string> = {
  entry: 'var(--color-fg)',
  stop: 'var(--loss)',
  take: 'var(--profit)',
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * График прокрутки: свечи до текущего момента и уровни сделки.
 *
 * Своё SVG, как все графики продукта: библиотеке пришлось бы переопределять
 * цвета, шрифты и рамки по одному свойству. Холст масштабируется целиком,
 * пиксельные мерки переводятся в единицы холста через u = W / boxW.
 *
 * Окно показа (сколько свечей видно и какие) — состояние самого графика: пан
 * (драг) и зум двигают его напрямую, «живой край» включён по умолчанию и
 * возвращается кнопкой. Родитель знает только о запросе догрузить историю,
 * когда пан подходит к загруженному краю (`onNeedHistory`).
 *
 * Стоп и тейк перетаскиваются. Их «горячая зона» останавливает событие
 * (`stopPropagation`) — иначе один и тот же клик начинал бы и перетаскивание
 * уровня, и пан фона.
 */
export function ReplayChart({
  candles,
  levels,
  labelFor,
  levelLabel,
  liveLabel,
  onDragLevel,
  onNeedHistory,
  historyLoading,
}: {
  candles: Candle[];
  levels: Level[];
  labelFor: (t: number) => string;
  levelLabel: (kind: LevelKind) => string;
  /** Подпись кнопки возврата к живому краю — перевод даёт вызывающий, как и остальные подписи. */
  liveLabel: string;
  onDragLevel?: (kind: LevelKind, price: number, done: boolean) => void;
  /** Пан подошёл к загруженному краю — время догрузить историю назад. */
  onNeedHistory?: () => void;
  historyLoading?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [boxW, setBoxW] = useState(0);
  const [drag, setDrag] = useState<LevelKind | null>(null);
  const frozen = useRef<{ lo: number; hi: number } | null>(null);
  const lastDrag = useRef<number | null>(null);
  const [view, setView] = useState<ViewState>({ count: DEFAULT_COUNT, anchorTime: null });
  const panRef = useRef<{ startX: number; startIdx: number; count: number; slot: number } | null>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    setBoxW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setBoxW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const u = boxW > 0 ? W / boxW : 1;
  const px = (n: number) => n * u;

  const { startIdx, endIdx, live } = resolveWindow(candles, view, { minCount: MIN_COUNT, maxCount: MAX_COUNT });
  const shown = candles.slice(startIdx, endIdx);

  // Пан подошёл к загруженному краю — просим родителя догрузить историю
  // назад. Догрузка добавляет свечи в начало массива; окно держится за
  // anchorTime, а не за индекс, поэтому сдвиг массива его не портит.
  useEffect(() => {
    if (!live && startIdx <= EDGE_THRESHOLD && !historyLoading) onNeedHistory?.();
  }, [startIdx, live, historyLoading, onNeedHistory]);

  let lo: number;
  let hi: number;
  if (drag && frozen.current) {
    ({ lo, hi } = frozen.current);
  } else {
    const values = [...shown.flatMap((c) => [c.h, c.l]), ...levels.map((l) => l.price)];
    lo = values.length ? Math.min(...values) : 0;
    hi = values.length ? Math.max(...values) : 1;
    const pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.01 || 1;
    lo -= pad;
    hi += pad;
  }

  const plotH = H - PT - PB;
  const y = (p: number) => PT + ((hi - p) / (hi - lo)) * plotH;
  const priceAt = (yy: number) => clamp(hi - ((yy - PT) / plotH) * (hi - lo), lo, hi);
  const count = endIdx - startIdx;
  const slot = count > 0 ? PW / count : PW;
  const cx = (i: number) => i * slot + slot / 2;
  const bodyW = Math.max(px(1), slot * 0.66);

  const svgY = (clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return ((clientY - r.top) / r.height) * H;
  };
  const svgX = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * W;
  };

  const startDrag = (kind: LevelKind) => (e: PointerEvent<SVGRectElement>) => {
    // Не пускаем событие к фоновому пану — иначе на одном клике начались бы
    // сразу оба жеста.
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    frozen.current = { lo, hi };
    setDrag(kind);
  };

  const startPan = (e: PointerEvent<SVGSVGElement>) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    panRef.current = { startX: svgX(e.clientX), startIdx, count, slot };
  };

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (drag && onDragLevel) {
      const p = priceAt(svgY(e.clientY));
      lastDrag.current = p;
      onDragLevel(drag, p, false);
      return;
    }
    const pan = panRef.current;
    if (!pan) return;
    const dx = svgX(e.clientX) - pan.startX;
    const deltaSlots = Math.round(dx / pan.slot);
    const maxStart = Math.max(0, candles.length - pan.count);
    const newStart = clamp(pan.startIdx - deltaSlots, 0, maxStart);
    setView({ count: pan.count, anchorTime: newStart >= maxStart ? null : candles[newStart]?.t ?? null });
  };

  const endDrag = () => {
    if (drag) {
      if (onDragLevel && lastDrag.current != null) onDragLevel(drag, lastDrag.current, true);
      setDrag(null);
      frozen.current = null;
      lastDrag.current = null;
      return;
    }
    panRef.current = null;
  };

  const goLive = () => setView((v) => ({ ...v, anchorTime: null }));

  const ticks = Array.from({ length: TICKS }, (_, i) => lo + ((i + 0.5) / TICKS) * (hi - lo));
  const timeIdx = shown.length ? [...new Set([0.15, 0.5, 0.85].map((f) => Math.floor(f * (shown.length - 1))))] : [];

  return (
    <div className="replay-chart-wrap">
      <svg
        ref={svgRef}
        className="replay-chart"
        viewBox={`0 0 ${W} ${H}`}
        onPointerDown={startPan}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {ticks.map((p) => (
          <g key={p}>
            <line x1={0} x2={PW} y1={y(p)} y2={y(p)} stroke="var(--color-line)" strokeWidth={px(1)} />
            <text x={PW + px(6)} y={y(p) + px(3.5)} fill="var(--color-muted)" fontSize={px(10)} fontFamily="var(--font-mono)">
              {formatPriceGrouped(p)}
            </text>
          </g>
        ))}

        {shown.map((c, i) => {
          const color = c.c >= c.o ? 'var(--profit)' : 'var(--loss)';
          const top = y(Math.max(c.o, c.c));
          const bottom = y(Math.min(c.o, c.c));
          return (
            <g key={c.t}>
              <line x1={cx(i)} x2={cx(i)} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth={px(1)} />
              <rect x={cx(i) - bodyW / 2} y={top} width={bodyW} height={Math.max(px(1), bottom - top)} fill={color} />
            </g>
          );
        })}

        {timeIdx.map((i) => (
          <text key={i} x={cx(i)} y={H - px(7)} fill="var(--color-muted)" fontSize={px(10)} textAnchor="middle">
            {labelFor(shown[i].t)}
          </text>
        ))}

        {levels.map((l) => (
          <g key={l.kind}>
            <line
              x1={0}
              x2={PW}
              y1={y(l.price)}
              y2={y(l.price)}
              stroke={LEVEL_COLOR[l.kind]}
              strokeWidth={px(1.25)}
              strokeDasharray={l.kind === 'entry' ? undefined : `${px(5)} ${px(4)}`}
            />
            <text x={px(4)} y={y(l.price) - px(4)} fill={LEVEL_COLOR[l.kind]} fontSize={px(10)} fontFamily="var(--font-mono)">
              {levelLabel(l.kind)} {formatPriceGrouped(l.price)}
            </text>
            {l.draggable && onDragLevel && (
              <rect
                className="lvl-hit"
                x={0}
                y={y(l.price) - px(8)}
                width={PW}
                height={px(16)}
                fill="transparent"
                onPointerDown={startDrag(l.kind)}
              />
            )}
          </g>
        ))}
      </svg>
      {!live && (
        <Button className="replay-live" onClick={goLive}>
          {liveLabel}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Шаг 2: Прокинуть новые пропсы из `SessionScreen`**

Файл: `frontend/src/views/backtest/components/SessionScreen.tsx:220-227`

Было:
```tsx
          {replay.ready ? (
            <ReplayChart
              candles={screenCandles}
              levels={levels}
              labelFor={labelFor}
              levelLabel={(k) => t(`level.${k}`)}
              onDragLevel={onDragLevel}
            />
          ) : (
```

Стало:
```tsx
          {replay.ready ? (
            <ReplayChart
              candles={screenCandles}
              levels={levels}
              labelFor={labelFor}
              levelLabel={(k) => t(`level.${k}`)}
              liveLabel={t('live')}
              onDragLevel={onDragLevel}
              onNeedHistory={() => void replay.loadMoreHistory()}
              historyLoading={replay.historyLoading}
            />
          ) : (
```

- [ ] **Шаг 3: Добавить перевод**

Файл: `frontend/src/shared/i18n/messages/ru.json`, в объект `"backtest"` рядом с `"pause"`:
```json
    "pause": "Пауза",
    "live": "→ сейчас",
```

Файл: `frontend/src/shared/i18n/messages/en.json`, в объект `"backtest"` рядом с `"pause"`:
```json
    "pause": "Pause",
    "live": "→ now",
```

- [ ] **Шаг 4: Стили обёртки и кнопки**

Файл: `frontend/src/app/globals.css`, после строки `.replay-controls { ... }` (в блоке
«БЕКТЕСТ»):

```css
  /* Обёртка даёт координаты для кнопки «→ сейчас», абсолютно позиционированной
     над графиком — сам SVG остаётся без изменений размеров. */
  .replay-chart-wrap { position: relative; }
  .replay-live { position: absolute; top: var(--s2); right: var(--s2); background: var(--ground); }
```

- [ ] **Шаг 5: Прогнать тесты и линт**

Run (из `frontend/`): `npx vitest run src/views/backtest && npx eslint src/views/backtest`
Expected: PASS.

- [ ] **Шаг 6: Ручная проверка**

`npm run dev`, открыть активную сессию `/backtest`. Проверить: график по умолчанию показывает
живой край (как раньше); драг по графику (мышью, зажав кнопку, за пределами линий стопа/тейка)
двигает окно назад и вперёд; при уходе от живого края появляется кнопка «→ сейчас» и возвращает
на место; перетаскивание стопа/тейка по-прежнему работает и не запускает пан на том же клике.

- [ ] **Шаг 7: Commit**

```bash
git add frontend/src/views/backtest/components/ReplayChart.tsx \
        frontend/src/views/backtest/components/SessionScreen.tsx \
        frontend/src/app/globals.css \
        frontend/src/shared/i18n/messages/ru.json frontend/src/shared/i18n/messages/en.json
git commit -m "feat(backtest): окно показа графика, пан драгом, кнопка «→ сейчас»"
```

---

### Задача 7: `ReplayChart` — зум колесом мыши и пинчем

**Файлы:**
- Изменить: `frontend/src/views/backtest/components/ReplayChart.tsx`

**Интерфейсы:** без изменений пропсов компонента; только внутреннее поведение.

- [ ] **Шаг 1: Добавить константу и ref с актуальным состоянием**

После `const EDGE_THRESHOLD = 15;` добавить:
```ts
const ZOOM_STEP = 1.15;
```

После объявления `panRef` добавить:
```ts
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; count: number; startIdx: number; midFrac: number } | null>(null);
  /**
   * Колёсный зум висит на нативном (не React) листенере, чтобы звать
   * preventDefault — React с версии 17 держит onWheel пассивным, и внутри
   * него preventDefault просто не работает. Листенеру нужны свежие
   * startIdx/count/candles на момент события, а не из замыкания при монтаже —
   * отсюда ref, обновляемый каждый рендер.
   */
  const latestRef = useRef({ startIdx: 0, count: DEFAULT_COUNT, candles: [] as Candle[] });
  useEffect(() => {
    latestRef.current = { startIdx, count, candles };
  });
```

- [ ] **Шаг 2: Слушатель колеса**

После эффекта `ResizeObserver` (перед строкой `const u = boxW > 0 ...`) добавить:
```ts
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const xFrac = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const { startIdx: s, count: c, candles: cs } = latestRef.current;
      const focalIdx = s + xFrac * c;
      const factor = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      const newCount = clamp(Math.round(c * factor), MIN_COUNT, MAX_COUNT);
      const maxStart = Math.max(0, cs.length - newCount);
      const newStart = clamp(Math.round(focalIdx - xFrac * newCount), 0, maxStart);
      setView({ count: newCount, anchorTime: newStart >= maxStart ? null : cs[newStart]?.t ?? null });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
```

- [ ] **Шаг 3: Пинч — расширить `startPan`, `onMove`, `endDrag`**

Заменить `startPan`:
```ts
  const startPan = (e: PointerEvent<SVGSVGElement>) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      panRef.current = null;
      const [a, b] = [...pointersRef.current.values()];
      const rect = svgRef.current!.getBoundingClientRect();
      pinchRef.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        count,
        startIdx,
        midFrac: clamp(((a.x + b.x) / 2 - rect.left) / rect.width, 0, 1),
      };
      return;
    }
    panRef.current = { startX: svgX(e.clientX), startIdx, count, slot };
  };
```

Заменить `onMove`:
```ts
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (drag && onDragLevel) {
      const p = priceAt(svgY(e.clientY));
      lastDrag.current = p;
      onDragLevel(drag, p, false);
      return;
    }
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const ratio = dist / pinch.dist;
      const newCount = clamp(Math.round(pinch.count / ratio), MIN_COUNT, MAX_COUNT);
      const focalIdx = pinch.startIdx + pinch.midFrac * pinch.count;
      const maxStart = Math.max(0, candles.length - newCount);
      const newStart = clamp(Math.round(focalIdx - pinch.midFrac * newCount), 0, maxStart);
      setView({ count: newCount, anchorTime: newStart >= maxStart ? null : candles[newStart]?.t ?? null });
      return;
    }
    const pan = panRef.current;
    if (!pan) return;
    const dx = svgX(e.clientX) - pan.startX;
    const deltaSlots = Math.round(dx / pan.slot);
    const maxStart = Math.max(0, candles.length - pan.count);
    const newStart = clamp(pan.startIdx - deltaSlots, 0, maxStart);
    setView({ count: pan.count, anchorTime: newStart >= maxStart ? null : candles[newStart]?.t ?? null });
  };
```

Заменить `endDrag`:
```ts
  const endDrag = (e: PointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (drag) {
      if (onDragLevel && lastDrag.current != null) onDragLevel(drag, lastDrag.current, true);
      setDrag(null);
      frozen.current = null;
      lastDrag.current = null;
      return;
    }
    panRef.current = null;
  };
```

(`onPointerUp={endDrag}` и `onPointerCancel={endDrag}` в JSX не меняются — React передаёт
событие первым аргументом в любом случае.)

- [ ] **Шаг 4: Прогнать тесты и линт**

Run: `npx vitest run src/views/backtest && npx eslint src/views/backtest`
Expected: PASS.

- [ ] **Шаг 5: Ручная проверка**

В браузере (десктоп): колесо мыши над графиком уменьшает/увеличивает число видимых свечей,
не скроллит страницу. На тач-устройстве или в эмуляции тача в devtools: пинч двумя пальцами
зумит вокруг точки между ними.

- [ ] **Шаг 6: Commit**

```bash
git add frontend/src/views/backtest/components/ReplayChart.tsx
git commit -m "feat(backtest): зум колесом мыши и пинчем на графике прокрутки"
```

---

### Задача 8: Анимация цены внутри минутки

**Файлы:**
- Изменить: `frontend/src/views/backtest/lib/candles.ts`
- Изменить: `frontend/src/views/backtest/lib/candles.test.ts`
- Изменить: `frontend/src/views/backtest/components/ReplayChart.tsx`
- Изменить: `frontend/src/views/backtest/components/SessionScreen.tsx`

**Интерфейсы:**
- Использует: `glidePrice` из `../lib/motion` (Задача 3); `glide` из `useReplay` (Задача 2).
- Отдаёт: `scaleCandle(c: Candle, scale: number): Candle` — потребляет `SessionScreen` (в этой же
  задаче, заменяет инлайновое масштабирование `screenCandles`).

- [ ] **Шаг 1: Написать падающий тест на `scaleCandle`**

Добавить в `frontend/src/views/backtest/lib/candles.test.ts`:
```ts
import { scaleCandle } from './candles'; // добавить в существующий import из './candles'

describe('scaleCandle', () => {
  it('масштабирует O/H/L/C, время не трогает', () => {
    expect(scaleCandle({ t: 1000, o: 10, h: 12, l: 9, c: 11 }, 2)).toEqual({ t: 1000, o: 20, h: 24, l: 18, c: 22 });
  });

  it('scale=1 — тот же объект, без копии', () => {
    const c = { t: 1000, o: 10, h: 12, l: 9, c: 11 };
    expect(scaleCandle(c, 1)).toBe(c);
  });
});
```

- [ ] **Шаг 2: Проверить падение теста**

Run: `npx vitest run src/views/backtest/lib/candles.test.ts`
Expected: FAIL — `scaleCandle` не экспортирован.

- [ ] **Шаг 3: Реализация `scaleCandle`**

Добавить в `frontend/src/views/backtest/lib/candles.ts`, рядом с `fromApi`:
```ts
/** Свеча, домноженная на масштаб скрытой цены сессии; scale=1 — тот же объект, без копии. */
export function scaleCandle(c: Candle, scale: number): Candle {
  return scale === 1 ? c : { t: c.t, o: c.o * scale, h: c.h * scale, l: c.l * scale, c: c.c * scale };
}
```

- [ ] **Шаг 4: Проверить прохождение теста**

Run: `npx vitest run src/views/backtest/lib/candles.test.ts`
Expected: PASS.

- [ ] **Шаг 5: `SessionScreen` — `scaleCandle` и `screenGlide`**

Файл: `frontend/src/views/backtest/components/SessionScreen.tsx`. Добавить `scaleCandle` в
существующий импорт из `'../lib/candles'` (строка 22): `import { TIMEFRAMES, dayNumber,
scaleCandle } from '../lib/candles';`.

Было (строки 89-95):
```tsx
  const screenCandles = useMemo(
    () =>
      scale === 1
        ? replay.candles
        : replay.candles.map((c) => ({ t: c.t, o: c.o * scale, h: c.h * scale, l: c.l * scale, c: c.c * scale })),
    [replay.candles, scale],
  );
```

Стало:
```tsx
  const screenCandles = useMemo(() => replay.candles.map((c) => scaleCandle(c, scale)), [replay.candles, scale]);

  const screenGlide = useMemo(
    () => (replay.glide ? { minute: scaleCandle(replay.glide.minute, scale), durationMs: replay.glide.durationMs } : null),
    [replay.glide, scale],
  );
```

В JSX `<ReplayChart ...>` (см. Задачу 6, Шаг 2) добавить проп `glide={screenGlide}`.

- [ ] **Шаг 6: `ReplayChart` — приём `glide` и анимация**

Добавить в импорт из `'../lib/motion'`: `glidePrice`.

Добавить проп в сигнатуру компонента (после `historyLoading?: boolean;`):
```ts
  /** В настоящих для экрана (масштабированных) ценах — минутка, которую сейчас анимируем. */
  glide: { minute: Candle; durationMs: number } | null;
```

Добавить состояние (рядом с `panRef`):
```ts
  const [animCandle, setAnimCandle] = useState<Candle | null>(null);
  const prevLastRef = useRef<Candle | null>(null);
```

Добавить эффекты после вычисления `shown` (сразу после блока `useEffect` про `onNeedHistory`):
```ts
  useEffect(() => {
    // На монтировании — база для первого тика: иначе уже накопленная часть
    // формирующейся свечи «обрушилась» бы до открытия на первой анимации.
    prevLastRef.current = shown.length ? shown[shown.length - 1] : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!glide) return;
    const newLast = shown.length ? shown[shown.length - 1] : null;
    if (!newLast) return;
    const prev = prevLastRef.current;
    const sameBucket = prev != null && prev.t === newLast.t;
    const base = sameBucket
      ? prev!
      : { t: newLast.t, o: glide.minute.o, h: glide.minute.o, l: glide.minute.o, c: glide.minute.o };
    const { minute, durationMs } = glide;
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const ph = Math.min(1, (now - t0) / durationMs);
      const price = glidePrice(minute.o, minute.h, minute.l, minute.c, ph);
      if (ph < 1) {
        setAnimCandle({ t: newLast.t, o: base.o, h: Math.max(base.h, price), l: Math.min(base.l, price), c: price });
        raf = requestAnimationFrame(frame);
      } else {
        setAnimCandle(null); // доигралось — дальше рисуем настоящие финальные значения
      }
    };
    raf = requestAnimationFrame(frame);
    prevLastRef.current = newLast;
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glide]);
```

Заменить цикл отрисовки свечей:

Было:
```tsx
        {shown.map((c, i) => {
          const color = c.c >= c.o ? 'var(--profit)' : 'var(--loss)';
          const top = y(Math.max(c.o, c.c));
          const bottom = y(Math.min(c.o, c.c));
          return (
            <g key={c.t}>
              <line x1={cx(i)} x2={cx(i)} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth={px(1)} />
              <rect x={cx(i) - bodyW / 2} y={top} width={bodyW} height={Math.max(px(1), bottom - top)} fill={color} />
            </g>
          );
        })}
```

Стало:
```tsx
        {shown.map((c, i) => {
          // Последняя свеча во время анимации минутки — берём анимированные
          // значения, а не финальные: они и так почти совпадают в конце пути,
          // разница видна только на глаз, не на шкале.
          const draw = animCandle && i === shown.length - 1 && animCandle.t === c.t ? animCandle : c;
          const color = draw.c >= draw.o ? 'var(--profit)' : 'var(--loss)';
          const top = y(Math.max(draw.o, draw.c));
          const bottom = y(Math.min(draw.o, draw.c));
          return (
            <g key={c.t}>
              <line x1={cx(i)} x2={cx(i)} y1={y(draw.h)} y2={y(draw.l)} stroke={color} strokeWidth={px(1)} />
              <rect x={cx(i) - bodyW / 2} y={top} width={bodyW} height={Math.max(px(1), bottom - top)} fill={color} />
            </g>
          );
        })}
```

- [ ] **Шаг 7: Прогнать тесты и линт**

Run: `npx vitest run src/views/backtest && npx eslint src/views/backtest`
Expected: PASS.

- [ ] **Шаг 8: Ручная проверка**

`npm run dev`, открыть активную сессию, включить автопрокрутку на ×1 — последняя свеча должна
видимо «дышать» тенями вверх-вниз в течение секунды на каждый тик, а не мгновенно принимать
финальные значения. Проверить и на ×16 (движение короче, но должно оставаться плавным, не
рывками), и на переключении между ТФ (1м и, например, 1ч).

- [ ] **Шаг 9: Commit**

```bash
git add frontend/src/views/backtest/lib/candles.ts frontend/src/views/backtest/lib/candles.test.ts \
        frontend/src/views/backtest/components/ReplayChart.tsx \
        frontend/src/views/backtest/components/SessionScreen.tsx
git commit -m "feat(backtest): анимация цены внутри минутки на автопрокрутке"
```

---

### Задача 9: Итоговая проверка

**Файлы:** нет изменений — только верификация.

- [ ] **Шаг 1: Полный прогон тестов фронтенда**

Run (из `frontend/`): `npm test`
Expected: PASS, весь набор, включая новые файлы из задач 1, 3, 4, 8.

- [ ] **Шаг 2: Линт**

Run: `npx eslint src/views/backtest src/app/globals.css`
Expected: без ошибок (CSS eslint может не подхватывать — если ругается на неизвестный тип файла,
это не относится к правке; проверить, что `.tsx`/`.ts` чистые).

- [ ] **Шаг 3: Билд**

Run (из `frontend/`): `npx next build`
Expected: успешная сборка без ошибок типов и без предупреждений о неиспользуемых импортах —
правка большая (7+ файлов), по глобальным правилам билд обязателен перед тем, как считать
задачу завершённой.

- [ ] **Шаг 4: Сквозная ручная проверка**

`npm run dev`, `/backtest` → активная сессия (или создать новую):

- автопрокрутка на ×1/×4/×16 на нескольких таймфреймах — цена движется непрерывно, свеча растёт
  тенями, финал точно совпадает с реальными координатами (сверить с паузой сразу после тика —
  число совпадает с тем, что было видно во время движения);
- пауза → «Шаг» — как раньше, мгновенный прыжок без анимации;
- драг по графику назад — окно уезжает в историю, автопрокрутка не встаёт; кнопка «→ сейчас»
  появляется и возвращает на живой край;
- колесо мыши — зум по числу видимых свечей, страница не скроллится;
- пинч (эмуляция тача в devtools или реальное устройство) — зум работает;
- перетаскивание стоп/тейк — не запускает пан на том же клике, работает как раньше;
- срабатывание стопа/тейка на автопрокрутке — всё ещё останавливает её и раскрывает исход.

- [ ] **Шаг 5: Commit (если на этом шаге что-то было исправлено)**

Если Шаги 1-4 потребовали правок — закоммитить их отдельно с понятным сообщением, иначе шаг
пропускается: итоговая проверка сама по себе не создаёт коммита.
