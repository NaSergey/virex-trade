import type {
  LearningBlock,
  StrategyReport,
  SystemBlock,
  TradeRow,
  VariantRow,
  YearRow,
} from './report.types';
import {
  alignToClose,
  atr,
  closeMs,
  Series,
  structure,
  swings,
} from './series';
import { scanLevels } from './events';
import {
  findSetups,
  MAIN,
  Setup,
  SetupContext,
  Variant,
  VARIANTS,
} from './setups';
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
import { theoryOf } from './theory';
import { maxDrawdown, summarize } from './stats';

/** Поднимать при любой правке правил, обучения или формы отчёта. */
export const STRATEGY_VERSION = 1;
export const REPORT_ID = 'smc-intraday';

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

/** Одна позиция за раз: сетап, чей вход приходится на открытую позицию, пропускается. */
export function sequential<T extends { fillMs: number; exitMs: number }>(
  trades: T[],
): T[] {
  const sorted = [...trades].sort((a, b) => a.fillMs - b.fillMs);
  const out: T[] = [];
  let freeAt = -Infinity;
  for (const t of sorted) {
    if (t.fillMs >= freeAt) {
      out.push(t);
      freeAt = t.exitMs;
    }
  }
  return out;
}

function toRow(p: Prepared, st: Setup, f: Filled): TradeRow {
  const { s } = p;
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
    entry: st.entry,
    stop: st.stop,
    target: st.target,
    plannedR: st.plannedR,
    fillMs: f.fillMs,
    fill: f.fill,
    exitMs: f.exitMs,
    exit: f.exit,
    outcome: f.outcome,
    rGross: f.rGross,
    rNet: f.rNet,
    features: st.features,
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

async function runVariant(
  v: Variant,
  p: Prepared,
  fetch: FetchMinutes,
  cache: Map<string, Bar[]>,
) {
  const setups = findSetups(p.s, p.ctx, v);
  const resolved = await simulateAll(p.s, setups, fetch, cache);
  const filled: TradeRow[] = [];
  let missed = 0;
  let expired = 0;
  for (const r of resolved) {
    if (r.result.status === 'filled') filled.push(toRow(p, r.setup, r.result));
    else if (r.result.status === 'missed') missed++;
    else if (r.result.status === 'expired') expired++;
  }
  const system = sequential(filled);
  const sys = systemOf(system);
  const row: VariantRow = {
    id: v.id,
    label: v.label,
    setups: setups.length,
    filled: filled.length,
    missed,
    expired,
    summary: sys.summary,
    grossExpectancy: summarize(system.map((t) => t.rGross)).expectancy,
    maxDd1: sys.maxDd1,
  };
  return { v, row, filled, system, sys };
}

function learningOf(filled: TradeRow[], nowMs: number): LearningBlock {
  const all: LearnTrade[] = filled.map((t) => ({
    id: t.id,
    fillMs: t.fillMs,
    exitMs: t.exitMs,
    rNet: t.rNet,
    features: t.features,
  }));
  const quarters = walkForward(all, LEARN_FROM_MS, nowMs);
  // Правила решают на выставлении лимита (confirmMs), а не на исполнении:
  // лимит, выставленный в конце квартала, живёт по правилам того квартала.
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
    base: systemOf(sequential(forward)),
    learned: systemOf(sequential(learned)),
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
  const p15 = prepare(m15, h4, d1, trend4h, trendD);
  await yieldFn();
  const p60 = prepare(h1, d1, d1, trendD, trendD);
  await yieldFn();

  const cache = new Map<string, Bar[]>();
  const runs = [];
  for (const v of VARIANTS) {
    runs.push(await runVariant(v, v.tf === 60 ? p60 : p15, fetch, cache));
    await yieldFn();
  }
  const main = runs.find((r) => r.v.id === MAIN.id);

  const author = authorCheck(h1, p60.ctx.atr, p60.ctx.scan);
  await yieldFn();
  const learning = learningOf(main.filled, nowMs);
  await yieldFn();
  const theory = theoryOf(
    main.system.map((t) => ({
      rGross: t.rGross,
      rNet: t.rNet,
      stopPct: Math.abs(t.entry - t.stop) / t.entry,
    })),
  );

  return {
    version: STRATEGY_VERSION,
    computedAt: new Date(nowMs).toISOString(),
    dataFrom: m15.t[0],
    dataTo: closeMs(m15, m15.n - 1),
    variants: runs.map((r) => r.row),
    main: {
      variant: main.row,
      equity: main.sys.equity,
      byYear: byYear(main.system),
      trades: main.system,
    },
    author,
    learning,
    theory,
  };
}
