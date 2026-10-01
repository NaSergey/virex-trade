/**
 * RSI с дивергенциями — перенос индикатора владельца «RSI Divergence» (Pine v6)
 * на свечи терминала. Формулы — те же, что у встроенных функций TradingView,
 * чтобы числа на панели совпадали с его панелью на тех же свечах:
 *
 * - `ta.rsi` — средние роста и падения по Уайлдеру (`ta.rma`: первое значение —
 *   простое среднее первых `length`, дальше `(prev·(n−1) + x) / n`);
 * - `ta.ema` — `α = 2/(n+1)`, начало — первое определённое значение;
 * - `ta.pivothigh` / `ta.pivotlow` — вершина строго выше `left` баров слева и
 *   не ниже `right` баров справа (у впадины — зеркально); подтверждается только
 *   через `right` баров, поэтому последние `right` баров вершиной не бывают;
 * - дивергенция — между вершинами RSI (медвежья: цена выше, RSI ниже) или
 *   впадинами (бычья: цена ниже, RSI выше); правила пары — у `divergencesOf`.
 *
 * Считается по всем загруженным свечам таймфрейма, как у TradingView по всем
 * барам графика: первые `length` свечей RSI не имеют.
 */

export interface RsiOptions {
  length: number;
  overbought: number;
  oversold: number;
  /** Длина EMA сглаженной средней RSI. */
  avgLength: number;
  leftBars: number;
  rightBars: number;
  /** Сколько свечей может лежать между вершинами пары — как у встроенного индикатора дивергенций TradingView. */
  minRange: number;
  maxRange: number;
}

/** Умолчания скрипта владельца. */
export const RSI_DEFAULTS: RsiOptions = {
  length: 14,
  overbought: 70,
  oversold: 30,
  avgLength: 30,
  leftBars: 5,
  rightBars: 5,
  minRange: 5,
  maxRange: 60,
};

export interface Divergence {
  kind: 'bear' | 'bull';
  /** Индексы свечей двух вершин (впадин) RSI и значения RSI в них. */
  from: number;
  to: number;
  fromValue: number;
  toValue: number;
  /** Цена в тех же точках: максимум свечи у медвежьей, минимум — у бычьей. По ним линия на графике цены. */
  fromPrice: number;
  toPrice: number;
}

export interface RsiSeries {
  /** По свече на значение; NaN — ещё не определён (разгон). */
  rsi: number[];
  avg: number[];
  divergences: Divergence[];
}

/** `ta.rsi(close, length)`. */
export function rsiOf(closes: readonly number[], length: number): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  if (length < 1 || closes.length <= length) return out;
  let up = 0;
  let down = 0;
  for (let i = 1; i <= length; i++) {
    const ch = closes[i] - closes[i - 1];
    up += Math.max(ch, 0);
    down += Math.max(-ch, 0);
  }
  up /= length;
  down /= length;
  const value = () => (down === 0 ? 100 : up === 0 ? 0 : 100 - 100 / (1 + up / down));
  out[length] = value();
  for (let i = length + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    up = (up * (length - 1) + Math.max(ch, 0)) / length;
    down = (down * (length - 1) + Math.max(-ch, 0)) / length;
    out[i] = value();
  }
  return out;
}

/** `ta.ema(src, length)`: начало — первое определённое значение, до него — NaN. */
export function emaOf(values: readonly number[], length: number): number[] {
  const alpha = 2 / (length + 1);
  const out = new Array<number>(values.length).fill(NaN);
  let prev = NaN;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isNaN(v)) continue;
    prev = Number.isNaN(prev) ? v : alpha * v + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

