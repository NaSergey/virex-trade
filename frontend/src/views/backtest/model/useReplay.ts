'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCandles, saveCursor } from '../api/hooks';
import type { BacktestTrade, SessionDetail } from '../api/types';
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
import { findExit, type Exit } from '../lib/fills';

/** Сколько минуток держать загруженными впереди момента сессии. */
const LOOKAHEAD_MS = 3 * DAY;
/** Потолок `/api/market-data/candles` на один запрос. */
const CHUNK = 5000;
/** Сколько закрытых свечей таймфрейма брать в прошлое. */
const CLOSED_LIMIT = 300;
/** Сколько свечей отдавать графику. */
const VISIBLE = 120;
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

  const candles = useMemo(() => {
    const set = closed[tf];
    if (!set) return [];
    return visibleCandles({ closed: set.candles, anchor: set.anchor, minutes, tf, cursor }).slice(-VISIBLE);
  }, [closed, tf, minutes, cursor]);

  const price = useMemo(() => lastPrice(minutes, cursor), [minutes, cursor]);

  const step = useCallback(async () => {
    if (busy.current || endedRef.current) return;
    busy.current = true;
    setError(null);
    try {
      const from = cursorRef.current;
      const target = nextStop(from, tfRef.current);
      await ensureMinutes(target + LOOKAHEAD_MS);
      const reach = Math.min(target, loadedUntil(minutesRef.current) ?? from);
      if (reach > from) {
        const open = openRef.current;
        if (open && !closing.current.has(open.id)) {
          const exit = findExit(open, minutesRef.current, Math.max(Date.parse(open.entryTime), from), reach);
          if (exit) {
            closing.current.add(open.id);
            // Сработал уровень — автопрокрутка встаёт, чтобы исход не проскочил мимо глаз.
            setSpeed(null);
            onExitRef.current(open, exit);
          }
        }
        cursorRef.current = reach;
        setCursor(reach);
      }
      // Шаг не дошёл до цели — минутки кончились, дальше крутить нечего.
      if (reach < target) {
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
  }, [ensureMinutes]);

  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    if (!speed) return;
    const h = setInterval(() => void stepRef.current(), 1000 / speed);
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
