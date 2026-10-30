import type { TheoryBlock } from './report.types';
import {
  maxDrawdown,
  maxLossStreak,
  mulberry32,
  summarize,
  thin,
} from './stats';

export interface TheoryTrade {
  rGross: number;
  rNet: number;
  /** Стоп сделки, доля цены входа. */
  stopPct: number;
}

const SIMS = 1000;
const RUIN_TRADES = 300;
const RISKS = [0.005, 0.01, 0.02, 0.05];
const MAX_POINTS = 200;
const KEEP_FIRST = 120;

function cumulative(rs: number[]): number[] {
  let s = 0;
  return rs.map((r) => (s += r));
}

/**
 * Принципы видео 2 на сделках стратегии: мат ожидание, безубыточный винрейт,
 * сходимость среднего, разброс перестановками, объём позиции, риск разорения,
 * асимметрия убытков. Перестановки — с возвращением, зерно фиксировано.
 */
export function theoryOf(trades: TheoryTrade[], seed = 20261030): TheoryBlock {
  const net = trades.map((t) => t.rNet);
  const sNet = summarize(net);
  const sGross = summarize(trades.map((t) => t.rGross));
  const n = net.length;
  const rnd = mulberry32(seed);
  const sample = (len: number) =>
    Array.from({ length: len }, () => net[Math.floor(rnd() * n)]);

  const sims = n ? Array.from({ length: SIMS }, () => sample(n)) : [];
  const order = sims
    .map((p, i) => ({ i, sum: p.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => a.sum - b.sum);
  const pick = (q: number) =>
    sims[order[Math.min(order.length - 1, Math.floor(q * order.length))].i];
  const maxStreak = maxLossStreak(net);
  const paths = n
    ? [
        { label: '5-й процентиль', points: thin(cumulative(pick(0.05))) },
        { label: 'Медиана', points: thin(cumulative(pick(0.5))) },
        { label: '95-й процентиль', points: thin(cumulative(pick(0.95))) },
      ]
    : [];
  const pStreak = sims.length
    ? sims.filter((p) => maxLossStreak(p) >= maxStreak).length / sims.length
    : 0;

  const ruin = RISKS.map((risk) => {
    if (!n) return { risk, p: 0 };
    let ruined = 0;
    for (let k = 0; k < SIMS; k++) {
      if (maxDrawdown(sample(RUIN_TRADES), risk) >= 0.5) ruined++;
    }
    return { risk, p: ruined / SIMS };
  });

  const cum = cumulative(net);
  const stride = Math.max(1, Math.ceil(n / MAX_POINTS));
  const running = cum
    .map((s, i) => ({ n: i + 1, mean: s / (i + 1) }))
    .filter((_, i) => i < KEEP_FIRST || i % stride === 0 || i === n - 1);

  const stops = trades.map((t) => t.stopPct).sort((a, b) => a - b);
  const stopPct = stops.length ? stops[Math.floor(stops.length / 2)] : 0;
  const maxDd1 = maxDrawdown(net, 0.01);

  return {
    expectancy: {
      winrate: sNet.winrate,
      avgWin: sNet.avgWin,
      avgLoss: sNet.avgLoss,
      gross: sGross.expectancy,
      net: sNet.expectancy,
    },
    breakeven: {
      table: [1, 2, 3, 4].map((r) => ({ r, winrate: 1 / (1 + r) })),
      avgWin: sNet.avgWin,
      winrate: sNet.winrate,
      needed: sNet.breakeven,
    },
    running,
    variance: { paths, maxStreak, pStreak, sims: SIMS },
    sizing: {
      account: 1000,
      riskPct: 0.005,
      riskUsd: 5,
      stopPct,
      position: stopPct > 0 ? 5 / stopPct : 0,
      streak20: [0.01, 0.05].map((risk) => ({
        risk,
        loss: 1 - (1 - risk) ** 20,
      })),
    },
    ruin: { trades: RUIN_TRADES, sims: SIMS, rows: ruin },
    asymmetry: {
      table: [0.1, 0.3, 0.5].map((loss) => ({ loss, need: loss / (1 - loss) })),
      maxDd1,
      need: maxDd1 < 1 ? maxDd1 / (1 - maxDd1) : null,
    },
  };
}
