/*
 * Исследование улучшений стратегии. Подбор — по сделкам до CUTOFF; годы после него
 * печатаются только для вариантов, названных в --holdout=a,b (финалисты).
 * Свечи — Binance, кэш в каталоге. Запуск из backend/:
 * TS_NODE_TRANSPILE_ONLY=1 node -r ts-node/register src/scripts/strategy-research.ts <каталог> <BTC|ETH|…> [--only=a,b] [--holdout=a,b] [--placebo=a]
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  alignToClose,
  atr,
  maRegime,
  closeMs,
  CandleRow,
  Series,
  structure,
  swings,
  toSeries,
} from '../strategy/series';
import { scanLevels } from '../strategy/events';
import {
  findSetups,
  MAIN,
  Setup,
  SetupContext,
  Variant,
} from '../strategy/setups';
import { Bar, FEES, minuteKey, simulateAll } from '../strategy/simulate';
import { selectSystem } from '../strategy/odds';
import { maxDrawdown, meanCi, mulberry32, summarize } from '../strategy/stats';
import type { TradeRow } from '../strategy/report.types';

const DIR = process.argv[2];
const SYM = (process.argv[3] || 'BTC').toUpperCase();
const arg = (k: string) =>
  process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const only = arg('only')?.split(',');
const holdout = arg('holdout')?.split(',') ?? [];
const placebo = arg('placebo');
const CUTOFF = Date.UTC(2023, 0, 1);
const DAY = 86_400_000;
const API = 'https://data-api.binance.vision/api/v3/klines';
const START = Date.UTC(2018, 0, 1);
const INTERVAL: Record<number, string> = {
  1: '1m',
  15: '15m',
  60: '1h',
  240: '4h',
  1440: '1d',
};
const base: Variant = { ...MAIN, learn: false };

const VARIANTS: Variant[] = [
  { ...base, id: 'base15', label: 'База 15m' },
  // 1. Комиссия: стоп не тоньше
  { ...base, id: 'minstop.5', label: 'Стоп ≥ 0,5 %', minStopPct: 0.005 },
  { ...base, id: 'minstop1', label: 'Стоп ≥ 1 %', minStopPct: 0.01 },
  { ...base, id: 'minstop1.5', label: 'Стоп ≥ 1,5 %', minStopPct: 0.015 },
  // 2. Старший ТФ
  { ...base, id: 'h1', label: '1H', tf: 60 },
  { ...base, id: 'h1-7d', label: '1H, срок 7 д', tf: 60, holdMs: 7 * DAY },
  { ...base, id: 'h4', label: '4H', tf: 240 },
  { ...base, id: 'h4-14d', label: '4H, срок 14 д', tf: 240, holdMs: 14 * DAY },
  // 3. Режим рынка
  { ...base, id: 'reg15', label: '15m, MA200', regime: true },
  { ...base, id: 'reg1h', label: '1H, MA200', tf: 60, regime: true },
  {
    ...base,
    id: 'reg4h',
    label: '4H, MA200, 14 д',
    tf: 240,
    regime: true,
    holdMs: 14 * DAY,
  },
  // 4. Запас к стопу
  { ...base, id: 'buf.25', label: '15m, запас 0,25 ATR', stopBufAtr: 0.25 },
  { ...base, id: 'buf.5', label: '15m, запас 0,5 ATR', stopBufAtr: 0.5 },
  {
    ...base,
    id: 'h1buf.25',
    label: '1H, запас 0,25 ATR',
    tf: 60,
    stopBufAtr: 0.25,
  },
  {
    ...base,
    id: 'h1buf.5',
    label: '1H, запас 0,5 ATR',
    tf: 60,
    stopBufAtr: 0.5,
  },
  // 5. Вход по рынку
  { ...base, id: 'mkt15', label: '15m, рынок', market: true },
  { ...base, id: 'mkt1h', label: '1H, рынок', tf: 60, market: true },
  {
    ...base,
    id: 'mkt4h',
    label: '4H, рынок, 14 д',
    tf: 240,
    market: true,
    holdMs: 14 * DAY,
  },
];

// Сочетания второго раунда.
VARIANTS.push(
  {
    ...base,
    id: 'c1',
    label: '15m MA200 запас.5',
    regime: true,
    stopBufAtr: 0.5,
  },
  {
    ...base,
    id: 'c2',
    label: '15m MA200 зап.5 ст.5%',
    regime: true,
    stopBufAtr: 0.5,
    minStopPct: 0.005,
  },
  {
    ...base,
    id: 'c3',
    label: '15m MA200 стоп.5%',
    regime: true,
    minStopPct: 0.005,
  },
  {
    ...base,
    id: 'c4',
    label: '1H MA200 запас.5',
    tf: 60,
    regime: true,
    stopBufAtr: 0.5,
  },
  {
    ...base,
    id: 'c5',
    label: '1H MA200 свип+FVG',
    tf: 60,
    regime: true,
    bos: false,
  },
  {
    ...base,
    id: 'c6',
    label: '1H MA200 свип',
    tf: 60,
    regime: true,
    bos: false,
    fvg: false,
  },
  { ...base, id: 'c7', label: '4H свип+FVG', tf: 240, bos: false },
  { ...base, id: 'c8', label: '4H свип', tf: 240, bos: false, fvg: false },
  {
    ...base,
    id: 'c9',
    label: '4H MA200 свип+FVG',
    tf: 240,
    regime: true,
    bos: false,
  },
  {
    ...base,
    id: 'c10',
    label: '4H MA200 свип',
    tf: 240,
    regime: true,
    bos: false,
    fvg: false,
  },
  {
    ...base,
    id: 'c11',
    label: '15m MA200 FVG зап.5',
    regime: true,
    bos: false,
    stopBufAtr: 0.5,
  },
  {
    ...base,
    id: 'c12',
    label: '4H MA200 без контекста',
    tf: 240,
    regime: true,
    context: false,
  },
  {
    ...base,
    id: 'c13',
    label: '1H MA200 без контекста',
    tf: 60,
    regime: true,
    context: false,
  },
  {
    ...base,
    id: 'c14',
    label: '4H FVG запас.25',
    tf: 240,
    bos: false,
    stopBufAtr: 0.25,
  },
);

const pairOf = () => `${SYM}USDT`;
async function klines(
  tf: number,
  from: number,
  to: number,
): Promise<CandleRow[]> {
  const url = `${API}?symbol=${pairOf()}&interval=${INTERVAL[tf]}&startTime=${from}&endTime=${to}&limit=1000`;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const rows = (await res.json()) as unknown[][];
        return rows.map((r) => ({
          time: Number(r[0]),
          open: +(r[1] as string),
          high: +(r[2] as string),
          low: +(r[3] as string),
          close: +(r[4] as string),
        }));
      }
      if (attempt > 6) throw new Error(`${res.status} ${url}`);
    } catch (e) {
      if (attempt > 6) throw e;
    }
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
}

async function history(tf: number): Promise<CandleRow[]> {
  const file = path.join(DIR, `${SYM.toLowerCase()}-${tf}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const step = tf * 60_000;
  const now = Date.now();
  const rows: CandleRow[] = [];
  for (let from = START; from < now; ) {
    const page = await klines(tf, from, now);
    if (!page.length) break;
    for (const r of page) if ((r.time as number) + step <= now) rows.push(r);
    from = (page[page.length - 1].time as number) + step;
  }
  fs.writeFileSync(file, JSON.stringify(rows));
  return rows;
}

const cacheFile = path.join(DIR, `minutes-${SYM.toLowerCase()}.json`);
const cache = new Map<string, Bar[]>(
  fs.existsSync(cacheFile)
    ? JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
    : [],
);
let fetched = 0;
async function minutes(
  ranges: [number, number][],
): Promise<Map<string, Bar[]>> {
  const out = new Map<string, Bar[]>();
  const queue = [...ranges];
  const worker = async () => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      const [from, to] = r;
      const rows = await klines(1, from, to - 1);
      fetched++;
      out.set(
        minuteKey(from, to),
        rows.map((x) => ({
          t0: x.time as number,
          t1: (x.time as number) + 60_000,
          o: x.open,
          h: x.high,
          l: x.low,
          c: x.close,
        })),
      );
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return out;
}

function line(
  id: string,
  label: string,
  ts: TradeRow[],
  extraCols = '',
): string {
  const rs = ts.map((t) => t.rNet);
  const s = summarize(rs);
  const g = summarize(ts.map((t) => t.rGross));
  const ci = rs.length > 1 ? meanCi(rs) : { lo: NaN, hi: NaN };
  const longs = ts.filter((t) => t.dir === 1).length;
  const p = (x: number) => (x * 100).toFixed(1).padStart(5);
  const r = (x: number) => (x >= 0 ? '+' : '') + x.toFixed(3);
  return `${id.padEnd(14)} ${label.padEnd(22)} n=${String(s.n).padStart(4)} long=${p(ts.length ? longs / ts.length : 0)} wr=${p(s.winrate)} be=${p(s.breakeven)} E=${r(s.expectancy)} gross=${r(g.expectancy)} ci=[${r(ci.lo)};${r(ci.hi)}] sum=${s.sumR.toFixed(1).padStart(7)} dd1=${p(maxDrawdown(rs, 0.01))}${extraCols}`;
}

(async () => {
  const need15 = VARIANTS.some(
    (v) => (!only || only.includes(v.id)) && v.tf === 15,
  );
  const [m15, h1, h4, d1] = await Promise.all(
    [15, 60, 240, 1440].map(async (tf) =>
      tf === 15 && !need15 ? null : toSeries(tf, await history(tf)),
    ),
  );
  const trend4h = structure(h4);
  const trendD = structure(d1);
  const regD = maRegime(d1);
  const ctxCache = new Map<number, { s: Series; ctx: SetupContext }>();
  const prep = (tf: number) => {
    const hit = ctxCache.get(tf);
    if (hit) return hit;
    const s = tf === 15 ? m15 : tf === 60 ? h1 : h4;
    const a = atr(s);
    const ctx: SetupContext = {
      atr: a,
      scan: scanLevels(s, a, swings(s)),
      htf:
        tf === 15 ? alignToClose(s, h4, trend4h) : alignToClose(s, d1, trendD),
      daily: alignToClose(s, d1, trendD),
      regime: alignToClose(s, d1, regD),
    };
    const v = { s, ctx };
    ctxCache.set(tf, v);
    return v;
  };

  const run = async (v: Variant, setups?: Setup[]) => {
    const { s, ctx } = prep(v.tf);
    const list = setups ?? findSetups(s, ctx, v);
    const resolved = await simulateAll(s, list, minutes, cache);
    const all: TradeRow[] = [];
    for (const r of resolved) {
      if (r.result.status !== 'filled') continue;
      const f = r.result;
      const st = r.setup;
      all.push({
        id: st.id,
        dir: st.dir,
        confirmMs: closeMs(s, st.e),
        fillMs: f.fillMs,
        exitMs: f.exitMs,
        rNet: f.rNet,
        rGross: f.rGross,
        features: st.features,
        filled: f.filled,
        takesHit: f.takesHit,
        outcome: f.outcome,
        entries: st.entries,
        stop: st.stop,
      } as unknown as TradeRow);
    }
    return {
      setups: list.length,
      all,
      system: v.odds ? selectSystem(all, all).system : all,
    };
  };

  for (const v of VARIANTS) {
    if (only && !only.includes(v.id)) continue;
    const r = await run(v);
    const dev = r.system.filter((t) => t.confirmMs < CUTOFF);
    console.log(line(v.id, v.label, dev));
    if (holdout.includes(v.id)) {
      fs.writeFileSync(
        path.join(DIR, `trades-${SYM.toLowerCase()}-${v.id}.json`),
        JSON.stringify(r.system),
      );
      const test = r.system.filter((t) => t.confirmMs >= CUTOFF);
      console.log(line('  после 2023', '', test));
      const years = new Map<number, number[]>();
      for (const t of r.system) {
        const y = new Date(t.exitMs).getUTCFullYear();
        years.set(y, [...(years.get(y) ?? []), t.rNet]);
      }
      console.log(
        '  годы: ' +
          [...years.entries()]
            .map(
              ([y, a]) =>
                `${y}:${a.length}/${a.reduce((x, b) => x + b, 0).toFixed(1)}R`,
            )
            .join(' '),
      );
      for (const d of [1, -1]) {
        const side = r.system.filter((t) => t.dir === d);
        console.log(line(d === 1 ? '  лонги' : '  шорты', '', side));
      }
    }
    fs.writeFileSync(cacheFile, JSON.stringify([...cache.entries()]));
  }

  if (placebo) {
    // Контроль: те же сторона, режим и геометрия, но время входа случайное. Если
    // случайный вход зарабатывает столько же, это рост рынка, а не сигнал стратегии.
    const v = VARIANTS.find((x) => x.id === placebo);
    const real = await run(v);
    const { s } = prep(v.tf);
    const realSetups = findSetups(s, prep(v.tf).ctx, v).filter((st) =>
      real.system.some((t) => t.id === st.id),
    );
    const es: number[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const rnd = mulberry32(seed * 7919);
      const list: Setup[] = realSetups.map((st, n) => {
        const e = 300 + Math.floor(rnd() * (s.n - 400));
        const entry = s.c[e];
        const frac =
          (st.dir * (st.entries[0] - st.stop)) / Math.abs(st.entries[0]);
        const h = frac * entry;
        const scale = (x: number) =>
          entry +
          st.dir *
            ((st.dir * (x - st.entries[0])) /
              (st.dir * (st.entries[0] - st.stop))) *
            h;
        return {
          ...st,
          id: `${st.id}:p${seed}:${n}`,
          e,
          entries: st.entries.map(scale),
          stop: entry - st.dir * h,
          target: scale(st.target),
          takes: st.takes.map(scale),
          market: true,
        };
      });
      const r = await run({ ...v, odds: false }, list);
      const rs = r.all.map((t) => t.rNet);
      es.push(summarize(rs).expectancy);
      fs.writeFileSync(cacheFile, JSON.stringify([...cache.entries()]));
    }
    es.sort((a, b) => a - b);
    const realE = summarize(real.system.map((t) => t.rNet)).expectancy;
    console.log(
      `плацебо ${placebo}: реальный E=${realE.toFixed(3)}; случайный вход: медиана ${es[10].toFixed(3)}, мин ${es[0].toFixed(3)}, макс ${es[19].toFixed(3)}; выше реального ${es.filter((x) => x >= realE).length}/20`,
    );
  }
  fs.writeFileSync(cacheFile, JSON.stringify([...cache.entries()]));
  console.log(
    `минуток загружено ${fetched}; комиссии ${FEES.maker}/${FEES.taker}`,
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
