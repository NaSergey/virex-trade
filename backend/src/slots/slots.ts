/**
 * Слоты — чистые правила: символы, барабаны, линии, выплаты и расчёт выигрыша.
 * Без базы и без случайности внутри: генератор передаёт сервис, поэтому
 * отдача (RTP) считается здесь точно, а не прогоном (`expectedReturn`).
 *
 * Пять барабанов по три клетки, десять линий. Каждая клетка выпадает
 * независимо по весам своего барабана — у настоящего автомата это лента, но
 * у взвешенной клетки отдача считается формулой, и её держит тест.
 *
 * Три бонусных раунда, каждый разыгрывается целиком в спине, который его
 * запустил (`play`), — экран только показывает:
 * - бесплатные спины: 3/4/5 корон (скаттер) — 8/12/20 спинов, выигрыш ×2,
 *   короны внутри добавляют спинов;
 * - сундуки: сундук на барабанах 1, 3 и 5 — открываются по одному, пока не
 *   выпадет «Забрать» (первый всегда с призом);
 * - колесо фортуны: колесо на барабанах 1, 3 и 5 — 16 равных секторов.
 */

export const SYMBOLS = [
  'cherry',
  'lemon',
  'plum',
  'grapes',
  'bell',
  'bar',
  'seven',
  'diamond',
  'wild',
  'scatter',
  'chest',
  'wheel',
] as const;
export type Sym = (typeof SYMBOLS)[number];

export const REELS = 5;
export const ROWS = 3;

/** Строка клетки на каждом барабане (0 — верх). */
export const PAYLINES: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [1, 2, 1, 0, 1],
];

/** Выплата линии за 3, 4 и 5 подряд слева — в ставках на линию. */
export const LINE_PAYS: Partial<
  Record<Sym, readonly [number, number, number]>
> = {
  cherry: [5, 15, 50],
  lemon: [5, 15, 50],
  plum: [10, 30, 100],
  grapes: [10, 40, 120],
  bell: [20, 60, 200],
  bar: [30, 100, 300],
  seven: [50, 250, 1000],
  diamond: [100, 500, 2500],
};

/** Бесплатные спины за 3, 4, 5 корон; выигрыш внутри умножается. */
export const FREE_SPINS: readonly [number, number, number] = [8, 12, 20];
export const FREE_MULT = 2;
/** Предел спинов одного бонуса вместе с добавленными — бесконечной цепочки не бывает. */
export const FREE_MAX = 100;

/** Призы сундуков в ставках спина и их веса. */
export const PICK_PRIZES: readonly (readonly [number, number])[] = [
  [1, 30],
  [2, 25],
  [3, 18],
  [5, 12],
  [10, 8],
  [20, 4],
  [50, 2],
  [100, 1],
];
export const PICK_BOXES = 12;
/** «Забрать» на каждом сундуке после первого — 3 из 10. */
export const PICK_COLLECT = [3, 10] as const;

/** Секторы колеса в ставках спина, все одного размера и равновероятны. */
export const WHEEL: readonly number[] = [
  5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 8, 10, 15, 20, 25, 100,
];

/**
 * Веса клеток по барабанам. Wild — только на 2–4: на первом он начинал бы
 * линию «ничем». Сундук и колесо — только на 1, 3 и 5: бонус — по одному на
 * каждом из них.
 */
export const WEIGHTS: readonly Record<Sym, number>[] = [
  {
    cherry: 20,
    lemon: 20,
    plum: 16,
    grapes: 14,
    bell: 11,
    bar: 8,
    seven: 5,
    diamond: 3,
    wild: 0,
    scatter: 3,
    chest: 6,
    wheel: 6,
  },
  {
    cherry: 20,
    lemon: 20,
    plum: 16,
    grapes: 14,
    bell: 11,
    bar: 8,
    seven: 5,
    diamond: 3,
    wild: 10,
    scatter: 3,
    chest: 0,
    wheel: 0,
  },
  {
    cherry: 20,
    lemon: 20,
    plum: 16,
    grapes: 14,
    bell: 11,
    bar: 8,
    seven: 5,
    diamond: 3,
    wild: 10,
    scatter: 3,
    chest: 6,
    wheel: 6,
  },
  {
    cherry: 20,
    lemon: 20,
    plum: 16,
    grapes: 14,
    bell: 11,
    bar: 8,
    seven: 5,
    diamond: 3,
    wild: 10,
    scatter: 3,
    chest: 0,
    wheel: 0,
  },
  {
    cherry: 20,
    lemon: 20,
    plum: 16,
    grapes: 14,
    bell: 11,
    bar: 8,
    seven: 5,
    diamond: 3,
    wild: 0,
    scatter: 3,
    chest: 6,
    wheel: 6,
  },
];

