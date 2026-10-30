import type { Dir, Outcome } from './report.types';
import { closeMs, Series } from './series';
import type { Setup } from './setups';

export interface Bar {
  t0: number;
  t1: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

/** Минутки свечи [from, to); null — ещё не загружены. */
export type Minutes = (from: number, to: number) => Bar[] | null;

export interface Fees {
  maker: number;
  taker: number;
}

/** Bybit, бессрочные USDT: лимит — мейкер, стоп и рынок — тейкер. */
export const FEES: Fees = { maker: 0.0002, taker: 0.00055 };
/** Сколько свечей живёт лимит на вход. */
export const LIMIT_LIFE = 48;
/** Автор торгует внутри дня и срок не называет — выход по закрытию через 3 суток. */
export const MAX_HOLD_MS = 3 * 86_400_000;

export const minuteKey = (from: number, to: number): string => `${from}-${to}`;

export interface Filled {
  status: 'filled';
  fillMs: number;
  fill: number;
  exitMs: number;
  exit: number;
  outcome: Outcome;
  rGross: number;
  rNet: number;
}

/** missed — цель раньше входа; expired — лимит истёк; open — данные кончились посреди сделки. */
export type Final = Filled | { status: 'missed' | 'expired' | 'open' };
export type Result = Final | { status: 'needs'; from: number; to: number };

interface State {
  open: boolean;
  fillMs: number;
  fill: number;
}
interface Exit {
  price: number;
  ms: number;
  outcome: Outcome;
}
type Step = 'continue' | 'missed' | 'ambiguous' | Exit;

/** Свеча в «лонговых» координатах: шорт — те же правила на перевёрнутых ценах. */
const asLong = (b: Bar, d: Dir): Bar =>
  d === 1 ? b : { t0: b.t0, t1: b.t1, o: -b.o, h: -b.l, l: -b.h, c: -b.c };

/**
 * Одна свеча для лонга. На минутке спорный порядок решается худшим исходом:
 * вход и цель — сделки не было (а со стопом — убыток), стоп и цель — стоп.
 */
function step(
  st: State,
  b: Bar,
  entry: number,
  stop: number,
  target: number,
  minute: boolean,
): Step {
  if (!st.open) {
    const te = b.l <= entry;
    const tt = b.h >= target;
    const ts = b.l <= stop;
    if (!te) return tt ? 'missed' : 'continue';
    if (tt) {
      if (!minute) return 'ambiguous';
      if (!ts) return 'missed';
    }
    st.open = true;
    st.fill = Math.min(entry, b.o);
    st.fillMs = b.t0;
    if (ts) {
      return { price: Math.min(stop, st.fill), ms: b.t1, outcome: 'stop' };
    }
    return 'continue';
  }
  const ts = b.l <= stop;
  const tt = b.h >= target;
  if (ts && tt && !minute) return 'ambiguous';
  if (ts) return { price: Math.min(stop, b.o), ms: b.t1, outcome: 'stop' };
  if (tt) return { price: Math.max(target, b.o), ms: b.t1, outcome: 'target' };
  if (b.t1 >= st.fillMs + MAX_HOLD_MS) {
    return { price: b.c, ms: b.t1, outcome: 'time' };
  }
  return 'continue';
}

function done(st: State, x: Exit, d: Dir, risk: number, fees: Fees): Filled {
  const rGross = (x.price - st.fill) / risk;
  const fee =
    fees.maker * Math.abs(st.fill) +
    (x.outcome === 'target' ? fees.maker : fees.taker) * Math.abs(x.price);
  return {
    status: 'filled',
    fillMs: st.fillMs,
    fill: d * st.fill,
    exitMs: x.ms,
    exit: d * x.price,
    outcome: x.outcome,
    rGross,
    rNet: rGross - fee / risk,
  };
}

/** Лимит с закрытия свечи `e`, дальше стоп, цель или срок. R — от планового риска. */
export function simulate(
  s: Series,
  st: Setup,
  minutes: Minutes,
  fees: Fees = FEES,
): Result {
  const d = st.dir;
  const entry = d * st.entry;
  const stop = d * st.stop;
  const target = d * st.target;
  const state: State = { open: false, fillMs: 0, fill: 0 };
  for (let k = st.e + 1; k < s.n; k++) {
    if (!state.open && k > st.e + LIMIT_LIFE) return { status: 'expired' };
    const bar = asLong(
      {
        t0: s.t[k],
        t1: closeMs(s, k),
        o: s.o[k],
        h: s.h[k],
        l: s.l[k],
        c: s.c[k],
      },
      d,
    );
    let r = step(state, bar, entry, stop, target, false);
    if (r === 'ambiguous') {
      const mins = minutes(bar.t0, bar.t1);
      if (mins === null) return { status: 'needs', from: bar.t0, to: bar.t1 };
      r = 'continue';
      for (const m of mins) {
        r = step(state, asLong(m, d), entry, stop, target, true);
        if (r !== 'continue') break;
      }
      // Минуток нет (дыра в истории) — свеча целиком как одна минутка.
      if (mins.length === 0) r = step(state, bar, entry, stop, target, true);
    }
    if (r === 'missed') return { status: 'missed' };
    if (typeof r === 'object') return done(state, r, d, entry - stop, fees);
  }
  return { status: state.open ? 'open' : 'expired' };
}

export type FetchMinutes = (
  ranges: [number, number][],
) => Promise<Map<string, Bar[]>>;

export interface Resolved {
  setup: Setup;
  result: Final;
}

const ROUNDS = 5;

/**
 * Прогон всех сетапов. Спорные свечи просят минутки; их подгружают пачкой между
 * проходами, и сделки, которым они были нужны, считаются заново. После
 * `ROUNDS` проходов недостающие минутки считаются пустыми — худший исход.
 */
export async function simulateAll(
  s: Series,
  setups: Setup[],
  fetch: FetchMinutes,
  cache: Map<string, Bar[]>,
  fees: Fees = FEES,
): Promise<Resolved[]> {
  const out = new Map<string, Final>();
  let todo = setups;
  for (let round = 0; todo.length; round++) {
    const last = round >= ROUNDS;
    const lookup: Minutes = (from, to) =>
      cache.get(minuteKey(from, to)) ?? (last ? [] : null);
    const need = new Map<string, [number, number]>();
    const next: Setup[] = [];
    for (const st of todo) {
      const r = simulate(s, st, lookup, fees);
      if (r.status === 'needs') {
        need.set(minuteKey(r.from, r.to), [r.from, r.to]);
        next.push(st);
      } else {
        out.set(st.id, r);
      }
    }
    if (need.size) {
      for (const [k, v] of await fetch([...need.values()])) cache.set(k, v);
    }
    todo = next;
  }
  return setups.map((setup) => ({ setup, result: out.get(setup.id) }));
}
