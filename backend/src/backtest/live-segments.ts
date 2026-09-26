/**
 * Отрезки движения цены между тиками движка эфира.
 *
 * Минутка, которую прошлый тик застал недоформированной, уже частично
 * проверена: её открытие и увиденный тогда диапазон движок разбирал в прошлый
 * раз. Взять её на следующем тике целиком значило бы проверить одно и то же
 * движение дважды — и исполнить стоп по цене, которая была до того, как этот
 * стоп выставили. Поэтому такая минутка превращается в отрезок «от прошлой
 * цены до нынешней», в который входят только НОВЫЕ экстремумы.
 *
 * Чистые функции без Nest и базы: правила исполнения стоят слишком дорого,
 * чтобы проверять их через слой хранилища.
 */
const MINUTE_MS = 60_000;

/** Свеча минутки: время открытия и OHLC. */
export interface Bar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

/** Что движок видел в конце прошлого тика. Живёт в памяти процесса. */
export interface Snapshot {
  /** Время прошлого тика. */
  at: number;
  /** Открытие минутки, которая тогда ещё формировалась. */
  minuteT: number;
  /** Её диапазон и цена, какими они были видны тогда. */
  high: number;
  low: number;
  last: number;
}

export interface Segment {
  /** Начало отрезка: прошлый тик или открытие минутки. */
  from: number;
  /** Конец: закрытие минутки или время этого тика — им же датируется выход. */
  to: number;
  bar: Bar;
  /**
   * Экстремумы, которых прошлый тик не видел. У целой минутки — её собственные.
   * null — движение не вышло за уже проверенные границы.
   */
  extHigh: number | null;
  extLow: number | null;
}

export function buildSegments(
  snap: Snapshot | null,
  minutes: Bar[],
  until: number,
): { segments: Segment[]; next: Snapshot | null } {
  const segments: Segment[] = [];
  let next: Snapshot | null = null;

  for (const m of minutes) {
    if (m.t >= until) break;
    // Минутки левее снимка прошлый тик уже разобрал целиком.
    if (snap && m.t < snap.minuteT) continue;

    const closed = m.t + MINUTE_MS <= until;
    const to = closed ? m.t + MINUTE_MS : until;

    if (snap && m.t === snap.minuteT) {
      const extHigh = m.h > snap.high ? m.h : null;
      const extLow = m.l < snap.low ? m.l : null;
      segments.push({
        from: snap.at,
        to,
        bar: {
          t: m.t,
          o: snap.last,
          c: m.c,
          h: Math.max(snap.last, m.c, extHigh ?? -Infinity),
          l: Math.min(snap.last, m.c, extLow ?? Infinity),
        },
        extHigh,
        extLow,
      });
    } else {
      segments.push({ from: m.t, to, bar: m, extHigh: m.h, extLow: m.l });
    }

    // Незакрытая минутка — единственная, что может остаться в снимке: закрытую
    // на следующем тике брать уже не из чего.
    next = closed ? null : { at: until, minuteT: m.t, high: m.h, low: m.l, last: m.c };
  }

  return { segments, next };
}

/**
 * Отрезок глазами конкретной позиции.
 *
 * Позиция, открытая внутри отрезка, видит только движение от своей цены входа
 * до цены конца — без экстремумов. Экстремумы отрезка во времени не
 * расположены: известно лишь, что они случились где-то внутри него, и засчитать
 * их такой позиции значило бы иногда закрывать её по цене, которой при ней не
 * было. Особенно заметно это после перезапуска, когда отрезком становится целая
 * минутка: сделка, открытая на её пятидесятой секунде, ловила бы стоп по
 * минимуму десятой.
 *
 * Цена ошибки в другую сторону — пропущенное касание внутри отрезка — меньше:
 * тик идёт раз в две секунды, и уже на следующем позиция получает весь отрезок
 * целиком. Выдуманное закрытие отменить нельзя, пропущенное — наверстается.
 *
 * `null` — позиция открыта после отрезка, проверять нечего.
 */
export function barForTrade(seg: Segment, trade: { entryTime: number; entryPrice: number }): Bar | null {
  if (trade.entryTime >= seg.to) return null;
  if (trade.entryTime <= seg.from) return seg.bar;
  return {
    t: seg.bar.t,
    o: trade.entryPrice,
    c: seg.bar.c,
    h: Math.max(trade.entryPrice, seg.bar.c),
    l: Math.min(trade.entryPrice, seg.bar.c),
  };
}
