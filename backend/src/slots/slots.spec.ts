import {
  drawGrid,
  evaluate,
  expectedReturn,
  PAYLINES,
  winOf,
  type Grid,
  type Sym,
} from './slots';

/** Детерминированный ГПСЧ для прогонов (mulberry32). */
const rng = (seed: number) => (n: number) => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
};

const fill = (s: Sym): Grid => Array.from({ length: 5 }, () => [s, s, s]);

describe('слоты', () => {
  it('отдача 95–97 % — посчитана точно', () => {
    const rtp = expectedReturn();
    console.log('RTP', rtp);
    expect(rtp).toBeGreaterThan(0.95);
    expect(rtp).toBeLessThan(0.97);
  });

  it('прогон сходится с формулой', () => {
    const rand = rng(42);
    let bet = 0;
    let win = 0;
    let hits = 0;
    const n = 300_000;
    for (let i = 0; i < n; i++) {
      const w = winOf(evaluate(drawGrid(rand)), 10);
      bet += 10;
      win += w;
      if (w > 0) hits++;
    }
    console.log('MC', win / bet, 'hit rate', hits / n);
    expect(Math.abs(win / bet - expectedReturn())).toBeLessThan(0.04);
  });

  it('wild продолжает линию, скаттер платит отовсюду', () => {
    const g = fill('cherry');
    g[0] = ['bell', 'seven', 'lemon'];
    g[1] = ['wild', 'seven', 'plum'];
    g[2] = ['plum', 'seven', 'scatter'];
    g[3] = ['scatter', 'lemon', 'plum'];
    g[4] = ['scatter', 'grapes', 'lemon'];
    const ev = evaluate(g);
    expect(ev.lines.find((l) => l.line === 0)).toMatchObject({
      symbol: 'seven',
      count: 3,
      pay: 50,
    });
    expect(ev.scatters).toBe(3);
    expect(ev.scatterPay).toBe(3);
  });

  it('выигрыш целый при любой ставке из списка', () => {
    const ev = evaluate(fill('cherry'));
    expect(ev.lines).toHaveLength(PAYLINES.length);
    expect(winOf(ev, 10)).toBe(50 * 10);
  });
});
