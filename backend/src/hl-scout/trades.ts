import type { HlFill } from './activity';
import type { RawFill } from './hl-types';

/** Сколько сделок отдаём: старше — за окном `userFills` (последние 2000 исполнений) всё равно не видно. */
export const MAX_TRADES = 200;

export interface HlTrade {
  coin: string;
  side: 'long' | 'short';
  /** Первое исполнение в видимой истории; у `partial` — не начало сделки. */
  openedAt: number;
  /** Время последнего исполнения. */
  lastAt: number;
  /** `null` — позиция ещё открыта. */
  closedAt: number | null;
  /** Сделка открыта раньше окна истории: вход и объём считаются по видимой части. */
  partial: boolean;
  /** Средняя цена набора позиции; `null`, если набор остался за окном. */
  entryPx: number | null;
  /** Средняя цена закрытия; `null` у открытой. */
  exitPx: number | null;
  /** Наибольший размер позиции за сделку, в монетах. */
  peakSize: number;
  /** Наибольший размер в долларах по цене входа. */
  notional: number;
  /** Закрытый результат за вычетом комиссий. */
  pnl: number;
  fee: number;
  /** Исполнения сделки, новые первыми: по ним сделка собрана. */
  fills: HlFill[];
}

export interface HlCoinStat {
  coin: string;
  trades: number;
  /** Оборот по исполнениям, $. */
  volume: number;
  pnl: number;
  /** Доля сделок монеты среди всех. */
  share: number;
}

interface Acc {
  side: 'long' | 'short';
  partial: boolean;
  openedAt: number;
  lastAt: number;
  entryNotional: number;
  entrySize: number;
  exitNotional: number;
  exitSize: number;
  peak: number;
  closedPnl: number;
  fee: number;
  fills: HlFill[];
}

/** Остаток меньше миллионной доли шага — позиция закрыта: размеры приходят строками и копят ошибку. */
const isZero = (x: number, scale: number) => Math.abs(x) <= scale * 1e-6;

/**
 * Исполнения кошелька, собранные в сделки: сделка — это позиция от нуля до нуля.
 * Десять исполнений, которыми набирали и закрывали одну позицию, — одна сделка,
 * а не десять строк. Размер позиции до исполнения Hyperliquid отдаёт сам
 * (`startPosition`), поэтому история может начинаться посреди сделки; разворот
 * («Long > Short») делится: закрывающая часть уходит в старую сделку, остаток
 * открывает новую.
 */
