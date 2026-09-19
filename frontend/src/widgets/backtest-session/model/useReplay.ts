'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fetchCandles, saveCursor } from '../api/hooks';
import type { BacktestCloseOrder, BacktestEntryOrder, BacktestTrade, SessionDetail } from '../api/types';
import { advanceTo, type OpenPosition } from '../lib/advance';
import {
  DAY,
  MINUTE,
  TIMEFRAMES,
  bucketStart,
  currentBucket,
  lastPrice,
  loadedUntil,
  nextStop,
  visibleCandles,
  type Candle,
} from '../lib/candles';
import type { CloseOrder, EntryFill, Exit } from '../lib/fills';

/** Сколько минуток держать загруженными впереди момента сессии. */
const LOOKAHEAD_MS = 3 * DAY;
/** Потолок эндпоинта свечей на один запрос. */
const CHUNK = 5000;
/** Сколько закрытых свечей таймфрейма брать в прошлое. */
const CLOSED_LIMIT = 300;
/** Дальше в прошлое пан не пускает — год от текущего момента сессии, не от сегодняшней даты. */
export const HISTORY_CAP_MS = 365 * DAY;
/** Кусок истории на одну догрузку при пане. */
const HISTORY_CHUNK = 500;
/** Момент сохраняется на сервер не чаще, чем раз в столько. */
const SAVE_EVERY_MS = 10000;
/** Скорости автопрокрутки — шагов в секунду. */
export const SPEEDS = [1, 4, 16, 32] as const;

interface ClosedSet {
  /** До какого момента загружена история этого таймфрейма; дальше свечи собираются из минуток. */
  anchor: number;
  candles: Candle[];
}

