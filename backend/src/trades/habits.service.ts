import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { loadRows, median, SESSIONS, type Row } from './trade-rows';
import { storedRangePos } from './trade-context.service';

/**
 * «Цена привычек» — обратная сторона «Выборки».
 *
 * В «Лаборатории» фильтры крутит пользователь: он должен сам догадаться, что
 * посмотреть. Здесь наоборот — сервис сам перебирает все срезы и показывает те,
 * что стоили денег, сразу в долларах.
 *
 * Цена считается контрфактуалом ПРОТИВ ОСТАЛЬНОЙ СВОЕЙ ТОРГОВЛИ, а не как сумма
 * P&L среза: у убыточного счёта убыточен любой срез, и топ бы просто повторял
 * самые крупные из них. Сравнение идёт с «остальными» (all \ S), а не со всеми
 * сделками: при большом срезе база уже содержит его самого и эффект размывается.
 *
 *   lift = avgPnl(S) - avgPnl(R)      насколько сделка среза хуже обычной
 *   cost = lift * |S|                 «столько было бы, торгуй ты их как обычно»
 *
 * Дальше — четыре фильтра против самообмана, без которых инструмент на паре
 * сотен сделок превращается в генератор убедительных совпадений:
 *   1) пороги выборки (MIN_SEGMENT / MIN_REST);
 *   2) перестановочный тест вместо t-теста — у P&L тяжёлые хвосты;
 *   3) поправка Бенджамини–Хохберга: проверяется полсотни гипотез сразу, при
 *      p<0.05 без неё пара «открытий» гарантирована случайно;
 *   4) устойчивость к одной сделке и проверка на второй половине истории.
 */

// Минимум сделок в срезе и вне его, иначе гипотеза даже не проверяется.
const MIN_SEGMENT = 12;
const MIN_REST = 30;
// Ниже этого числа позиций не показываем ничего: на меньшем объёме любой
// результат — шум, и честнее сказать «нужно ещё N сделок».
const MIN_POSITIONS = 60;
const FDR = 0.1;
const PERM_ITERS = 2000;

// Вход в течение часа после закрытия убыточной позиции — «отыгрыш».
const TILT_MS = 60 * 60_000;
// С какой по счёту сделки за день начинается переторговка.
const OVERTRADE_NTH = 3;
// Во сколько раз вход должен превышать медианный, чтобы считаться «разгоном».
const SIZE_UP_MULT = 1.5;

export type Confidence = 'confirmed' | 'likely';
export type Oos = 'pass' | 'fail' | 'na';

/**
 * 16 видов кандидата. По этому значению фронтенд (`habit-labels.ts`) выбирает
 * шаблон подписи/совета — `label`/`advice` ниже остаются как готовый русский
 * текст только на случай незнакомого фронту `kind` (рассинхрон версий).
 */
export type HabitKind =
  | 'tilt'
  | 'overtrading'
  | 'size_up'
  | 'size_up_after_loss'
  | 'hold_long'
  | 'dir'
  | 'hour'
  | 'weekday'
  | 'session'
  | 'trend4h'
  | 'ema200'
  | 'atr'
  | 'vol'
  | 'range4h'
  | 'tag'
  | 'symbol';

export interface Habit {
  key: string;
  group: 'behaviour' | 'time' | 'context' | 'tag' | 'symbol';
  kind: HabitKind;
  /** Подстановки для шаблона label/advice на фронте, см. HabitKind. */
  params: Record<string, string | number>;
  label: string;
  advice: string;
  n: number;
  nRest: number;
  avgPnl: number;
  avgRest: number;
  lift: number;
  /** Отрицательный — привычка стоила денег; положительный — приносила. */
  cost: number;
  /** Сумма P&L среза: «столько было бы, не открывай ты их вовсе» (со знаком минус). */
  absolute: number;
  winRate: number;
  winRateRest: number;
  p: number;
  confidence: Confidence;
  outlierSafe: boolean;
  oos: Oos;
  /** Query-параметры /api/trades/lab, открывающие этот срез в «Аналитике». */
  lab: Record<string, string> | null;
}

export interface Candidate {
  key: string;
  group: Habit['group'];
  kind: HabitKind;
  params: Record<string, string | number>;
  label: string;
  advice: string;
  lab: Record<string, string> | null;
  /** true — в срезе, false — вне, null — строка не участвует (нет данных). */
  test: (r: Row) => boolean | null;
}

