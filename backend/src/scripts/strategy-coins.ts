/*
 * Стратегия на других монетах: тот же код, что считает отчёт, свечи — Binance (кэш в каталоге).
 * Из него снимок `views/strategy/model/check.ts`. Запуск из backend/:
 * TS_NODE_TRANSPILE_ONLY=1 node -r ts-node/register src/scripts/strategy-coins.ts <каталог> BTC ETH XRP SOL BNB
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  alignToClose,
  atr,
  CandleRow,
  closeMs,
  structure,
  swings,
  toSeries,
} from '../strategy/series';
import { scanLevels } from '../strategy/events';
import { findSetups } from '../strategy/setups';
import { Bar, minuteKey, simulateAll } from '../strategy/simulate';
import { selectSystem } from '../strategy/odds';
import { summarize } from '../strategy/stats';
import type { TradeRow } from '../strategy/report.types';

const API = 'https://data-api.binance.vision/api/v3/klines';
const INTERVAL: Record<number, string> = {
  1: '1m',
  15: '15m',
  60: '1h',
  240: '4h',
  1440: '1d',
};
const START = Date.UTC(2018, 0, 1);
const [DIR, ...COINS] = process.argv.slice(2);

async function klines(
  coin: string,
  tf: number,
  from: number,
  to: number,
): Promise<CandleRow[]> {
  const url = `${API}?symbol=${coin}USDT&interval=${INTERVAL[tf]}&startTime=${from}&endTime=${to}&limit=1000`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (res.ok) {
      const rows = (await res.json()) as unknown[][];
      return rows.map((r) => ({
        time: Number(r[0]),
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
      }));
    }
    if (attempt > 6) throw new Error(`${res.status} ${url}`);
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
}

async function history(coin: string, tf: number): Promise<CandleRow[]> {
  const file = path.join(DIR, `${coin.toLowerCase()}-${tf}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const step = tf * 60_000;
  const now = Date.now();
  const rows: CandleRow[] = [];
  for (let from = START; from < now; ) {
    const page = await klines(coin, tf, from, now);
    if (!page.length) break;
    for (const r of page) if ((r.time as number) + step <= now) rows.push(r);
    from = (page[page.length - 1].time as number) + step;
  }
  fs.writeFileSync(file, JSON.stringify(rows));
  return rows;
}

const line = (name: string, ts: TradeRow[]) => {
  const s = summarize(ts.map((t) => t.rNet));
  const pct = (s.winrate * 100).toFixed(1);
  return `${name}: ${s.n} сделок, винрейт ${pct} %, ${s.expectancy.toFixed(3)}R, итог ${s.sumR.toFixed(1)}R`;
};

async function run(coin: string) {
  const [m15, h1, h4, d1] = await Promise.all(
    [15, 60, 240, 1440].map(async (tf) =>
      toSeries(tf, await history(coin, tf)),
    ),
  );
  const a = atr(h1);
  const ctx = {
    atr: a,
    scan: scanLevels(h1, a, swings(h1)),
    htf: alignToClose(h1, h4, structure(h4)),
    daily: alignToClose(h1, d1, structure(d1)),
    h4,
    atr4: atr(h4),
  };
  const cache = new Map<string, Bar[]>();
  const resolved = await simulateAll(
    m15,
    findSetups(m15, h1, ctx),
    async (ranges) => {
      const out = new Map<string, Bar[]>();
      for (const [from, to] of ranges) {
        const rows = await klines(coin, 1, from, to - 1);
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
      return out;
    },
    cache,
  );
  const all: TradeRow[] = [];
  for (const r of resolved) {
    if (r.result.status !== 'filled') continue;
    all.push({
      ...r.result,
      id: r.setup.id,
      dir: r.setup.dir,
      confirmMs: closeMs(m15, r.setup.e),
      features: r.setup.features,
    } as unknown as TradeRow);
  }
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 2);
  const from = d.getTime();
  const before = all.filter((t) => t.confirmMs < from);
  const recent = all.filter((t) => t.confirmMs >= from);
  const a2 = selectSystem(recent, all).system;
  const b2 = selectSystem(before, all).system;
  console.log(coin);
  console.log('  ' + line('2 года', a2));
  console.log('  ' + line('вся история', [...b2, ...a2]));
}

void (async () => {
  for (const coin of COINS) await run(coin);
})();