/** Вершина (`high`) или впадина (`low`) в точке `p`: см. правило в шапке файла. */
function isPivot(values: readonly number[], p: number, left: number, right: number, kind: 'high' | 'low'): boolean {
  const v = values[p];
  if (Number.isNaN(v) || p - left < 0 || p + right >= values.length) return false;
  const beats = (other: number, strict: boolean) => {
    if (Number.isNaN(other)) return false;
    if (kind === 'high') return strict ? v > other : v >= other;
    return strict ? v < other : v <= other;
  };
  for (let k = 1; k <= left; k++) if (!beats(values[p - k], true)) return false;
  for (let k = 1; k <= right; k++) if (!beats(values[p + k], false)) return false;
  return true;
}

interface Anchor {
  bar: number;
  value: number;
  price: number;
}

/**
 * Дивергенции — в том порядке, в каком их находит проход по барам слева
 * направо: вершина в точке `p` подтверждается на баре `p + right`.
 *
 * Правило строже по смыслу и мягче по форме, чем в исходном скрипте, — тот
 * требовал, чтобы ОБЕ вершины стояли в зоне перекупленности (впадины — в
 * перепроданности), и пропускал самый частый случай: RSI был выше 70, а на
 * следующем максимуме цены не дотянул и до 70. Здесь (запрос владельца
 * 2026-09-30 — «лучше отображал дивергенции»):
 *
 * - в зоне должна быть ПЕРВАЯ вершина пары — «якорь»; вторая — выше 50 (у
 *   впадин — ниже 50), иначе это уже не ослабление роста, а другой рынок;
 * - между ними от `minRange` до `maxRange` свечей: без потолка пары тянулись бы
 *   через полграфика;
 * - промежуточная вершина ниже якоря и с ценой ниже его не сбивает пару: самая
 *   классическая дивергенция идёт через такой провал;
 * - найденная дивергенция сама становится якорем: следующее ослабление
 *   продолжает цепочку отрезком от неё, а не веером из одной точки.
 */
export function divergencesOf(
  rsi: readonly number[],
  highs: readonly number[],
  lows: readonly number[],
  o: RsiOptions,
): Divergence[] {
  const out: Divergence[] = [];
  let top: Anchor | null = null;
  let bottom: Anchor | null = null;
  const inRange = (a: Anchor, p: number) => p - a.bar >= o.minRange && p - a.bar <= o.maxRange;

  for (let p = o.leftBars; p + o.rightBars < rsi.length; p++) {
    const v = rsi[p];
    if (isPivot(rsi, p, o.leftBars, o.rightBars, 'high')) {
      if (top && p - top.bar > o.maxRange) top = null;
      const here = { bar: p, value: v, price: highs[p] };
      if (top && inRange(top, p) && v > 50 && highs[p] > top.price && v < top.value) {
        out.push({ kind: 'bear', from: top.bar, to: p, fromValue: top.value, toValue: v, fromPrice: top.price, toPrice: highs[p] });
        top = here;
      } else if (v >= o.overbought) {
        top = here;
      }
    }
    if (isPivot(rsi, p, o.leftBars, o.rightBars, 'low')) {
      if (bottom && p - bottom.bar > o.maxRange) bottom = null;
      const here = { bar: p, value: v, price: lows[p] };
      if (bottom && inRange(bottom, p) && v < 50 && lows[p] < bottom.price && v > bottom.value) {
        out.push({ kind: 'bull', from: bottom.bar, to: p, fromValue: bottom.value, toValue: v, fromPrice: bottom.price, toPrice: lows[p] });
        bottom = here;
      } else if (v <= o.oversold) {
        bottom = here;
      }
    }
  }
  return out;
}

/** Всё, что рисует панель RSI, по свечам графика. */
export function rsiSeries(candles: readonly { h: number; l: number; c: number }[], o: RsiOptions = RSI_DEFAULTS): RsiSeries {
  const rsi = rsiOf(
    candles.map((c) => c.c),
    o.length,
  );
  return {
    rsi,
    avg: emaOf(rsi, o.avgLength),
    divergences: divergencesOf(
      rsi,
      candles.map((c) => c.h),
      candles.map((c) => c.l),
      o,
    ),
  };
}