/** Детерминированный PRNG: одинаковый ответ на одних и тех же данных. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mean(v: number[]): number {
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

/**
 * Доля случайных разбиений, где разрыв средних не меньше наблюдаемого.
 *
 * Перемешивается только префикс длины k (частичный Фишер–Йетс), а разность
 * средних восстанавливается из одной суммы — полный шаффл на каждой итерации
 * здесь ничего не добавляет.
 */
function permutationP(s: number[], r: number[], seed: number): number {
  const k = s.length;
  const pool = [...s, ...r];
  const n = pool.length;
  const total = pool.reduce((a, b) => a + b, 0);
  const sumS = s.reduce((a, b) => a + b, 0);
  const obs = Math.abs(sumS / k - (total - sumS) / (n - k));
  const rnd = mulberry32(seed);
  let hits = 0;
  for (let it = 0; it < PERM_ITERS; it++) {
    let acc = 0;
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(rnd() * (n - i));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
      acc += pool[i];
    }
    if (Math.abs(acc / k - (total - acc) / (n - k)) >= obs - 1e-9) hits++;
  }
  return (hits + 1) / (PERM_ITERS + 1);
}

const winRate = (v: number[]) =>
  v.length ? (v.filter((x) => x > 0).length / v.length) * 100 : 0;
const round = (x: number, d = 2) => Number(x.toFixed(d));

