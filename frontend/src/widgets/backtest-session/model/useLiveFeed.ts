'use client';

import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fetchCandles, fetchLiveTail } from '../api/hooks';
import {
  DAY,
  DEFAULT_TIMEFRAME,
  fromApi,
  lastPrice,
  loadedUntil,
  visibleCandles,
  visibleUntil,
  type ApiCandle,
  type Candle,
} from '../lib/candles';
import { liveAnchor, mergeMinutes, mergeTagged, nextChange, ofSymbol, type TaggedMinutes } from '../lib/live';
import { recallFeed, rememberClosed, rememberMinutes, rememberSkew, type ClosedMemo } from './feedMemory';
import type { Replay } from './useReplay';

/** Как часто забирать живой хвост. Столько же, сколько тик серверного движка. */
const TAIL_MS = 2000;
/** Сколько закрытых свечей таймфрейма держать в прошлом. */
const CLOSED_LIMIT = 300;
/** Кусок истории на одну догрузку при пане. */
const HISTORY_CHUNK = 500;
/** Минуток за раз — с запасом на двое суток (2880). */
const MINUTES_LIMIT = 5000;

const NO_CANDLES: Candle[] = [];
const NO_ANCHORS: readonly number[] = [];

/**
 * Откуда лента берёт свечи. У эфира бектеста это рынок продукта
 * (`/api/market-data`), у биржевого терминала — рынок самой биржи: механика
 * ленты одна, а цены обязаны быть той площадки, где исполняются ордера.
 *
 * Ссылка обязана быть стабильной (константа модуля): лента перезапрашивает
 * свечи при её смене.
 */
export interface LiveSource {
  /** Хвост минуток монеты и время сервера; последняя минутка ещё формируется. */
  tail: (symbol: string) => Promise<{ serverTime: string; minutes: ApiCandle[] }>;
  /** Закрытые свечи таймфрейма — в той же форме, что `fetchCandles`. */
  candles: (tf: number, range: { from?: number; to?: number; limit: number }, symbol: string) => Promise<Candle[]>;
}

/** Рынок продукта: у свечей `real` id сессии в адрес не входит. */
export const SESSION_SOURCE: LiveSource = {
  tail: fetchLiveTail,
  candles: (tf, range, symbol) => fetchCandles({ id: '', dataSource: 'real' }, tf, range, symbol),
};

/** Что ленте нужно от сессии: чей это график и где он кончается. У биржевого терминала конца нет. */
export interface LiveFeedSession {
  session: { id: string; endTime: string | null };
}

/** Закрытые свечи таймфрейма монеты и граница, до которой они загружены. */
interface ClosedState extends ClosedMemo {
  symbol: string;
  tf: number;
}

/** Закрытые свечи таймфрейма до «сейчас» и граница, правее которой свечи собираются из минуток. */
async function loadClosed(source: LiveSource, symbol: string, tf: number): Promise<ClosedMemo> {
  const rows = await source.candles(tf, { to: Date.now(), limit: CLOSED_LIMIT }, symbol);
  return { rows, anchor: liveAnchor(rows, tf, Date.now()) };
}

/**
 * Минутки для сборки текущей свечи: с полуночи UTC вчерашнего дня и до сейчас —
 * из них собирается недоформированная свеча даже дневного таймфрейма.
 */
const loadDay = (source: LiveSource, symbol: string) =>
  source.candles(1, { from: Math.floor(Date.now() / DAY) * DAY - DAY, limit: MINUTES_LIMIT }, symbol);

/**
 * Прогрев ленты: свечи монеты — в память (`feedMemory`), и терминал, открытый
 * следом, рисует график сразу. Загружается ровно то, что лента загрузила бы
 * на монтировании: закрытые свечи таймфрейма по умолчанию, минутки суток и
 * хвост. Монету, которую лента уже видела, прогрев не трогает: её память
 * свежее того, что он принёс бы.
 */
export async function prefetchLiveFeed(symbol: string, source: LiveSource = SESSION_SOURCE): Promise<void> {
  if (recallFeed(source, symbol, DEFAULT_TIMEFRAME)) return;
  const [closed, day, tail] = await Promise.all([
    loadClosed(source, symbol, DEFAULT_TIMEFRAME),
    loadDay(source, symbol),
    source.tail(symbol),
  ]);
  if (recallFeed(source, symbol, DEFAULT_TIMEFRAME)) return;
  rememberSkew(source, Date.now() - Date.parse(tail.serverTime));
  rememberClosed(source, symbol, DEFAULT_TIMEFRAME, closed);
  rememberMinutes(source, symbol, mergeMinutes(day, tail.minutes.map(fromApi)));
}

