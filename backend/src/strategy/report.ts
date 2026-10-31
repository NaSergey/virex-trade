import type {
  Dir,
  LearningBlock,
  MainStats,
  SideRow,
  StrategyReport,
  SystemBlock,
  TradeRow,
  YearRow,
} from './report.types';
import {
  alignToClose,
  atr,
  closeMs,
  lowerBound,
  Series,
  structure,
  swings,
} from './series';
import { scanLevels } from './events';
import { findSetups, Setup, SetupContext } from './setups';
import { Bar, FetchMinutes, Filled, simulateAll } from './simulate';
import { authorCheck } from './author-check';
import {
  effectOf,
  kept,
  LEARN_FROM_MS,
  learnRules,
  LearnTrade,
  nextQuarter,
  quarterKey,
  quarterStart,
  rulesAt,
  topMistakes,
  walkForward,
} from './learning';
import { selectSystem } from './odds';
import { plainNotional, withTheory, withoutTheory } from './money';
import { theoryOf } from './theory';
import { maxDrawdown, summarize } from './stats';

/** Поднимать при любой правке правил, обучения или формы отчёта. */
export const STRATEGY_VERSION = 7;
export const REPORT_ID = 'smc-intraday';
/** Сделки и статистика отчёта — за столько последних лет (решение владельца). */
export const STATS_YEARS = 2;

export interface ReportInput {
  m15: Series;
  h1: Series;
  h4: Series;
  d1: Series;
  nowMs: number;
}

const pause = () => new Promise<void>((resolve) => setImmediate(resolve));

interface Prepared {
  s: Series;
  ctx: SetupContext;
}

function prepare(
  s: Series,
  htf: Series,
  d1: Series,
  trendHtf: Int8Array,
  trendD: Int8Array,
): Prepared {
  const a = atr(s);
  return {
    s,
    ctx: {
      atr: a,
      scan: scanLevels(s, a, swings(s)),
      htf: alignToClose(s, htf, trendHtf),
      daily: alignToClose(s, d1, trendD),
    },
  };
}

/** Риск сделки в долях цены: средняя дистанция уровней входа до стопа к средней цене уровней. */
export function stopPctOf(t: Pick<TradeRow, 'entries' | 'stop'>): number {
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return (
    mean(t.entries.map((e) => Math.abs(e - t.stop))) /
    mean(t.entries.map(Math.abs))
  );
}

/** Макс. ход цены от среднего входа за сделку, доли: в прибыль и против. */
export function excursions(
  s: Series,
  dir: Dir,
  avg: number,
  fillMs: number,
  exitMs: number,
): { maxUp: number; maxDown: number } {
  let up = 0;
  let down = 0;
  const to = lowerBound(s.t, exitMs);
  for (let k = lowerBound(s.t, fillMs); k < to; k++) {
    up = Math.max(up, dir === 1 ? s.h[k] - avg : avg - s.l[k]);
    down = Math.max(down, dir === 1 ? avg - s.l[k] : s.h[k] - avg);
  }
  return { maxUp: up / Math.abs(avg), maxDown: down / Math.abs(avg) };
}

function toRow(s: Series, st: Setup, f: Filled): TradeRow {
  return {
    id: st.id,
    dir: st.dir,
    tf: s.tf,
    sweepMs: s.t[st.sweepI],
    obMs: s.t[st.obI],
    fvgMs: st.fvgI >= 0 ? s.t[st.fvgI] : null,
    bosMs: st.bosI >= 0 ? s.t[st.bosI] : null,
    confirmMs: closeMs(s, st.e),
    level: st.level,
    blockTop: st.blockTop,
    entries: st.entries,
    filled: f.filled,
    avgEntry: f.avgEntry,
    stop: st.stop,
    finalStop: f.finalStop,
    target: st.target,
    takes: st.takes,
    takesHit: f.takesHit,
    plannedR: st.plannedR,
    fillMs: f.fillMs,
    exitMs: f.exitMs,
    exit: f.exit,
    ...excursions(s, st.dir, f.avgEntry, f.fillMs, f.exitMs),
    outcome: f.outcome,
    rGross: f.rGross,
    rNet: f.rNet,
    features: st.features,
    odds: null,
  };
}

function systemOf(trades: TradeRow[]): SystemBlock {
  const rs = trades.map((t) => t.rNet);
  let cum = 0;
  return {
    summary: summarize(rs),
    maxDd1: maxDrawdown(rs, 0.01),
    equity: trades.map((t) => ({ ms: t.exitMs, r: (cum += t.rNet) })),
  };
}

function byYear(trades: TradeRow[]): YearRow[] {
  const map = new Map<number, number[]>();
  for (const t of trades) {
    const y = new Date(t.fillMs).getUTCFullYear();
    const list = map.get(y) ?? [];
    list.push(t.rNet);
    map.set(y, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, rs]) => ({ year, summary: summarize(rs) }));
}

const toLearn = (trades: TradeRow[]): LearnTrade[] =>
  trades.map((t) => ({
    id: t.id,
    fillMs: t.fillMs,
    exitMs: t.exitMs,
    rNet: t.rNet,
    features: t.features,
  }));

