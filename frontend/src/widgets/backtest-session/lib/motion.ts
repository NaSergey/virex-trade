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
 *
 * Позиция ДРОБНАЯ: 22.5 — кадр, начинающийся ровно посередине свечи 22.
 * Целая означала бы, что пан двигает график только по свече за раз, а жест
 * при этом непрерывный: на приближенном участке свеча занимает десятки
 * единиц холста, и кадр вместо следования за курсором прыгает через неё.
 * Внутри загруженного участка доля берётся интерполяцией между соседями, а
 * не делением на общий шаг: в истории бывают пропуски бакетов, и там деление
 * разъехалось бы с индексом.
 */
export function frameAtTime(candles: { t: number }[], time: number): number {
  const len = candles.length;
  if (len === 0) return 0;
  const step = stepOf(candles);
  if (time <= candles[0].t) return step > 0 ? -(candles[0].t - time) / step : 0;
  const last = candles[len - 1];
  if (time >= last.t) return step > 0 ? len - 1 + (time - last.t) / step : len - 1;
  const i = indexAtOrAfter(candles, time);
  if (candles[i].t === time) return i;
  const prev = candles[i - 1];
  const width = candles[i].t - prev.t;
  return width > 0 ? i - 1 + (time - prev.t) / width : i - 1;
}

/** Обратная операция: время якоря для позиции кадра (дробной и/или
    отрицательной) — пан/пинч используют, чтобы зафиксировать текущую позицию
    в `ViewState.anchorTime`. Строго обратна `frameAtTime`: иначе дробный пан
    терял бы долю свечи на каждом круге «позиция → время → позиция». */
export function anchorTimeAt(candles: { t: number }[], frameStart: number): number | null {
  const len = candles.length;
  if (len === 0) return null;
  const step = stepOf(candles) || 1;
  if (frameStart <= 0) return candles[0].t + frameStart * step;
  if (frameStart >= len - 1) return candles[len - 1].t + (frameStart - (len - 1)) * step;
  const i = Math.floor(frameStart);
  return candles[i].t + (frameStart - i) * (candles[i + 1].t - candles[i].t);
}

/** Насколько близко (в долях свечи) кадр должен подойти к последним свечам,
    чтобы считаться прижатым к живому краю. Ноль тут не годится: позиция
    дробная, точное попадание в край жестом практически недостижимо — и
    график перестал бы возвращаться в живой режим сам. */
const LIVE_SNAP = 0.25;

/**
 * Якорь для позиции кадра — но `null` (живой режим), если кадр фактически
 * стоит вплотную к последним свечам. Общий для пана и зума: решай они это
 * по-разному, жест, вернувший график к краю, оставлял бы кнопку «→ сейчас»
 * висеть над живым графиком.
 */
export function liveAnchorAt(candles: { t: number }[], frameStart: number, count: number): number | null {
  const flush = Math.max(0, candles.length - count);
  return Math.abs(frameStart - flush) < LIVE_SNAP ? null : anchorTimeAt(candles, frameStart);
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
  // Кадр стоит дробно, срез массива — нет: берём и свечу, начатую до левого
  // края, и свечу, начатую до правого. Обе видны краями, поэтому группа
  // свечей обрезается по ширине поля в самом графике — иначе половинка
  // вылезала бы на полосу цены справа.
  const startIdx = clamp(Math.floor(frameStart), 0, total);
  const endIdx = clamp(Math.ceil(frameStart + count), 0, total);
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
/**
 * «Круглый» шаг сетки цены — ближайшее сверху число вида 1/2/5×10^n. Тот же
 * принцип, что у любой биржевой шкалы: подписи стоят на числах, которые
 * глаз читает мгновенно (1000, 2000, 5000, …), а не на «диапазон поделили на
 * пять» — тот шаг был произвольной дробью и менялся на КАЖДЫЙ пиксель
 * ручного зума цены, хотя сами линии сетки визуально не сдвигались.
 */
export function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const frac = raw / base;
  const niceFrac = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return niceFrac * base;
}

/**
 * Линии сетки цены на видимый диапазон `[lo, hi]` — круглые числа с шагом
 * `niceStep`, а не фиксированное их количество: при сужении диапазона (зум)
 * помещается больше линий, и они обязаны появляться сами, а не растягивать
 * те же пять на весь кадр. `minGap` — наименьшее расстояние между соседними
 * линиями В ЦЕНЕ; в экранные пиксели его переводит вызывающий.
 *
 * Значения — от `n0 * step`, а не накоплением `+= step`: так соседние вызовы
 * с почти тем же `lo` (кадр за кадром вертикального пана) дают побитово
 * одно и то же число для одной и той же линии сетки — на этом строится ключ
 * элемента в ReplayChart, чтобы React обновлял позицию линии, а не
 * пересоздавал её каждый кадр.
 */
export function priceTicks(lo: number, hi: number, minGap: number): number[] {
  if (!(hi > lo) || !(minGap > 0)) return [];
  const step = niceStep(minGap);
  const n0 = Math.ceil(lo / step);
  const ticks: number[] = [];
  // Верхняя граница на число линий — защита от вырожденного вызова, а не
  // ожидаемый путь: на разумном minGap линий всегда на порядок меньше.
  const maxTicks = 200;
  for (let k = 0; k < maxTicks; k++) {
    const v = (n0 + k) * step;
    if (v > hi) break;
    ticks.push(v);
  }
  return ticks;
}

/**
 * Натуральный диапазон цены: что показывать, пока зум цены не тронут руками.
 *
 * Задают его ТОЛЬКО свечи — шкала существует ради них. Уровни сделки в расчёт
 * не идут совсем, и это намеренно: уровень волен стоять сколь угодно далеко от
 * цены (ликвидация при плече 2x — в 50 % от входа, при 1x вообще в нуле), а
 * размах ста двадцати минуток BTC — около полупроцента. Пущенный в расчёт,
 * такой уровень задавал бы масштаб вместо свечей и сплющивал весь ряд в черту,
 * причём ручным зумом это не лечилось бы: его предел считается от этого же
 * диапазона и раздувался бы вместе с ним. Уровень, не попавший в кадр, просто
 * уходит за его край — так же ведёт себя шкала биржевого терминала.
 *
 * Разница `hi - lo` — она же база для пределов ручного зума: раз диапазон
 * зависит только от свечей, «приблизить в N раз» значит в N раз относительно
 * того, что просят сами свечи.
 */
export function autoPriceRange(candles: { h: number; l: number }[], pad: number): { lo: number; hi: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of candles) {
    if (c.h > hi) hi = c.h;
    if (c.l < lo) lo = c.l;
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1 };
  // Поле по краям — доля размаха. Запасные слагаемые нужны для вырожденного
  // кадра (все свечи по одной цене): без них диапазон схлопнулся бы в точку, а
  // деление на (hi - lo) дало бы бесконечность.
  const padAbs = (hi - lo) * pad || Math.abs(hi) * 0.01 || 1;
  return { lo: lo - padAbs, hi: hi + padAbs };
}

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
  // Округляется только `count` — свечи либо влезают целиком, либо нет.
  // Начало кадра не округляется: на щелчке колеса это сдвиг картинки на
  // полсвечи, а на пинче, где жест непрерывный, — те же рывки, что у пана.
  const newStart = clamp(focalIdx - focalFrac * count, minStart, maxStart);
  return { count, anchorTime: liveAnchorAt(candles, newStart, count) };
}
