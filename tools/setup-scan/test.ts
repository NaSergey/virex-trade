/**
 * Проверка сетапов владельца на истории, до того как писать сканер (2026-11-12).
 *
 * Запуск (из frontend/, там vite-node):
 *   npx vite-node ../tools/setup-scan/test.ts -- <каталог кэша свечей> [SYMBOL]
 *
 * Данные — спот Binance (data-api.binance.vision), свечи 15м / 1ч / 4ч с 2019 года.
 * Дивергенции — тем же `rsi.ts`, что рисует панель RSI терминала, шагом вперёд:
 * на каждой свече детектор видит только окно до неё.
 *
 * Условия (лонг; шорт зеркально), все — на закрытой свече:
 *   D — бычья дивергенция RSI подтверждена (вторая впадина + rightBars); активна 5 свечей
 *   O — RSI был в зоне (<30 / >70) в последние 5 свечей
 *   F — первое касание незакрытого FVG (не старше 100 свечей, зазор ≥ 0,2 ATR, свеча не
 *       закрылась сквозь него); активно 5 свечей
 *   V — объём свечи ≥ 1,5 × среднего за 20 и свеча в сторону сделки; только сама свеча
 * Сигнал сочетания — первая свеча, где активны все его условия; повтор не раньше чем через 10.
 *
 * Исход от закрытия сигнальной свечи, ATR(14) этой свечи:
 *   1:1 — стоп 1 ATR, цель 1 ATR; 1:2 — стоп 1 ATR, цель 2 ATR; горизонт 30 свечей,
 *   не дошло — выход по закрытию; стоп и цель в одной свече — стоп.
 *   Комиссия 0,11 % на круг (тейкер Bybit × 2) вычтена из R.
 *   Ход — средний максимум в сторону сделки и против неё за 20 свечей, в ATR.
 *
 * КРИТЕРИЙ (записан до прогона). Сочетание «работает» на таймфрейме, если по обеим сторонам
 * вместе на проверке (с 2023-01-01): сделок ≥ 40, средний R после комиссии > 0 и t ≥ 2
 * (по 1:1 или 1:2), и на истории до 2023 тот же R > 0. Ячеек 10 × 3 = 30 на каждый из двух
 * исходов: одна-две случайно прошедшие ожидаемы, единичный проход на границе — не доказательство.
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RSI_DEFAULTS, divergencesOf, rsiOf } from '../../frontend/src/widgets/backtest-session/lib/rsi';

const [cacheDir, SYMBOL = 'BTCUSDT'] = process.argv.slice(2).filter((a) => a !== '--');
if (!cacheDir) throw new Error('нужен каталог кэша свечей');
mkdirSync(cacheDir, { recursive: true });

const FROM = Date.UTC(2019, 0, 1);
const SPLIT = Date.UTC(2023, 0, 1);
const TFS: [string, number][] = [
  ['15m', 15],
  ['1h', 60],
  ['4h', 240],
];
const FEE = 0.0011;
const HORIZON = 30;
const MOVE_BARS = 20;
const ACTIVE = 5;
const REFRACTORY = 10;
const WINDOW = 300;
const O = RSI_DEFAULTS;

export interface Bars {
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
}

export async function load(interval: string, minutes: number, symbol = SYMBOL): Promise<Bars> {
  const file = join(cacheDir, `${symbol}-${interval}.json`);
  let rows: number[][] = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  const step = minutes * 60_000;
  let from = rows.length ? rows[rows.length - 1][0] + step : FROM;
  const end = Date.now() - step;
  while (from < end) {
    const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${from}&limit=1000`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance ${res.status}`);
    const page = (await res.json()) as (string | number)[][];
    if (!page.length) break;
    for (const k of page) rows.push([Number(k[0]), Number(k[1]), Number(k[2]), Number(k[3]), Number(k[4]), Number(k[5])]);
    from = Number(page[page.length - 1][0]) + step;
    await new Promise((r) => setTimeout(r, 120));
  }
  // Последняя свеча может быть незакрытой — в расчёт не идёт.
  rows = rows.filter((r) => r[0] + step <= Date.now());
  writeFileSync(file, JSON.stringify(rows));
  const col = (i: number) => rows.map((r) => r[i]);
  return { t: col(0), o: col(1), h: col(2), l: col(3), c: col(4), v: col(5) };
}

export function atrOf(b: Bars, len = 14): number[] {
  const out = new Array<number>(b.c.length).fill(NaN);
  let a = 0;
  for (let i = 1; i < b.c.length; i++) {
    const tr = Math.max(b.h[i] - b.l[i], Math.abs(b.h[i] - b.c[i - 1]), Math.abs(b.l[i] - b.c[i - 1]));
    if (i <= len) {
      a += tr / len;
      if (i === len) out[i] = a;
    } else {
      a = (a * (len - 1) + tr) / len;
      out[i] = a;
    }
  }
  return out;
}

type Side = 1 | -1;
/** По каждой свече: с какой свечи условие активно в последний раз (или -1e9). */
type Marks = Record<'D' | 'O' | 'F' | 'V', { long: Int32Array; short: Int32Array }>;

