/**
 * Шестой прогон (2026-11-13): простая стратегия с ≥ 1 сделкой в неделю и хорошим винрейтом ИЛИ хорошим RR.
 *
 * Запуск (из frontend/):
 *   npx vite-node ../tools/setup-scan/weekly.ts -- <каталог кэша свечей>
 *
 * Пятый прогон (trend.ts) показал: пробой 20 / 10 на 4ч по тренду на BTC — +0,47R на проверке (t 2,0), но 0,8 сделки
 * в неделю. Здесь те же правила БЕЗ ЕДИНОЙ ПРАВКИ ставятся на другие монеты: частота набирается монетами, а монеты,
 * которых правила не видели, — заодно честная проверка. Вторая семья — кандидат на «хороший винрейт».
 *
 * Семья A, «пробой» (кандидат на RR). 4ч, закрытые свечи, лонг (шорт зеркально):
 *   вход  — закрытие выше максимума предыдущих 20 свечей и выше EMA за 50 дней, по закрытию (тейкер)
 *   стоп  — 2 ATR(14), но не ближе 1,5 % цены; исполняется по своей цене
 *   выход — закрытие ниже минимума предыдущих 10 свечей (тейкер); тейка нет
 * Семья B, «откат» (кандидат на винрейт). 4ч, закрытые свечи, лонг (шорт зеркально):
 *   вход  — RSI(2) < 10 при закрытии выше EMA за 50 дней, по закрытию (тейкер)
 *   стоп  — тот же: 2 ATR(14), не ближе 1,5 %
 *   выход — закрытие выше SMA(5) (тейкер)
 * У обеих: одна позиция на монету, сигнал при открытой позиции пропускается.
 * Издержки: тейкер 0,055 % × 2 и фандинг 0,01 % за 8 часов (лонг платит, шорт получает) — вычтены из R.
 *
 * Монеты: основной набор — BTCUSDT + ETHUSDT (минимум, который даёт частоту). Справочно, в критерий не входят:
 * SOLUSDT, BNBUSDT, XRPUSDT и набор из пяти. Соседние параметры пробоя (15 / 8 и 30 / 15) — справочно, не для выбора.
 *
 * КРИТЕРИЙ (записан до прогона), по каждой семье отдельно, на наборе BTC + ETH:
 *   1) на проверке (вход с 2023-01-01) сделок в среднем ≥ 1 в неделю;
 *   2) на проверке средний R > 0 и t ≥ 2, где t считается по НЕДЕЛЬНЫМ суммам R (сделки двух монет зависимы);
 *   3) на истории (до 2023) средний R > 0;
 *   4) ETH отдельно — R > 0 и на истории, и на проверке (на нём правила не подбирались);
 *   5) «хороший винрейт» — ≥ 60 %; «хороший RR» — средняя прибыль ≥ 2 средних убытков.
 * Семей две — случайный проход обеих маловероятен; проход одной на границе t — намёк, не доказательство.
 */
process.env.SETUP_SCAN_LIB = '1';

const SPLIT = Date.UTC(2023, 0, 1);
const TAKER = 0.00055;
const FUNDING_8H = 0.0001;
const WEEK = 7 * 86_400_000;
const MIN = 240;
const BAR = MIN * 60_000;

interface B {
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
}
interface Trade {
  sym: string;
  t: number;
  out: number;
  side: 1 | -1;
  r: number;
  risk: number;
  bars: number;
}
interface Pos {
  side: 1 | -1;
  entry: number;
  stop: number;
  risk: number;
  at: number;
}

const hiOf = (b: B, i: number, len: number) => Math.max(...b.h.slice(i - len, i));
const loOf = (b: B, i: number, len: number) => Math.min(...b.l.slice(i - len, i));

/** Общий проход: `enter` даёт сторону на закрытии свечи i, `leave` — выход по закрытию. */
function walk(
  sym: string,
  b: B,
  atr: number[],
  from: number,
  enter: (i: number) => 1 | -1 | 0,
  leave: (i: number, side: 1 | -1) => boolean,
): Trade[] {
  const out: Trade[] = [];
  let pos: Pos | null = null;
  for (let i = from; i < b.c.length; i++) {
    if (pos) {
      const { side, entry, stop, risk } = pos;
      const stopped = side === 1 ? b.l[i] <= stop : b.h[i] >= stop;
      if (stopped || leave(i, side)) {
        const price = stopped ? stop : b.c[i];
        const bars = i - pos.at;
        const cost = 2 * TAKER * entry + side * FUNDING_8H * entry * ((bars * MIN) / 480);
        out.push({ sym, t: b.t[pos.at], out: b.t[i], side, r: (side * (price - entry) - cost) / risk, risk: (100 * risk) / entry, bars });
        pos = null;
      }
      continue;
    }
    if (Number.isNaN(atr[i])) continue;
    const side = enter(i);
    if (!side) continue;
    const entry = b.c[i];
    const risk = Math.max(2 * atr[i], 0.015 * entry);
    pos = { side, entry, stop: entry - side * risk, risk, at: i };
  }
  return out;
}

