/**
 * Второй прогон (2026-11-12): четыре способа вывести «дивергенция + FVG» в плюс.
 *
 * Запуск (из frontend/):
 *   npx vite-node ../tools/setup-scan/variants.ts -- <каталог кэша свечей> [SYMBOL]
 *
 * Сигнал — как в test.ts: первая свеча, где активны и дивергенция RSI (подтверждена не раньше
 * 5 свечей назад), и первое касание незакрытого FVG (не раньше 5 свечей назад); повтор через 10.
 * Только 1ч и 4ч: 15м съедает комиссия.
 *
 * Варианты (лонг; шорт зеркально). R — в единицах риска сделки, после комиссии
 * (тейкер 0,055 %, мейкер 0,02 %):
 *   база       — вход по закрытию (тейкер), стоп 1 ATR, цель 1 или 2 ATR, выход тейкером
 *   лимит      — лимит на середине FVG (или на цене закрытия, если она уже ниже), ждёт 5 свечей;
 *                стоп 1 ATR от лимита, цель 1 или 2 ATR; вход и цель — мейкер, стоп — тейкер;
 *                стоп в свече исполнения считается, цель — нет
 *   свинг      — вход по закрытию, стоп за второй экстремум дивергенции (− 0,1 ATR), цель 2R или 3R;
 *                риск меньше 0,3 ATR — сделки нет
 *   тренд      — база, но лонг только выше EMA за 50 дней, шорт — только ниже
 *   объём      — база, но у второго экстремума дивергенции (±1 свеча) объём ≥ 1,5 × среднего за 20
 *   всё вместе — лимит + стоп за экстремум + тренд, цель 2R
 * Горизонт — 30 свечей (у стопа за экстремум — 60), не дошло — выход по закрытию тейкером.
 *
 * КРИТЕРИЙ (записан до прогона): по обеим сторонам вместе на проверке (с 2023) сделок ≥ 30,
 * средний R > 0 и t ≥ 2, и на истории до 2023 R > 0. Новых ячеек 9 × 2 таймфрейма = 18:
 * одна случайно прошедшая ожидаема — единичный проход на границе не доказательство.
 */
process.env.SETUP_SCAN_LIB = '1';
import { RSI_DEFAULTS, divergencesOf, rsiOf } from '../../frontend/src/widgets/backtest-session/lib/rsi';

const SPLIT = Date.UTC(2023, 0, 1);
const TAKER = 0.00055;
/** Стоп не ближе этой доли цены (MIN_STOP=0.015 — правило владельца) и множитель горизонта. */
const MIN_STOP = Number(process.env.MIN_STOP ?? 0);
const HX = Number(process.env.HORIZON_X ?? 1);
const MAKER = 0.0002;
const O = RSI_DEFAULTS;
const WINDOW = 300;

type Side = 1 | -1;
interface B {
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
}
interface Signal {
  i: number;
  side: Side;
  /** Второй экстремум дивергенции: свеча и цена. */
  swingBar: number;
  swing: number;
  gapTop: number;
  gapBottom: number;
}

function signalsOf(b: B, atr: number[]): Signal[] {
  const n = b.c.length;
  const rsi = rsiOf(b.c, O.length);
  const R = O.rightBars;
  const L = O.leftBars;
  const pivot = (xs: number[], p: number, low: boolean) => {
    for (let k = 1; k <= L; k++) if (low ? !(xs[p] < xs[p - k]) : !(xs[p] > xs[p - k])) return false;
    for (let k = 1; k <= R; k++) if (low ? !(xs[p] <= xs[p + k]) : !(xs[p] >= xs[p + k])) return false;
    return true;
  };
  type Div = { bar: number; swingBar: number; swing: number };
  type Touch = { bar: number; top: number; bottom: number };
  const divs: Record<Side, (Div | undefined)[]> = { 1: new Array(n), [-1]: new Array(n) } as never;
  const touches: Record<Side, (Touch | undefined)[]> = { 1: new Array(n), [-1]: new Array(n) } as never;

  for (let i = WINDOW; i < n; i++) {
    const p = i - R;
    if (!pivot(b.l, p, true) && !pivot(b.h, p, false)) continue;
    const s = i - WINDOW + 1;
    for (const d of divergencesOf(rsi.slice(s, i + 1), b.h.slice(s, i + 1), b.l.slice(s, i + 1), O)) {
      if (d.to + s !== p) continue;
      divs[d.kind === 'bull' ? 1 : -1][i] = { bar: i, swingBar: p, swing: d.toPrice };
    }
  }

  let gaps: { side: Side; top: number; bottom: number; born: number }[] = [];
  for (let i = 2; i < n; i++) {
    const next: typeof gaps = [];
    for (const g of gaps) {
      if (i - g.born > 100) continue;
      const touched = g.side === 1 ? b.l[i] <= g.top : b.h[i] >= g.bottom;
      if (!touched) {
        next.push(g);
        continue;
      }
      const held = g.side === 1 ? b.c[i] >= g.bottom : b.c[i] <= g.top;
      if (held) touches[g.side][i] = { bar: i, top: g.top, bottom: g.bottom };
    }
    gaps = next;
    const a = atr[i];
    if (Number.isNaN(a)) continue;
    if (b.l[i] - b.h[i - 2] >= 0.2 * a) gaps.push({ side: 1, top: b.l[i], bottom: b.h[i - 2], born: i });
    if (b.l[i - 2] - b.h[i] >= 0.2 * a) gaps.push({ side: -1, top: b.l[i - 2], bottom: b.h[i], born: i });
  }

  const out: Signal[] = [];
  for (const side of [1, -1] as Side[]) {
    let d: Div | undefined;
    let f: Touch | undefined;
    let prev = false;
    let last = -1e9;
    for (let i = 0; i < n; i++) {
      d = divs[side][i] ?? d;
      f = touches[side][i] ?? f;
      const all = !!d && !!f && i - d.bar <= 5 && i - f.bar <= 5;
      if (all && !prev && i - last >= 10) {
        out.push({ i, side, swingBar: d!.swingBar, swing: d!.swing, gapTop: f!.top, gapBottom: f!.bottom });
        last = i;
      }
      prev = all;
    }
  }
  return out;
}

