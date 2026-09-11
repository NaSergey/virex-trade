'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCandles, saveCursor } from '../api/hooks';
import type { BacktestTrade, SessionDetail } from '../api/types';
import { advanceTo } from '../lib/advance';
import {
  DAY,
  MINUTE,
  bucketStart,
  currentBucket,
  lastPrice,
  loadedUntil,
  nextStop,
  visibleCandles,
  type Candle,
} from '../lib/candles';
import type { Exit } from '../lib/fills';

/** Сколько минуток держать загруженными впереди момента сессии. */
const LOOKAHEAD_MS = 3 * DAY;
/** Потолок `/api/market-data/candles` на один запрос. */
const CHUNK = 5000;
/** Сколько закрытых свечей таймфрейма брать в прошлое. */
const CLOSED_LIMIT = 300;
/** Дальше в прошлое пан не пускает — год от текущего момента сессии, не от сегодняшней даты. */
export const HISTORY_CAP_MS = 365 * DAY;
/** Кусок истории на одну догрузку при пане. */
const HISTORY_CHUNK = 500;
/** Момент сохраняется на сервер не чаще, чем раз в столько. */
const SAVE_DELAY_MS = 3000;
/** Скорости автопрокрутки — шагов в секунду. */
export const SPEEDS = [1, 4, 16] as const;

interface ClosedSet {
  /** До какого момента загружена история этого таймфрейма; дальше свечи собираются из минуток. */
  anchor: number;
  candles: Candle[];
}

export interface Replay {
  cursor: number;
  tf: number;
  setTf: (tf: number) => void;
  /** В настоящих ценах. */
  candles: Candle[];
  /**
   * Минутка, которая только что «приземлилась» на автопрокрутке, и на сколько
   * мс её отрисовать — для плавного хода цены внутри тика. null на паузе и
   * после ручного «Шага»: там анимации нет по замыслу.
   */
  glide: { minute: Candle; durationMs: number } | null;
  /** Догрузить ещё истории назад для текущего ТФ — вызывает ReplayChart, приближаясь к краю. */
  loadMoreHistory: () => Promise<void>;
  historyLoading: boolean;
  /** Цена последней показанной минутки, настоящая. */
  price: number | null;
  ready: boolean;
  step: () => Promise<void>;
  speed: number | null;
  setSpeed: (speed: number | null) => void;
  /** Минутки кончились — дальше крутить нечего. */
  ended: boolean;
  error: unknown;
  /** Сохранить момент сейчас, не дожидаясь задержки. */
  flush: () => Promise<void>;
}

/**
 * Прокрутка сессии: минутки грузятся кусками с начала суток текущего момента
 * (из них собирается недоформированная свеча даже дневного таймфрейма) и
 * заранее на три дня вперёд; «Шаг» доводит время до закрытия свечи выбранного
 * таймфрейма и по дороге проверяет стоп и тейк открытой сделки.
 *
 * Проверяются уровни, сохранённые на сервере, а не черновик в полях: пока
 * правка не применена, она не действует — так же, как неотправленный ордер.
 */
