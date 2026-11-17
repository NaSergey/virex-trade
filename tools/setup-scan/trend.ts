/**
 * Пятый прогон (2026-11-12): самая простая стратегия с ≥ 1 сделкой в неделю — пробой диапазона по тренду.
 *
 * Запуск (из frontend/):
 *   npx vite-node ../tools/setup-scan/trend.ts -- <каталог кэша свечей> [SYMBOL]
 *
 * Правила (лонг; шорт зеркально), всё на закрытых свечах:
 *   вход   — закрытие выше максимума предыдущих N свечей, по цене закрытия (тейкер)
 *   стоп   — 2 ATR(14) от входа, но не ближе 1,5 % цены; исполняется внутри свечи по своей цене
 *   выход  — закрытие ниже минимума предыдущих M свечей (тейкер); тейка нет
 *   одна позиция за раз: сигнал при открытой позиции пропускается
 *   фильтр тренда (отдельной строкой) — лонг только выше EMA за 50 дней, шорт — только ниже
 * Наборы: 4ч N=20 / M=10 и 1ч N=55 / M=20. Комиссия 0,055 % × 2, вычтена из R (R — доля начального риска).
 *
 * КРИТЕРИЙ (записан до прогона): на проверке (с 2023) сделок ≥ 40, средний R > 0 и t ≥ 2, на истории
 * до 2023 R > 0, и сделок в среднем не меньше одной в неделю. Ячеек 4 — случайный проход маловероятен.
 */
process.env.SETUP_SCAN_LIB = '1';

const SPLIT = Date.UTC(2023, 0, 1);
const TAKER = 0.00055;
const WEEK = 7 * 86_400_000;

interface B {
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
}
interface Trade {
  t: number;
  side: 1 | -1;
  r: number;
  risk: number;
  bars: number;
}

function run(b: B, atr: number[], ema: number[], n: number, m: number, trend: boolean): Trade[] {
  const out: Trade[] = [];
  const hi = (i: number, len: number) => Math.max(...b.h.slice(i - len, i));
  const lo = (i: number, len: number) => Math.min(...b.l.slice(i - len, i));
  let pos: { side: 1 | -1; entry: number; stop: number; risk: number; at: number } | null = null;
  for (let i = Math.max(n, 20); i < b.c.length; i++) {
    if (pos) {
      const { side, entry, stop, risk } = pos;
      const fee = (2 * TAKER * entry) / risk;
      const stopped = side === 1 ? b.l[i] <= stop : b.h[i] >= stop;
      const exit = side === 1 ? b.c[i] < lo(i, m) : b.c[i] > hi(i, m);
      if (stopped || exit) {
        const price = stopped ? stop : b.c[i];
        out.push({ t: b.t[pos.at], side, r: (side * (price - entry)) / risk - fee, risk: (100 * risk) / entry, bars: i - pos.at });
        pos = null;
      }
      // Выход и новый вход в одной свече не делаем: следующий сигнал — со следующей свечи.
      continue;
    }
    if (Number.isNaN(atr[i])) continue;
    const up = b.c[i] > hi(i, n);
    const down = b.c[i] < lo(i, n);
    const side: 1 | -1 | 0 = up ? 1 : down ? -1 : 0;
    if (!side) continue;
    if (trend && (side === 1 ? !(b.c[i] > ema[i]) : !(b.c[i] < ema[i]))) continue;
    const entry = b.c[i];
    const risk = Math.max(2 * atr[i], 0.015 * entry);
    pos = { side, entry, stop: entry - side * risk, risk, at: i };
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
const f = (x: number, d = 2) => (Number.isNaN(x) ? '—' : (x >= 0 ? '+' : '') + x.toFixed(d));

function report(label: string, ts: Trade[], from: number, to: number, minutes: number) {
  const part = (xs: Trade[], a: number, z: number) => {
    const rs = xs.map((x) => x.r);
    let peak = 0;
    let sum = 0;
    let dd = 0;
    for (const r of rs) {
      sum += r;
      peak = Math.max(peak, sum);
      dd = Math.max(dd, peak - sum);
    }
    const weeks = (z - a) / WEEK;
    const wr = rs.length ? Math.round((100 * rs.filter((r) => r > 0).length) / rs.length) : NaN;
    return `${String(rs.length).padStart(4)} сд. · ${(rs.length / weeks).toFixed(1)}/нед · винрейт ${wr}% · R ${f(mean(rs))} (t ${f(tOf(rs), 1)}) · итог ${f(sum, 0)}R · просадка ${dd.toFixed(0)}R`;
  };
  const dev = ts.filter((x) => x.t < SPLIT);
  const test = ts.filter((x) => x.t >= SPLIT);
  const side = (sd: 1 | -1) => {
    const xs = test.filter((x) => x.side === sd).map((x) => x.r);
    return `${f(mean(xs))} (${xs.length})`;
  };
  const tr = test.map((x) => x.r);
  const perWeek = test.length / ((to - SPLIT) / WEEK);
  const pass = test.length >= 40 && mean(tr) > 0 && tOf(tr) >= 2 && mean(dev.map((x) => x.r)) > 0 && perWeek >= 1;
  console.log(`\n${label}${pass ? '  — ПРОШЛО' : ''}`);
  console.log(`  история : ${part(dev, from, SPLIT)}`);
  console.log(`  проверка: ${part(test, SPLIT, to)}`);
  console.log(
    `  проверка по сторонам: лонг ${side(1)}, шорт ${side(-1)} · средний стоп ${mean(ts.map((x) => x.risk)).toFixed(2)} % · в сделке в среднем ${((mean(ts.map((x) => x.bars)) * minutes) / 1440).toFixed(1)} дн.`,
  );
}

async function main() {
  const { load, atrOf } = await import('./test');
  const symbol = process.argv.slice(2).filter((a) => a !== '--')[1] ?? 'BTCUSDT';
  console.log(`${symbol}: пробой диапазона; история — до 2023, проверка — с 2023`);
  for (const [tf, minutes, n, m] of [
    ['4h', 240, 20, 10],
    ['1h', 60, 55, 20],
  ] as [string, number, number, number][]) {
    const b: B = await load(tf, minutes);
    const atr = atrOf(b as never);
    const len = (50 * 1440) / minutes;
    const ema: number[] = [];
    b.c.forEach((c, i) => ema.push(i ? ema[i - 1] + (2 / (len + 1)) * (c - ema[i - 1]) : c));
    const from = b.t[0];
    const to = b.t[b.t.length - 1];
    report(`${tf}, вход ${n} / выход ${m}, обе стороны`, run(b, atr, ema, n, m, false), from, to, minutes);
    report(`${tf}, вход ${n} / выход ${m}, только по тренду`, run(b, atr, ema, n, m, true), from, to, minutes);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
