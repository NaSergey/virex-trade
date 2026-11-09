/**
 * Слоты — чистые правила: символы, барабаны, линии, выплаты и расчёт выигрыша.
 * Без базы и без случайности внутри: генератор передаёт сервис, поэтому
 * отдача (RTP) считается здесь точно, а не прогоном (`expectedReturn`).
 *
 * Пять барабанов по три клетки, десять линий. Каждая клетка выпадает
 * независимо по весам своего барабана — у настоящего автомата это лента, но
 * у взвешенной клетки отдача считается формулой, и её держит тест.
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

/** Скаттер платит в любом месте, в ставках на весь спин: 3, 4, 5 штук. */
export const SCATTER_PAYS: readonly [number, number, number] = [3, 15, 100];

/**
 * Веса клеток по барабанам. Wild — только на 2–4: на первом он начинал бы
 * линию «ничем», и считать её пришлось бы особым правилом.
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
  /** В ставках на весь спин. */
  scatterPay: number;
  /** Клетки выигрыша `[reel, row]` — для подсветки. */
  cells: [number, number][];
}

export function evaluate(grid: Grid): Evaluation {
  const lines: LineWin[] = [];
  const cells = new Map<string, [number, number]>();
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
    for (let r = 0; r < count; r++) cells.set(`${r}:${rows[r]}`, [r, rows[r]]);
  });
  let scatters = 0;
  for (const col of grid) for (const s of col) if (s === 'scatter') scatters++;
  const scatterPay =
    scatters >= 3 ? SCATTER_PAYS[Math.min(scatters, 5) - 3] : 0;
  if (scatterPay > 0)
    grid.forEach((col, r) =>
      col.forEach(
        (s, row) => s === 'scatter' && cells.set(`${r}:${row}`, [r, row]),
      ),
    );
  return { lines, scatters, scatterPay, cells: [...cells.values()] };
}

/** Выигрыш в монетах. Ставка кратна числу линий — сумма всегда целая. */
export function winOf(ev: Evaluation, bet: number): number {
  const lineBet = bet / PAYLINES.length;
  return (
    ev.lines.reduce((s, l) => s + l.pay * lineBet, 0) + ev.scatterPay * bet
  );
}

/**
 * Точная отдача: матожидание выигрыша на монету ставки. Клетки независимы,
 * поэтому каждая линия даёт одно и то же матожидание, а скаттеры — сумма
 * по барабанам с распределением числа скаттеров (свёртка).
 */
export function expectedReturn(): number {
  const p = WEIGHTS.map((w) => {
    const t = totalOf(w);
    return Object.fromEntries(SYMBOLS.map((s) => [s, w[s] / t])) as Record<
      Sym,
      number
    >;
  });
  // Матожидание одной линии в ставках на линию; линий 10 по ставке/10 — это
  // и есть доля от ставки спина.
  let line = 0;
  for (const [sym, pays] of Object.entries(LINE_PAYS) as [
    Sym,
    readonly number[],
  ][]) {
    let run = p[0][sym];
    for (let k = 1; k < REELS; k++) {
      const cont = p[k][sym] + p[k].wild;
      // run — вероятность, что первые k клеток линии — этот символ.
      if (k >= 3) line += run * (1 - cont) * pays[k - 3];
      run *= cont;
    }
    line += run * pays[REELS - 3];
  }
  // Число скаттеров на поле — свёртка распределений по барабанам.
  let dist = [1];
  for (const pr of p) {
    const per = [1, 3, 3, 1].map(
      (c, k) => c * pr.scatter ** k * (1 - pr.scatter) ** (ROWS - k),
    );
    const next = new Array<number>(dist.length + ROWS).fill(0);
    dist.forEach((a, i) => per.forEach((b, j) => (next[i + j] += a * b)));
    dist = next;
  }
  const scatter = dist.reduce(
    (s, pr, n) => s + (n >= 3 ? pr * SCATTER_PAYS[Math.min(n, 5) - 3] : 0),
    0,
  );
  return line + scatter;
}
