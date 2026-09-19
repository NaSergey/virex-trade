'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCandles, fetchLiveTail } from '../api/hooks';
import type { SessionDetail } from '../api/types';
import {
  DAY,
  fromApi,
  lastPrice,
  loadedUntil,
  visibleCandles,
  type Candle,
} from '../lib/candles';
import { liveAnchor, mergeMinutes } from '../lib/live';
import type { Replay } from './useReplay';

/** Как часто забирать живой хвост. Столько же, сколько тик серверного движка. */
const TAIL_MS = 2000;
/** Сколько закрытых свечей таймфрейма держать в прошлом. */
const CLOSED_LIMIT = 300;
/** Кусок истории на одну догрузку при пане. */
const HISTORY_CHUNK = 500;

/**
 * Источник свечей для турнира в прямом эфире.
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
 */
export function useLiveFeed(detail: SessionDetail, enabled = true): Replay {
  const { session } = detail;
  const endTime = session.endTime ? Date.parse(session.endTime) : null;

  const [tf, setTf] = useState(1);
  const [shownTf, setShownTf] = useState(1);
  const [closed, setClosed] = useState<Candle[]>([]);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [minutes, setMinutes] = useState<Candle[]>([]);
  const [now, setNow] = useState<number>(() => Date.now());
  const [error, setError] = useState<unknown>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  /** Часы браузера минус часы сервера. Момент ведём по серверным. */
  const skew = useRef(0);
  const loading = useRef(false);

  const cursor = Math.min(now, endTime ?? now);

  // Живой хвост: раз в две секунды. Минутки сливаются по времени, свежая
  // версия последней замещает прежнюю (см. mergeMinutes).
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const pull = async () => {
      if (loading.current) return;
      loading.current = true;
      try {
        const { serverTime, minutes: tail } = await fetchLiveTail();
        if (!alive) return;
        skew.current = Date.now() - Date.parse(serverTime);
        const fresh = tail.map(fromApi);
        setMinutes((prev) => {
          const merged = mergeMinutes(prev, fresh);
          // Разрыв между загруженным и хвостом (вкладка спала) догружается
          // отдельно: выдумывать пропущенные свечи нельзя.
          const gapFrom = prev.length ? loadedUntil(prev) : null;
          if (gapFrom != null && fresh.length && fresh[0].t > gapFrom) void fillGap(gapFrom, fresh[0].t);
          return merged;
        });
        setNow(Date.now() - skew.current);
        setError(null);
      } catch (e) {
        if (alive) setError(e);
      } finally {
        loading.current = false;
      }
    };

    const fillGap = async (from: number, to: number) => {
      try {
        const gap = await fetchCandles({ id: session.id, dataSource: 'real' }, 1, { from, to, limit: 5000 });
        if (alive) setMinutes((prev) => mergeMinutes(prev, gap));
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
  }, [enabled, session.id]);

  // Часы между запросами хвоста: момент обязан идти ровно, а не рывками раз в
  // две секунды — на нём держится подпись времени и «Закрыть по рынку».
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now() - skew.current), 250);
    return () => clearInterval(timer);
  }, [enabled]);

  // Закрытые свечи выбранного таймфрейма. Минутки берём с полуночи UTC
  // вчерашнего дня: из них собирается недоформированная свеча даже дневного
  // таймфрейма.
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void (async () => {
      try {
        const rows = await fetchCandles({ id: session.id, dataSource: 'real' }, tf, {
          to: Date.now(),
          limit: CLOSED_LIMIT,
        });
        if (!alive) return;
        setClosed(rows);
        setAnchor(liveAnchor(rows, tf, Date.now()));
        setShownTf(tf);
      } catch (e) {
        if (alive) setError(e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled, session.id, tf]);

  // Минутки для сборки текущей свечи: с полуночи UTC вчерашнего дня и до
  // сейчас. Один раз при входе; дальше их продлевает хвост.
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void (async () => {
      const from = Math.floor(Date.now() / DAY) * DAY - DAY;
      try {
        const rows = await fetchCandles({ id: session.id, dataSource: 'real' }, 1, { from, limit: 5000 });
        if (alive) setMinutes((prev) => mergeMinutes(prev, rows));
      } catch (e) {
        if (alive) setError(e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled, session.id]);

  const loadMoreHistory = useCallback(async () => {
    if (historyLoading || closed.length === 0) return;
    setHistoryLoading(true);
    try {
      const rows = await fetchCandles({ id: session.id, dataSource: 'real' }, shownTf, {
        to: closed[0].t,
        limit: HISTORY_CHUNK,
      });
      setClosed((prev) => [...rows.filter((c) => c.t < (prev[0]?.t ?? Infinity)), ...prev]);
    } catch (e) {
      setError(e);
    } finally {
      setHistoryLoading(false);
    }
  }, [closed, historyLoading, session.id, shownTf]);

  const candles = useMemo(
    () => (anchor == null ? [] : visibleCandles({ closed, anchor, minutes, tf: shownTf, cursor })),
    [anchor, closed, minutes, shownTf, cursor],
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
