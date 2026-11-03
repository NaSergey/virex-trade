import { chance, pick, shuffle, weighted, type Rand } from './rng';
import type { Station, StationKind, WeatherId } from './types';

/**
 * Карта линии (спека, «Карта забега»): 9 рядов по 2–3 станции на трёх путях и
 * хранитель десятым. Переходы — к соседним путям следующего ряда и без
 * пересечений: схема метро, а не клубок.
 */
export const ROWS = 10;
const LANES = [0, 1, 2] as const;
type Lane = (typeof LANES)[number];

const idOf = (row: number, lane: number) => `r${row}l${lane}`;

/** Станции, куда можно пойти: с начала — ряд 1, со станции — её переходы. */
export function reachable(map: readonly Station[], from: string | null): string[] {
  if (from === null) return map.filter((s) => s.row === 1).map((s) => s.id);
  return map.find((s) => s.id === from)?.next ?? [];
}

/** Пути ряда: у первого и девятого — два, у хранителя — средний. */
function lanesOf(r: Rand, row: number): Lane[] {
  if (row === ROWS) return [1];
  if (row === 1 || row === ROWS - 1) return pick(r, [[0, 1], [1, 2], [0, 2]] as Lane[][]);
  return chance(r, 0.55) ? [0, 1, 2] : pick(r, [[0, 1], [1, 2], [0, 2]] as Lane[][]);
}

const crosses = (edges: [number, number][], a: number, b: number) =>
  edges.some(([c, d]) => (a < c && b > d) || (a > c && b < d));

/** Переходы между рядами: каждой станции — выход, каждой следующей — вход. */
function link(r: Rand, from: Lane[], to: Lane[]): [number, number][] {
  const edges: [number, number][] = [];
  const near = (a: number, b: number) => Math.abs(a - b) <= 1;
  const add = (a: number, b: number) => {
    if (!edges.some(([c, d]) => c === a && d === b)) edges.push([a, b]);
  };
  for (const a of from) {
    const options = shuffle(
      r,
      to.filter((b) => near(a, b)),
    );
    const b = options.find((x) => !crosses(edges, a, x)) ?? options[0];
    add(a, b);
    const extra = options.find((x) => x !== b && !crosses(edges, a, x));
    if (extra !== undefined && chance(r, 0.35)) add(a, extra);
  }
  for (const b of to) {
    if (edges.some(([, d]) => d === b)) continue;
    const options = shuffle(
      r,
      from.filter((a) => near(a, b)),
    );
    add(options.find((a) => !crosses(edges, a, b)) ?? options[0], b);
  }
  return edges;
}

const BASE_WEIGHTS: [StationKind, number][] = [
  ['fight', 45],
  ['scene', 22],
  ['shop', 9],
  ['rest', 9],
  ['find', 8],
  ['elite', 7],
];

/** Может ли станция ряда быть этого типа — без учёта соседей. */
function allowed(kind: StationKind, row: number, fog: number): boolean {
  switch (kind) {
    case 'shop':
    case 'rest':
      // Ряд 9 — лавка и скамейка; в ряду 8 они встали бы рядом с такими же.
      return row >= 3 && row <= 7;
    case 'elite':
      return row >= (fog >= 4 ? 3 : 4) && row <= 8;
    default:
      return row >= 2 && row <= 8;
  }
}

function weightOf(kind: StationKind, weather: WeatherId, w: number): number {
  if (weather === 'holiday' && kind === 'scene') return w * 2;
  if (weather === 'rush' && kind === 'fight') return w * 1.5;
  if (weather === 'rush' && kind === 'rest') return w * 0.5;
  return w;
}

function build(r: Rand, opts: { weather: WeatherId; fog: number }): Station[] {
  const rows: Station[][] = [];
  for (let row = 1; row <= ROWS; row++) {
    rows.push(lanesOf(r, row).map((lane) => ({ id: idOf(row, lane), row, lane, kind: 'fight', next: [] })));
  }
  for (let i = 0; i < ROWS - 1; i++) {
    const edges = link(
      r,
      rows[i].map((s) => s.lane),
      rows[i + 1].map((s) => s.lane),
    );
    for (const s of rows[i]) {
      s.next = edges.filter(([a]) => a === s.lane).map(([, b]) => idOf(i + 2, b)).sort();
    }
  }
  const parentsOf = (s: Station) => rows[s.row - 2]?.filter((p) => p.next.includes(s.id)) ?? [];
  const fits = (s: Station, kind: StationKind) =>
    kind === 'fight' || parentsOf(s).every((p) => p.kind !== kind);

  for (let row = 2; row <= 8; row++) {
    const here = rows[row - 1];
    let forced: Station | null = null;
    if (row === 3 || row === 6) {
      const ok = here.filter((s) => fits(s, 'scene'));
      forced = ok.length > 0 ? pick(r, ok) : null;
      if (forced) forced.kind = 'scene';
    }
    for (const s of here) {
      if (s === forced) continue;
      const eliteTaken = here.some((x) => x !== s && x.kind === 'elite');
      const entries = BASE_WEIGHTS.filter(
        ([k]) => allowed(k, row, opts.fog) && fits(s, k) && !(k === 'elite' && eliteTaken),
      ).map(([k, w]) => [k, weightOf(k, opts.weather, w)] as const);
      s.kind = weighted(r, entries);
    }
  }
  const last = rows[ROWS - 2];
  const [a, b] = shuffle(r, ['rest', 'shop'] as const);
  last[0].kind = a;
  last[1].kind = b;
  rows[ROWS - 1][0].kind = 'boss';

  // Элит не выпало — одна встаёт на бой, где можно.
  const flat = rows.flat();
  if (!flat.some((s) => s.kind === 'elite')) {
    const spots = flat.filter(
      (s) =>
        s.kind === 'fight' &&
        allowed('elite', s.row, opts.fog) &&
        fits(s, 'elite') &&
        s.next.every((n) => flat.find((x) => x.id === n)!.kind !== 'elite'),
    );
    if (spots.length > 0) pick(r, spots).kind = 'elite';
  }
  return flat;
}

/** Карта годится: правила спеки, которые сборке не удалось соблюсти по ходу. */
export function validMap(map: readonly Station[]): boolean {
  const ids = new Map(map.map((s) => [s.id, s]));
  const has = (row: number, kind: StationKind) => map.some((s) => s.row === row && s.kind === kind);
  if (!has(3, 'scene') || !has(6, 'scene') || !map.some((s) => s.kind === 'elite')) return false;
  return map.every((s) =>
    s.next.every((n) => s.kind === 'fight' || ids.get(n)!.kind !== s.kind),
  );
}

export function buildMap(r: Rand, opts: { weather: WeatherId; fog: number }): Station[] {
  let map = build(r, opts);
  for (let i = 0; i < 50 && !validMap(map); i++) map = build(r, opts);
  return map;
}