interface Plan {
  /** Свеча, с которой ищется исполнение лимита; у входа по рынку — нет. */
  limit?: number;
  entry: number;
  stop: number;
  target: number;
  horizon: number;
  feeIn: number;
  feeTake: number;
}

/** R сделки после комиссии; null — сделки нет (лимит не исполнился, история кончилась). */
function run(b: B, s: Signal, p: Plan): number | null {
  const { side } = s;
  const risk = side * (p.entry - p.stop);
  if (!(risk > 0)) return null;
  let from = s.i + 1;
  let fillBar = -1;
  if (p.limit != null) {
    for (let k = s.i + 1; k <= s.i + 5 && k < b.c.length; k++) {
      if (side === 1 ? b.l[k] <= p.entry : b.h[k] >= p.entry) {
        fillBar = k;
        break;
      }
    }
    if (fillBar < 0) return null;
    from = fillBar;
  }
  const end = from + p.horizon;
  if (end >= b.c.length) return null;
  const fee = (rate: number) => (rate * p.entry) / risk;
  const targetR = (side * (p.target - p.entry)) / risk;
  for (let k = from; k <= end; k++) {
    if (side === 1 ? b.l[k] <= p.stop : b.h[k] >= p.stop) return -1 - fee(p.feeIn) - fee(TAKER);
    if (k !== fillBar && (side === 1 ? b.h[k] >= p.target : b.l[k] <= p.target)) return targetR - fee(p.feeIn) - fee(p.feeTake);
  }
  return (side * (b.c[end] - p.entry)) / risk - fee(p.feeIn) - fee(TAKER);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
function tOf(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const mu = mean(xs);
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mu) ** 2, 0) / (xs.length - 1));
  return sd ? mu / (sd / Math.sqrt(xs.length)) : NaN;
}
const f = (x: number, d = 2) => (Number.isNaN(x) ? '    —' : (x >= 0 ? '+' : '') + x.toFixed(d));

