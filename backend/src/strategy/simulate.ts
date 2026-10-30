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
/** Сколько свечей живёт сетка входа, пока ни один лимит не исполнился. */
export const LIMIT_LIFE = 48;
/** Автор торгует внутри дня и срок не называет — выход по закрытию через 3 суток. */
export const MAX_HOLD_MS = 3 * 86_400_000;

export const minuteKey = (from: number, to: number): string => `${from}-${to}`;

export interface Filled {
  status: 'filled';
  /** Первое исполнение входа. */
  fillMs: number;
  /** Сколько уровней сетки исполнилось. */
  filled: number;
  avgEntry: number;
  exitMs: number;
  /** Цена последнего выхода. */
  exit: number;
  outcome: Outcome;
  takesHit: number;
  finalStop: number;
  rGross: number;
  rNet: number;
}

/** missed — цель раньше входа; expired — лимиты истекли; open — данные кончились посреди сделки. */
export type Final = Filled | { status: 'missed' | 'expired' | 'open' };
export type Result = Final | { status: 'needs'; from: number; to: number };

const EPS = 1e-12;

/** Свеча в «лонговых» координатах: шорт — те же правила на перевёрнутых ценах. */
const asLong = (b: Bar, d: Dir): Bar =>
  d === 1 ? b : { t0: b.t0, t1: b.t1, o: -b.o, h: -b.l, l: -b.h, c: -b.c };

/** План сделки в «лонговых» координатах. */
interface Plan {
  /** Уровни входа по убыванию цены. */
  levels: number[];
  takes: number[];
  stop0: number;
  /** Объём уровня: 1 / число уровней. */
  q: number;
  trail: boolean;
  fees: Fees;
}

/** Позиция по сетке: исполнения входа, тейки, стоп за тейками, деньги и комиссия. */
class Position {
  readonly filled: boolean[];
  fills = 0;
  qty = 0;
  cost = 0;
  cash = 0;
  fee = 0;
  stop: number;
  tp = 0;
  entriesOn = true;
  firstMs = NaN;
  exitMs = NaN;
  exit = NaN;
  outcome: Outcome | null = null;

  constructor(private readonly p: Plan) {
    this.filled = p.levels.map(() => false);
    this.stop = p.stop0;
  }

  get done(): boolean {
    return this.outcome !== null;
  }

  get avg(): number {
    return this.cost / (this.fills * this.p.q);
  }

  touchesEntry(b: Bar): boolean {
    return (
      this.entriesOn &&
      this.p.levels.some((lvl, k) => !this.filled[k] && b.l <= lvl)
    );
  }

  /** Стоп, каким он станет после тейков этой свечи. */
  stopAfterUp(b: Bar): number {
    const { takes, trail } = this.p;
    let stop = this.stop;
    for (let j = this.tp; trail && j < takes.length && b.h >= takes[j]; j++) {
      stop = Math.max(stop, j === 0 ? this.avg : takes[j - 1]);
    }
    return stop;
  }

  /** Вниз: исполнения входа по убыванию цены, затем стоп. */
  down(b: Bar): void {
    if (this.entriesOn) {
      this.p.levels.forEach((lvl, k) => {
        if (!this.filled[k] && b.l <= lvl) {
          this.fill(k, Math.min(lvl, b.o), b.t0);
        }
      });
    }
    if (this.qty > 0 && b.l <= this.stop) {
      const outcome = this.stop === this.p.stop0 ? 'stop' : 'trail';
      this.close(this.qty, Math.min(this.stop, b.o), b.t1, false, outcome);
    }
  }

  /** Вверх: тейки по возрастанию; после каждого — стоп за тейками и снятие входа. */
  up(b: Bar): void {
    const { takes, trail } = this.p;
    while (
      !this.done &&
      this.qty > 0 &&
      this.tp < takes.length &&
      b.h >= takes[this.tp]
    ) {
      const avg = this.avg;
      const share = this.qty / (takes.length - this.tp);
      this.close(share, Math.max(takes[this.tp], b.o), b.t1, true, 'target');
      if (trail) {
        this.stop = Math.max(
          this.stop,
          this.tp === 0 ? avg : takes[this.tp - 1],
        );
        this.entriesOn = false;
      }
      this.tp++;
    }
  }

  timeExit(b: Bar): void {
    if (!this.done && this.qty > 0 && b.t1 >= this.firstMs + MAX_HOLD_MS) {
      this.close(this.qty, b.c, b.t1, false, 'time');
    }
  }

