'use client';

import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useNonPassiveWheel } from '@/shared/lib/hooks/useNonPassiveWheel';
import { formatMoney, formatPriceGrouped } from '@/shared/lib/utils/format';
import { DrawingLayer } from './drawings/DrawingLayer';
import { useDrawingGestures, type ChartDrawingProps, type ChartGeo } from './drawings/useDrawingGestures';
import {
  anchorTimeAt,
  frameAtTime,
  frameBounds,
  glidePrice,
  liveAnchorAt,
  priceTicks,
  resolveWindow,
  zoomStep,
  type ViewState,
} from '../lib/motion';
import type { Candle } from '../lib/candles';

const W = 720;
/** Высота холста до первого замера коробки; дальше её задаёт сама коробка (см. H в компоненте). */
const DEFAULT_H = 380;
const PT = 14;
const PB = 24;
/** Полоса цены, пока ширину ещё нечем измерить (первый рендер до calibRef) —
    после него настоящая ширина всегда считается по самим цифрам, см. PR ниже. */
const DEFAULT_PR = 58;
/** Не уже: полоса должна оставаться удобной целью для драг-жеста масштаба
    цены (см. startPan), даже когда цифры сами по себе совсем узкие. */
const MIN_PR = 34;
/** Не шире: у монеты с длинной ценой полоса не должна отъедать половину
    графика ради того, что можно было бы сократить переносом разрядов. */
const MAX_PR = 110;
/** Отступ слева от поля свечей до начала текста цены и справа от текста до
    края холста, в экранных пикселях. */
const PRICE_LABEL_GAP_PX = 6;
const PRICE_LABEL_MARGIN_PX = 4;
/** Ширина символа моноширинного шрифта — доля от его кегля. Запасное
    значение на первый кадр, пока calibRef её не измерил по-настоящему
    (см. эффект калибровки ниже); типичный моноширинный шрифт близок к 0.6em. */
const PRICE_CHAR_RATIO_FALLBACK = 0.62;
/** Калибровочная строка для измерения ширины символа: только цифры — в
    моноширинном шрифте у пробела и точки та же ширина, что и у цифры, так
    что мерить их отдельно незачем. Десять разных цифр усредняют шум на
    случай, если шрифт не идеально моноширинный. */
const CALIBRATION_TEXT = '0123456789';
/** Условный кегль калибровочного текста — сам по себе не имеет значения:
    измеренное отношение ширина/кегль не зависит от того, каким кеглем мерить
    (шрифт масштабируется линейно), поэтому не нужно ждать реальный px(10). */
const CALIBRATION_FONT_SIZE = 10;
const DEFAULT_COUNT = 120;
/** Предел приближения — меньше свечей в кадре не показываем: на 20 тело
    свечи расползалось в толстый прямоугольник без полезной детали, а само
    приближение переставало что-либо добавлять к разбору сделки. */
const MIN_COUNT = 80;
const MAX_COUNT = 400;
/** Насколько близко к загруженному краю пан просит родителя догрузить историю. */
const EDGE_THRESHOLD = 15;
/** Наименьший экранный зазор между соседними линиями сетки цены — дальше
    priceTicks сама решает, на каком шаге (1/2/5×10^n) их расставить: линии
    добавляются и убираются по ходу зума, а не стоят фиксированной пятёркой. */
const MIN_TICK_GAP_PX = 46;
const ZOOM_STEP = 1.15;
/** Длительность плавного сдвига окна, если сверху не пришла своя (glide цены
    автопрокрутки) — например, у мгновенного «Шага». */
const FRAME_GLIDE_MS = 220;
/** Насколько узко/широко можно смасштабировать цену вручную — доля от
    натурального (авто) диапазона видимых свечей. */
const MIN_PRICE_FRAC = 0.15;
const MAX_PRICE_FRAC = 6;
/** С какого смещения по вертикали драг фона считается ещё и сдвигом цены —
    в экранных пикселях. Ноль тут не годится: горизонтальный жест почти всегда
    уводит курсор на пиксель-другой вниз, и любой пан выключал бы
    автоподбор диапазона цены, ни разу его заметно не сдвинув. */
const VPAN_THRESHOLD_PX = 4;
/** Сколько экранных пикселей вертикального драга по полосе цены меняют размах
    в e раз. Чем больше, тем спокойнее шкала отзывается на жест. */
const PRICE_DRAG_PX = 260;
/** Дальше этого числа маркеров в кадре подписи не рисуются — только стрелки:
    на плотной сессии подписи сливаются в сплошную полосу и мешают читать
    сами свечи, ради которых график и открыт. */
const MARKER_LABELS_MAX = 8;

export type LevelKind =
  | 'entry'
  | 'stop'
  | 'take'
  | 'liq'
  | 'limitClose'
  | 'orderEntry'
  | 'gridUpper'
  | 'gridLower'
  | 'gridPending';

/**
 * Отметка сделки на графике: где вошли и где вышли. Цена своя, а не свечная
 * (вход случается внутри свечи, по цене минутки), а вот позиция по горизонтали
 * — центр своей свечи: стрелка, повисшая между свечами, не читается как
 * «событие вот здесь».
 */
export interface Marker {
  id: string;
  kind: 'entry' | 'exit';
  /** Время события — по нему ищется свеча, над/под которой встанет стрелка. */
  time: number;
  price: number;
  direction: 'long' | 'short';
  /** Итог сделки — только у выхода: он и красит стрелку. */
  tone?: 'profit' | 'loss' | null;
  label: string;
}

export interface Level {
  /** Ключ строки — не kind: лимит-ордеров одного kind может быть несколько. */
  id: string;
  kind: LevelKind;
  price: number;
  draggable: boolean;
  /** Результат в USDT, если цена дойдёт до переданной — не у входа и не у ликвидации.
   * Функцией, а не числом: пока уровень тащат, подпись считается на цене под
   * курсором внутри графика, без рендера родителя на каждый кадр. */
  impactAt?: (price: number) => number | null;
  /** Чья это сделка — только у уровней открытой позиции (stop/take/entry/liq того трейда). */
  tradeId?: string;
}