function emaOf(xs: number[], len: number): number[] {
  const out: number[] = [];
  xs.forEach((c, i) => out.push(i ? out[i - 1] + (2 / (len + 1)) * (c - out[i - 1]) : c));
  return out;
}

function breakout(sym: string, b: B, atr: number[], ema: number[], n: number, m: number): Trade[] {
  return walk(
    sym,
    b,
    atr,
    300,
    (i) => (b.c[i] > hiOf(b, i, n) && b.c[i] > ema[i] ? 1 : b.c[i] < loOf(b, i, n) && b.c[i] < ema[i] ? -1 : 0),
    (i, side) => (side === 1 ? b.c[i] < loOf(b, i, m) : b.c[i] > hiOf(b, i, m)),
  );
}

function dip(sym: string, b: B, atr: number[], ema: number[], rsi2: number[]): Trade[] {
  const sma5 = (i: number) => (b.c[i] + b.c[i - 1] + b.c[i - 2] + b.c[i - 3] + b.c[i - 4]) / 5;
  return walk(
    sym,
    b,
    atr,
    300,
    (i) => (rsi2[i] < 10 && b.c[i] > ema[i] ? 1 : rsi2[i] > 90 && b.c[i] < ema[i] ? -1 : 0),
    (i, side) => (side === 1 ? b.c[i] > sma5(i) : b.c[i] < sma5(i)),
  );
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
function tOf(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const mu = mean(xs);
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mu) ** 2, 0) / (xs.length - 1));
  return sd ? mu / (sd / Math.sqrt(xs.length)) : NaN;
}
const f = (x: number, d = 2) => (Number.isNaN(x) ? '—' : (x >= 0 ? '+' : '') + x.toFixed(d));

interface Stat {
  n: number;
  perWeek: number;
  wr: number;
  r: number;
  tWeek: number;
  win: number;
  loss: number;
  sum: number;
  dd: number;
  streak: number;
}

function statOf(ts: Trade[], a: number, z: number): Stat {
  const xs = [...ts].sort((p, q) => p.out - q.out);
  const rs = xs.map((x) => x.r);
  let peak = 0;
  let sum = 0;
  let dd = 0;
  let run = 0;
  let streak = 0;
  for (const r of rs) {
    sum += r;
    peak = Math.max(peak, sum);
    dd = Math.max(dd, peak - sum);
    run = r > 0 ? 0 : run + 1;
    streak = Math.max(streak, run);
  }
  const weeks = Math.max(1, Math.floor((z - a) / WEEK));
  const byWeek = new Array<number>(weeks).fill(0);
  for (const x of xs) byWeek[Math.min(weeks - 1, Math.max(0, Math.floor((x.t - a) / WEEK)))] += x.r;
  const wins = rs.filter((r) => r > 0);
  const losses = rs.filter((r) => r <= 0);
  return {
    n: rs.length,
    perWeek: rs.length / ((z - a) / WEEK),
    wr: rs.length ? (100 * wins.length) / rs.length : NaN,
    r: mean(rs),
    tWeek: tOf(byWeek),
    win: mean(wins),
    loss: -mean(losses),
    sum,
    dd,
    streak,
  };
}

const line = (s: Stat) =>
  `${String(s.n).padStart(4)} сд. · ${s.perWeek.toFixed(1)}/нед · винрейт ${s.wr.toFixed(0)}% · прибыль ${f(s.win)}R / убыток −${s.loss.toFixed(2)}R (${(s.win / s.loss).toFixed(1)} к 1) · R ${f(s.r)} (t нед. ${f(s.tWeek, 1)}) · итог ${f(s.sum, 0)}R · просадка ${s.dd.toFixed(0)}R · минусов подряд ${s.streak}`;

