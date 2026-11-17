/**
 * Третий прогон (2026-11-12): вход по тренду на коррекции после снятия ликвидности,
 * лимиткой в FVG или ордерблок, выход лимиткой.
 *
 * Запуск (из frontend/):
 *   npx vite-node ../tools/setup-scan/pullback.ts -- <каталог кэша свечей> [SYMBOL]
 *
 * Правила (лонг; шорт зеркально), всё на закрытых свечах:
 *   тренд    — закрытие выше EMA за 50 дней (шорт — ниже)
 *   снятие   — свеча пробила последнюю подтверждённую впадину (5/5, не старше 60 свечей),
 *              и не позже чем через 3 свечи цена закрылась обратно выше неё
 *   FVG      — первый бычий FVG (зазор ≥ 0,2 ATR), чья импульсная свеча не раньше свечи снятия,
 *              не позже 10 свечей после возврата; лимит на середине зазора
 *   ордерблок — последняя медвежья свеча перед минимумом снятия (до 5 свечей назад); зона
 *              действует, когда цена закрылась выше её максимума (до 10 свечей после возврата);
 *              лимит на середине свечи
 *   вход     — лимит ждёт 10 свечей (цена уже ниже лимита — лимит по цене закрытия); мейкер
 *   стоп     — за минимум снятия (− 0,1 ATR), тейкер; риск меньше 0,3 ATR — сделки нет
 *   выход    — лимитом (мейкер): 2R, 3R или «ликвидность» — последняя подтверждённая вершина
 *              не ближе 1R от входа (нет такой за 100 свечей — сделки нет)
 *   горизонт — 60 свечей после исполнения, дальше выход по закрытию тейкером;
 *              стоп в свече исполнения считается, цель — нет
 * Комиссии: мейкер 0,02 %, тейкер 0,055 %.
 *
 * КРИТЕРИЙ (записан до прогона): по обеим сторонам вместе на проверке (с 2023) сделок ≥ 30,
 * средний R > 0 и t ≥ 2, и на истории до 2023 R > 0. Ячеек 2 зоны × 3 цели × 3 таймфрейма = 18:
 * одна случайно прошедшая ожидаема — единичный проход на границе не доказательство.
 */
process.env.SETUP_SCAN_LIB = '1';

const SPLIT = Date.UTC(2023, 0, 1);
const TAKER = 0.00055;
/** Стоп не ближе этой доли цены (MIN_STOP=0.015 — правило владельца) и множитель горизонта. */
const MIN_STOP = Number(process.env.MIN_STOP ?? 0);
const HX = Number(process.env.HORIZON_X ?? 1);
const MAKER = 0.0002;

interface View {
  o: number[];
  h: number[];
  l: number[];
  c: number[];
}
interface Row {
  key: string;
  t: number;
  side: 1 | -1;
  r: number;
  risk: number;
}

