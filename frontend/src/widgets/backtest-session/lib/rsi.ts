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
 * - дивергенция — между вершинами цены (медвежья: цена выше, RSI ниже) или
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
  /** На сколько свечей пик RSI может отстоять от вершины цены: импульс выдыхается раньше цены. */
  lag: number;
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
  lag: 3,
};

export interface Divergence {
  kind: 'bear' | 'bull';
  /** Индексы свечей двух вершин (впадин) цены и цена в них: максимум у медвежьей, минимум у бычьей. По ним линия на графике цены. */
  from: number;
  to: number;
  fromPrice: number;
  toPrice: number;
  /**
   * Пики RSI у этих вершин — свои индексы, до `lag` свечей от вершины цены, и
   * значения в них. По ним линия на панели RSI: пик импульса стоит раньше
   * вершины цены, и линия от свечи вершины начиналась бы со склона.
   */
  rsiFrom: number;
  rsiTo: number;
  fromValue: number;
  toValue: number;
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

interface Swing {
  /** Вершина цены: свеча и цена. */
  bar: number;
  price: number;
  /** Пик RSI у неё: свеча и значение. */
  rsiBar: number;
  value: number;
  /** Конец найденной дивергенции — может начать следующую и вне зоны. */
  chained: boolean;
}

/**
 * Дивергенции одной стороны — `bear` по максимумам, `bull` по минимумам — в
 * порядке подтверждения вершин: вершина в точке `p` подтверждается на баре
 * `p + right`.
 *
 * Вершины ищутся на цене, а не на RSI (жалоба владельца 2026-10-08: «часто
 * показывает неправильно, на дневке — вообще не так»). Пик RSI приходится на
 * середину импульса, а цена после него ещё растёт, — линия по цене в свече
 * пика RSI начиналась со склона, а не с вершины: на 1000 дневных свечах BTC
 * так стояла половина концов. Дивергенцию читают по вершинам цены — «цена
 * выше, RSI ниже», — поэтому RSI берётся у них: самый крайний в окне ±`lag`
 * свечей.
 *
 * Правила пары — те же, что были для вершин RSI (запрос владельца 2026-09-30 —
 * «лучше отображал дивергенции»):
 *
 * - в зоне должна быть ПЕРВАЯ вершина пары — «якорь»; вторая — выше 50 (у
 *   впадин — ниже 50), иначе это уже не ослабление роста, а другой рынок;
 * - между ними от `minRange` до `maxRange` свечей;
 * - найденная дивергенция сама становится якорем: следующее ослабление
 *   продолжает цепочку отрезком от неё.
 *
 * Пара ищется среди прежних вершин от ближней к дальней, поэтому промежуточный
 * провал её не сбивает. Зато ни одна свеча между вершинами не должна заходить
 * за линию — ни ценой, ни RSI: иначе смотрят на ту, что зашла, и линия мимо неё
 * врёт. У самих вершин (в их `left`/`right` свечах) предел — вершина, а не
 * линия: плато RSI у пика — всё тот же пик. Новая вершина, продолжающая
 * дивергенцию от того же якоря, удлиняет её линию, а не ставит вторую рядом.
 */
function divergencesOfSide(
  kind: 'bear' | 'bull',
  rsi: readonly number[],
  price: readonly number[],
  o: RsiOptions,
): Divergence[] {
  // Знак стороны: «выше» у медвежьей — больше, у бычьей — меньше.
  const s = kind === 'bear' ? 1 : -1;
  const zone = kind === 'bear' ? o.overbought : o.oversold;
  const beyond = (a: number, b: number) => s * (a - b) > 0;
  const crosses = (values: readonly number[], a: number, va: number, b: number, vb: number) => {
    for (let i = a + 1; i < b; i++) {
      const line = va + ((vb - va) * (i - a)) / (b - a);
      const limit = i <= a + o.rightBars ? (beyond(va, line) ? va : line) : i >= b - o.leftBars ? (beyond(vb, line) ? vb : line) : line;
      if (beyond(values[i], limit)) return true;
    }
    return false;
  };

  const out: Divergence[] = [];
  // Якорь → индекс его дивергенции в `out`: продолжение заменяет её.
  const started = new Map<number, number>();
  const swings: Swing[] = [];
  for (let p = o.leftBars; p + o.rightBars < price.length; p++) {
    if (!isPivot(price, p, o.leftBars, o.rightBars, kind === 'bear' ? 'high' : 'low')) continue;
    let rb = -1;
    for (let k = Math.max(0, p - o.lag); k <= Math.min(rsi.length - 1, p + o.lag); k++) {
      if (!Number.isNaN(rsi[k]) && (rb < 0 || beyond(rsi[k], rsi[rb]))) rb = k;
    }
    if (rb < 0) continue;
    const here: Swing = { bar: p, price: price[p], rsiBar: rb, value: rsi[rb], chained: false };
    if (beyond(here.value, 50)) {
      for (let j = swings.length - 1; j >= 0; j--) {
        const a = swings[j];
        if (p - a.bar < o.minRange) continue;
        if (p - a.bar > o.maxRange) break;
        if (!beyond(here.price, a.price) || !beyond(a.value, here.value)) continue;
        if (!a.chained && beyond(zone, a.value)) continue;
        if (a.rsiBar >= rb) continue;
        if (crosses(price, a.bar, a.price, p, here.price) || crosses(rsi, a.rsiBar, a.value, rb, here.value)) continue;
        const dv: Divergence = {
          kind,
          from: a.bar,
          to: p,
          fromPrice: a.price,
          toPrice: here.price,
          rsiFrom: a.rsiBar,
          rsiTo: rb,
          fromValue: a.value,
          toValue: here.value,
        };
        const was = started.get(a.bar);
        if (was === undefined) {
          started.set(a.bar, out.length);
          out.push(dv);
        } else {
          out[was] = dv;
        }
        here.chained = true;
        break;
      }
    }
    swings.push(here);
  }
  return out;
}

/** Медвежьи и бычьи дивергенции — по порядку подтверждения второй вершины. */
export function divergencesOf(
  rsi: readonly number[],
  highs: readonly number[],
  lows: readonly number[],
  o: RsiOptions,
): Divergence[] {
  return [...divergencesOfSide('bear', rsi, highs, o), ...divergencesOfSide('bull', rsi, lows, o)].sort((a, b) => a.to - b.to);
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
