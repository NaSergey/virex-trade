import type { AuthorRow, Dir, Share } from './report.types';
import type { Series } from './series';
import { Confirm, confirmAfter, Scan } from './events';
import { wilson } from './stats';

/** Горизонт барьерного теста, свечей. */
export const HORIZON = 24;

/**
 * Какая граница ±1 ATR от закрытия свечи i задета первой за HORIZON свечей:
 * 1 — верхняя, −1 — нижняя, 0 — ни одна или обе в одной свече.
 */
export function barrier(
  s: Series,
  a: Float64Array,
  i: number,
  horizon = HORIZON,
): -1 | 0 | 1 {
  const up = s.c[i] + a[i];
  const dn = s.c[i] - a[i];
  for (let k = i + 1; k <= i + horizon && k < s.n; k++) {
    const hu = s.h[k] >= up;
    const hd = s.l[k] <= dn;
    if (hu && hd) return 0;
    if (hu) return 1;
    if (hd) return -1;
  }
  return 0;
}

/** Доля «верх первым» среди всех свечей — что даёт сам рынок, без сигнала. */
export function baseUp(s: Series, a: Float64Array): number {
  let up = 0;
  let dn = 0;
  for (let i = 0; i < s.n; i++) {
    if (!Number.isFinite(a[i])) continue;
    const b = barrier(s, a, i);
    if (b === 1) up++;
    else if (b === -1) dn++;
  }
  return up + dn ? up / (up + dn) : 0.5;
}

export interface Item {
  i: number;
  dir: Dir;
}

export function shareOf(
  items: Item[],
  s: Series,
  a: Float64Array,
  pUp: number,
): Share {
  let ok = 0;
  let n = 0;
  let unresolved = 0;
  let base = 0;
  for (const it of items) {
    const b = barrier(s, a, it.i);
    if (b === 0) {
      unresolved++;
      continue;
    }
    n++;
    if (b === it.dir) ok++;
    base += it.dir === 1 ? pUp : 1 - pUp;
  }
  if (!n) {
    return { n, share: null, lo: null, hi: null, base: null, unresolved };
  }
  const [lo, hi] = wilson(ok, n);
  return { n, share: ok / n, lo, hi, base: base / n, unresolved };
}

/** Цифры автора (видео 1, 5:32–11:11), доли. */
const AUTHOR = {
  sweep: 0.622,
  fvg: 0.84,
  bos: 0.89,
  all: 0.92,
  breakAll: 0.61,
  lt02: 0.492,
  mid: 0.539,
  gt05: 0.665,
};

/**
 * Статистика автора на BTC. Для свипа с условием — два столбца: от закрытия
 * свипа (условие ждём после — так, по-видимому, считал автор, и процент
 * завышается сам: слом вверх «после» уже значит, что цена пошла вверх) и от
 * свечи, на которой условие выполнилось (честно).
 */
export function authorCheck(
  s: Series,
  a: Float64Array,
  scan: Scan,
): AuthorRow[] {
  const pUp = baseUp(s, a);
  const sh = (items: Item[]) => shareOf(items, s, a, pUp);
  const conf = scan.sweeps.map((sw) => ({ sw, c: confirmAfter(s, sw) }));
  const cond = (pick: (c: Confirm) => number) => {
    const hits = conf.map((x) => ({ x, k: pick(x.c) })).filter((y) => y.k >= 0);
    return {
      fromEvent: sh(hits.map((y) => ({ i: y.x.sw.i, dir: y.x.sw.dir }))),
      fromConfirm: sh(hits.map((y) => ({ i: y.k, dir: y.x.sw.dir }))),
    };
  };
  const br = (f: (depth: number) => boolean) =>
    sh(
      scan.breaks
        .filter((b) => f(b.depthAtr))
        .map((b) => ({ i: b.i, dir: b.dir })),
    );
  return [
    {
      key: 'sweep',
      label: 'Свип',
      author: AUTHOR.sweep,
      fromEvent: sh(scan.sweeps.map((sw) => ({ i: sw.i, dir: sw.dir }))),
      fromConfirm: null,
    },
    {
      key: 'sweep-fvg',
      label: 'Свип + имбаланс',
      author: AUTHOR.fvg,
      ...cond((c) => c.fvg),
    },
    {
      key: 'sweep-bos',
      label: 'Свип + слом структуры',
      author: AUTHOR.bos,
      ...cond((c) => c.bos),
    },
    {
      key: 'sweep-all',
      label: 'Все три фактора',
      author: AUTHOR.all,
      ...cond((c) => (c.fvg >= 0 && c.bos >= 0 ? Math.max(c.fvg, c.bos) : -1)),
    },
    {
      key: 'break',
      label: 'Пробой, любое закрытие',
      author: AUTHOR.breakAll,
      fromEvent: br(() => true),
      fromConfirm: null,
    },
    {
      key: 'break-lt02',
      label: 'Пробой, закрытие < 0,2 ATR',
      author: AUTHOR.lt02,
      fromEvent: br((d) => d < 0.2),
      fromConfirm: null,
    },
    {
      key: 'break-02-05',
      label: 'Пробой, закрытие 0,2–0,5 ATR',
      author: AUTHOR.mid,
      fromEvent: br((d) => d >= 0.2 && d <= 0.5),
      fromConfirm: null,
    },
    {
      key: 'break-gt05',
      label: 'Пробой, закрытие > 0,5 ATR',
      author: AUTHOR.gt05,
      fromEvent: br((d) => d > 0.5),
      fromConfirm: null,
    },
  ];
}