async function main() {
  const { load, atrOf } = await import('./test');
  const symbol = process.argv.slice(2).filter((a) => a !== '--')[1] ?? 'BTCUSDT';
  console.log(`${symbol}: «дивергенция + FVG», история — до 2023, проверка — с 2023`);
  console.log('Столбцы: n, винрейт, R после комиссии, t  ||  то же на проверке  ||  проверка: лонг R (n), шорт R (n)');
  for (const [tf, minutes] of [
    ['1h', 60],
    ['4h', 240],
  ] as [string, number][]) {
    const b: B = await load(tf, minutes);
    const atr = atrOf(b);
    const sigs = signalsOf(b, atr);
    // Тренд — EMA за 50 дней свечей.
    const len = (50 * 1440) / minutes;
    const ema: number[] = [];
    b.c.forEach((c, i) => ema.push(i ? ema[i - 1] + (2 / (len + 1)) * (c - ema[i - 1]) : c));
    const withTrend = (s: Signal) => (s.side === 1 ? b.c[s.i] > ema[s.i] : b.c[s.i] < ema[s.i]);
    const climax = (s: Signal) => {
      const p = s.swingBar;
      let sum = 0;
      for (let k = p - 21; k < p - 1; k++) sum += b.v[k];
      return Math.max(b.v[p - 1], b.v[p], b.v[p + 1]) >= 1.5 * (sum / 20);
    };
    const market = (s: Signal, mult: number): Plan => {
      const e = b.c[s.i];
      const a = atr[s.i];
      return { entry: e, stop: e - s.side * a, target: e + s.side * mult * a, horizon: 30, feeIn: TAKER, feeTake: TAKER };
    };
    const limitAt = (s: Signal) => {
      const mid = (s.gapTop + s.gapBottom) / 2;
      return s.side === 1 ? Math.min(mid, b.c[s.i]) : Math.max(mid, b.c[s.i]);
    };
    const limit = (s: Signal, mult: number): Plan => {
      const e = limitAt(s);
      const a = atr[s.i];
      return { limit: 1, entry: e, stop: e - s.side * a, target: e + s.side * mult * a, horizon: 30, feeIn: MAKER, feeTake: MAKER };
    };
    const swingStop = (s: Signal, e: number) => {
      const raw = s.swing - s.side * 0.1 * atr[s.i];
      const dist = s.side * (e - raw);
      // Ближе 0,3 ATR — сделки нет (отсекает вызывающий); иначе не ближе MIN_STOP от входа.
      return dist < 0.3 * atr[s.i] ? raw : e - s.side * Math.max(dist, MIN_STOP * e);
    };
    const swing = (s: Signal, rr: number): Plan | null => {
      const e = b.c[s.i];
      const stop = swingStop(s, e);
      const risk = s.side * (e - stop);
      if (risk < 0.3 * atr[s.i]) return null;
      return { entry: e, stop, target: e + s.side * rr * risk, horizon: Math.round(60 * HX), feeIn: TAKER, feeTake: TAKER };
    };
    const all = (s: Signal): Plan | null => {
      if (!withTrend(s)) return null;
      const e = limitAt(s);
      const stop = swingStop(s, e);
      const risk = s.side * (e - stop);
      if (risk < 0.3 * atr[s.i]) return null;
      return { limit: 1, entry: e, stop, target: e + s.side * 2 * risk, horizon: Math.round(60 * HX), feeIn: MAKER, feeTake: MAKER };
    };
    const variants: [string, (s: Signal) => Plan | null][] = [
      ['база 1:1', (s) => market(s, 1)],
      ['база 1:2', (s) => market(s, 2)],
      ['лимит 1:1', (s) => limit(s, 1)],
      ['лимит 1:2', (s) => limit(s, 2)],
      ["свинг 1R", (s) => swing(s, 1)],
      ["свинг 2R", (s) => swing(s, 2)],
      ['свинг 3R', (s) => swing(s, 3)],
      ['тренд 1:1', (s) => (withTrend(s) ? market(s, 1) : null)],
      ['тренд 1:2', (s) => (withTrend(s) ? market(s, 2) : null)],
      ['объём 1:1', (s) => (climax(s) ? market(s, 1) : null)],
      ['объём 1:2', (s) => (climax(s) ? market(s, 2) : null)],
      ['всё вместе 2R', all],
    ];
    console.log(`\n=== ${tf} · сигналов ${sigs.length}`);
    for (const [name, plan] of variants) {
      const rows: { t: number; side: Side; r: number; risk: number }[] = [];
      for (const s of sigs) {
        if (Number.isNaN(atr[s.i])) continue;
        const p = plan(s);
        const r = p ? run(b, s, p) : null;
        if (r != null) rows.push({ t: b.t[s.i], side: s.side, r, risk: (100 * Math.abs(p!.entry - p!.stop)) / p!.entry });
      }
      const part = (xs: typeof rows) => {
        const rs = xs.map((x) => x.r);
        const wr = rs.length ? Math.round((100 * rs.filter((r) => r > 0).length) / rs.length) : NaN;
        return `${String(rs.length).padStart(4)} ${String(wr).padStart(3)}% ${f(mean(rs))} ${f(tOf(rs), 1).padStart(5)}`;
      };
      const dev = rows.filter((x) => x.t < SPLIT);
      const test = rows.filter((x) => x.t >= SPLIT);
      const side = (sd: Side) => {
        const xs = test.filter((x) => x.side === sd).map((x) => x.r);
        return `${f(mean(xs))} (${xs.length})`;
      };
      const tr = test.map((x) => x.r);
      const pass = test.length >= 30 && mean(tr) > 0 && tOf(tr) >= 2 && mean(dev.map((x) => x.r)) > 0;
      console.log(`${name.padEnd(14)} ${part(dev)} || ${part(test)} || ${side(1)}, ${side(-1)} || стоп ${mean(rows.map((x) => x.risk)).toFixed(2)} %${pass ? "  ПРОШЛО" : ""}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
