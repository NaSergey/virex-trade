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

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Шаг между соседними свечами: они всегда выровнены по границе бакета
    таймфрейма, поэтому шаг постоянный — считаем по первым двум. */
const stepOf = (candles: { t: number }[]) => (candles.length >= 2 ? candles[1].t - candles[0].t : 0);

/**
 * Позиция в «кадре» (может быть отрицательной — левее первой загруженной
 * свечи, туда, где реальных данных ещё/уже нет) для времени `time`.
 * Экстраполирует постоянным шагом за пределами массива — так же, как
 * `RangeCheckChart` умеет уезжать за края данных индексами.
 */
export function frameAtTime(candles: { t: number }[], time: number): number {
  if (candles.length === 0) return 0;
  const step = stepOf(candles);
  if (time < candles[0].t) return step > 0 ? -Math.round((candles[0].t - time) / step) : 0;
  return indexAtOrAfter(candles, time);
}

/** Обратная операция: время якоря для позиции кадра (в т.ч. отрицательной) —
    пан/пинч используют, чтобы зафиксировать текущую позицию в `ViewState.anchorTime`. */
export function anchorTimeAt(candles: { t: number }[], frameStart: number): number | null {
  if (candles.length === 0) return null;
  if (frameStart < 0) return candles[0].t - -frameStart * (stepOf(candles) || 1);
  if (frameStart < candles.length) return candles[frameStart].t;
  return candles[candles.length - 1].t;
}

/**
 * Куда пану/зуму можно уводить кадр при данном count: не дальше живого края
 * справа и не дальше `edge` настоящих свечей слева — левее только пустое
 * поле, как в графике «Диапазон входа» (`RangeCheckChart`). Общая для
 * `resolveWindow` и обработчиков жестов в `ReplayChart`, которым нужно знать
 * эти границы ещё до того, как состояние осядет и `resolveWindow` пересчитает
 * их сама — иначе «запас» перескролла копится сверх видимого и жест на
 * возврате едет вхолостую, прежде чем кадр вообще сдвинется.
 */
export function frameBounds(candles: { t: number }[], count: number, edgeMin = 3): { min: number; max: number } {
  const total = candles.length;
  const edge = Math.min(edgeMin, total);
  return { min: edge - count, max: Math.max(0, total - count) };
}

/**
 * Где стоит окно просмотра: индексы для среза массива, ширина кадра и следит
 * ли оно за живым краем. Якорь хранится временем, а не индексом — массив
 * растёт слева при догрузке истории для пана, и индекс от этого сместился
 * бы, а время нет.
 *
 * Кадр умеет уезжать левее первой загруженной свечи (виртуальный `frameStart`
 * отрицательный, `startIdx` при этом зажат в 0) — иначе при короткой истории
 * (старт сессии, только что выбранный ТФ) пан упирался бы в стену намертво.
 * Вправо (за живой край, в будущее, которого ещё не было) кадр не уезжает —
 * там принципиально нет данных, а не просто «ещё не загружены».
 */
export function resolveWindow(
  candles: { t: number }[],
  view: ViewState,
  bounds: WindowBounds,
  edgeMin = 3,
): { frameStart: number; startIdx: number; endIdx: number; count: number; live: boolean } {
  const total = candles.length;
  const count = clamp(view.count, bounds.minCount, bounds.maxCount);
  const { min: minFrameStart, max: maxFrameStart } = frameBounds(candles, count, edgeMin);
  const live = view.anchorTime == null;
  // Проверка написана заново (не через `live`), чтобы TS сузил anchorTime до number.
  const frameStart = clamp(
    view.anchorTime == null ? maxFrameStart : frameAtTime(candles, view.anchorTime),
    minFrameStart,
    maxFrameStart,
  );
  const startIdx = clamp(frameStart, 0, total);
  const endIdx = clamp(frameStart + count, 0, total);
  return { frameStart, startIdx, endIdx, count, live };
}

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