/**
 * Источник свечей для сессии в прямом эфире — своей или турнирной.
 *
 * Отдаёт тот же интерфейс `Replay`, что и прокрутка бектеста, но устроен
 * наоборот: там время ведёт участник и будущее просто не показано, здесь
 * будущего нет вовсе, а время идёт само. Поэтому «Шаг», скорости и «Завершить»
 * ничего не делают, а браузер не проверяет срабатывания — стопы, тейки и
 * лимитки исполняет серверный движок.
 *
 * Момент считается по часам СЕРВЕРА: браузер берёт смещение из `serverTime`
 * ответа хвоста. Иначе отставшие или спешащие часы означали бы сделку,
 * открытую в будущем или в прошлом относительно того, что видит сервер.
 *
 * Лента показывает одну монету (`symbol`). Состояние помечено монетой, к
 * которой относится (`ofSymbol`): после переключения график пуст, пока не
 * приедут свечи новой, — а не рисует прежнюю монету под новым названием.
 *
 * Монтируется лента с того, что уже знает о монете (`feedMemory`): с прошлого
 * захода на терминал или с прогрева. Терминал — главная страница, и
 * вернувшийся на него не должен видеть заглушку графика (владелец
 * 2026-10-17): прежние свечи видны сразу, свежие ложатся поверх — хвост
 * сразу, разрыв догружается, закрытые свечи и минутки суток перечитываются.
 */