function marksOf(b: Bars, atr: number[]): Marks {
  const n = b.c.length;
  const mk = () => ({ long: new Int32Array(n).fill(-1e9), short: new Int32Array(n).fill(-1e9) });
  const m: Marks = { D: mk(), O: mk(), F: mk(), V: mk() };
  const rsi = rsiOf(b.c, O.length);

  // D — шагом вперёд: детектор зовётся, только когда свеча i − rightBars могла стать вершиной.
  const R = O.rightBars;
  const L = O.leftBars;
  const pivot = (xs: number[], p: number, low: boolean) => {
    for (let k = 1; k <= L; k++) if (low ? !(xs[p] < xs[p - k]) : !(xs[p] > xs[p - k])) return false;
    for (let k = 1; k <= R; k++) if (low ? !(xs[p] <= xs[p + k]) : !(xs[p] >= xs[p + k])) return false;
    return true;
  };
  for (let i = WINDOW; i < n; i++) {
    const p = i - R;
    const lo = pivot(b.l, p, true);
    const hi = pivot(b.h, p, false);
    if (!lo && !hi) continue;
    const s = i - WINDOW + 1;
    const found = divergencesOf(rsi.slice(s, i + 1), b.h.slice(s, i + 1), b.l.slice(s, i + 1), O);
    for (const d of found) {
      if (d.to + s !== p) continue;
      (d.kind === 'bull' ? m.D.long : m.D.short)[i] = i;
    }
  }

  // O — RSI в зоне.
  for (let i = 0; i < n; i++) {
    if (rsi[i] < O.oversold) m.O.long[i] = i;
    if (rsi[i] > O.overbought) m.O.short[i] = i;
  }

  // F — первое касание незакрытого FVG.
  interface Gap {
    side: Side;
    top: number;
    bottom: number;
    born: number;
  }
  let gaps: Gap[] = [];
  for (let i = 2; i < n; i++) {
    const next: Gap[] = [];
    for (const g of gaps) {
      if (i - g.born > 100) continue;
      const touched = g.side === 1 ? b.l[i] <= g.top : b.h[i] >= g.bottom;
      if (!touched) {
        next.push(g);
        continue;
      }
      const held = g.side === 1 ? b.c[i] >= g.bottom : b.c[i] <= g.top;
      if (held) (g.side === 1 ? m.F.long : m.F.short)[i] = i;
    }
    gaps = next;
    const a = atr[i];
    if (Number.isNaN(a)) continue;
    if (b.l[i] - b.h[i - 2] >= 0.2 * a) gaps.push({ side: 1, top: b.l[i], bottom: b.h[i - 2], born: i });
    if (b.l[i - 2] - b.h[i] >= 0.2 * a) gaps.push({ side: -1, top: b.l[i - 2], bottom: b.h[i], born: i });
  }

  // V — всплеск объёма в сторону сделки.
  let sum = 0;
  for (let i = 0; i < n; i++) {
    if (i >= 20) {
      const avg = sum / 20;
      if (b.v[i] >= 1.5 * avg) {
        if (b.c[i] > b.o[i]) m.V.long[i] = i;
        if (b.c[i] < b.o[i]) m.V.short[i] = i;
      }
      sum -= b.v[i - 20];
    }
    sum += b.v[i];
  }
  return m;
}

interface Trade {
  t: number;
  r1: number;
  r2: number;
  mfe: number;
  mae: number;
}

function outcome(b: Bars, atr: number[], i: number, side: Side): Trade | null {
  const a = atr[i];
  const e = b.c[i];
  if (Number.isNaN(a) || i + HORIZON >= b.c.length) return null;
  const fee = (FEE * e) / a;
  const run = (target: number) => {
    for (let k = i + 1; k <= i + HORIZON; k++) {
      const down = side === 1 ? e - b.l[k] : b.h[k] - e;
      const up = side === 1 ? b.h[k] - e : e - b.l[k];
      if (down >= a) return -1 - fee;
      if (up >= target * a) return target - fee;
    }
    return (side * (b.c[i + HORIZON] - e)) / a - fee;
  };
  let mfe = 0;
  let mae = 0;
  for (let k = i + 1; k <= i + MOVE_BARS; k++) {
    mfe = Math.max(mfe, side === 1 ? b.h[k] - e : e - b.l[k]);
    mae = Math.max(mae, side === 1 ? e - b.l[k] : b.h[k] - e);
  }
  return { t: b.t[i], r1: run(1), r2: run(2), mfe: mfe / a, mae: mae / a };
}