export interface Replay {
  cursor: number;
  /** Выбранный ТФ. */
  tf: number;
  /** ТФ свечей в `candles` — отстаёт от `tf`, пока история выбранного ещё грузится. */
  shownTf: number;
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
  /** Сохранить момент сейчас, не дожидаясь очередного круга. */
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
export function useReplay(
  detail: SessionDetail,
  onExit: (trade: BacktestTrade, exit: Exit) => void,
  onEntryFill: (order: BacktestEntryOrder, fill: EntryFill) => void,
  /**
   * Открытие, добор, срабатывание уровня сетки или закрытие в полёте — сервер
   * ещё не ответил, и появившаяся (или закрытая) сделка ещё не в `detail.trades`.
   * Тик, стартовавший в этом окне, просто не даёт результата (курсор не двигается)
   * и повторится сам на следующем интервале — автопрокрутка не встаёт, скорость
   * не трогаем: без этого висящего окна минутки между входом и ответом сервера
   * не проверились бы на стоп/тейк только что открытой позиции.
   */
  pending: boolean,
  /**
   * Выключенная прокрутка не ходит в сеть и не сохраняет момент. Нужна ровно
   * одному случаю: сессия турнира в эфире, где источник свечей — `useLiveFeed`.
   * Хуки нельзя вызывать по условию, поэтому вызываются оба, а спит тот, чья
   * очередь не настала.
   */
  enabled = true,
): Replay {
  const sessionId = detail.session.id;
  const dataSource = detail.session.dataSource;
  const source = useMemo(() => ({ id: sessionId, dataSource }), [sessionId, dataSource]);
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
  const pendingRef = useRef(pending);
  useLayoutEffect(() => {
    pendingRef.current = pending;
  });
  const minutesRef = useRef<Candle[]>([]);
  const minutesFrom = useRef(bucketStart(cursor - MINUTE, 1440));
  const exhausted = useRef(false);
  const loading = useRef<Promise<void> | null>(null);
  const busy = useRef(false);
  const endedRef = useRef(false);
  /** Сделки, чьё закрытие уже отправлено: пока сессия не перечитана, второй раз их не закрываем. */
  const closing = useRef(new Set<string>());
  const openTradesRef = useRef<BacktestTrade[]>([]);
  openTradesRef.current = detail.trades.filter((x) => x.exitTime == null);
  const closeOrdersRef = useRef<BacktestCloseOrder[]>([]);
  closeOrdersRef.current = detail.closeOrders;
  const entryOrdersRef = useRef<BacktestEntryOrder[]>([]);
  entryOrdersRef.current = detail.entryOrders;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const onEntryFillRef = useRef(onEntryFill);
  onEntryFillRef.current = onEntryFill;
  /** Уровень сетки, чьё срабатывание уже отправлено: как и closing ниже, не даёт
   * тому же уровню сработать второй раз, пока сессия не перечитана после ответа. */
  const filling = useRef(new Set<string>());

  /** Догружает минутки, пока загруженное не дойдёт до until или история не кончится. */
  const ensureMinutes = useCallback(async (until: number) => {
    while (!exhausted.current && (loadedUntil(minutesRef.current) ?? minutesFrom.current) < until) {
      if (!loading.current) {
        loading.current = (async () => {
          const from = loadedUntil(minutesRef.current) ?? minutesFrom.current;
          const chunk = await fetchCandles(source, 1, { from, limit: CHUNK });
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
  }, [source]);

  useEffect(() => {
    if (!enabled) return;
    ensureMinutes(cursorRef.current + LOOKAHEAD_MS).catch(setError);
  }, [enabled, ensureMinutes]);

  // Прошлое таймфрейма — один запрос на таймфрейм; всё, что после anchor, собирается
  // из минуток, поэтому перегружать при шаге не нужно. Отметка о запросе — в рефе, а
  // не по наличию в `closed`: запрос в полёте иначе ушёл бы второй раз.
  const requestedTf = useRef(new Set<number>());
  const loadClosed = useCallback((t: number) => {
    if (requestedTf.current.has(t)) return;
    requestedTf.current.add(t);
    const anchor = currentBucket(cursorRef.current, t);
    fetchCandles(source, t, { to: anchor - 1, limit: CLOSED_LIMIT })
      .then((candles) => setClosed((prev) => (prev[t] ? prev : { ...prev, [t]: { anchor, candles } })))
      .catch((e) => {
        // Снятая отметка — чтобы повторный выбор этого ТФ попробовал снова.
        requestedTf.current.delete(t);
        setError(e);
      });
  }, [source]);
  // Выбранный — первым, и заново при выборе, если прошлый запрос упал.
  useEffect(() => {
    if (enabled) loadClosed(tf);
  }, [enabled, tf, loadClosed]);
  // Остальные — сразу при входе, а не по клику: иначе на каждом первом переключении
  // график ждал бы сети, и ТФ менялся бы не сразу.
  useEffect(() => {
    if (!enabled) return;
    for (const t of TIMEFRAMES) loadClosed(t);
  }, [enabled, loadClosed]);

  // ТФ свечей на экране: выбранный, как только его история загружена, а до того —
  // прежний. Иначе график на время запроса пропадал бы целиком. Правится прямо в
  // рендере (adjust state while rendering), без лишнего кадра со старым ТФ.
  const [shownTf, setShownTf] = useState(tf);
  if (shownTf !== tf && closed[tf]) setShownTf(tf);

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
    // Для того ТФ, что на экране: пан упирается в край именно его свечей.
    const tf = shownTf;
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
      const chunk = await fetchCandles(source, tf, { to: earliest - 1, limit: HISTORY_CHUNK });
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
  }, [closed, shownTf, source]);

  const candles = useMemo(() => {
    const set = closed[shownTf];
    if (!set) return [];
    // Полный загруженный ряд, не только «последние 120»: окно показа теперь
    // выбирает сам ReplayChart (пан и зум), а не хук.
    return visibleCandles({ closed: set.candles, anchor: set.anchor, minutes, tf: shownTf, cursor });
  }, [closed, shownTf, minutes, cursor]);

  const price = useMemo(() => lastPrice(minutes, cursor), [minutes, cursor]);

  /**
   * Общая механика продвижения: и мгновенный «Шаг» (target — закрытие свечи
   * ТФ), и минутный тик автопрокрутки (target — from + минута) идут через
   * одну проверку срабатывания (`advanceTo`) — раздельные реализации однажды
   * разошлись бы, и молча.
   */
  const advance = useCallback(
    async (target: number, onLanded?: (from: number, reach: number) => void) => {
      if (busy.current || endedRef.current || pendingRef.current) return;
      busy.current = true;
      setError(null);
      try {
        const from = cursorRef.current;
        await ensureMinutes(target + LOOKAHEAD_MS);
        const openTrades = openTradesRef.current.filter((t) => !closing.current.has(t.id));
        const positions: OpenPosition[] = openTrades.map((t) => ({
          tradeId: t.id,
          direction: t.direction,
          stopLoss: t.stopLoss,
          takeProfit: t.takeProfit,
          entryTime: Date.parse(t.entryTime),
        }));
        const pendingEntryOrders = entryOrdersRef.current.filter((o) => !filling.current.has(o.id));
        const { reach, complete, exits, entryFill } = advanceTo({
          from,
          target,
          minutes: minutesRef.current,
          loadedUntil: loadedUntil(minutesRef.current),
          positions,
          closeOrders: closeOrdersRef.current.map((o): CloseOrder => ({ id: o.id, price: o.price, qty: o.qty, tradeId: o.tradeId })),
          entryOrders: pendingEntryOrders.map((o) => ({ id: o.id, direction: o.direction, price: o.price })),
        });
        if (reach > from) {
          if (exits.length > 0 || entryFill) {
            for (const exit of exits) {
              const trade = openTrades.find((t) => t.id === exit.tradeId);
              if (!trade) continue;
              closing.current.add(trade.id);
              onExitRef.current(trade, exit);
            }
            if (entryFill) {
              const order = pendingEntryOrders.find((o) => o.id === entryFill.orderId);
              if (order) {
                filling.current.add(order.id);
                onEntryFillRef.current(order, entryFill);
              }
            }
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
    if (!speed) {
      // Доигрывать анимацию формирующейся свечи после паузы не по замыслу
      // (см. комментарий у Replay.glide) — доигрывала бы до `1000/предыдущая
      // скорость` мс, и на ×1 пауза выглядела бы так, будто не сработала.
      setGlide(null);
      return;
    }
    // Первый тик — сразу, а не через `1000/speed`: setInterval всегда ждёт
    // полный период до первого срабатывания, и при переключении на низкую
    // скорость (особенно ×1) это читалось бы как секундная задержка отклика
    // на нажатие, хотя обработчик уже отработал.
    void tickRef.current(speed);
    const h = setInterval(() => void tickRef.current(speed), 1000 / speed);
    return () => clearInterval(h);
  }, [speed]);

  // Момент сохраняется не чаще раза в SAVE_EVERY_MS: автопрокрутка на ×16
  // дала бы шестнадцать запросов в секунду. Сервер двигает момент только вперёд,
  // так что опоздавшее сохранение ничего не отмотает.
  const saved = useRef(cursor);
  const flush = useCallback(
    async (keepalive = false) => {
      const c = cursorRef.current;
      if (c === saved.current) return;
      // Помечаем отправленным ДО запроса: два сохранения подряд (интервал и
      // уход со страницы) иначе слали бы один и тот же момент дважды. На
      // ошибке отметка откатывается — иначе неудачная отправка выглядела бы
      // как сохранённая, и следующей попытки не случилось бы до нового шага.
      const prev = saved.current;
      saved.current = c;
      try {
        await saveCursor(sessionId, c, keepalive);
      } catch (e) {
        if (saved.current === c) saved.current = prev;
        throw e;
      }
    },
    [sessionId],
  );

  // Интервал, а не таймер «через 3 секунды после последнего шага»: тот был
  // debounce'ом — автопрокрутка двигает момент раз в 1000/speed мс и сбрасывала
  // его каждым тиком, поэтому пока пользователь крутит, не уходило НИ ОДНОГО
  // сохранения. Интервал сохраняет по ходу дела; flush сам выходит, когда
  // момент не менялся, так что на паузе запросов нет.
  useEffect(() => {
    if (!enabled) return;
    const h = setInterval(() => void flush().catch(() => undefined), SAVE_EVERY_MS);
    return () => clearInterval(h);
  }, [enabled, flush]);

  // Уход со страницы — pagehide, а не только размонтирование: перезагрузка (F5)
  // и закрытие вкладки эффекты React не чистят, и накопленный с последнего
  // сохранения кусок прокрутки терялся целиком. keepalive — чтобы браузер довёл
  // запрос до конца уже после выгрузки страницы. visibilitychange нужен
  // отдельно: на мобильных вкладку часто убивают из фона, не дав pagehide.
  useEffect(() => {
    if (!enabled) return;
    const onHide = () => void flush(true).catch(() => undefined);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      onHide();
    };
  }, [enabled, flush]);

  return {
    cursor,
    tf,
    shownTf,
    setTf,
    candles,
    glide,
    loadMoreHistory,
    historyLoading,
    price,
    ready: closed[shownTf] != null && price != null,
    step,
    speed,
    setSpeed,
    ended,
    error,
    flush,
  };
}
