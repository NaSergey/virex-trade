/**
 * Цена в фазе 0..1 внутри одной настоящей минутки: open → дальний от open
 * экстремум → второй экстремум → close, с плавным (smoothstep) переходом на
 * каждом стыке. Порядок обхода экстремумов — приближение: настоящего пути
 * тика биржа не хранит, есть только O/H/L/C.
 */
export function glidePrice(o: number, h: number, l: number, c: number, phase: number): number {
  const ph = Math.max(0, Math.min(1, phase));
  const far = Math.abs(h - o) >= Math.abs(o - l) ? h : l;
  const near = far === h ? l : h;
  const points = [o, far, near, c];
  const ease = (x: number) => x * x * (3 - 2 * x);
  const seg = ph * 3;
  const i = Math.min(2, Math.floor(seg));
  const localPh = ease(seg - i);
  return points[i] + (points[i + 1] - points[i]) * localPh;
}

/** Индекс первой свечи с t >= time; длина массива, если такой нет. Свечи упорядочены по t. */
export function indexAtOrAfter(candles: { t: number }[], time: number): number {
  let lo = 0;
  let hi = candles.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (candles[mid].t < time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export interface ViewState {
  /** Сколько свечей показывать. */
  count: number;
  /** Время левого края окна; null — окно следует за правым краем (живой режим). */
  anchorTime: number | null;
}

export interface WindowBounds {
  minCount: number;
  maxCount: number;
}

/**
 * Где стоит окно просмотра: индексы в массиве свечей и следит ли оно за живым
 * краем. Якорь хранится временем, а не индексом — массив растёт слева при
 * догрузке истории для пана, и индекс от этого сместился бы, а время нет.
 */
export function resolveWindow(
  candles: { t: number }[],
  view: ViewState,
  bounds: WindowBounds,
): { startIdx: number; endIdx: number; live: boolean } {
  const total = candles.length;
  const count = Math.min(bounds.maxCount, Math.max(bounds.minCount, view.count));
  const maxStart = Math.max(0, total - count);
  const live = view.anchorTime == null;
  // Проверка написана заново (не через `live`), чтобы TS сузил anchorTime до number.
  const startIdx =
    view.anchorTime == null ? maxStart : Math.min(indexAtOrAfter(candles, view.anchorTime), maxStart);
  return { startIdx, endIdx: Math.min(total, startIdx + count), live };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Один шаг зума с сохранением фокальной точки: свеча под курсором (колесо)
 * или между пальцами (пинч) остаётся на месте, меняется только то, сколько
 * свечей помещается вокруг неё. Общая математика для обоих жестов — они
 * расходились только тем, откуда берут baseIdx (готовый индекс у колеса,
 * пересчитанный из anchorTime у пинча — колёсный жест синхронный и разовый,
 * пинчу нужно бережно относиться к возможной догрузке истории посреди себя).
 */
export function zoomStep(
  candles: { t: number }[],
  baseIdx: number,
  frameCount: number,
  focalFrac: number,
  factor: number,
  bounds: WindowBounds,
): { count: number; anchorTime: number | null } {
  const focalIdx = baseIdx + focalFrac * frameCount;
  const count = clamp(Math.round(frameCount * factor), bounds.minCount, bounds.maxCount);
  const maxStart = Math.max(0, candles.length - count);
  const newStart = clamp(Math.round(focalIdx - focalFrac * count), 0, maxStart);
  return { count, anchorTime: newStart >= maxStart ? null : candles[newStart]?.t ?? null };
}