export function useReplay(detail: SessionDetail, onExit: (trade: BacktestTrade, exit: Exit) => void): Replay {
  const sessionId = detail.session.id;
  const [cursor, setCursor] = useState(() => Date.parse(detail.session.cursorTime));
  const [tf, setTf] = useState(60);
  const [minutes, setMinutes] = useState<Candle[]>([]);
  const [closed, setClosed] = useState<Record<number, ClosedSet>>({});
  const [speed, setSpeed] = useState<number | null>(null);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Шаг асинхронный и зовётся из таймера: он читает рефы, а не значения,
  // захваченные при создании колбэка.
  const cursorRef = useRef(cursor);
  const tfRef = useRef(tf);
  tfRef.current = tf;
  const minutesRef = useRef<Candle[]>([]);
  const minutesFrom = useRef(bucketStart(cursor - MINUTE, 1440));
  const exhausted = useRef(false);
  const loading = useRef<Promise<void> | null>(null);
  const busy = useRef(false);
  const endedRef = useRef(false);
  /** Сделки, чьё закрытие уже отправлено: пока сессия не перечитана, второй раз их не закрываем. */
  const closing = useRef(new Set<string>());
  const openRef = useRef<BacktestTrade | null>(null);
  openRef.current = detail.trades.find((x) => x.exitTime == null) ?? null;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  /** Догружает минутки, пока загруженное не дойдёт до until или история не кончится. */
  const ensureMinutes = useCallback(async (until: number) => {
    while (!exhausted.current && (loadedUntil(minutesRef.current) ?? minutesFrom.current) < until) {
      if (!loading.current) {
        loading.current = (async () => {
          const from = loadedUntil(minutesRef.current) ?? minutesFrom.current;
          const chunk = await fetchCandles(1, { from, limit: CHUNK });
          if (chunk.length < CHUNK) exhausted.current = true;
          if (chunk.length > 0) {
            minutesRef.current = [...minutesRef.current, ...chunk];
            setMinutes(minutesRef.current);
          }
        })().finally(() => {
          loading.current = null;
        });
      }
      await loading.current;
    }
  }, []);

  useEffect(() => {
    ensureMinutes(cursorRef.current + LOOKAHEAD_MS).catch(setError);
  }, [ensureMinutes]);

  // Прошлое выбранного таймфрейма — один раз на таймфрейм; всё, что после
  // anchor, собирается из минуток, поэтому перегружать при шаге не нужно.
  useEffect(() => {
    if (closed[tf]) return;
    const anchor = currentBucket(cursorRef.current, tf);
    let cancelled = false;
    fetchCandles(tf, { to: anchor - 1, limit: CLOSED_LIMIT })
      .then((candles) => {
        if (!cancelled) setClosed((prev) => ({ ...prev, [tf]: { anchor, candles } }));
      })
      .catch(setError);
    return () => {
      cancelled = true;
    };
  }, [tf, closed]);

  /** Какие ТФ сейчас догружают историю — на каждый таймфрейм свой флаг, а не один общий:
   * иначе фетч для ТФ=60 в полёте держал бы заблокированным вызов для только что
   * выбранного ТФ=240. */
  const historyLoadingRef = useRef<Record<number, boolean>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  /** На какой ТФ пан уже упёрся в границу года — чтобы не долбить сервер у края. */
  const historyExhausted = useRef<Record<number, boolean>>({});

  /**
   * Довесок истории для пана назад: следующий кусок закрытых свечей текущего
   * ТФ перед уже загруженными, не дальше года от текущего момента сессии.
   */
  const loadMoreHistory = useCallback(async () => {
    const set = closed[tf];
    if (!set || historyLoadingRef.current[tf] || historyExhausted.current[tf]) return;
    const earliest = set.candles[0]?.t ?? set.anchor;
    const floor = cursorRef.current - HISTORY_CAP_MS;
    if (earliest <= floor) {
      historyExhausted.current[tf] = true;
      return;
    }
    historyLoadingRef.current[tf] = true;
    setHistoryLoading(true);
    try {
      const chunk = await fetchCandles(tf, { to: earliest - 1, limit: HISTORY_CHUNK });
      const filtered = chunk.filter((c) => c.t >= floor);
      if (chunk.length < HISTORY_CHUNK || filtered.length < chunk.length) historyExhausted.current[tf] = true;
      if (filtered.length > 0) {
        setClosed((prev) => {
          const cur = prev[tf];
          if (!cur) return prev;
          return { ...prev, [tf]: { ...cur, candles: [...filtered, ...cur.candles] } };
        });
      }
    } catch (e) {
      setError(e);
    } finally {
      historyLoadingRef.current[tf] = false;
      setHistoryLoading(false);
    }
  }, [closed, tf]);

  const candles = useMemo(() => {
    const set = closed[tf];
    if (!set) return [];
    // Полный загруженный ряд, не только «последние 120»: окно показа теперь
    // выбирает сам ReplayChart (пан и зум), а не хук.
    return visibleCandles({ closed: set.candles, anchor: set.anchor, minutes, tf, cursor });
  }, [closed, tf, minutes, cursor]);

  const price = useMemo(() => lastPrice(minutes, cursor), [minutes, cursor]);

  /**
   * Общая механика продвижения: и мгновенный «Шаг» (target — закрытие свечи
   * ТФ), и минутный тик автопрокрутки (target — from + минута) идут через
   * одну проверку срабатывания (`advanceTo`) — раздельные реализации однажды
   * разошлись бы, и молча.
   */
  const advance = useCallback(
    async (target: number, onLanded?: (from: number, reach: number) => void) => {
      if (busy.current || endedRef.current) return;
      busy.current = true;
      setError(null);
      try {
        const from = cursorRef.current;
        await ensureMinutes(target + LOOKAHEAD_MS);
        const open = openRef.current;
        const position =
          open && !closing.current.has(open.id)
            ? { direction: open.direction, stopLoss: open.stopLoss, takeProfit: open.takeProfit, entryTime: Date.parse(open.entryTime) }
            : null;
        const { reach, complete, exit } = advanceTo({
          from,
          target,
          minutes: minutesRef.current,
          loadedUntil: loadedUntil(minutesRef.current),
          position,
        });
        if (reach > from) {
          if (exit && open) {
            closing.current.add(open.id);
            // Сработал уровень — автопрокрутка встаёт, чтобы исход не проскочил мимо глаз.
            setSpeed(null);
            onExitRef.current(open, exit);
          }
          cursorRef.current = reach;
          setCursor(reach);
          onLanded?.(from, reach);
        }
        // Не дошли до цели — минутки кончились, дальше крутить нечего.
        if (!complete) {
          endedRef.current = true;
          setEnded(true);
          setSpeed(null);
        }
      } catch (e) {
        setError(e);
        setSpeed(null);
      } finally {
        busy.current = false;
      }
    },
    [ensureMinutes],
  );

  /** Мгновенный прыжок до закрытия текущей свечи ТФ — без анимации, для ручного разбора. */
  const step = useCallback(() => advance(nextStop(cursorRef.current, tfRef.current)), [advance]);

  const [glide, setGlide] = useState<{ minute: Candle; durationMs: number } | null>(null);

  /**
   * Тик автопрокрутки — ровно одна настоящая минутка, не вся свеча ТФ:
   * скорость (шагов в секунду) стала «минут симуляции в секунду» и не зависит
   * от выбранного таймфрейма. `speedNow` — из замыкания эффекта интервала, а
   * не из состояния `speed`, чтобы длительность анимации не разошлась со
   * ставкой, на которой тик на самом деле случился.
   */
  const tick = useCallback(
    (speedNow: number) =>
      advance(cursorRef.current + MINUTE, (from) => {
        const landed = minutesRef.current.find((m) => m.t === from);
        // Минутки может не быть — дыра в истории биржи; тогда просто без анимации.
        if (landed) setGlide({ minute: landed, durationMs: 1000 / speedNow });
      }),
    [advance],
  );

  const tickRef = useRef(tick);
  tickRef.current = tick;
  useEffect(() => {
    if (!speed) return;
    const h = setInterval(() => void tickRef.current(speed), 1000 / speed);
    return () => clearInterval(h);
  }, [speed]);

  // Момент сохраняется с задержкой, а не на каждый шаг: автопрокрутка на ×16
  // дала бы шестнадцать запросов в секунду. Сервер двигает момент только вперёд,
  // так что опоздавшее сохранение ничего не отмотает.
  const saved = useRef(cursor);
  const flush = useCallback(async () => {
    const c = cursorRef.current;
    if (c === saved.current) return;
    await saveCursor(sessionId, c);
    saved.current = c;
  }, [sessionId]);

  useEffect(() => {
    const h = setTimeout(() => void flush().catch(() => undefined), SAVE_DELAY_MS);
    return () => clearTimeout(h);
  }, [cursor, flush]);

  useEffect(
    () => () => {
      const c = cursorRef.current;
      if (c !== saved.current) void saveCursor(sessionId, c, true).catch(() => undefined);
    },
    [sessionId],
  );

  return {
    cursor,
    tf,
    setTf,
    candles,
    glide,
    loadMoreHistory,
    historyLoading,
    price,
    ready: closed[tf] != null && price != null,
    step,
    speed,
    setSpeed,
    ended,
    error,
    flush,
  };
}
