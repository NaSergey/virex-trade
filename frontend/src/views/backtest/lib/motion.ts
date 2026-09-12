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
 * Куда пану/зуму можно уводить кадр при данном count: не дальше `edge`
 * настоящих свечей с любого края — за ними уже пустое поле, симметрично
 * слева и справа, как в графике «Диапазон входа» (`RangeCheckChart`), где
 * `from` так же зажат в `[edge - count, len - edge]`. Правый край раньше
 * держался вплотную к живым свечам («в будущем данных нет») — но по той же
 * логике в будущем нет данных и у `RangeCheckChart`, а он всё равно даёт
 * оттащить последнюю свечу от края; пустое поле — это просто пустое поле,
 * а не утверждение о существовании данных. Общая для `resolveWindow` и
 * обработчиков жестов в `ReplayChart`, которым нужно знать эти границы ещё
 * до того, как состояние осядет и `resolveWindow` пересчитает их сама —
 * иначе «запас» перескролла копится сверх видимого и жест на возврате едет
 * вхолостую, прежде чем кадр вообще сдвинется.
 */
export function frameBounds(candles: { t: number }[], count: number, edgeMin = 3): { min: number; max: number } {
  const total = candles.length;
  const edge = Math.min(edgeMin, total);
  return { min: edge - count, max: total - edge };
}

/**
 * Где стоит окно просмотра: индексы для среза массива, ширина кадра и следит
 * ли оно за живым краем. Якорь хранится временем, а не индексом — массив
 * растёт слева при догрузке истории для пана, и индекс от этого сместился
 * бы, а время нет.
 *
 * Кадр умеет уезжать за любой край загруженных данных, оставляя пустое поле
 * (виртуальный `frameStart` отрицательный слева или такой, что `frameStart +
 * count` больше длины массива справа; `startIdx`/`endIdx` при этом зажаты в
 * границы массива) — иначе при короткой истории пан упирался бы в стену
 * намертво, а последние свечи было бы не оттащить от правого края холста.
 * «Живой» край (`anchorTime === null`) — это не предел `frameBounds`, а
 * конкретная позиция вплотную к последним свечам без пустоты справа: именно
 * туда встаёт кадр по умолчанию и по кнопке «→ сейчас», а в пустоту за этим
 * краем уводит только ручной пан.
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
  // «Живая» позиция — впритык к последним свечам (total - count), а не
  // maxFrameStart: тот теперь шире (пускает пустоту справа), и подставлять
  // его сюда сделало бы пустой правый отступ видом по умолчанию.
  const frameStart = clamp(
    view.anchorTime == null ? Math.max(0, total - count) : frameAtTime(candles, view.anchorTime),
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
 *
 * Границы — те же `frameBounds`, что у пана, а не свой отдельный `[0, total -
 * count]`: раньше зум пересчитывал позицию независимо от пана и обрезал её
 * этим более узким пределом на каждый шаг колеса, поэтому любая, даже
 * случайная прокрутка колеса/тачпада после пана отдёргивала кадр обратно к
 * живому краю — пан отодвигал свечи, а следующий же зум откатывал назад.
 */
export function zoomStep(
  candles: { t: number }[],
  baseIdx: number,
  frameCount: number,
  focalFrac: number,
  factor: number,
  bounds: WindowBounds,
  edgeMin = 3,
): { count: number; anchorTime: number | null } {
  const focalIdx = baseIdx + focalFrac * frameCount;
  const count = clamp(Math.round(frameCount * factor), bounds.minCount, bounds.maxCount);
  const { min: minStart, max: maxStart } = frameBounds(candles, count, edgeMin);
  const newStart = clamp(Math.round(focalIdx - focalFrac * count), minStart, maxStart);
  const flush = Math.max(0, candles.length - count);
  return { count, anchorTime: newStart === flush ? null : anchorTimeAt(candles, newStart) };
}