export function tradesOf(raw: RawFill[]): {
  trades: HlTrade[];
  coins: HlCoinStat[];
  /** Сколько исполнений разобрано и с какого времени они видны. */
  fillsCount: number;
  since: number | null;
} {
  const fills = [...(raw ?? [])].sort((a, b) => a.time - b.time);
  const open = new Map<string, Acc>();
  const done: HlTrade[] = [];
  const volume = new Map<string, number>();

  const finish = (coin: string, acc: Acc, closed: boolean) => {
    const entryPx = acc.entrySize > 0 ? acc.entryNotional / acc.entrySize : null;
    const exitPx = acc.exitSize > 0 ? acc.exitNotional / acc.exitSize : null;
    done.push({
      coin,
      side: acc.side,
      openedAt: acc.openedAt,
      lastAt: acc.lastAt,
      closedAt: closed ? acc.lastAt : null,
      partial: acc.partial,
      entryPx,
      exitPx,
      peakSize: acc.peak,
      notional: acc.peak * (entryPx ?? exitPx ?? 0),
      pnl: acc.closedPnl - acc.fee,
      fee: acc.fee,
      fills: acc.fills.reverse(),
    });
  };

  for (const f of fills) {
    const px = Number(f.px);
    const sz = Number(f.sz);
    const delta = f.side === 'B' ? sz : -sz;
    volume.set(f.coin, (volume.get(f.coin) ?? 0) + px * sz);

    let cur = open.get(f.coin);
    const known = f.startPosition != null && Number.isFinite(Number(f.startPosition));
    // Без `startPosition` размер ведём сами: от начала видимой истории.
    const start = known
      ? Number(f.startPosition)
      : cur
        ? (cur.side === 'long' ? 1 : -1) * (cur.entrySize - cur.exitSize)
        : 0;
    const end = start + delta;
    const scale = Math.max(Math.abs(start), sz);

    // Позиция уже нулевая, а сделка висит (пропуск в истории, ликвидация) — старая закончилась.
    if (cur && isZero(start, scale)) {
      finish(f.coin, cur, true);
      open.delete(f.coin);
      cur = undefined;
    }

    const flips = !isZero(start, scale) && !isZero(end, scale) && start * end < 0;
    // Доля исполнения, ушедшая на закрытие старой стороны (при развороте — |start|, иначе всё).
    const closePart = flips ? Math.abs(start) / sz : 1;

    const put = (acc: Acc, part: number, after: number, before: number) => {
      const size = sz * part;
      const grows = Math.abs(after) > Math.abs(before);
      if (grows) {
        acc.entryNotional += px * size;
        acc.entrySize += size;
      } else {
        acc.exitNotional += px * size;
        acc.exitSize += size;
      }
      acc.peak = Math.max(acc.peak, Math.abs(after));
      acc.lastAt = f.time;
      acc.fee += Number(f.fee) * part;
      if (!grows) acc.closedPnl += Number(f.closedPnl);
      acc.fills.push({
        coin: f.coin,
        side: f.side === 'B' ? 'buy' : 'sell',
        price: px,
        size: size,
        time: f.time,
        dir: f.dir,
        closedPnl: grows ? 0 : Number(f.closedPnl),
        fee: Number(f.fee) * part,
        taker: !!f.crossed,
      });
    };

    if (!cur) {
      const partial = !isZero(start, scale);
      cur = {
        side: (partial ? start : delta) > 0 ? 'long' : 'short',
        partial,
        openedAt: f.time,
        lastAt: f.time,
        entryNotional: 0,
        entrySize: 0,
        exitNotional: 0,
        exitSize: 0,
        peak: Math.abs(start),
        closedPnl: 0,
        fee: 0,
        fills: [],
      };
      open.set(f.coin, cur);
    }

    put(cur, closePart, flips ? 0 : end, start);

    if (flips || isZero(end, scale)) {
      finish(f.coin, cur, true);
      open.delete(f.coin);
    }
    if (flips) {
      const next: Acc = {
        side: end > 0 ? 'long' : 'short',
        partial: false,
        openedAt: f.time,
        lastAt: f.time,
        entryNotional: 0,
        entrySize: 0,
        exitNotional: 0,
        exitSize: 0,
        peak: 0,
        closedPnl: 0,
        fee: 0,
        fills: [],
      };
      open.set(f.coin, next);
      put(next, 1 - closePart, end, 0);
    }
  }
  for (const [coin, acc] of open) finish(coin, acc, false);

  done.sort((a, b) => b.lastAt - a.lastAt);

  const byCoin = new Map<string, { trades: number; pnl: number }>();
  for (const t of done) {
    const s = byCoin.get(t.coin) ?? { trades: 0, pnl: 0 };
    s.trades += 1;
    s.pnl += t.pnl;
    byCoin.set(t.coin, s);
  }
  const coins = [...byCoin]
    .map(([coin, s]) => ({
      coin,
      trades: s.trades,
      volume: volume.get(coin) ?? 0,
      pnl: s.pnl,
      share: done.length ? s.trades / done.length : 0,
    }))
    .sort((a, b) => b.trades - a.trades || b.volume - a.volume);

  return {
    trades: done.slice(0, MAX_TRADES),
    coins,
    fillsCount: fills.length,
    since: fills.length ? fills[0].time : null,
  };
}
