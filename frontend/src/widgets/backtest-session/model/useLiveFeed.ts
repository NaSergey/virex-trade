'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { liveAnchor, mergeTagged, ofSymbol, type TaggedMinutes } from '../lib/live';
import type { Replay } from './useReplay';

/** Как часто забирать живой хвост. Столько же, сколько тик серверного движка. */
const TAIL_MS = 2000;
/** Сколько закрытых свечей таймфрейма держать в прошлом. */
const CLOSED_LIMIT = 300;
/** Кусок истории на одну догрузку при пане. */
const HISTORY_CHUNK = 500;

const NO_CANDLES: Candle[] = [];

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
interface ClosedState {
  symbol: string;
  tf: number;
  rows: Candle[];
  anchor: number;
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
 */
export function useLiveFeed(
  detail: LiveFeedSession,
  enabled: boolean,
  symbol: string,
  source: LiveSource = SESSION_SOURCE,
  /** Терминала не видно: часы и хвост стоят, загруженное остаётся. */
  paused = false,
): Replay {
  const { session } = detail;
  const endTime = session.endTime ? Date.parse(session.endTime) : null;

  const [tf, setTf] = useState<number>(DEFAULT_TIMEFRAME);
  const [closedState, setClosedState] = useState<ClosedState | null>(null);
  const [minutesState, setMinutesState] = useState<TaggedMinutes>({ symbol, rows: [] });
  const [now, setNow] = useState<number>(() => Date.now());
  const [error, setError] = useState<unknown>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  /** Часы браузера минус часы сервера. Момент ведём по серверным. */
  const skew = useRef(0);
  const loading = useRef(false);

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
        const fresh = tail.map(fromApi);
        setMinutesState((prev) => {
          const same = prev.symbol === symbol ? prev.rows : [];
          // Разрыв между загруженным и хвостом (вкладка спала) догружается
          // отдельно: выдумывать пропущенные свечи нельзя.
          const gapFrom = same.length ? loadedUntil(same) : null;
          if (gapFrom != null && fresh.length && fresh[0].t > gapFrom) void fillGap(gapFrom, fresh[0].t);
          return mergeTagged(prev, symbol, fresh);
        });
        setNow(Date.now() - skew.current);
        setError(null);
      } catch (e) {
        if (alive) setError(e);
      } finally {
        if (alive) loading.current = false;
      }
    };

    const fillGap = async (from: number, to: number) => {
      try {
        const gap = await source.candles(1, { from, to, limit: 5000 }, symbol);
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
  }, [enabled, paused, session.id, symbol, source]);

  // Часы между запросами хвоста: момент обязан идти ровно, а не рывками раз в
  // две секунды — на нём держится подпись времени и «Закрыть по рынку».
  useEffect(() => {
    if (!enabled || paused) return;
    const timer = setInterval(() => setNow(Date.now() - skew.current), 250);
    return () => clearInterval(timer);
  }, [enabled, paused]);

  // Закрытые свечи выбранного таймфрейма.
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void (async () => {
      try {
        const rows = await source.candles(tf, { to: Date.now(), limit: CLOSED_LIMIT }, symbol);
        if (!alive) return;
        setClosedState({ symbol, tf, rows, anchor: liveAnchor(rows, tf, Date.now()) });
      } catch (e) {
        if (alive) setError(e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled, session.id, tf, symbol, source]);

  // Минутки для сборки текущей свечи: с полуночи UTC вчерашнего дня и до
  // сейчас — из них собирается недоформированная свеча даже дневного
  // таймфрейма. Один раз на монету; дальше их продлевает хвост.
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void (async () => {
      const from = Math.floor(Date.now() / DAY) * DAY - DAY;
      try {
        const rows = await source.candles(1, { from, limit: 5000 }, symbol);
        if (alive) setMinutesState((prev) => mergeTagged(prev, symbol, rows));
      } catch (e) {
        if (alive) setError(e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled, session.id, symbol, source]);

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

  // Свечи — по границе показа минуток, а не по моменту: момент тикает четыре
  // раза в секунду, и новый массив свечей на каждом тике перерисовывал весь
  // график, хотя минутки меняются раз в две секунды, с хвостом.
  const until = visibleUntil(minutes, cursor);
  const candles = useMemo(
    () => (anchor == null ? NO_CANDLES : visibleCandles({ closed, anchor, minutes, tf: shownTf, cursor: until })),
    [anchor, closed, minutes, shownTf, until],
  );

  const noop = useCallback(async () => undefined, []);

  return {
    cursor,
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
    // момент и так тикает четыре раза в секунду, а чтение часов и рефа при
    // отрисовке делает результат непредсказуемым.
    ended: endTime != null && now >= endTime,
    error,
    flush: noop,
  };
}