function statsFrom(nowMs: number): number {
  const d = new Date(nowMs);
  d.setUTCFullYear(d.getUTCFullYear() - STATS_YEARS);
  return d.getTime();
}

function sideOf(trades: TradeRow[]): SideRow {
  const rs = trades.map((t) => t.rNet);
  return {
    summary: summarize(rs),
    grossExpectancy: summarize(trades.map((t) => t.rGross)).expectancy,
    maxDd1: maxDrawdown(rs, 0.01),
  };
}

async function runStrategy(
  m15: Series,
  p: Prepared,
  fetch: FetchMinutes,
  fromMs: number,
) {
  const setups = findSetups(m15, p.s, p.ctx);
  const resolved = await simulateAll(
    m15,
    setups,
    fetch,
    new Map<string, Bar[]>(),
  );
  const all: TradeRow[] = [];
  const counts = { setups: 0, missed: 0, expired: 0 };
  for (const r of resolved) {
    const inWindow = closeMs(m15, r.setup.e) >= fromMs;
    if (inWindow) counts.setups++;
    if (r.result.status === 'filled') all.push(toRow(m15, r.setup, r.result));
    else if (inWindow && r.result.status === 'missed') counts.missed++;
    else if (inWindow && r.result.status === 'expired') counts.expired++;
  }
  // Сделки и квота — за окно, а оценка вероятности видит всю историю.
  const filled = all.filter((t) => t.confirmMs >= fromMs);
  const odds = selectSystem(filled, all);
  const stats: MainStats = {
    ...counts,
    filled: filled.length,
    ...sideOf(odds.system),
  };
  return { all, odds, stats };
}

function learningOf(filled: TradeRow[], nowMs: number): LearningBlock {
  const all = toLearn(filled);
  const quarters = walkForward(all, LEARN_FROM_MS, nowMs);
  // Правила решают на выставлении сетки (confirmMs), а не на исполнении:
  // сетка, выставленная в конце квартала, живёт по правилам того квартала.
  const forward = filled.filter((t) => t.confirmMs >= LEARN_FROM_MS);
  const isKept = (t: TradeRow) => kept(t, rulesAt(quarters, t.confirmMs) ?? []);
  const learned = forward.filter(isKept);
  const excluded = forward.filter((t) => !isKept(t)).map((t) => t.rNet);
  return {
    fromMs: LEARN_FROM_MS,
    quarters: quarters.map((q) => {
      const inQ = forward.filter(
        (t) => t.confirmMs >= q.startMs && t.confirmMs < q.endMs,
      );
      return {
        key: q.key,
        rules: q.rules,
        added: q.added,
        removed: q.removed,
        trainN: q.trainN,
        trades: inQ.length,
        excluded: inQ.filter((t) => !kept(t, q.rules)).length,
      };
    }),
    base: systemOf(selectSystem(forward, filled).system),
    learned: systemOf(selectSystem(learned, filled).system),
    effect: effectOf(excluded),
    mistakes: topMistakes(all),
    next: {
      key: quarterKey(nextQuarter(quarterStart(nowMs))),
      rules: learnRules(all.filter((t) => t.exitMs < nowMs)),
    },
  };
}

/**
 * Отчёт целиком. Между этапами — `yieldFn`: расчёт идёт в `worker`, который
 * держит сокеты терминалов, и один блок на секунды им вреден.
 */
export async function buildReport(
  input: ReportInput,
  fetch: FetchMinutes,
  yieldFn: () => Promise<void> = pause,
): Promise<StrategyReport> {
  const { m15, h1, h4, d1, nowMs } = input;
  const trend4h = structure(h4);
  const trendD = structure(d1);
  const p60 = prepare(h1, h4, d1, trend4h, trendD);
  await yieldFn();

  const fromMs = Math.max(statsFrom(nowMs), m15.t[0]);
  const main = await runStrategy(m15, p60, fetch, fromMs);
  await yieldFn();
  const system = main.odds.system;

  const author = authorCheck(h1, p60.ctx.atr, p60.ctx.scan);
  await yieldFn();
  const learning = learningOf(main.all, nowMs);
  await yieldFn();
  const mt = system.map((t) => ({ rNet: t.rNet, stopPct: stopPctOf(t) }));
  const notional = plainNotional(mt);
  const money = {
    theory: withTheory(mt),
    plain: withoutTheory(mt, notional),
    plainNotional: notional,
  };
  const theory = theoryOf(
    system.map((t) => ({
      rGross: t.rGross,
      rNet: t.rNet,
      stopPct: stopPctOf(t),
    })),
  );

  return {
    version: STRATEGY_VERSION,
    computedAt: new Date(nowMs).toISOString(),
    dataFrom: fromMs,
    dataTo: closeMs(m15, m15.n - 1),
    main: {
      stats: main.stats,
      sides: {
        all: sideOf(system),
        long: sideOf(system.filter((t) => t.dir === 1)),
        short: sideOf(system.filter((t) => t.dir === -1)),
      },
      equity: systemOf(system).equity,
      byYear: byYear(system),
      trades: system,
      money,
    },
    odds: main.odds.block,
    author,
    learning,
    theory,
  };
}
