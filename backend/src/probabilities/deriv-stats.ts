import {
  atrOf,
  firstBarrier,
  statOf,
  zoneEvents,
  zonesOf,
  type Bar,
  type OddsStat,
  type Outcome,
  type Zone,
} from './odds-math';

export type DerivKind = 'funding' | 'ratio' | 'oi';
export const DERIV_KINDS: readonly DerivKind[] = ['funding', 'ratio', 'oi'];

export interface DerivPointLike {
  kind: DerivKind;
  time: number;
  value: number;
}

const H4 = 4 * 3_600_000;
/** Окно зоны — полгода прошлых свечей 4ч. */
export const ZONE_DAYS = 180;
export const ZONE_WINDOW = ZONE_DAYS * 6;
/** Точка старше этого к открытию свечи — значения нет (дыра в ряду). */
const STALE_MS = 12 * 3_600_000;
/** Изменение открытого интереса — за сутки, шесть свечей 4ч. */
const OI_LAG = 6;

/**
 * Значение ряда на каждой свече — последняя точка не позже ОТКРЫТИЯ свечи.
 * Событие решается на закрытии свечи, исход считается от её закрытия, а метка
 * точки у Bybit — начало или конец её периода (документация не говорит). Точка с
 * меткой не позже открытия к закрытию известна при любой из них: при метке
 * начала её период — ровно эта свеча. Точка с меткой до закрытия при метке
 * начала описывала бы следующие 4 часа — заглядывание вперёд. `points` — по
 * возрастанию времени.
 */
export function alignTo(
  bars: readonly Bar[],
  points: readonly { time: number; value: number }[],
): (number | null)[] {
  const out: (number | null)[] = [];
  let j = -1;
  for (const b of bars) {
    while (j + 1 < points.length && points[j + 1].time <= b.t) j++;
    out.push(
      j >= 0 && b.t - points[j].time <= STALE_MS ? points[j].value : null,
    );
  }
  return out;
}

/** Ряд, по которому меряется зона: фандинг и доля лонгов — как есть, открытый интерес — изменение за сутки. */
export function seriesOf(
  kind: DerivKind,
  bars: readonly Bar[],
  points: readonly { time: number; value: number }[],
): (number | null)[] {
  const raw = alignTo(bars, points);
  if (kind !== 'oi') return raw;
  return raw.map((v, i) => {
    const was = i >= OI_LAG ? raw[i - OI_LAG] : null;
    return v != null && was != null && was > 0 ? v / was - 1 : null;
  });
}

/** Частоты зон: ключ `<ряд>:high` / `<ряд>:low`. */
export type DerivOdds = Record<string, OddsStat | null>;

const ofKind = (points: readonly DerivPointLike[], kind: DerivKind) =>
  points.filter((p) => p.kind === kind);

/**
 * Частоты после входа ряда в крайнюю зону: исход — какую границу ±1 ATR(4ч)
 * цена коснулась первой; сторона — та, что чаще шла первой в истории.
 */
export function derivOdds(
  bars: readonly Bar[],
  points: readonly DerivPointLike[],
): DerivOdds {
  const atr = atrOf(bars);
  const out: DerivOdds = {};
  for (const kind of DERIV_KINDS) {
    const zones = zonesOf(
      seriesOf(kind, bars, ofKind(points, kind)),
      ZONE_WINDOW,
    );
    const outs: Record<'high' | 'low', Outcome[]> = { high: [], low: [] };
    for (const e of zoneEvents(zones)) {
      if (Number.isNaN(atr[e.i])) continue;
      const side = firstBarrier(bars, e.i, atr[e.i]);
      if (side) outs[e.zone].push({ t: bars[e.i].t, side });
    }
    out[`${kind}:high`] = statOf(outs.high, 'auto');
    out[`${kind}:low`] = statOf(outs.low, 'auto');
  }
  return out;
}

export interface DerivNow {
  kind: DerivKind;
  value: number | null;
  zone: Zone | null;
}

/**
 * Что ряды показывают сейчас: значение и зона на свече, открывшейся последней к
 * `now` (её в `price_candles` ещё нет — синк пишет закрытые), теми же функциями,
 * что считают частоты.
 */
export function derivNow(
  bars: readonly Bar[],
  points: readonly DerivPointLike[],
  now: number,
): DerivNow[] {
  const open = Math.floor(now / H4) * H4;
  const last = bars.at(-1);
  const grid =
    last && last.t >= open ? bars : [...bars, { t: open, h: 0, l: 0, c: 0 }];
  const i = grid.length - 1;
  return DERIV_KINDS.map((kind) => {
    const s = seriesOf(kind, grid, ofKind(points, kind));
    return { kind, value: s[i], zone: zonesOf(s, ZONE_WINDOW)[i] };
  });
}