/** Логика лонга на виде; шорт — тот же код на перевёрнутых ценах. */
function tradesOf(v: View, atr: number[], ema: number[], t: number[], side: 1 | -1): Row[] {
  const n = v.c.length;
  const out: Row[] = [];
  const pivotLow = (p: number) => {
    for (let k = 1; k <= 5; k++) if (!(v.l[p] < v.l[p - k]) || !(v.l[p] <= v.l[p + k])) return false;
    return true;
  };
  const pivotHigh = (p: number) => {
    for (let k = 1; k <= 5; k++) if (!(v.h[p] > v.h[p - k]) || !(v.h[p] >= v.h[p + k])) return false;
    return true;
  };
  const highs: { bar: number; price: number }[] = [];

  const sim = (key: string, z: number, limit: number, stop: number, target: number) => {
    const entry = Math.min(limit, v.c[z]);
    const risk = entry - stop;
    if (risk < 0.3 * atr[z]) return;
    let fill = -1;
    for (let k = z + 1; k <= z + 10 && k < n; k++)
      if (v.l[k] <= entry) {
        fill = k;
        break;
      }
    if (fill < 0 || fill + Math.round(60 * HX) >= n) return;
    const fee = (rate: number) => (rate * Math.abs(entry)) / risk;
    let r = (v.c[fill + Math.round(60 * HX)] - entry) / risk - fee(MAKER) - fee(TAKER);
    for (let k = fill; k <= fill + Math.round(60 * HX); k++) {
      if (v.l[k] <= stop) {
        r = -1 - fee(MAKER) - fee(TAKER);
        break;
      }
      if (k !== fill && v.h[k] >= target) {
        r = (target - entry) / risk - 2 * fee(MAKER);
        break;
      }
    }
    out.push({ key, t: t[z], side, r, risk: (100 * risk) / Math.abs(entry) });
  };

  const zone = (name: string, z: number, limit: number, sweepLow: number) => {
    if (z >= n || !(v.c[z] > ema[z]) || Number.isNaN(atr[z])) return;
    const entry = Math.min(limit, v.c[z]);
    if (!(entry - (sweepLow - 0.1 * atr[z]) >= 0.3 * atr[z])) return;
    // Стоп за минимум снятия, но не ближе MIN_STOP от входа (правило владельца: минимум 1,5 %).
    const stop = Math.min(sweepLow - 0.1 * atr[z], entry - MIN_STOP * Math.abs(entry));
    const risk = entry - stop;
    sim(`${name} 1R`, z, limit, stop, entry + risk);
    sim(`${name} 2R`, z, limit, stop, entry + 2 * risk);
    sim(`${name} 3R`, z, limit, stop, entry + 3 * risk);
    for (let q = highs.length - 1; q >= 0 && z - highs[q].bar <= 100; q--) {
      // Вершина должна быть известна к свече зоны: подтверждение — через 5 свечей.
      if (highs[q].bar + 5 > z) continue;
      if (highs[q].price >= entry + risk) {
        sim(`${name} ликв.`, z, limit, stop, highs[q].price);
        break;
      }
    }
  };

  let piv: { bar: number; price: number } | null = null;
  for (let i = 10; i < n - 15; i++) {
    const p = i - 5;
    if (pivotLow(p)) piv = { bar: p, price: v.l[p] };
    if (pivotHigh(p)) highs.push({ bar: p, price: v.h[p] });
    if (piv && i - piv.bar > 60) piv = null;
    if (!piv || !(v.l[i] < piv.price)) continue;

    // Снятие на свече i; возврат — закрытие выше впадины не позже чем через 3 свечи.
    const level = piv.price;
    piv = null;
    let r = -1;
    let sweepLow = v.l[i];
    let lowBar = i;
    for (let k = i; k <= i + 3; k++) {
      if (v.l[k] < sweepLow) {
        sweepLow = v.l[k];
        lowBar = k;
      }
      if (v.c[k] > level) {
        r = k;
        break;
      }
    }
    if (r < 0) continue;

    for (let k = Math.max(i + 1, 2); k <= r + 10; k++) {
      if (v.l[k] - v.h[k - 2] >= 0.2 * atr[k]) {
        zone('FVG', Math.max(k, r), (v.l[k] + v.h[k - 2]) / 2, sweepLow);
        break;
      }
    }
    for (let q = lowBar; q >= lowBar - 5; q--) {
      if (!(v.c[q] < v.o[q])) continue;
      for (let k = r; k <= r + 10; k++) {
        if (v.c[k] > v.h[q]) {
          zone('ОБ', k, (v.h[q] + v.l[q]) / 2, sweepLow);
          break;
        }
      }
      break;
    }
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
const f = (x: number, d = 2) => (Number.isNaN(x) ? '    —' : (x >= 0 ? '+' : '') + x.toFixed(d));

async function main() {
  const { load, atrOf } = await import('./test');
  const symbol = process.argv.slice(2).filter((a) => a !== '--')[1] ?? 'BTCUSDT';
  console.log(`${symbol}: по тренду на коррекции после снятия ликвидности; история — до 2023, проверка — с 2023`);
  console.log('Столбцы: n, винрейт, R после комиссии, t  ||  то же на проверке  ||  проверка: лонг R (n), шорт R (n)');
  for (const [tf, minutes] of [
    ['15m', 15],
    ['1h', 60],
    ['4h', 240],
  ] as [string, number][]) {
    const b = await load(tf, minutes);
    const atr = atrOf(b);
    const len = (50 * 1440) / minutes;
    const ema: number[] = [];
    b.c.forEach((c: number, i: number) => ema.push(i ? ema[i - 1] + (2 / (len + 1)) * (c - ema[i - 1]) : c));
    const neg = (xs: number[]) => xs.map((x) => -x);
    const rows = [
      ...tradesOf(b, atr, ema, b.t, 1),
      ...tradesOf({ o: neg(b.o), h: neg(b.l), l: neg(b.h), c: neg(b.c) }, atr, neg(ema), b.t, -1),
    ];
    console.log(`\n=== ${tf}`);
    for (const key of ["FVG 1R", "FVG 2R", "FVG 3R", "FVG ликв.", "ОБ 1R", "ОБ 2R", "ОБ 3R", "ОБ ликв."]) {
      const mine = rows.filter((x) => x.key === key);
      const part = (xs: Row[]) => {
        const rs = xs.map((x) => x.r);
        const wr = rs.length ? Math.round((100 * rs.filter((r) => r > 0).length) / rs.length) : NaN;
        return `${String(rs.length).padStart(5)} ${String(wr).padStart(3)}% ${f(mean(rs))} ${f(tOf(rs), 1).padStart(5)}`;
      };
      const dev = mine.filter((x) => x.t < SPLIT);
      const test = mine.filter((x) => x.t >= SPLIT);
      const side = (sd: 1 | -1) => {
        const xs = test.filter((x) => x.side === sd).map((x) => x.r);
        return `${f(mean(xs))} (${xs.length})`;
      };
      const tr = test.map((x) => x.r);
      const pass = test.length >= 30 && mean(tr) > 0 && tOf(tr) >= 2 && mean(dev.map((x) => x.r)) > 0;
      console.log(`${key.padEnd(10)} ${part(dev)} || ${part(test)} || ${side(1)}, ${side(-1)} || стоп ${mean(mine.map((x) => x.risk)).toFixed(2)} %${pass ? "  ПРОШЛО" : ""}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