@Injectable()
export class HabitsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param opts.includeAll — вернуть ещё и все срезы, прошедшие пороги выборки,
   * до отсева по значимости. Для отладки и режима «показать всё»; в обычном
   * ответе их быть не должно — это ровно тот список, из которого глаз сам
   * выберет самый красивый шум.
   */
  async scan(
    userId: string,
    days?: number,
    tzOffsetMin?: number,
    opts?: { includeAll?: boolean },
  ) {
    const { rows, medAtr, medVol } = await loadRows(this.prisma, userId, days, tzOffsetMin);
    const tz = Number.isFinite(tzOffsetMin) ? (tzOffsetMin as number) : 0;

    if (rows.length < MIN_POSITIONS) {
      return {
        success: true,
        status: 'need_more' as const,
        positions: rows.length,
        need: MIN_POSITIONS,
        totalCost: 0,
        habits: [] as Habit[],
        edges: [] as Habit[],
        all: [] as Habit[],
      };
    }

    const flags = this.behaviourFlags(rows, tz);
    const candidates = this.candidates(rows, flags, medAtr, medVol);

    const found: Habit[] = [];
    let tested = 0;
    for (const c of candidates) {
      const h = this.evaluate(c, rows);
      if (!h) continue;
      tested++;
      found.push(h);
    }

    // Бенджамини–Хохберг по всем реально проверенным гипотезам.
    const passed = benjaminiHochberg(found.map((h) => h.p));
    const kept: Habit[] = [];
    found
      .slice()
      .sort((a, b) => a.p - b.p)
      .forEach((h, i) => {
        const bh = passed[i];
        const confirmed = bh && h.outlierSafe && h.oos !== 'fail';
        if (!confirmed && h.p >= 0.05) return;
        kept.push({ ...h, confidence: confirmed ? 'confirmed' : 'likely' });
      });

    const habits = kept.filter((h) => h.cost < 0).sort((a, b) => a.cost - b.cost);
    const edges = kept.filter((h) => h.cost > 0).sort((a, b) => b.cost - a.cost);

    return {
      success: true,
      status: 'ok' as const,
      positions: rows.length,
      tested,
      // Сумма только подтверждённых: заголовок продукта не должен опираться
      // на то, что сам сервис пометил как «похоже».
      totalCost: round(
        habits.filter((h) => h.confidence === 'confirmed').reduce((a, h) => a + h.cost, 0),
      ),
      habits,
      edges,
      all: opts?.includeAll ? found.slice().sort((a, b) => a.cost - b.cost) : ([] as Habit[]),
    };
  }

  /** Поведенческие признаки — считаются по ленте позиций в порядке входа. */
  private behaviourFlags(rows: Row[], tz: number) {
    const byEntry = [...rows].sort((a, b) => a.entryMs - b.entryMs);
    const tilt = new Set<string>();
    const overtrade = new Set<string>();
    const perDay = new Map<number, number>();
    let prevLossExit: number | null = null;

    for (const r of byEntry) {
      if (prevLossExit != null && r.entryMs - prevLossExit <= TILT_MS) tilt.add(r.id);
      // Убыточные выходы обновляют «часы отыгрыша», прибыльные — нет.
      if (r.closedPnl < 0) {
        const exit = r.closedAt.getTime();
        if (prevLossExit == null || exit > prevLossExit) prevLossExit = exit;
      }
      const day = Math.floor((r.entryMs - tz * 60_000) / 86_400_000);
      const nth = (perDay.get(day) ?? 0) + 1;
      perDay.set(day, nth);
      if (nth >= OVERTRADE_NTH) overtrade.add(r.id);
    }

    const medNotional = median(rows.map((r) => r.notional).filter((v) => v > 0)) ?? 0;
    const held = rows.filter((r) => r.holdMs >= 0).map((r) => r.holdMs);
    const medHold = median(held);
    return { tilt, overtrade, medNotional, medHold };
  }

  private candidates(
    rows: Row[],
    flags: ReturnType<HabitsService['behaviourFlags']>,
    medAtr: number | null,
    medVol: number | null,
  ): Candidate[] {
    const { tilt, overtrade, medNotional, medHold } = flags;
    const big = (r: Row) => medNotional > 0 && r.notional >= medNotional * SIZE_UP_MULT;
    const list: Candidate[] = [
      {
        key: 'tilt',
        group: 'behaviour',
        kind: 'tilt',
        params: {},
        label: 'Вход в течение часа после убытка',
        advice: 'Пауза 60 минут после убыточной сделки.',
        lab: null,
        test: (r) => tilt.has(r.id),
      },
      {
        key: 'overtrading',
        group: 'behaviour',
        kind: 'overtrading',
        params: { nth: OVERTRADE_NTH, limit: OVERTRADE_NTH - 1 },
        label: `${OVERTRADE_NTH}-я и следующие сделки за день`,
        advice: `Лимит ${OVERTRADE_NTH - 1} сделки в день.`,
        lab: null,
        test: (r) => overtrade.has(r.id),
      },
      {
        key: 'size_up',
        group: 'behaviour',
        kind: 'size_up',
        params: { mult: SIZE_UP_MULT },
        label: `Вход крупнее обычного (от ${SIZE_UP_MULT}× медианы)`,
        advice: 'Фиксированный размер позиции.',
        lab: null,
        test: (r) => (medNotional > 0 ? big(r) : null),
      },
      {
        key: 'size_up_after_loss',
        group: 'behaviour',
        kind: 'size_up_after_loss',
        params: {},
        label: 'Увеличенный вход сразу после убытка',
        advice: 'Никогда не повышать размер на просадке.',
        lab: null,
        test: (r) => (medNotional > 0 ? big(r) && tilt.has(r.id) : null),
      },
      {
        key: 'hold_long',
        group: 'behaviour',
        kind: 'hold_long',
        params: {},
        label: 'Позиции, которые держал дольше обычного',
        advice: 'Ограничить время в позиции.',
        lab: null,
        test: (r) => (medHold == null || r.holdMs < 0 ? null : r.holdMs > medHold),
      },
      {
        key: 'dir:long',
        group: 'context',
        kind: 'dir',
        params: { direction: 'long' },
        label: 'Лонги',
        advice: 'Сравнить с шортами в «Аналитике».',
        lab: { direction: 'long' },
        test: (r) => r.direction === 'long',
      },
      {
        key: 'dir:short',
        group: 'context',
        kind: 'dir',
        params: { direction: 'short' },
        label: 'Шорты',
        advice: 'Сравнить с лонгами в «Аналитике».',
        lab: { direction: 'short' },
        test: (r) => r.direction === 'short',
      },
    ];

    // Время входа: блоки по 4 часа (24 отдельных часа — заведомо пустые срезы).
    for (let h = 0; h < 24; h += 4) {
      const to = h + 3;
      list.push({
        key: `hour:${h}-${to}`,
        group: 'time',
        kind: 'hour',
        params: { hourFrom: h, hourTo: to },
        label: `Входы ${String(h).padStart(2, '0')}:00–${String(to).padStart(2, '0')}:59`,
        advice: 'Не открывать в этом окне.',
        lab: { hourFrom: String(h), hourTo: String(to) },
        test: (r) => r.hour >= h && r.hour <= to,
      });
    }

    const WD = ['воскресеньям', 'понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам'];
    for (let d = 0; d < 7; d++) {
      list.push({
        key: `weekday:${d}`,
        group: 'time',
        kind: 'weekday',
        params: { weekday: d },
        label: `Входы по ${WD[d]}`,
        advice: 'Проверить, что в этот день меняется в подходе.',
        lab: { weekdays: String(d) },
        test: (r) => r.weekday === d,
      });
    }

    const SESSION_RU: Record<string, string> = {
      asia: 'азиатскую сессию',
      london: 'лондонскую сессию',
      ny: 'сессию Нью-Йорка',
      night: 'ночь (21–24 UTC)',
    };
    for (const s of Object.keys(SESSIONS)) {
      list.push({
        key: `session:${s}`,
        group: 'time',
        kind: 'session',
        params: { session: s },
        label: `Входы в ${SESSION_RU[s]}`,
        advice: 'Сместить активность на другую сессию.',
        lab: { sessions: s },
        test: (r) => r.session === s,
      });
    }

    const TREND_RU: Record<string, string> = {
      trend_up: 'в восходящем тренде 4H',
      trend_down: 'в нисходящем тренде 4H',
      range: 'в боковике 4H',
    };
    for (const t of Object.keys(TREND_RU)) {
      list.push({
        key: `trend4h:${t}`,
        group: 'context',
        kind: 'trend4h',
        params: { trend: t },
        label: `Входы ${TREND_RU[t]}`,
        advice: 'Не торговать этот режим рынка.',
        lab: { trend4h: t },
        test: (r) => (r.ctx?.trend4h == null ? null : r.ctx.trend4h === t),
      });
    }

    list.push(
      {
        key: 'ema200:above',
        group: 'context',
        kind: 'ema200',
        params: { side: 'above' },
        label: 'Входы выше EMA200 (1H)',
        advice: 'Проверить направление относительно EMA200.',
        lab: { ema200: 'above' },
        test: (r) => (r.ctx?.ema200Above == null ? null : r.ctx.ema200Above),
      },
      {
        key: 'ema200:below',
        group: 'context',
        kind: 'ema200',
        params: { side: 'below' },
        label: 'Входы ниже EMA200 (1H)',
        advice: 'Проверить направление относительно EMA200.',
        lab: { ema200: 'below' },
        test: (r) => (r.ctx?.ema200Above == null ? null : !r.ctx.ema200Above),
      },
      {
        key: 'atr:high',
        group: 'context',
        kind: 'atr',
        params: { level: 'high' },
        label: 'Входы на повышенной волатильности',
        advice: 'Уменьшать размер на высоком ATR.',
        lab: { atr: 'high' },
        test: (r) =>
          medAtr == null || r.ctx?.atrPct == null ? null : r.ctx.atrPct >= medAtr,
      },
      {
        key: 'atr:low',
        group: 'context',
        kind: 'atr',
        params: { level: 'low' },
        label: 'Входы на низкой волатильности',
        advice: 'Пропускать вялый рынок.',
        lab: { atr: 'low' },
        test: (r) => (medAtr == null || r.ctx?.atrPct == null ? null : r.ctx.atrPct < medAtr),
      },
      {
        key: 'vol:high',
        group: 'context',
        kind: 'vol',
        params: { level: 'high' },
        label: 'Входы на всплеске объёма',
        advice: 'Проверить, не входите ли в кульминацию движения.',
        lab: { vol: 'high' },
        test: (r) => (medVol == null || r.ctx?.volRel == null ? null : r.ctx.volRel >= medVol),
      },
      {
        key: 'vol:low',
        group: 'context',
        kind: 'vol',
        params: { level: 'low' },
        label: 'Входы на низком объёме',
        advice: 'Требовать подтверждения объёмом.',
        lab: { vol: 'low' },
        test: (r) => (medVol == null || r.ctx?.volRel == null ? null : r.ctx.volRel < medVol),
      },
    );

    const RANGE_RU: Record<string, string> = {
      low: 'у нижней границы диапазона 4H',
      mid: 'в середине диапазона 4H',
      high: 'у верхней границы диапазона 4H',
    };
    for (const b of ['low', 'mid', 'high']) {
      list.push({
        key: `range4h:${b}`,
        group: 'context',
        kind: 'range4h',
        params: { bucket: b },
        label: `Входы ${RANGE_RU[b]}`,
        advice: 'Дождаться возврата в свою зону диапазона.',
        lab: { rangeTf: '4h', range: b },
        test: (r) => {
          const v = r.ctx ? storedRangePos(r.ctx, '4h') : null;
          if (v == null) return null;
          return (v < 33 ? 'low' : v < 66 ? 'mid' : 'high') === b;
        },
      });
    }

    // Теги и символы — только те, где среза вообще хватает на проверку.
    const tagNames = new Map<string, string>();
    const tagCount = new Map<string, number>();
    const symCount = new Map<string, number>();
    for (const r of rows) {
      for (const t of r.tags) {
        tagNames.set(t.id, t.name);
        tagCount.set(t.id, (tagCount.get(t.id) ?? 0) + 1);
      }
      symCount.set(r.symbol, (symCount.get(r.symbol) ?? 0) + 1);
    }
    for (const [id, n] of tagCount) {
      if (n < MIN_SEGMENT) continue;
      list.push({
        key: `tag:${id}`,
        group: 'tag',
        kind: 'tag',
        params: { tagName: tagNames.get(id) ?? '' },
        label: `Сделки с тегом «${tagNames.get(id)}»`,
        advice: 'Пересмотреть или отказаться от этого сетапа.',
        lab: { tags: id },
        test: (r) => r.tagSet.has(id),
      });
    }
    for (const [sym, n] of symCount) {
      if (n < MIN_SEGMENT) continue;
      list.push({
        key: `symbol:${sym}`,
        group: 'symbol',
        kind: 'symbol',
        params: { symbol: sym },
        label: `Сделки по ${sym}`,
        advice: 'Убрать инструмент из списка или пересмотреть подход к нему.',
        lab: { symbols: sym },
        test: (r) => r.symbol === sym,
      });
    }

    return list;
  }

  private evaluate(c: Candidate, rows: Row[]): Habit | null {
    const S: Row[] = [];
    const R: Row[] = [];
    for (const r of rows) {
      const v = c.test(r);
      // null не попадает никуда: сравнивать сделки с контекстом против сделок,
      // у которых его просто не посчитали, — это сравнение не про поведение.
      if (v === null) continue;
      (v ? S : R).push(r);
    }
    if (S.length < MIN_SEGMENT || R.length < MIN_REST) return null;

    const sp = S.map((r) => r.closedPnl);
    const rp = R.map((r) => r.closedPnl);
    const avgS = mean(sp);
    const avgR = mean(rp);
    const lift = avgS - avgR;
    const cost = lift * S.length;
    const p = permutationP(sp, rp, hash(c.key));

    // Устойчивость к одной сделке: убираем крупнейшую по модулю и смотрим,
    // осталось ли явление. Одна ликвидация не должна называться привычкой.
    let iMax = 0;
    for (let i = 1; i < sp.length; i++) {
      if (Math.abs(sp[i]) > Math.abs(sp[iMax])) iMax = i;
    }
    const trimmed = sp.filter((_, i) => i !== iMax);
    const liftTrim = mean(trimmed) - avgR;
    const outlierSafe =
      trimmed.length >= MIN_SEGMENT - 1 &&
      Math.sign(liftTrim) === Math.sign(lift) &&
      Math.abs(liftTrim) >= Math.abs(lift) * 0.5;

    return {
      key: c.key,
      group: c.group,
      kind: c.kind,
      params: c.params,
      label: c.label,
      advice: c.advice,
      n: S.length,
      nRest: R.length,
      avgPnl: round(avgS),
      avgRest: round(avgR),
      lift: round(lift),
      cost: round(cost),
      absolute: round(-sp.reduce((a, b) => a + b, 0)),
      winRate: round(winRate(sp), 1),
      winRateRest: round(winRate(rp), 1),
      p: round(p, 4),
      confidence: 'likely',
      outlierSafe,
      oos: this.outOfSample(S, R, lift),
      lab: c.lab,
    };
  }

  /**
   * Держится ли знак эффекта на второй половине истории.
   *
   * Срез ищется по всем данным, поэтому «нашли и там же подтвердили» — не
   * доказательство. Граница берётся по медиане времени входа всей выборки,
   * чтобы половины были сопоставимы по календарю, а не по числу сделок среза.
   */
  private outOfSample(S: Row[], R: Row[], lift: number): Oos {
    const all = [...S, ...R].map((r) => r.entryMs).sort((a, b) => a - b);
    const split = all[Math.floor(all.length / 2)];
    const s2 = S.filter((r) => r.entryMs >= split).map((r) => r.closedPnl);
    const r2 = R.filter((r) => r.entryMs >= split).map((r) => r.closedPnl);
    if (s2.length < 8 || r2.length < 15) return 'na';
    const lift2 = mean(s2) - mean(r2);
    return Math.sign(lift2) === Math.sign(lift) ? 'pass' : 'fail';
  }
}

/**
 * Benjamini–Hochberg: какие из отсортированных по возрастанию p-value проходят
 * при заданном FDR. Возвращает маску в том же порядке (по возрастанию p).
 */
export function benjaminiHochberg(pValues: number[], fdr = FDR): boolean[] {
  const m = pValues.length;
  const sorted = [...pValues].sort((a, b) => a - b);
  let cutoff = -1;
  for (let i = 0; i < m; i++) {
    if (sorted[i] <= ((i + 1) / m) * fdr) cutoff = i;
  }
  return sorted.map((_, i) => i <= cutoff);
}