const COMBOS = ['D', 'O', 'F', 'D+F', 'D+V', 'O+V', 'F+V', 'O+F', 'D+F+V', 'O+F+V'];

function signals(b: Bars, atr: number[], m: Marks, combo: string, side: Side): Trade[] {
  const keys = combo.split('+') as (keyof Marks)[];
  const n = b.c.length;
  const out: Trade[] = [];
  // Последняя свеча, где условие было отмечено, — бегущим максимумом.
  const last = keys.map(() => -1e9);
  let prevAll = false;
  let lastSignal = -1e9;
  for (let i = 0; i < n; i++) {
    let all = true;
    keys.forEach((k, j) => {
      const mark = (side === 1 ? m[k].long : m[k].short)[i];
      if (mark === i) last[j] = i;
      const span = k === 'V' ? 0 : ACTIVE;
      if (i - last[j] > span) all = false;
    });
    if (all && !prevAll && i - lastSignal >= REFRACTORY) {
      const tr = outcome(b, atr, i, side);
      if (tr) out.push(tr);
      lastSignal = i;
    }
    prevAll = all;
  }
  return out;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
function tOf(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const mu = mean(xs);
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mu) ** 2, 0) / (xs.length - 1));
  return sd ? mu / (sd / Math.sqrt(xs.length)) : NaN;
}
const f = (x: number, d = 2) => (Number.isNaN(x) ? '   —' : (x >= 0 ? '+' : '') + x.toFixed(d));
const pct = (xs: Trade[], pick: (t: Trade) => number) => (xs.length ? Math.round((100 * xs.filter((t) => pick(t) > 0).length) / xs.length) : NaN);

function row(label: string, ts: Trade[]): string {
  const dev = ts.filter((t) => t.t < SPLIT);
  const test = ts.filter((t) => t.t >= SPLIT);
  const part = (xs: Trade[]) =>
    `${String(xs.length).padStart(5)} ${String(pct(xs, (t) => t.r1)).padStart(3)}% ${f(mean(xs.map((t) => t.r1)))} ${f(tOf(xs.map((t) => t.r1)), 1).padStart(5)} | ${String(pct(xs, (t) => t.r2)).padStart(3)}% ${f(mean(xs.map((t) => t.r2)))} ${f(tOf(xs.map((t) => t.r2)), 1).padStart(5)}`;
  const pass = (pick: (t: Trade) => number) =>
    test.length >= 40 && mean(test.map(pick)) > 0 && tOf(test.map(pick)) >= 2 && mean(dev.map(pick)) > 0;
  const verdict = pass((t) => t.r1) || pass((t) => t.r2) ? ' ПРОШЛО' : '';
  return `${label.padEnd(12)} ${part(dev)} || ${part(test)} || ${f(mean(test.map((t) => t.mfe)), 1)} ${f(-mean(test.map((t) => t.mae)), 1)}${verdict}`;
}

async function main() {
  console.log(`${SYMBOL}, спот Binance с 2019-01-01; история — до 2023, проверка — с 2023`);
  console.log('Столбцы: n, винрейт 1:1, R 1:1, t | винрейт 1:2, R 1:2, t  (R — после комиссии) || то же на проверке || ход за 20 свечей в ATR: в сторону, против');
  for (const [tf, minutes] of TFS) {
    const b = await load(tf, minutes);
    const atr = atrOf(b);
    const m = marksOf(b, atr);
    console.log(`\n=== ${tf} · ${b.c.length} свечей · ${new Date(b.t[0]).toISOString().slice(0, 10)} … ${new Date(b.t[b.t.length - 1]).toISOString().slice(0, 10)}`);
    // Планка: каждая 7-я свеча в обе стороны — что даёт вход без условия.
    const base: Trade[] = [];
    for (let i = WINDOW; i < b.c.length; i += 7)
      for (const s of [1, -1] as Side[]) {
        const tr = outcome(b, atr, i, s);
        if (tr) base.push(tr);
      }
    console.log(row('без условия', base));
    for (const combo of COMBOS) {
      const long = signals(b, atr, m, combo, 1);
      const short = signals(b, atr, m, combo, -1);
      console.log(row(combo, [...long, ...short]));
      console.log(row('  лонг', long));
      console.log(row('  шорт', short));
    }
  }
}

if (process.env.SETUP_SCAN_LIB !== "1") main().catch((e) => {
  console.error(e);
  process.exit(1);
});
