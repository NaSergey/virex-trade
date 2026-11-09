import {
  evaluate,
  expectedReturn,
  hasTrigger,
  PAYLINES,
  PICK_BOXES,
  play,
  playPick,
  playWheel,
  returnParts,
  WHEEL,
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
  it('отдача 95–97 % — посчитана точно, бонусы — заметная доля', () => {
    const parts = returnParts();
    console.log('RTP', parts);
    expect(expectedReturn()).toBeGreaterThan(0.95);
    expect(expectedReturn()).toBeLessThan(0.97);
    for (const k of ['free', 'pick', 'wheel'] as const)
      expect(parts[k]).toBeGreaterThan(0.04);
  });

  it('прогон с бонусами сходится с формулой', () => {
    const rand = rng(7);
    const n = 400_000;
    let win = 0;
    const seen = { free: 0, pick: 0, wheel: 0 };
    for (let i = 0; i < n; i++) {
      const o = play(rand, 10);
      win += o.win;
      for (const b of o.bonuses) seen[b.kind]++;
    }
    console.log('MC', win / (n * 10), seen);
    expect(Math.abs(win / (n * 10) - expectedReturn())).toBeLessThan(0.05);
    expect(seen.free).toBeGreaterThan(n / 300);
    expect(seen.pick).toBeGreaterThan(n / 600);
    expect(seen.wheel).toBeGreaterThan(n / 600);
  });

  it('wild продолжает линию', () => {
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
  });

  it('выигрыш линий целый', () => {
    const ev = evaluate(fill('cherry'));
    expect(ev.lines).toHaveLength(PAYLINES.length);
    expect(winOf(ev, 10)).toBe(500);
  });

  it('бонус сундука и колеса — по символу на барабанах 1, 3 и 5', () => {
    const g = fill('cherry');
    g[0][0] = 'chest';
    g[2][2] = 'chest';
    expect(hasTrigger(g, 'chest')).toBe(false);
    g[4][1] = 'chest';
    expect(hasTrigger(g, 'chest')).toBe(true);
    expect(hasTrigger(g, 'wheel')).toBe(false);
  });

  it('сундуки: первый с призом, сундуков ровно столько, сколько на экране', () => {
    for (let s = 1; s < 500; s++) {
      const b = playPick(rng(s), 10);
      if (b.kind !== 'pick') throw new Error();
      expect(b.picks.length).toBeGreaterThan(0);
      expect(b.picks.length + b.rest.length + 1).toBe(PICK_BOXES);
      expect(b.win).toBe(b.picks.reduce((x, v) => x + v, 0));
    }
  });

  it('колесо платит сектор, на который встало', () => {
    const b = playWheel(rng(3), 20);
    if (b.kind !== 'wheel') throw new Error();
    expect(b.win).toBe(WHEEL[b.index] * 20);
    expect(b.segments[b.index]).toBe(b.win);
  });

  it('итог спина — линии и все бонусы', () => {
    const rand = rng(11);
    for (let i = 0; i < 20_000; i++) {
      const o = play(rand, 10);
      expect(o.win).toBe(o.baseWin + o.bonuses.reduce((s, b) => s + b.win, 0));
      expect(Number.isInteger(o.win)).toBe(true);
    }
  });
});