  private fill(k: number, price: number, ms: number): void {
    const { q, fees } = this.p;
    this.filled[k] = true;
    this.fills++;
    this.qty += q;
    this.cost += q * price;
    this.cash -= q * price;
    this.fee += fees.maker * q * Math.abs(price);
    if (Number.isNaN(this.firstMs)) this.firstMs = ms;
  }

  private close(
    x: number,
    price: number,
    ms: number,
    maker: boolean,
    last: Outcome,
  ): void {
    this.qty -= x;
    this.cash += x * price;
    this.fee +=
      (maker ? this.p.fees.maker : this.p.fees.taker) * x * Math.abs(price);
    this.exitMs = ms;
    this.exit = price;
    if (this.qty <= EPS) {
      this.qty = 0;
      this.outcome = last;
    }
  }
}

type Step = 'continue' | 'missed' | 'ambiguous';

/**
 * Одна свеча. Спорная (вниз и вверх) на свече ТФ — 'ambiguous'; на минутке —
 * худший порядок: стоп задет — сначала вниз, иначе тейки, потом откат.
 */
function step(pos: Position, plan: Plan, b: Bar, minute: boolean): Step {
  const { takes } = plan;
  const last = takes[takes.length - 1];
  if (pos.fills === 0) {
    if (!pos.touchesEntry(b)) return b.h >= last ? 'missed' : 'continue';
    if (b.h >= takes[0]) {
      if (!minute) return 'ambiguous';
      if (b.l > pos.stop && b.h >= last) return 'missed';
    }
    pos.down(b);
    return 'continue';
  }
  const up = pos.tp < takes.length && b.h >= takes[pos.tp];
  if (!up) {
    pos.down(b);
  } else if (b.l <= pos.stopAfterUp(b) || pos.touchesEntry(b)) {
    if (!minute) return 'ambiguous';
    if (b.l <= pos.stop) {
      pos.down(b);
    } else {
      pos.up(b);
      if (!pos.done) pos.down(b);
    }
  } else {
    pos.up(b);
  }
  if (!pos.done) pos.timeExit(b);
  return 'continue';
}

function result(pos: Position, d: Dir, risk: number): Filled {
  return {
    status: 'filled',
    fillMs: pos.firstMs,
    filled: pos.fills,
    avgEntry: d * pos.avg,
    exitMs: pos.exitMs,
    exit: d * pos.exit,
    outcome: pos.outcome,
    takesHit: pos.tp,
    finalStop: d * pos.stop,
    rGross: pos.cash / risk,
    rNet: (pos.cash - pos.fee) / risk,
  };
}

/**
 * Сетка с закрытия свечи `e`: исполнения, тейки, стоп за тейками, срок.
 * R — от планового риска всей сетки (все уровни исполнились и выбит стоп — −1R).
 */
export function simulate(
  s: Series,
  st: Setup,
  minutes: Minutes,
  fees: Fees = FEES,
): Result {
  const d = st.dir;
  const plan: Plan = {
    levels: st.entries.map((x) => d * x),
    takes: st.takes.map((x) => d * x),
    stop0: d * st.stop,
    q: 1 / st.entries.length,
    trail: st.trail,
    fees,
  };
  const risk = plan.levels.reduce((a, x) => a + (x - plan.stop0), 0) * plan.q;
  const pos = new Position(plan);
  for (let k = st.e + 1; k < s.n; k++) {
    if (pos.fills === 0 && k > st.e + LIMIT_LIFE) return { status: 'expired' };
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
    let r = step(pos, plan, bar, false);
    if (r === 'ambiguous') {
      const mins = minutes(bar.t0, bar.t1);
      if (mins === null) return { status: 'needs', from: bar.t0, to: bar.t1 };
      // Минуток нет (дыра в истории) — свеча целиком как одна минутка.
      const seq = mins.length ? mins.map((m) => asLong(m, d)) : [bar];
      r = 'continue';
      for (const m of seq) {
        r = step(pos, plan, m, true);
        if (r !== 'continue' || pos.done) break;
      }
    }
    if (r === 'missed') return { status: 'missed' };
    if (pos.done) return result(pos, d, risk);
  }
  return { status: pos.fills ? 'open' : 'expired' };
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
      // Дыра в истории: не вернулось — пусто, без повторных запросов.
      for (const k of need.keys()) if (!cache.has(k)) cache.set(k, []);
    }
    todo = next;
  }
  return setups.map((setup) => ({ setup, result: out.get(setup.id) }));
}