const LEVEL_COLOR: Record<LevelKind, string> = {
  entry: 'var(--color-fg)',
  stop: 'var(--loss)',
  take: 'var(--profit)',
  liq: 'var(--loss)',
  limitClose: 'var(--color-muted)',
  orderEntry: 'var(--color-fg)',
  gridUpper: 'var(--color-fg)',
  gridLower: 'var(--color-fg)',
  gridPending: 'var(--color-muted)',
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * График прокрутки: свечи до текущего момента и уровни сделки.
 *
 * Своё SVG, как все графики продукта: библиотеке пришлось бы переопределять
 * цвета, шрифты и рамки по одному свойству. Холст масштабируется целиком,
 * пиксельные мерки переводятся в единицы холста через u = W / box.w.
 *
 * Окно показа (сколько свечей видно и какие) — состояние самого графика: пан
 * (драг) и зум двигают его напрямую, «живой край» включён по умолчанию и
 * возвращается двойным кликом по полю свечей (см. `onDoubleClick` ниже) —
 * двойной клик по полосе цены справа вместо этого сбрасывает ручной зум
 * цены, тем же жестом, каким `RangeCheckChart` сбрасывает `span`. Родитель
 * знает только о запросе догрузить историю, когда пан подходит к
 * загруженному краю (`onNeedHistory`). Смена таймфрейма (`timeframe`) сбрасывает
 * окно и зум цены прямо в рендере, а не пересозданием компонента по `key`: тот
 * терял бы измеренную ширину холста и калибровку шрифта, и первый кадр нового ТФ
 * рисовался бы в чужом масштабе, со сдвигом всего графика следующим кадром.
 *
 * Стоп и тейк перетаскиваются. Их «горячая зона» останавливает событие
 * (`stopPropagation`) — иначе один и тот же клик начинал бы и перетаскивание
 * уровня, и пан фона. Пока палец не отпущен, цена уровня — локальное состояние
 * графика (`drag.price`), и родитель узнаёт о ней один раз, по отпусканию
 * (`onDragLevel`): иначе каждый кадр жеста перерисовывал бы весь экран сессии —
 * панель ордера, таблицу позиций — ради одной линии.
 *
 * Живой сдвиг окна (новая свеча на автопрокрутке) анимирован — иначе на
 * коротком таймфрейме или высокой скорости весь набор точек SVG телепортируется
 * на ширину свечи по нескольку раз в секунду, и это читается как лаг, хотя
 * рендер не тормозит. Анимация — CSS-transition на transform группы свечей
 * (FLIP: перед новым кадром группу мгновенно откатывают на старую позицию,
 * следующим тактом включают transition и снимают откат), а не покадровый
 * пересчёт через requestAnimationFrame: свечи и так пересчитываются на каждый
 * живой тик, второй React-рендер на каждый кадр анимации поверх этого на
 * коротком ТФ/высокой скорости давал реальные просадки FPS, а transform на
 * compositor-потоке — нет, и потому работает на любой скорости одинаково
 * дёшево. Анимируется только сам «живой» прирост счётчика свечей — ручной
 * пан/зум и колёсный зум на живом краю остаются 1:1 с жестом.
 *
 * Полоса цены справа — своя ось: колесо там масштабирует видимый диапазон цены
 * (`priceRange`), а не число свечей, тем же приёмом удержания точки под
 * курсором, что и горизонтальный зум. `priceRange` держится, пока его не
 * сбросят двойным кликом — как `span` в `RangeCheckChart` — а не подстраивается
 * заново под каждую новую свечу, иначе ручной зум и не отличить от авто.
 *
 * Обёрнут в `memo`: рисует до сотен SVG-узлов (по два-три на свечу плюс
 * уровни), и без этого весь график перерисовывался бы на любой ре-рендер
 * родителя — включая тик слайдера риска, который к самому графику отношения
 * не имеет. Пропсы, которые родитель обязан держать стабильными между такими
 * тиками (`levels`, `labelFor`, колбэки), см. в SessionScreen.
 */
export const ReplayChart = memo(function ReplayChart({
  timeframe,
  candles,
  levels,
  markers,
  labelFor,
  levelLabel,
  onDragLevel,
  onNeedHistory,
  historyLoading,
  glide,
  drawing,
}: {
  /** ТФ свечей в `candles`, в минутах. */
  timeframe: number;
  candles: Candle[];
  levels: Level[];
  /** Входы и выходы сделок сессии; как и `levels`, ссылка обязана быть стабильной — см. memo ниже. */
  markers: Marker[];
  labelFor: (t: number) => string;
  levelLabel: (kind: LevelKind) => string;
  /** Уровень отпущен на новой цене. Вызывается один раз на жест. */
  onDragLevel?: (kind: LevelKind, price: number, tradeId?: string) => void;
  /** Пан подошёл к загруженному краю — время догрузить историю назад. */
  onNeedHistory?: () => void;
  historyLoading?: boolean;
  /** В настоящих для экрана (масштабированных) ценах — минутка, которую сейчас анимируем. */
  glide: { minute: Candle; durationMs: number } | null;
  /** Рисунки и инструмент панели; без него график без разметки. Ссылка стабильная — см. memo. */
  drawing?: ChartDrawingProps;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  // Двоеточия из useId в url(#...) не годятся — убираем; своего счётчика не
  // заводим: два графика на странице получили бы один id и один обрезался бы
  // по чужой области.
  const clipId = `replay-plot-${useId().replace(/:/g, '')}`;
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<{ id: string; kind: LevelKind; tradeId?: string; price: number } | null>(null);
  // Курсор — единственная подсказка, что фон вообще можно тащить: без неё
  // рабочий пан на глаз неотличим от графика, прибитого к живому краю.
  const [grabbing, setGrabbing] = useState(false);
  const frozen = useRef<{ lo: number; hi: number } | null>(null);
  const lastDrag = useRef<number | null>(null);
  /** Указатель, который тащит уровень — чтобы движение/отпускание другого пальца его не задевало. */
  const dragPointerId = useRef<number | null>(null);
  const [view, setView] = useState<ViewState>({ count: DEFAULT_COUNT, anchorTime: null });
  // Якорь пана/пинча — время свечи, а не индекс: догрузка истории при подходе
  // к краю (onNeedHistory) может прямо во время того же жеста добавить свечи
  // в начало массива и сдвинуть все индексы — время сдвиг не портит.
  const panRef = useRef<{
    startX: number;
    anchorT: number | null;
    count: number;
    slot: number;
    /** Вертикальная часть жеста: с какой точки и от какого диапазона цены
        считать сдвиг. Включается только после VPAN_THRESHOLD_PX (см. там). */
    startY: number;
    lo: number;
    hi: number;
    vertical: boolean;
  } | null>(null);
  /** Драг по полосе цены справа — масштаб цены курсором, без колеса. */
  const priceDragRef = useRef<{ startY: number; lo: number; hi: number } | null>(null);
  /** Формирующаяся свеча в середине анимации — с ТФ, на котором её посчитали. */
  const [animCandle, setAnimCandle] = useState<(Candle & { tf: number }) | null>(null);
  const prevLastRef = useRef<Candle | null>(null);
  // Ручной зум цены — null, пока не тронут (тогда диапазон авто-подгоняется
  // под видимые свечи); сброс — двойной клик, как у span в RangeCheckChart.
  const [priceRange, setPriceRange] = useState<{ lo: number; hi: number } | null>(null);
  // Новый ТФ — окно к живому краю, зум цены сброшен: пан и зум, набранные на одних
  // свечах, на другом наборе бессмысленны. Прямо в рендере — тот же кадр уже с новым видом.
  const [viewTf, setViewTf] = useState(timeframe);
  if (viewTf !== timeframe) {
    setViewTf(timeframe);
    setView({ count: DEFAULT_COUNT, anchorTime: null });
    setPriceRange(null);
    setAnimCandle(null);
  }
  // Плавный сдвиг «живого» окна (FLIP через CSS-transition) — группа свечей
  // и меток времени, которую двигаем; остальное — снимок предыдущего тика,
  // чтобы отличить «появилась новая свеча» от пана/зума/клика «→ сейчас».
  const shiftGroupRef = useRef<SVGGElement>(null);
  const prevFrameStartRef = useRef<number | null>(null);
  const prevTotalRef = useRef<number | null>(null);
  const prevCountRef = useRef<number | null>(null);
  const prevTfRef = useRef(timeframe);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; count: number; anchorT: number | null; midFrac: number } | null>(null);
  /** Жесты применяются раз в кадр (см. onMove): здесь копятся последние координаты
      указателя, тащащего уровень; координаты фона лежат в pointersRef. */
  const levelMoveY = useRef<number | null>(null);
  const moveRaf = useRef(0);
  const applyMoveRef = useRef<() => void>(() => undefined);
  /**
   * Колёсный зум висит на нативном (не React) листенере, чтобы звать
   * preventDefault — React с версии 17 держит onWheel пассивным, и внутри
   * него preventDefault просто не работает. Листенеру нужны свежие
   * frameStart/count/candles на момент события, а не из замыкания при монтаже —
   * отсюда ref, обновляемый каждый рендер.
   */
  const latestRef = useRef({
    frameStart: 0,
    count: DEFAULT_COUNT,
    candles: [] as Candle[],
    lo: 0,
    hi: 1,
    autoLo: 0,
    autoHi: 1,
    pw: W - DEFAULT_PR,
    h: DEFAULT_H,
  });

  // До отрисовки: с box.w = 0 первый кадр шёл бы в масштабе u = 1 — крупные подписи и
  // другая ширина полосы цены, и следующим кадром весь график съезжал бы на место.
  useLayoutEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const measure = (w: number, h: number) => setBox((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    const r = el.getBoundingClientRect();
    measure(r.width, r.height);
    const ro = new ResizeObserver(([entry]) => measure(entry.contentRect.width, entry.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const u = box.w > 0 ? W / box.w : 1;
  const px = (n: number) => n * u;
  // Высота холста — по форме самой коробки, а не константой: график заполняет то, что
  // ему отдала раскладка (остаток экрана над кнопками шага), и `viewBox` совпадает с
  // ней по пропорции — без полей по краям и без растяжения текста. Ширина по-прежнему W,
  // поэтому мерки в пикселях (px) остаются теми же.
  const H = box.w > 0 && box.h > 0 ? box.h * u : DEFAULT_H;

  /**
   * Ширина полосы цены считается по самим цифрам (см. PR ниже), а не
   * фиксированной константой — та либо оставляла зазор впустую у короткой
   * цены (мелкая монета, «0.1234»), либо теснила крупную («123 456.00»).
   * Символы моноширинные, поэтому измерять реальный лейбл на каждый кадр
   * пана не нужно — достаточно знать долю кегля на один символ ОДИН раз (её
   * и меряет `charRatio`), а дальше ширина — число символов × эта доля ×
   * кегль, чистая арифметика.
   *
   * Мерка — в useLayoutEffect (до отрисовки кадра браузером), а не при
   * монтировании через промис: калибровочный текст уже стоит в DOM после
   * первого рендера (со запасным `PRICE_CHAR_RATIO_FALLBACK`), и синхронная
   * поправка перед покраской не даёт мигнуть неверной шириной. Довесок на
   * `document.fonts.ready` — на случай, если веб-шрифт в момент первого
   * измерения ещё не подгрузился и браузер мерил по запасному системному.
   */
  const calibRef = useRef<SVGTextElement>(null);
  const [charRatio, setCharRatio] = useState(PRICE_CHAR_RATIO_FALLBACK);
  useLayoutEffect(() => {
    const measure = () => {
      const el = calibRef.current;
      if (!el) return;
      const len = el.getComputedTextLength();
      const ratio = len / (CALIBRATION_TEXT.length * CALIBRATION_FONT_SIZE);
      if (ratio > 0) setCharRatio((prev) => (Math.abs(prev - ratio) > 0.002 ? ratio : prev));
    };
    measure();
    document.fonts?.ready?.then(measure).catch(() => undefined);
  }, []);

  // Колёсному зуму нужны свежие frameStart/count/candles на момент события, а не
  // из замыкания при монтаже — читает их из latestRef, а не из состояния,
  // поэтому сам колбэк стабилен и слушатель не перевешивается на каждый рендер.
  const onWheel = useCallback((e: WheelEvent) => {
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const xFrac = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    // Вниз по колесу над свечами — крупнее (меньше свечей в кадре), вверх —
    // мельче: развёрнуто относительно «естественного» deltaY>0 = «отдалить».
    const factor = e.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    // Полоса цены справа — своя ось: колесо там масштабирует видимый диапазон
    // цены, а не число свечей. Тот же приём, что у горизонтального зума —
    // точка под курсором (здесь по вертикали) остаётся на месте. Ширина
    // полосы (`pw`) теперь сама зависит от рендера (см. PR у return-выражения
    // компонента) — колбэк стабилен (deps: []), поэтому читает её из
    // latestRef, а не из замыкания, как и остальные быстро устаревающие поля.
    if (xFrac > latestRef.current.pw / W) {
      const { lo: curLo, hi: curHi, autoLo, autoHi } = latestRef.current;
      const h = latestRef.current.h;
      const plotH = h - PT - PB;
      const yFrac = clamp(((e.clientY - rect.top) / rect.height) * h - PT, 0, plotH) / plotH;
      const anchor = curHi - yFrac * (curHi - curLo);
      const autoRange = autoHi - autoLo;
      // Направление развёрнуто относительно горизонтального зума нарочно:
      // вниз по колесу над полосой цены — диапазон шире (вид отдаляется),
      // вверх — уже. Тем же разворотом отвечает и драг по полосе (см. applyMove).
      const priceFactor = e.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const newRange = clamp((curHi - curLo) * priceFactor, autoRange * MIN_PRICE_FRAC, autoRange * MAX_PRICE_FRAC);
      const newHi = anchor + yFrac * newRange;
      setPriceRange({ lo: newHi - newRange, hi: newHi });
      return;
    }
    const { frameStart: s, count: c, candles: cs } = latestRef.current;
    setView(zoomStep(cs, s, c, xFrac, factor, { minCount: MIN_COUNT, maxCount: MAX_COUNT }));
  }, []);
  useNonPassiveWheel(svgRef, onWheel);

  const { frameStart, startIdx, endIdx, count, live } = resolveWindow(candles, view, {
    minCount: MIN_COUNT,
    maxCount: MAX_COUNT,
  });
  const shown = candles.slice(startIdx, endIdx);

  // Пан подошёл к загруженному краю — просим родителя догрузить историю
  // назад. Догрузка добавляет свечи в начало массива; окно держится за
  // anchorTime, а не за индекс, поэтому сдвиг массива его не портит.
  useEffect(() => {
    if (!live && startIdx <= EDGE_THRESHOLD && !historyLoading) onNeedHistory?.();
  }, [startIdx, live, historyLoading, onNeedHistory]);

  /**
   * Плавный сдвиг «живого» окна — FLIP на группе свечей/меток времени:
   * свечи и так уже пересчитаны на новую (верную) позицию обычным рендером,
   * этот эффект в useLayoutEffect (до отрисовки кадра браузером) на мгновение
   * откатывает группу назад transform'ом без transition, вынуждает браузер
   * применить откат синхронным чтением layout (`getBoundingClientRect`), а
   * следующим шагом включает transition и снимает откат — дальше анимацию
   * ведёт сам браузер на compositor-потоке, без дополнительных React-рендеров.
   *
   * Срабатывает узко: только когда `count` не менялся (не зум) и в массиве
   * реально появились новые свечи (не пан, не клик «→ сейчас» — там frameStart
   * прыгает по другой причине и должен остаться мгновенным, 1:1 с жестом).
   */
  useLayoutEffect(() => {
    const prevTarget = prevFrameStartRef.current;
    const prevTotal = prevTotalRef.current;
    const prevCount = prevCountRef.current;
    const prevTf = prevTfRef.current;
    prevFrameStartRef.current = frameStart;
    prevTotalRef.current = candles.length;
    prevCountRef.current = count;
    prevTfRef.current = timeframe;
    const el = shiftGroupRef.current;
    if (!el) return;
    const dragging = drag != null || panRef.current != null || pinchRef.current != null;
    // Смена ТФ тоже двигает frameStart и число свечей, но это другой ряд, а не новая
    // свеча — «проезд» старого графика в новый был бы враньём.
    const isLiveTick =
      live &&
      !dragging &&
      prevTf === timeframe &&
      prevTarget != null &&
      prevTarget !== frameStart &&
      prevCount === count &&
      prevTotal !== candles.length;
    if (!isLiveTick) {
      // Запись в style только если там что-то стоит: на пане frameStart меняется
      // каждый кадр, и безусловная запись каждый кадр же инвалидировала бы стили
      // группы со всеми свечами.
      if (el.style.transform || el.style.transition) {
        el.style.transition = 'none';
        el.style.transform = '';
      }
      return;
    }
    const slotNow = count > 0 ? PW / count : PW;
    const deltaPx = (frameStart - prevTarget) * slotNow;
    el.style.transition = 'none';
    el.style.transform = `translateX(${deltaPx}px)`;
    // Форсируем применение отката ДО включения transition — иначе браузер
    // схлопнёт оба присваивания в один кадр, и анимации не будет видно.
    void el.getBoundingClientRect();
    const duration = glide?.durationMs ?? FRAME_GLIDE_MS;
    el.style.transition = `transform ${duration}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
    el.style.transform = 'translateX(0px)';
    // Зависимости — узко только то, что решает isLiveTick: без них эффект
    // перезапускался бы на КАЖДЫЙ ре-рендер (в т.ч. на ценовой glide
    // формирующейся свечи, который тикает так же часто) и обрубал бы
    // transition ещё до того, как он успел бы визуально доиграть.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameStart, live, count, candles.length, timeframe]);

  useEffect(() => {
    // На монтировании и на смене ТФ — база для первого тика: иначе уже накопленная
    // часть формирующейся свечи «обрушилась» бы до открытия на первой анимации.
    prevLastRef.current = candles.length ? candles[candles.length - 1] : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe]);

  // Кадр анимации сверяет ТФ с тем, на котором она началась: без этого запущенный на
  // 4ч тик доигрывал бы до секунды уже на минутках и красил бы свечу с тем же временем
  // открытия — где-то слева, а не формирующуюся. В layout-эффекте — до любого rAF.
  const timeframeRef = useRef(timeframe);
  useLayoutEffect(() => {
    timeframeRef.current = timeframe;
  }, [timeframe]);

  useEffect(() => {
    if (!glide) return;
    // Формирующаяся — последняя свеча ряда, а не окна: с отведённым от края паном
    // последней в окне стоит давно закрытая, и анимировать её нельзя.
    const newLast = candles.length ? candles[candles.length - 1] : null;
    if (!newLast) return;
    const tf = timeframe;
    const prev = prevLastRef.current;
    const sameBucket = prev != null && prev.t === newLast.t;
    const base = sameBucket
      ? prev!
      : { t: newLast.t, o: glide.minute.o, h: glide.minute.o, l: glide.minute.o, c: glide.minute.o };
    const { minute, durationMs } = glide;
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      if (timeframeRef.current !== tf) return;
      const ph = Math.min(1, (now - t0) / durationMs);
      const price = glidePrice(minute.o, minute.h, minute.l, minute.c, ph);
      if (ph < 1) {
        setAnimCandle({ tf, t: newLast.t, o: base.o, h: Math.max(base.h, price), l: Math.min(base.l, price), c: price });
        raf = requestAnimationFrame(frame);
      } else {
        setAnimCandle(null); // доигралось — дальше рисуем настоящие финальные значения
      }
    };
    raf = requestAnimationFrame(frame);
    prevLastRef.current = newLast;
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glide]);

  // Натуральный (авто) диапазон — считается всегда, а не только когда
  // используется: он же служит базой для границ ручного зума цены (колесо
  // справа), которые должны отталкиваться от текущих видимых свечей, а не от
  // застывшего значения на момент первого зума.
  // Циклом, а не Math.min(...values)/Math.max(...values): спред на массиве
  // высот-минимумов до ~800 чисел (до 400 свечей × 2) выделял бы промежуточный
  // массив и распаковывал его в аргументы на каждый тик драга уровня.
  let autoLo = Infinity;
  let autoHi = -Infinity;
  for (const c of shown) {
    if (c.h > autoHi) autoHi = c.h;
    if (c.l < autoLo) autoLo = c.l;
  }
  for (const l of levels) {
    if (l.price > autoHi) autoHi = l.price;
    if (l.price < autoLo) autoLo = l.price;
  }
  if (!Number.isFinite(autoLo) || !Number.isFinite(autoHi)) {
    autoLo = 0;
    autoHi = 1;
  }
  const autoPad = (autoHi - autoLo) * 0.06 || Math.abs(autoHi) * 0.01 || 1;
  autoLo -= autoPad;
  autoHi += autoPad;

  let lo: number;
  let hi: number;
  if (drag && frozen.current) {
    ({ lo, hi } = frozen.current);
  } else if (priceRange) {
    ({ lo, hi } = priceRange);
  } else {
    lo = autoLo;
    hi = autoHi;
  }

  const plotH = H - PT - PB;
  const y = (p: number) => PT + ((hi - p) / (hi - lo)) * plotH;
  const priceAt = (yy: number) => clamp(hi - ((yy - PT) / plotH) * (hi - lo), lo, hi);

  // Сетка цены — раньше slot/cx/bodyW ниже: та зависит от PW, а PW теперь
  // сам зависит от того, сколько места нужно самим цифрам (см. PR).
  const ticks = priceTicks(lo, hi, ((hi - lo) * px(MIN_TICK_GAP_PX)) / plotH);
  const tickLabels: [number, string][] = ticks.map((p) => [p, formatPriceGrouped(p)]);
  // Полоса цены — по размеру самих цифр, не фиксированной константой: та
  // либо теснила крупную монету, либо впустую отъедала место у свечей ради
  // мелкой. Знак моноширинный, так что ширину даёт готовая арифметика
  // (число знаков × ширина знака), без измерения каждого лейбла на каждый
  // кадр пана.
  const maxLabelChars = tickLabels.reduce((m, [, label]) => Math.max(m, label.length), 0);
  const PR =
    maxLabelChars > 0
      ? clamp(maxLabelChars * charRatio * px(10) + px(PRICE_LABEL_GAP_PX) + px(PRICE_LABEL_MARGIN_PX), MIN_PR, MAX_PR)
      : DEFAULT_PR;
  const PW = W - PR;

  const slot = count > 0 ? PW / count : PW;
  useEffect(() => {
    latestRef.current = { frameStart, count, candles, lo, hi, autoLo, autoHi, pw: PW, h: H };
  });
  // Позиция свечи по её АБСОЛЮТНОМУ индексу в candles — всегда «верная»
  // (без анимационного отставания): сам сдвиг окна визуально доигрывает FLIP
  // выше через transform группы, а не эта формула.
  const cx = (absIdx: number) => (absIdx - frameStart) * slot + slot / 2;
  const bodyW = Math.max(px(1), slot * 0.66);

  const svgY = (clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return ((clientY - r.top) / r.height) * H;
  };
  const svgX = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * W;
  };

  /**
   * Геометрия для жестов рисования: обработчики событий читают её из рефа, а не
   * из замыкания рендера, в котором их повесили, — между рендером и событием
   * успевают пройти пан и зум.
   */
  const geoRef = useRef<ChartGeo>(null as unknown as ChartGeo);
  const draw = useDrawingGestures(drawing, geoRef);
  const tfMs = timeframe * 60_000;
  const xOfTime = (t: number) => (frameAtTime(candles, t) - frameStart) * slot + slot / 2;
  useLayoutEffect(() => {
    geoRef.current = {
      svg: svgRef.current,
      svgX,
      svgY,
      timeAt: (x, snap) => {
        const f = frameStart + (x - slot / 2) / slot;
        return anchorTimeAt(candles, snap ? Math.round(f) : f) ?? 0;
      },
      priceAt,
      yOf: y,
      candleAt: (t) => {
        const i = Math.round(frameAtTime(candles, t));
        return i >= 0 && i < candles.length ? candles[i] : null;
      },
      px,
      PW,
      lo,
      hi,
      tfMs,
    };
  });

  const startDrag = (level: Level) => (e: PointerEvent<SVGRectElement>) => {
    // Не пускаем событие к фоновому пану — иначе на одном клике начались бы
    // сразу оба жеста. preventDefault — иначе браузер начинает своё выделение
    // текста рядом с курсором вместо перетаскивания уровня.
    e.stopPropagation();
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    frozen.current = { lo, hi };
    dragPointerId.current = e.pointerId;
    lastDrag.current = null;
    setDrag({ id: level.id, kind: level.kind, tradeId: level.tradeId, price: level.price });
  };

  const startPan = (e: PointerEvent<SVGSVGElement>) => {
    if (draw.down(e)) return;
    // Без этого браузер начинает нативное выделение текста (подписи цен и
    // времени внутри SVG) вместо сдвига графика — драг визуально «залипает».
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setGrabbing(true);
    if (pointersRef.current.size === 2) {
      panRef.current = null;
      const [a, b] = [...pointersRef.current.values()];
      const rect = svgRef.current!.getBoundingClientRect();
      pinchRef.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        count,
        anchorT: anchorTimeAt(candles, frameStart),
        midFrac: clamp(((a.x + b.x) / 2 - rect.left) / rect.width, 0, 1),
      };
      return;
    }
    // Полоса цены справа — своя ось, и жест на ней свой: вертикальный драг
    // масштабирует диапазон цены. Тем же движением, что и колесо над полосой,
    // — иначе одна и та же ось отвечала бы на два жеста по-разному.
    if (svgX(e.clientX) > PW) {
      panRef.current = null;
      priceDragRef.current = { startY: svgY(e.clientY), lo, hi };
      return;
    }
    panRef.current = {
      startX: svgX(e.clientX),
      anchorT: anchorTimeAt(candles, frameStart),
      count,
      slot,
      startY: svgY(e.clientY),
      lo,
      hi,
      vertical: false,
    };
  };

  /**
   * Применение жеста — по накопленным координатам, раз в кадр (см. onMove).
   */
  const applyMove = () => {
    if (drag && levelMoveY.current != null) {
      const p = priceAt(svgY(levelMoveY.current));
      levelMoveY.current = null;
      // В ref — для отпускания: endDrag читает цену в том же обработчике, где
      // обновление состояния ниже ещё не применено.
      lastDrag.current = p;
      setDrag((d) => (d ? { ...d, price: p } : d));
    }
    const pts = [...pointersRef.current.values()];
    if (pts.length === 0) return;
    const priceDrag = priceDragRef.current;
    if (priceDrag) {
      // Вниз — растянуть (диапазон шире, вид отдаляется), вверх — сжать:
      // тот же разворот, что и у колеса над полосой (см. onWheel), чтобы
      // жест и прокрутка не спорили друг с другом. Экспонента, а не линейный
      // коэффициент: масштаб мультипликативен, и одинаковое движение руки
      // должно давать одинаковое изменение и в растянутом, и в сжатом виде.
      const dy = svgY(pts[0].y) - priceDrag.startY;
      const { autoLo: aLo, autoHi: aHi } = latestRef.current;
      const autoRange = aHi - aLo;
      const base = priceDrag.hi - priceDrag.lo;
      const mid = (priceDrag.hi + priceDrag.lo) / 2;
      const range = clamp(base * Math.exp(dy / px(PRICE_DRAG_PX)), autoRange * MIN_PRICE_FRAC, autoRange * MAX_PRICE_FRAC);
      setPriceRange({ lo: mid - range / 2, hi: mid + range / 2 });
      return;
    }
    const pinch = pinchRef.current;
    if (pinch && pts.length === 2) {
      const [a, b] = pts;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      // Защита от деления на ноль — редкий, но возможный случай, когда два
      // указателя совпадают по координате в момент начала пинча.
      const ratio = pinch.dist === 0 ? 1 : dist / pinch.dist;
      const baseFrame = pinch.anchorT != null ? frameAtTime(candles, pinch.anchorT) : 0;
      setView(zoomStep(candles, baseFrame, pinch.count, pinch.midFrac, 1 / ratio, { minCount: MIN_COUNT, maxCount: MAX_COUNT }));
      return;
    }
    const pan = panRef.current;
    if (!pan) return;
    const pt = pts[0];

    // Вертикальная часть того же драга: диапазон цены едет за курсором, чтобы
    // график можно было поставить выше или ниже. До порога жест считается
    // чисто горизонтальным и авто-подбор диапазона не трогается; в момент
    // превышения отсчёт начинается заново от текущей точки — иначе график
    // прыгнул бы на накопленные пиксели.
    const dyRaw = svgY(pt.y) - pan.startY;
    if (!pan.vertical && Math.abs(dyRaw) > px(VPAN_THRESHOLD_PX)) {
      pan.vertical = true;
      pan.startY = svgY(pt.y);
      pan.lo = lo;
      pan.hi = hi;
    }
    if (pan.vertical) {
      // Цена под курсором обязана остаться под курсором: сдвигаем обе границы
      // на то же расстояние в ценах, что курсор прошёл в долях поля.
      const shift = ((svgY(pt.y) - pan.startY) / plotH) * (pan.hi - pan.lo);
      setPriceRange({ lo: pan.lo + shift, hi: pan.hi + shift });
    }

    const dx = svgX(pt.x) - pan.startX;
    // Сдвиг в долях свечи, без округления: жест непрерывный, и кадр обязан
    // идти за курсором 1:1. Округление до целой свечи копило отставание до
    // полуслота и отдавало его скачком — на быстром движении это читается как
    // лаг, хотя рендер успевает.
    const deltaSlots = dx / pan.slot;
    const baseFrame = pan.anchorT != null ? frameAtTime(candles, pan.anchorT) : 0;
    // Зажимаем сразу здесь, а не только в resolveWindow — иначе «запас»
    // перескролла копится сверх видимого, и жест на возврате едет вхолостую,
    // прежде чем кадр вообще сдвинется с места.
    const { min: minFrame, max: maxFrame } = frameBounds(candles, pan.count);
    const newFrame = clamp(baseFrame - deltaSlots, minFrame, maxFrame);
    // «Живой» — только вплотную к последним свечам, а не весь путь до
    // maxFrame: тот теперь пускает дальше, в пустоту справа, и её нужно уметь
    // удержать вместо того, чтобы тут же схлопнуться обратно в live.
    const anchorTime = liveAnchorAt(candles, newFrame, pan.count);
    // Сверяемся с прежним состоянием: движение поперёк графика и любое,
    // упёршееся в границу, иначе гоняло бы перерисовку сотен узлов SVG
    // впустую — новый объект состояния React принял бы за изменение.
    setView((v) => (v.count === pan.count && v.anchorTime === anchorTime ? v : { count: pan.count, anchorTime }));
  };

  // Свежая версия — для кадра, запланированного на прошлом рендере: иначе rAF
  // применил бы жест со значениями lo/hi/candles того рендера, где его завели.
  useEffect(() => {
    applyMoveRef.current = applyMove;
  });
  useEffect(() => () => cancelAnimationFrame(moveRaf.current), []);

  /** Применить отложенный кадр жеста сейчас — перед отпусканием, чтобы последнее движение не потерялось. */
  const flushMove = () => {
    if (!moveRaf.current) return;
    cancelAnimationFrame(moveRaf.current);
    moveRaf.current = 0;
    applyMoveRef.current();
  };

  /**
   * Событие указателя только запоминает координаты, а жест применяется раз в
   * кадр. Мышь с высокой частотой опроса и тачпад шлют сотни pointermove в
   * секунду — больше, чем экран показывает кадров, — и каждое раньше
   * перерисовывало весь график: на отдалённом графике сотни свечей
   * пересчитывались по нескольку раз между двумя кадрами, из которых на экран
   * попадал только последний. Так работают и биржевые терминалы: сколько бы
   * событий ни пришло, отрисовка — одна на кадр.
   */
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (draw.move(e)) return;
    // Только указатель, начавший драг уровня — иначе второй палец на фоне (пан)
    // дёргал бы уровень чужим движением.
    if (drag && e.pointerId === dragPointerId.current) levelMoveY.current = e.clientY;
    else if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    else return;
    if (!moveRaf.current) {
      moveRaf.current = requestAnimationFrame(() => {
        moveRaf.current = 0;
        applyMoveRef.current();
      });
    }
  };

  const endDrag = (e: PointerEvent<SVGSVGElement>) => {
    if (draw.up(e)) return;
    flushMove();
    priceDragRef.current = null;
    pointersRef.current.delete(e.pointerId);
    const remaining = [...pointersRef.current.entries()];
    if (remaining.length < 2) pinchRef.current = null;
    if (remaining.length === 0) setGrabbing(false);
    if (drag && e.pointerId === dragPointerId.current) {
      if (onDragLevel && lastDrag.current != null) onDragLevel(drag.kind, lastDrag.current, drag.tradeId);
      setDrag(null);
      frozen.current = null;
      lastDrag.current = null;
      dragPointerId.current = null;
      return;
    }
    if (remaining.length === 1) {
      // Пинч завершился отпусканием одного из двух пальцев — продолжаем
      // панорамирование оставшимся, а не ждём нового касания.
      const [, pos] = remaining[0];
      panRef.current = {
        startX: svgX(pos.x),
        anchorT: anchorTimeAt(candles, frameStart),
        count,
        slot,
        startY: svgY(pos.y),
        lo,
        hi,
        vertical: false,
      };
    } else {
      panRef.current = null;
    }
  };

  const goLive = () => setView((v) => ({ ...v, anchorTime: null }));

  /**
   * Свечи — четыре пути на весь кадр (фитили и тела, отдельно по цвету), а не
   * `<g><line/><rect/></g>` на свечу. Отдалённый график — это до 400 свечей, то
   * есть больше тысячи SVG-узлов, которые React сверял бы и браузер
   * перекладывал бы в каждом кадре пана. Строка пути на 400 свечей
   * собирается за доли миллисекунды, а узлов остаётся четыре при любом
   * масштабе — тот же принцип, по которому терминалы рисуют весь ряд одним
   * проходом.
   *
   * Формирующаяся свеча в пути не участвует — её рисует отдельная пара узлов
   * ниже: glide перерисовывает её каждый кадр анимации, и без этого на каждый
   * такой кадр пересобирались бы пути всего кадра, хотя меняется одна свеча.
   */
  // Анимируется только последняя свеча текущего ТФ. Кадр от прежнего ТФ, успевший
  // прийти между сменой ряда и остановкой анимации, пропускается — иначе он лёг бы
  // на чужую свечу с тем же временем открытия.
  const lastT = candles.length ? candles[candles.length - 1].t : null;
  const anim = animCandle != null && animCandle.tf === timeframe && animCandle.t === lastT ? animCandle : null;
  const animT = anim?.t ?? null;
  const candlePaths = useMemo(() => {
    const plotHeight = H - PT - PB;
    const yOf = (p: number) => PT + ((hi - p) / (hi - lo)) * plotHeight;
    const r = (v: number) => Math.round(v * 100) / 100;
    const minBody = u; // один экранный пиксель в единицах холста
    let upWicks = '';
    let upBodies = '';
    let downWicks = '';
    let downBodies = '';
    for (let i = startIdx; i < endIdx; i++) {
      const c = candles[i];
      if (c.t === animT) continue;
      const x = (i - frameStart) * slot + slot / 2;
      const top = yOf(Math.max(c.o, c.c));
      const height = Math.max(minBody, yOf(Math.min(c.o, c.c)) - top);
      const wick = `M${r(x)} ${r(yOf(c.h))}V${r(yOf(c.l))}`;
      const body = `M${r(x - bodyW / 2)} ${r(top)}h${r(bodyW)}v${r(height)}h${r(-bodyW)}z`;
      if (c.c >= c.o) {
        upWicks += wick;
        upBodies += body;
      } else {
        downWicks += wick;
        downBodies += body;
      }
    }
    return { upWicks, upBodies, downWicks, downBodies };
  }, [candles, startIdx, endIdx, frameStart, slot, lo, hi, bodyW, u, animT, H]);

  let animBar: { x: number; wickTop: number; wickBottom: number; top: number; height: number; color: string } | null = null;
  if (anim) {
    const ai = candles.length - 1;
    if (ai >= startIdx && ai < endIdx) {
      const top = y(Math.max(anim.o, anim.c));
      animBar = {
        x: cx(ai),
        wickTop: y(anim.h),
        wickBottom: y(anim.l),
        top,
        height: Math.max(px(1), y(Math.min(anim.o, anim.c)) - top),
        color: anim.c >= anim.o ? 'var(--profit)' : 'var(--loss)',
      };
    }
  }

  // Маркеры в кадре: позиция — своя свеча (floor от дробного места во
  // времени), а не точка между свечами. Уехавшие по цене за видимый диапазон
  // пропускаем совсем, иначе они лепились бы к краю поля, показывая не своё
  // место.
  // Свеча каждого маркера ищется бинарным поиском — один раз на смену сделок
  // или свечей, а не в каждом кадре пана по всем сделкам сессии.
  const markerIdx = useMemo(
    () => markers.map((m) => ({ m, idx: Math.floor(frameAtTime(candles, m.time)) })),
    [markers, candles],
  );
  const shownMarkers = markerIdx.filter(
    ({ m, idx }) => idx >= startIdx - 1 && idx < endIdx + 1 && m.price >= lo && m.price <= hi,
  );
  const markerLabels = shownMarkers.length <= MARKER_LABELS_MAX;

  const shownDrawings = drawing
    ? [
        ...(draw.override ? drawing.drawings.map((d) => (d.id === draw.override!.id ? draw.override! : d)) : drawing.drawings),
        ...(draw.preview ? [draw.preview] : []),
      ]
    : [];

  const timeIdx = shown.length ? [...new Set([0.15, 0.5, 0.85].map((f) => Math.floor(f * (shown.length - 1))))] : [];

  return (
    <div className="replay-chart-wrap">
      <svg
        ref={svgRef}
        className="replay-chart"
        style={{ cursor: drawing?.tool ? 'crosshair' : grabbing ? 'grabbing' : 'grab' }}
        viewBox={`0 0 ${W} ${H}`}
        onPointerDown={startPan}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={(e) => {
          if (draw.blocksDoubleClick()) return;
          // Полоса цены — сбрасывает только ручной зум цены, независимо от
          // того, live график или нет: та же граница, что у startPan
          // (svgX > PW), и тот же жест, каким RangeCheckChart сбрасывает span.
          if (svgX(e.clientX) > PW) {
            setPriceRange(null);
            return;
          }
          // Поле свечей: если график отведён от живого края — двойной клик
          // возвращает к нему (замена убранной кнопки «→ сейчас», см. live
          // выше). Если уже live, вести назад некуда — тогда клик сбрасывает
          // ручной зум цены, как раньше делал в любой точке графика.
          if (!live) {
            goLive();
            return;
          }
          setPriceRange(null);
        }}
      >
        {/* Кадр стоит дробно, поэтому крайние свечи видны половинками —
            поле со свечами режется по ширине, иначе правая половинка налезала
            бы на полосу цены. Левая ушла бы за viewBox и так, но резать обе
            одним прямоугольником честнее, чем полагаться на это. */}
        <defs>
          <clipPath id={clipId}>
            <rect x={0} y={0} width={PW} height={H} />
          </clipPath>
        </defs>

        {/* Невидимая (за пределами viewBox) калибровка ширины символа —
            измеряется в useLayoutEffect выше, ею считается PR. */}
        <text ref={calibRef} x={-1000} y={-1000} fontSize={CALIBRATION_FONT_SIZE} fontFamily="var(--font-mono)" aria-hidden="true">
          {CALIBRATION_TEXT}
        </text>

        {/* Ключ — само значение линии, не индекс: priceTicks отдаёт круглые
            числа (см. её комментарий про побитовую стабильность между
            кадрами), и почти все они остаются теми же при небольшом сдвиге
            lo/hi — React должен подвинуть существующую линию по y, а не
            снести и создать всю сетку заново. Новый индекс не годится тем
            же способом: при входе новой линии с любого края он переехал бы
            под уже нарисованной линией, поменяв её подпись без движения. */}
        {tickLabels.map(([p, label]) => (
          <g key={p}>
            <line x1={0} x2={PW} y1={y(p)} y2={y(p)} stroke="var(--color-line)" strokeWidth={px(1)} />
            <text
              x={PW + px(PRICE_LABEL_GAP_PX)}
              y={y(p) + px(3.5)}
              fill="var(--color-muted)"
              fontSize={px(10)}
              fontFamily="var(--font-mono)"
            >
              {label}
            </text>
          </g>
        ))}

        {/* Обрезка — на отдельной группе, снаружи той, что двигает FLIP:
            область обрезки живёт в системе координат своего элемента, и,
            повесь её на ту же группу, она ехала бы вместе с ней — во время
            живого сдвига окно обрезки уходило бы на полосу цены. */}
        <g clipPath={`url(#${clipId})`}>
          {/* Группа, которую двигает FLIP выше: свечи и подписи времени —
              всё, чья x зависит от frameStart. Сетка цены и уровни снаружи —
              они привязаны к 0..PW, а не к окну свечей. */}
          <g ref={shiftGroupRef}>
            <path d={candlePaths.upWicks} stroke="var(--profit)" strokeWidth={px(1)} fill="none" />
            <path d={candlePaths.downWicks} stroke="var(--loss)" strokeWidth={px(1)} fill="none" />
            <path d={candlePaths.upBodies} fill="var(--profit)" />
            <path d={candlePaths.downBodies} fill="var(--loss)" />
            {/* Формирующаяся свеча — анимированные (glide) значения, отдельно от путей (см. candlePaths). */}
            {animBar && (
              <>
                <line
                  x1={animBar.x}
                  x2={animBar.x}
                  y1={animBar.wickTop}
                  y2={animBar.wickBottom}
                  stroke={animBar.color}
                  strokeWidth={px(1)}
                />
                <rect x={animBar.x - bodyW / 2} y={animBar.top} width={bodyW} height={animBar.height} fill={animBar.color} />
              </>
            )}

            {/* Рисунки — внутри сдвигаемой группы, как свечи: иначе на живом сдвиге
                окна фигуры отставали бы от свечей, к которым привязаны. Под
                отметками и уровнями сделок — разметка не закрывает стоп и тейк. */}
            {drawing && !drawing.hidden && (
              <DrawingLayer
                drawings={shownDrawings}
                selectedId={drawing.selectedId}
                interactive={!drawing.tool}
                ruler={draw.ruler}
                geo={{ xOf: xOfTime, yOf: y, px, PW, top: PT, bottom: H - PB, tfMs, candles }}
                onShapeDown={draw.startShape}
                onAnchorDown={draw.startAnchor}
              />
            )}

            {/* Отметки сделок — внутри сдвигаемой группы: они привязаны к своим
                свечам и обязаны ехать вместе с ними, а не висеть над полем.
                Стрелка стоит СНАРУЖИ своей цены и смотрит на неё: у лонга вход
                снизу, выход сверху, у шорта наоборот — две отметки на одной
                свече не сходятся в одну точку. */}
            {shownMarkers.map(({ m, idx }) => {
              const up = (m.kind === 'entry') === (m.direction === 'long');
              const color =
                m.kind === 'entry'
                  ? 'var(--color-fg)'
                  : m.tone === 'loss'
                    ? 'var(--loss)'
                    : m.tone === 'profit'
                      ? 'var(--profit)'
                      : 'var(--color-muted)';
              const x = cx(idx);
              const yy = y(m.price);
              const tip = up ? yy + px(4) : yy - px(4);
              const tail = up ? tip + px(7) : tip - px(7);
              return (
                <g key={m.id}>
                  <polygon
                    points={`${x},${tip} ${x - px(4.5)},${tail} ${x + px(4.5)},${tail}`}
                    fill={color}
                    stroke="var(--color-background)"
                    strokeWidth={px(0.75)}
                  />
                  {markerLabels && (
                    <text
                      x={x}
                      y={up ? tail + px(9) : tail - px(3.5)}
                      fill={color}
                      fontSize={px(9)}
                      fontFamily="var(--font-mono)"
                      textAnchor="middle"
                    >
                      {m.label}
                    </text>
                  )}
                </g>
              );
            })}

            {timeIdx.map((i) => (
              <text
                key={i}
                x={cx(startIdx + i)}
                y={H - px(7)}
                fill="var(--color-muted)"
                fontSize={px(10)}
                textAnchor="middle"
              >
                {labelFor(shown[i].t)}
              </text>
            ))}
          </g>
        </g>

        {levels.map((l) => {
          const price = drag?.id === l.id ? drag.price : l.price;
          const impact = l.impactAt?.(price) ?? null;
          return (
            <g key={l.id}>
              <line
                x1={0}
                x2={PW}
                y1={y(price)}
                y2={y(price)}
                stroke={LEVEL_COLOR[l.kind]}
                strokeWidth={px(1.25)}
                strokeDasharray={l.kind === 'entry' ? undefined : `${px(5)} ${px(4)}`}
              />
              <text x={px(4)} y={y(price) - px(4)} fill={LEVEL_COLOR[l.kind]} fontSize={px(10)} fontFamily="var(--font-mono)">
                {/* Вход и ликвидация подписаны ценой — это точки отсчёта, не
                    результат. Стоп, тейк и лимит-ордер подписаны результатом в
                    USDT: цену и так видно по линии и высоте над свечами. Уровни
                    сетки на вход — тоже ценой: сделки ещё нет, посчитать
                    результат не от чего. */}
                {l.kind === 'entry' ||
                l.kind === 'liq' ||
                l.kind === 'orderEntry' ||
                l.kind === 'gridUpper' ||
                l.kind === 'gridLower' ||
                l.kind === 'gridPending'
                  ? `${levelLabel(l.kind)} ${formatPriceGrouped(price)}`
                  : `${levelLabel(l.kind)}${impact != null ? ` ${formatMoney(impact)} USDT` : ''}`}
              </text>
              {l.draggable && onDragLevel && (
                <rect
                  className="lvl-hit"
                  x={0}
                  y={y(price) - px(8)}
                  width={PW}
                  height={px(16)}
                  fill="transparent"
                  onPointerDown={startDrag(l)}
                />
              )}
            </g>
          );
        })}

        {/* Полоса цены ловит жест масштаба — прозрачный прямоугольник поверх
            подписей: иначе про то, что шкалу можно тянуть, сообщал бы только
            курсор над самими цифрами. Событие всплывает к svg, где startPan сам
            разбирает, что жест начался на полосе. */}
        <rect x={PW} y={0} width={W - PW} height={H} fill="transparent" style={{ cursor: 'ns-resize' }} />
      </svg>
    </div>
  );
});