const totalOf = (w: Record<Sym, number>) =>
  SYMBOLS.reduce((s, k) => s + w[k], 0);

/** Сетка — по барабанам: `grid[reel][row]`. */
export type Grid = Sym[][];

/** `rand(n)` — целое из [0, n). */
export function drawGrid(rand: (n: number) => number): Grid {
  return WEIGHTS.map((w) => {
    const total = totalOf(w);
    const col: Sym[] = [];
    for (let r = 0; r < ROWS; r++) {
      let x = rand(total);
      let pick: Sym = SYMBOLS[0];
      for (const s of SYMBOLS) {
        if (x < w[s]) {
          pick = s;
          break;
        }
        x -= w[s];
      }
      col.push(pick);
    }
    return col;
  });
}

export interface LineWin {
  line: number;
  symbol: Sym;
  count: number;
  /** В ставках на линию. */
  pay: number;
}

export interface Evaluation {
  lines: LineWin[];
  scatters: number;
}

export function evaluate(grid: Grid): Evaluation {
  const lines: LineWin[] = [];
  PAYLINES.forEach((rows, line) => {
    const first = grid[0][rows[0]];
    const pays = LINE_PAYS[first];
    if (!pays) return;
    let count = 1;
    while (count < REELS) {
      const s = grid[count][rows[count]];
      if (s !== first && s !== 'wild') break;
      count++;
    }
    if (count < 3) return;
    lines.push({ line, symbol: first, count, pay: pays[count - 3] });
  });
  let scatters = 0;
  for (const col of grid) for (const s of col) if (s === 'scatter') scatters++;
  return { lines, scatters };
}

/** Бонус по символу на барабанах 1, 3 и 5. */
export const hasTrigger = (grid: Grid, sym: 'chest' | 'wheel') =>
  [0, 2, 4].every((r) => grid[r].includes(sym));

/** Бесплатных спинов за столько корон (меньше трёх — ноль). */
export const freeSpinsFor = (scatters: number) =>
  scatters >= 3 ? FREE_SPINS[Math.min(scatters, 5) - 3] : 0;

/** Выигрыш линий в монетах. Ставка кратна числу линий — сумма целая. */
export function winOf(ev: Evaluation, bet: number): number {
  return ev.lines.reduce((s, l) => s + l.pay, 0) * (bet / PAYLINES.length);
}

const pickPrize = (rand: (n: number) => number) => {
  const total = PICK_PRIZES.reduce((s, [, w]) => s + w, 0);
  let x = rand(total);
  for (const [v, w] of PICK_PRIZES) {
    if (x < w) return v;
    x -= w;
  }
  return PICK_PRIZES[0][0];
};

export interface FreeSpin {
  grid: Grid;
  lines: (LineWin & { win: number })[];
  win: number;
  /** Спинов добавили короны этого спина. */
  added: number;
}
export type Bonus =
  | {
      kind: 'free';
      awarded: number;
      mult: number;
      spins: FreeSpin[];
      win: number;
    }
  | { kind: 'pick'; picks: number[]; rest: number[]; win: number }
  | { kind: 'wheel'; segments: number[]; index: number; win: number };

export interface Outcome {
  grid: Grid;
  lines: (LineWin & { win: number })[];
  scatters: number;
  /** Выигрыш линий самого спина. */
  baseWin: number;
  bonuses: Bonus[];
  /** Всё вместе — столько начисляется. */
  win: number;
}

const withWin = (ev: Evaluation, bet: number, mult = 1) =>
  ev.lines.map((l) => ({ ...l, win: (l.pay * bet * mult) / PAYLINES.length }));

/** Бесплатные спины: короны добавляют спины, сундук и колесо внутри не играют. */
export function playFree(
  rand: (n: number) => number,
  bet: number,
  awarded: number,
): Bonus {
  const spins: FreeSpin[] = [];
  let left = awarded;
  let total = awarded;
  while (left > 0 && spins.length < FREE_MAX) {
    left--;
    const grid = drawGrid(rand);
    const ev = evaluate(grid);
    const added = Math.min(freeSpinsFor(ev.scatters), FREE_MAX - total);
    left += added;
    total += added;
    spins.push({
      grid,
      lines: withWin(ev, bet, FREE_MULT),
      win: winOf(ev, bet) * FREE_MULT,
      added,
    });
  }
  return {
    kind: 'free',
    awarded,
    mult: FREE_MULT,
    spins,
    win: spins.reduce((s, x) => s + x.win, 0),
  };
}

