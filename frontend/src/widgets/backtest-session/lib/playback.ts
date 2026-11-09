import { aggregate, bucketStart, tfMs, type Candle } from './candles';

/**
 * Темп автопрокрутки. Скорость — **свечей выбранного таймфрейма в секунду**, а не
 * минут истории: ×4 на минутках и ×4 на четырёх часах двигают график одинаково —
 * четыре свечи в секунду (владелец 2026-11-09). До этого ×N было N минут истории в
 * секунду, и дневная свеча на ×1 собиралась 24 минуты.
 */

/** Скорости автопрокрутки — свечей выбранного ТФ в секунду; клавиши 1…5 по порядку. */
export const SPEEDS = [1, 4, 8, 16, 32] as const;

/**
 * Не чаще стольких тиков в секунду: каждый тик перерисовывает весь терминал. Быстрее
 * свеча собирается из нескольких тиков, ещё быстрее — тик несёт несколько свечей.
 */
export const MAX_TICKS_PER_SEC = 16;

/**
 * Потолок истории в секунду — минуток, 4ч на ×32. Каждая минутка грузится с сервера
 * (у монет кроме BTC — с Binance, пятью запросами на кусок), и дневка на ×32 просила
 * бы 46 тысяч минуток в секунду: общий лимит Binance на IP кончился бы на паре
 * пользователей. Поэтому на дневке скорости выше ×4 выключены, а не тихо медленнее.
 */
export const MAX_MINUTES_PER_SEC = 240 * 32;

/** Скорость, которую этот ТФ тянет без замедления. */
export const allowedSpeed = (speed: number, tf: number) => speed * tf <= MAX_MINUTES_PER_SEC;

/** Самая быстрая доступная на этом ТФ, не быстрее `speed`. */
export function clampSpeed(speed: number, tf: number): number {
  let best: number = SPEEDS[0];
  for (const s of SPEEDS) if (s <= speed && allowedSpeed(s, tf)) best = s;
  return best;
}

export interface Pace {
  /** Минуток истории за тик. Делитель свечи или целое число свечей. */
  stepMin: number;
  /** Период тика, мс. */
  periodMs: number;
}

/**
 * Шаг и период тика: `speed × tf` минуток истории в секунду, тиками не чаще
 * `MAX_TICKS_PER_SEC`. Шаг выбирается так, чтобы границы тиков ложились на границы
 * свечей: меньше свечи — её делитель (свеча собирается из настоящих кусков, а не
 * из выдуманного пути), больше — целое число свечей.
 */
export function paceOf(speed: number, tf: number): Pace {
  const perSec = speed * tf;
  const raw = Math.max(1, Math.ceil(perSec / MAX_TICKS_PER_SEC));
  let stepMin: number;
  if (raw < tf) {
    stepMin = raw;
    while (tf % stepMin !== 0) stepMin++;
  } else {
    stepMin = Math.ceil(raw / tf) * tf;
  }
  return { stepMin, periodMs: (1000 * stepMin) / perSec };
}

/**
 * Куда ведёт тик: следующая граница сетки шага. С середины (момент встал на стопе
 * или лимите) — до ближайшей границы, а не на целый шаг вперёд: иначе тики дальше
 * резали бы свечи поперёк.
 */
export const tickTarget = (from: number, stepMin: number) => bucketStart(from, stepMin) + tfMs(stepMin);

export interface ClosedSet {
  /** До какого момента загружена история этого таймфрейма; дальше свечи собираются из минуток. */
  anchor: number;
  candles: Candle[];
}

/**
 * Перенос опор на `cut` перед тем, как минутки до него выбросить: свечи, которые
 * собирались из них, становятся закрытыми. Наборы из `keep` (на экране и выбранный)
 * переносятся, остальные выбрасываются — их загрузят заново при выборе, а
 * перенос минуточного набора копил бы в памяти ровно то, что выбрасывается.
 * `cut` — граница суток, значит, и граница свечи любого ТФ.
 */
export function reanchor(
  prev: Record<number, ClosedSet>,
  minutes: Candle[],
  cut: number,
  keep: ReadonlySet<number>,
): Record<number, ClosedSet> {
  const next: Record<number, ClosedSet> = {};
  for (const [key, set] of Object.entries(prev)) {
    const tf = Number(key);
    if (set.anchor >= cut) next[tf] = set;
    else if (keep.has(tf)) {
      const past = set.candles.filter((c) => c.t < set.anchor);
      next[tf] = { anchor: cut, candles: [...past, ...aggregate(minutes, tf, set.anchor, cut)] };
    }
  }
  return next;
}

export type ReplayKey = { type: 'speed'; speed: number } | { type: 'toggle' };

type KeyLike = Pick<KeyboardEvent, 'code' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'repeat'>;

/**
 * Клавиши прокрутки: 1…5 — скорость, пробел — пауза и обратно. Цифры — по `code`
 * (физической клавише, и на цифровом блоке), с модификаторами — не наши: Ctrl+цифра
 * переключает вкладки браузера. Удержание пробела не щёлкает паузой на каждом повторе.
 */
export function replayKeyOf(e: KeyLike): ReplayKey | null {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat) return null;
  if (e.code === 'Space') return { type: 'toggle' };
  const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
  if (!m) return null;
  const speed = SPEEDS[Number(m[1]) - 1];
  return speed == null ? null : { type: 'speed', speed };
}