export function useLiveFeed(
  detail: LiveFeedSession,
  enabled: boolean,
  symbol: string,
  source: LiveSource = SESSION_SOURCE,
  /** Терминала не видно: часы и хвост стоят, загруженное остаётся. */
  paused = false,
  /**
   * Входы открытых позиций: момент на экране обязан пройти их вовремя —
   * от них «закрыть можно» и возраст позиции (`nextChange`).
   */
  anchors: readonly number[] = NO_ANCHORS,
): Replay {
  const { session } = detail;
  const endTime = session.endTime ? Date.parse(session.endTime) : null;

  const [memo] = useState(() => recallFeed(source, symbol, DEFAULT_TIMEFRAME));
  const [tf, setTf] = useState<number>(DEFAULT_TIMEFRAME);
  const [closedState, setClosedState] = useState<ClosedState | null>(() =>
    memo?.closed ? { symbol, tf: DEFAULT_TIMEFRAME, rows: memo.closed.rows, anchor: memo.closed.anchor } : null,
  );
  const [minutesState, setMinutesState] = useState<TaggedMinutes>(() => ({ symbol, rows: memo?.minutes ?? [] }));
  const [now, setNow] = useState<number>(() => Date.now() - (memo?.skew ?? 0));
  const [error, setError] = useState<unknown>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  /** Часы браузера минус часы сервера. Момент ведём по серверным. */
  const skew = useRef(memo?.skew ?? 0);
  const loading = useRef(false);
  /** Момент в состоянии — от него часы считают следующий порог. */
  const shown = useRef(now);
  const show = useCallback((t: number) => {
    shown.current = t;
    setNow(t);
  }, []);
  // Пороги часы читают из рефа: интервал не перезапускается на каждой новой
  // позиции и каждом рендере.
  const thresholds = useRef({ anchors, endTime });
  useLayoutEffect(() => {
    thresholds.current = { anchors, endTime };
  });

  const closedOf = ofSymbol(closedState, symbol);
  const closed = closedOf?.rows ?? NO_CANDLES;
  const anchor = closedOf?.anchor ?? null;
  const shownTf = closedOf?.tf ?? tf;
  const minutes = ofSymbol(minutesState, symbol)?.rows ?? NO_CANDLES;

  const cursor = Math.min(now, endTime ?? now);

  // Живой хвост: раз в две секунды. Минутки сливаются по времени, свежая
  // версия последней замещает прежнюю (см. mergeMinutes).
  useEffect(() => {
    if (!enabled || paused) return;
    let alive = true;
    // Запрос прежней монеты мог остаться в пути: флаг занятости — у каждой
    // монеты свой, иначе новая ждала бы ответа, который всё равно выбросится.
    loading.current = false;
    const pull = async () => {
      if (loading.current) return;
      loading.current = true;
      try {
        const { serverTime, minutes: tail } = await source.tail(symbol);
        if (!alive) return;
        skew.current = Date.now() - Date.parse(serverTime);
        rememberSkew(source, skew.current);
        const fresh = tail.map(fromApi);
        setMinutesState((prev) => {
          const same = prev.symbol === symbol ? prev.rows : [];
          // Разрыв между загруженным и хвостом (вкладка спала) догружается
          // отдельно: выдумывать пропущенные свечи нельзя.
          const gapFrom = same.length ? loadedUntil(same) : null;
          if (gapFrom != null && fresh.length && fresh[0].t > gapFrom) void fillGap(gapFrom, fresh[0].t);
          return mergeTagged(prev, symbol, fresh);
        });
        show(Date.now() - skew.current);
        setError(null);
      } catch (e) {
        if (alive) setError(e);
      } finally {
        if (alive) loading.current = false;
      }
    };

    const fillGap = async (from: number, to: number) => {
      try {
        const gap = await source.candles(1, { from, to, limit: MINUTES_LIMIT }, symbol);
        if (alive) setMinutesState((prev) => mergeTagged(prev, symbol, gap));
      } catch {
        // Не догрузилось — на графике останется дыра, следующий круг попробует снова.
      }
    };

    void pull();
    const timer = setInterval(() => void pull(), TAIL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [enabled, paused, session.id, symbol, source, show]);

  // Часы между запросами хвоста. Смотрят на время четыре раза в секунду, а
  // состояние трогают только на пороге, где что-то видимое меняется
  // (`nextChange`): граница минуты, вход свежей позиции, конец сессии. Каждый
  // тик перерисовывал весь терминал — пропущенный кадр на слабом устройстве
  // четыре раза в секунду (замер 2026-10-14). Точное время для действий —
  // `moment()`.
  useEffect(() => {
    if (!enabled || paused) return;
    const timer = setInterval(() => {
      const t = Date.now() - skew.current;
      const { anchors, endTime } = thresholds.current;
      if (t > nextChange(shown.current, anchors, endTime)) show(t);
    }, 250);
    return () => clearInterval(timer);
  }, [enabled, paused, show]);

  // Закрытые свечи выбранного таймфрейма. Приход истории — переход
  // (`startTransition`), а не срочное обновление: он перерисовывает весь
  // терминал с новыми свечами, и одним куском это была самая длинная задача
  // экрана (~400 мс при ЦП ×4, замер 2026-10-13) — прокрутка и клики вставали.
  // Переход React режет на части и прерывает ради срочного; хвост и часы
  // остаются срочными.
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void (async () => {
      try {
        const { rows, anchor } = await loadClosed(source, symbol, tf);
        if (!alive) return;
        startTransition(() => setClosedState({ symbol, tf, rows, anchor }));
      } catch (e) {
        if (alive) setError(e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled, session.id, tf, symbol, source]);

  // Минутки суток (`loadDay`). Один раз на монету; дальше их продлевает хвост.
  // Переходом, как и история: слияние — функцией от прежнего, и срочный хвост,
  // пришедший посреди, не теряется.
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void (async () => {
      try {
        const rows = await loadDay(source, symbol);
        if (alive) startTransition(() => setMinutesState((prev) => mergeTagged(prev, symbol, rows)));
      } catch (e) {
        if (alive) setError(e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled, session.id, symbol, source]);

  // Всё, что лента узнала, — в память: следующий заход на терминал начнётся с
  // этого, а не с заглушки. Догруженная пролистыванием история — тоже.
  useEffect(() => {
    if (enabled && closedState)
      rememberClosed(source, closedState.symbol, closedState.tf, { rows: closedState.rows, anchor: closedState.anchor });
  }, [enabled, source, closedState]);
  useEffect(() => {
    if (enabled && minutesState.rows.length > 0) rememberMinutes(source, minutesState.symbol, minutesState.rows);
  }, [enabled, source, minutesState]);

  const loadMoreHistory = useCallback(async () => {
    if (historyLoading || closed.length === 0) return;
    setHistoryLoading(true);
    try {
      const rows = await source.candles(shownTf, { to: closed[0].t, limit: HISTORY_CHUNK }, symbol);
      // Пока грузилось, могли сменить монету или таймфрейм — тогда история чужая.
      setClosedState((prev) =>
        prev && prev.symbol === symbol && prev.tf === shownTf
          ? { ...prev, rows: [...rows.filter((c) => c.t < (prev.rows[0]?.t ?? Infinity)), ...prev.rows] }
          : prev,
      );
    } catch (e) {
      setError(e);
    } finally {
      setHistoryLoading(false);
    }
  }, [closed, historyLoading, shownTf, symbol, source]);

  // Свечи — по границе показа минуток, а не по моменту: момент меняется и на
  // пороге позиции, а свечи от него не зависят — новый массив перерисовывал бы
  // весь график.
  const until = visibleUntil(minutes, cursor);
  const candles = useMemo(
    () => (anchor == null ? NO_CANDLES : visibleCandles({ closed, anchor, minutes, tf: shownTf, cursor: until })),
    [anchor, closed, minutes, shownTf, until],
  );

  const noop = useCallback(async () => undefined, []);
  // Точный момент по часам сервера — время входа и выхода действий. Момент в
  // состоянии отстаёт до минуты: он меняется только на порогах.
  const moment = useCallback(() => {
    const t = Date.now() - skew.current;
    return endTime == null ? t : Math.min(t, endTime);
  }, [endTime]);

  return {
    cursor,
    moment,
    tf,
    shownTf,
    setTf,
    candles,
    // Анимации хода цены в эфире нет: цена и так меняется сама, дорисовывать
    // ей движение было бы враньём.
    glide: null,
    loadMoreHistory,
    historyLoading,
    price: lastPrice(minutes, cursor),
    ready: anchor != null && minutes.length > 0,
    // Время ведёт часы, а не участник: шагать и ускорять нечего.
    step: noop,
    speed: null,
    setSpeed: () => undefined,
    // По `now` (часы сервера в состоянии), а не по `Date.now()` в рендере:
    // конец сессии — порог часов, а чтение часов и рефа при отрисовке делает
    // результат непредсказуемым.
    ended: endTime != null && now >= endTime,
    error,
    flush: noop,
  };
}