/**
 * Сундуки: k-й открытый сундук показывает k-й приз последовательности —
 * какой сундук выбран, не важно, поэтому исход решён заранее и не ждёт
 * игрока. Первый — всегда приз; дальше «Забрать» с вероятностью 3/10; все
 * сундуки, кроме одного, с призом — последний «Забрать».
 */
export function playPick(rand: (n: number) => number, bet: number): Bonus {
  const picks: number[] = [];
  while (picks.length < PICK_BOXES - 1) {
    if (picks.length > 0 && rand(PICK_COLLECT[1]) < PICK_COLLECT[0]) break;
    picks.push(pickPrize(rand) * bet);
  }
  const rest = Array.from(
    { length: PICK_BOXES - picks.length - 1 },
    () => pickPrize(rand) * bet,
  );
  return { kind: 'pick', picks, rest, win: picks.reduce((s, v) => s + v, 0) };
}

export function playWheel(rand: (n: number) => number, bet: number): Bonus {
  const index = rand(WHEEL.length);
  return {
    kind: 'wheel',
    segments: WHEEL.map((x) => x * bet),
    index,
    win: WHEEL[index] * bet,
  };
}

/** Спин целиком: поле, линии и все запущенные им бонусы по порядку. */
export function play(rand: (n: number) => number, bet: number): Outcome {
  const grid = drawGrid(rand);
  const ev = evaluate(grid);
  const baseWin = winOf(ev, bet);
  const bonuses: Bonus[] = [];
  const free = freeSpinsFor(ev.scatters);
  if (free > 0) bonuses.push(playFree(rand, bet, free));
  if (hasTrigger(grid, 'chest')) bonuses.push(playPick(rand, bet));
  if (hasTrigger(grid, 'wheel')) bonuses.push(playWheel(rand, bet));
  return {
    grid,
    lines: withWin(ev, bet),
    scatters: ev.scatters,
    baseWin,
    bonuses,
    win: baseWin + bonuses.reduce((s, b) => s + b.win, 0),
  };
}

/**
 * Точная отдача: матожидание выигрыша на монету ставки. Клетки независимы,
 * поэтому каждая линия даёт одно и то же матожидание, а скаттеры — сумма
 * по барабанам с распределением числа скаттеров (свёртка).
 */
export function expectedReturn(): number {
  return returnParts().total;
}

/**
 * Отдача по частям, в долях ставки. Бесплатные спины — ожидаемое число
 * спинов с добавками `N / (1 − a)`, где `a` — ожидаемая добавка за спин
 * (предел `FREE_MAX` в формулу не входит: цепочка до него почти не доходит).
 */
export function returnParts() {
  const p = WEIGHTS.map((w) => {
    const t = totalOf(w);
    return Object.fromEntries(SYMBOLS.map((s) => [s, w[s] / t])) as Record<
      Sym,
      number
    >;
  });
  let line = 0;
  for (const [sym, pays] of Object.entries(LINE_PAYS) as [
    Sym,
    readonly number[],
  ][]) {
    let run = p[0][sym];
    for (let k = 1; k < REELS; k++) {
      const cont = p[k][sym] + p[k].wild;
      if (k >= 3) line += run * (1 - cont) * pays[k - 3];
      run *= cont;
    }
    line += run * pays[REELS - 3];
  }
  let dist = [1];
  for (const pr of p) {
    const per = [1, 3, 3, 1].map(
      (c, k) => c * pr.scatter ** k * (1 - pr.scatter) ** (ROWS - k),
    );
    const next = new Array<number>(dist.length + ROWS).fill(0);
    dist.forEach((a, i) => per.forEach((b, j) => (next[i + j] += a * b)));
    dist = next;
  }
  const added = dist.reduce((s, pr, n) => s + pr * freeSpinsFor(n), 0);
  const free = (added / (1 - added)) * FREE_MULT * line;
  const trig = (sym: Sym) =>
    [0, 2, 4].reduce((r, i) => r * (1 - (1 - p[i][sym]) ** ROWS), 1);
  const prizeW = PICK_PRIZES.reduce((s, [, w]) => s + w, 0);
  const prize = PICK_PRIZES.reduce((s, [v, w]) => s + v * w, 0) / prizeW;
  const keep = 1 - PICK_COLLECT[0] / PICK_COLLECT[1];
  let prizes = 0;
  for (let k = 0; k < PICK_BOXES - 1; k++) prizes += keep ** k;
  const pick = trig('chest') * prizes * prize;
  const wheel =
    (trig('wheel') * WHEEL.reduce((s, x) => s + x, 0)) / WHEEL.length;
  return { line, free, pick, wheel, total: line + free + pick + wheel };
}