function report(label: string, ts: Trade[], from: number, to: number, verdict?: (dev: Stat, test: Stat) => string) {
  const dev = statOf(ts.filter((x) => x.t < SPLIT), from, SPLIT);
  const test = statOf(ts.filter((x) => x.t >= SPLIT), SPLIT, to);
  console.log(`\n${label}${verdict ? verdict(dev, test) : ''}`);
  console.log(`  история : ${line(dev)}`);
  console.log(`  проверка: ${line(test)}`);
  const sd = (s: 1 | -1) => {
    const xs = ts.filter((x) => x.t >= SPLIT && x.side === s).map((x) => x.r);
    return `${f(mean(xs))} (${xs.length})`;
  };
  console.log(
    `  проверка по сторонам: лонг ${sd(1)}, шорт ${sd(-1)} · средний стоп ${mean(ts.map((x) => x.risk)).toFixed(2)} % · в сделке ${((mean(ts.map((x) => x.bars)) * MIN) / 1440).toFixed(1)} дн.`,
  );
  return { dev, test };
}

function years(label: string, ts: Trade[]) {
  const by = new Map<number, number[]>();
  for (const x of ts) {
    const y = new Date(x.t).getUTCFullYear();
    by.set(y, [...(by.get(y) ?? []), x.r]);
  }
  const cells = [...by.entries()].sort((p, q) => p[0] - q[0]).map(([y, rs]) => `${y}: ${f(rs.reduce((s, r) => s + r, 0), 0)}R (${rs.length})`);
  console.log(`  ${label} по годам: ${cells.join(' · ')}`);
}

async function main() {
  const { load, atrOf } = await import('./test');
  const { rsiOf } = await import('../../frontend/src/widgets/backtest-session/lib/rsi');
  const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
  const data = new Map<string, { b: B; atr: number[]; ema: number[]; rsi2: number[] }>();
  for (const s of SYMBOLS) {
    const b: B = await load('4h', MIN, s);
    data.set(s, { b, atr: atrOf(b as never), ema: emaOf(b.c, (50 * 1440) / MIN), rsi2: rsiOf(b.c, 2) });
    console.log(`${s}: ${b.c.length} свечей 4ч с ${new Date(b.t[0]).toISOString().slice(0, 10)}`);
  }
  const span = (syms: string[]) => {
    const from = Math.min(...syms.map((s) => data.get(s)!.b.t[0])) + 300 * BAR;
    const to = Math.max(...syms.map((s) => data.get(s)!.b.t.at(-1)!));
    return [from, to] as const;
  };

  const families: [string, (s: string) => Trade[]][] = [
    ['A. ПРОБОЙ 20 / 10 по тренду', (s) => breakout(s, data.get(s)!.b, data.get(s)!.atr, data.get(s)!.ema, 20, 10)],
    ['B. ОТКАТ RSI(2) по тренду', (s) => dip(s, data.get(s)!.b, data.get(s)!.atr, data.get(s)!.ema, data.get(s)!.rsi2)],
  ];
  for (const [name, make] of families) {
    console.log(`\n\n================ ${name} ================`);
    const per = new Map(SYMBOLS.map((s) => [s, make(s)]));
    const stats = new Map<string, { dev: Stat; test: Stat }>();
    for (const s of SYMBOLS) stats.set(s, report(s, per.get(s)!, ...span([s])));
    const main2 = ['BTCUSDT', 'ETHUSDT'];
    const set2 = main2.flatMap((s) => per.get(s)!);
    const eth = stats.get('ETHUSDT')!;
    report('НАБОР BTC + ETH (критерий)', set2, ...span(main2), (dev, test) => {
      const freq = test.perWeek >= 1;
      const edge = test.r > 0 && test.tWeek >= 2;
      const hist = dev.r > 0;
      const fresh = eth.dev.r > 0 && eth.test.r > 0;
      const quality = test.wr >= 60 || test.win / test.loss >= 2;
      const all = freq && edge && hist && fresh && quality;
      return `  — ${all ? 'ПРОШЛО' : 'НЕ ПРОШЛО'} [частота ${freq ? '✓' : '✗'} · плюс и t ${edge ? '✓' : '✗'} · история ${hist ? '✓' : '✗'} · ETH ${fresh ? '✓' : '✗'} · винрейт или RR ${quality ? '✓' : '✗'}]`;
    });
    years('BTC + ETH', set2);
    const set5 = SYMBOLS.flatMap((s) => per.get(s)!);
    report('НАБОР из пяти монет (справочно)', set5, ...span(SYMBOLS));
    years('пять монет', set5);
  }

  console.log('\n\n================ Соседние параметры пробоя, BTC + ETH (справочно) ================');
  for (const [n, m] of [
    [15, 8],
    [30, 15],
  ]) {
    const ts = ['BTCUSDT', 'ETHUSDT'].flatMap((s) => breakout(s, data.get(s)!.b, data.get(s)!.atr, data.get(s)!.ema, n, m));
    report(`пробой ${n} / ${m}`, ts, ...span(['BTCUSDT', 'ETHUSDT']));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
