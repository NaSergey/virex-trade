'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import { Button } from '@/shared/ui/Button';
import { glidePrice, indexAtOrAfter, resolveWindow, type ViewState } from '../lib/motion';
import type { Candle } from '../lib/candles';

const W = 720;
const H = 380;
const PR = 72; // полоса цен справа
const PT = 14;
const PB = 24;
const PW = W - PR;
const DEFAULT_COUNT = 120;
const MIN_COUNT = 20;
const MAX_COUNT = 400;
/** Насколько близко к загруженному краю пан просит родителя догрузить историю. */
const EDGE_THRESHOLD = 15;
const TICKS = 5;
const ZOOM_STEP = 1.15;

export type LevelKind = 'entry' | 'stop' | 'take';

export interface Level {
  kind: LevelKind;
  price: number;
  draggable: boolean;
}

const LEVEL_COLOR: Record<LevelKind, string> = {
  entry: 'var(--color-fg)',
  stop: 'var(--loss)',
  take: 'var(--profit)',
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * График прокрутки: свечи до текущего момента и уровни сделки.
 *
 * Своё SVG, как все графики продукта: библиотеке пришлось бы переопределять
 * цвета, шрифты и рамки по одному свойству. Холст масштабируется целиком,
 * пиксельные мерки переводятся в единицы холста через u = W / boxW.
 *
 * Окно показа (сколько свечей видно и какие) — состояние самого графика: пан
 * (драг) и зум двигают его напрямую, «живой край» включён по умолчанию и
 * возвращается кнопкой. Родитель знает только о запросе догрузить историю,
 * когда пан подходит к загруженному краю (`onNeedHistory`).
 *
 * Стоп и тейк перетаскиваются. Их «горячая зона» останавливает событие
 * (`stopPropagation`) — иначе один и тот же клик начинал бы и перетаскивание
 * уровня, и пан фона.
 */
export function ReplayChart({
  candles,
  levels,
  labelFor,
  levelLabel,
  liveLabel,
  onDragLevel,
  onNeedHistory,
  historyLoading,
  glide,
}: {
  candles: Candle[];
  levels: Level[];
  labelFor: (t: number) => string;
  levelLabel: (kind: LevelKind) => string;
  /** Подпись кнопки возврата к живому краю — перевод даёт вызывающий, как и остальные подписи. */
  liveLabel: string;
  onDragLevel?: (kind: LevelKind, price: number, done: boolean) => void;
  /** Пан подошёл к загруженному краю — время догрузить историю назад. */
  onNeedHistory?: () => void;
  historyLoading?: boolean;
  /** В настоящих для экрана (масштабированных) ценах — минутка, которую сейчас анимируем. */
  glide: { minute: Candle; durationMs: number } | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [boxW, setBoxW] = useState(0);
  const [drag, setDrag] = useState<LevelKind | null>(null);
  const frozen = useRef<{ lo: number; hi: number } | null>(null);
  const lastDrag = useRef<number | null>(null);
  /** Указатель, который тащит уровень — чтобы движение/отпускание другого пальца его не задевало. */
  const dragPointerId = useRef<number | null>(null);
  const [view, setView] = useState<ViewState>({ count: DEFAULT_COUNT, anchorTime: null });
  // Якорь пана/пинча — время свечи, а не индекс: догрузка истории при подходе
  // к краю (onNeedHistory) может прямо во время того же жеста добавить свечи
  // в начало массива и сдвинуть все индексы — время сдвиг не портит.
  const panRef = useRef<{ startX: number; anchorT: number | null; count: number; slot: number } | null>(null);
  const [animCandle, setAnimCandle] = useState<Candle | null>(null);
  const prevLastRef = useRef<Candle | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; count: number; anchorT: number | null; midFrac: number } | null>(null);
  /**
   * Колёсный зум висит на нативном (не React) листенере, чтобы звать
   * preventDefault — React с версии 17 держит onWheel пассивным, и внутри
   * него preventDefault просто не работает. Листенеру нужны свежие
   * startIdx/count/candles на момент события, а не из замыкания при монтаже —
   * отсюда ref, обновляемый каждый рендер.
   */
  const latestRef = useRef({ startIdx: 0, count: DEFAULT_COUNT, candles: [] as Candle[] });

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    setBoxW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => setBoxW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const u = boxW > 0 ? W / boxW : 1;
  const px = (n: number) => n * u;

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const xFrac = clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const { startIdx: s, count: c, candles: cs } = latestRef.current;
      const focalIdx = s + xFrac * c;
      const factor = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
      const newCount = clamp(Math.round(c * factor), MIN_COUNT, MAX_COUNT);
      const maxStart = Math.max(0, cs.length - newCount);
      const newStart = clamp(Math.round(focalIdx - xFrac * newCount), 0, maxStart);
      setView({ count: newCount, anchorTime: newStart >= maxStart ? null : cs[newStart]?.t ?? null });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const { startIdx, endIdx, live } = resolveWindow(candles, view, { minCount: MIN_COUNT, maxCount: MAX_COUNT });
  const shown = candles.slice(startIdx, endIdx);

  // Пан подошёл к загруженному краю — просим родителя догрузить историю
  // назад. Догрузка добавляет свечи в начало массива; окно держится за
  // anchorTime, а не за индекс, поэтому сдвиг массива его не портит.
  useEffect(() => {
    if (!live && startIdx <= EDGE_THRESHOLD && !historyLoading) onNeedHistory?.();
  }, [startIdx, live, historyLoading, onNeedHistory]);

  useEffect(() => {
    // На монтировании — база для первого тика: иначе уже накопленная часть
    // формирующейся свечи «обрушилась» бы до открытия на первой анимации.
    prevLastRef.current = shown.length ? shown[shown.length - 1] : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!glide) return;
    const newLast = shown.length ? shown[shown.length - 1] : null;
    if (!newLast) return;
    const prev = prevLastRef.current;
    const sameBucket = prev != null && prev.t === newLast.t;
    const base = sameBucket
      ? prev!
      : { t: newLast.t, o: glide.minute.o, h: glide.minute.o, l: glide.minute.o, c: glide.minute.o };
    const { minute, durationMs } = glide;
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const ph = Math.min(1, (now - t0) / durationMs);
      const price = glidePrice(minute.o, minute.h, minute.l, minute.c, ph);
      if (ph < 1) {
        setAnimCandle({ t: newLast.t, o: base.o, h: Math.max(base.h, price), l: Math.min(base.l, price), c: price });
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

  let lo: number;
  let hi: number;
  if (drag && frozen.current) {
    ({ lo, hi } = frozen.current);
  } else {
    const values = [...shown.flatMap((c) => [c.h, c.l]), ...levels.map((l) => l.price)];
    lo = values.length ? Math.min(...values) : 0;
    hi = values.length ? Math.max(...values) : 1;
    const pad = (hi - lo) * 0.06 || Math.abs(hi) * 0.01 || 1;
    lo -= pad;
    hi += pad;
  }

  const plotH = H - PT - PB;
  const y = (p: number) => PT + ((hi - p) / (hi - lo)) * plotH;
  const priceAt = (yy: number) => clamp(hi - ((yy - PT) / plotH) * (hi - lo), lo, hi);
  const count = endIdx - startIdx;
  const slot = count > 0 ? PW / count : PW;
  useEffect(() => {
    latestRef.current = { startIdx, count, candles };
  });
  const cx = (i: number) => i * slot + slot / 2;
  const bodyW = Math.max(px(1), slot * 0.66);

  const svgY = (clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return ((clientY - r.top) / r.height) * H;
  };
  const svgX = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * W;
  };

  const startDrag = (kind: LevelKind) => (e: PointerEvent<SVGRectElement>) => {
    // Не пускаем событие к фоновому пану — иначе на одном клике начались бы
    // сразу оба жеста.
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    frozen.current = { lo, hi };
    dragPointerId.current = e.pointerId;
    setDrag(kind);
  };

  const startPan = (e: PointerEvent<SVGSVGElement>) => {
    svgRef.current?.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      panRef.current = null;
      const [a, b] = [...pointersRef.current.values()];
      const rect = svgRef.current!.getBoundingClientRect();
      pinchRef.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        count,
        anchorT: candles[startIdx]?.t ?? null,
        midFrac: clamp(((a.x + b.x) / 2 - rect.left) / rect.width, 0, 1),
      };
      return;
    }
    panRef.current = { startX: svgX(e.clientX), anchorT: candles[startIdx]?.t ?? null, count, slot };
  };

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    // Только указатель, начавший этот драг — иначе второй палец на фоне (пан)
    // дёргал бы уровень чужим движением.
    if (drag && onDragLevel && e.pointerId === dragPointerId.current) {
      const p = priceAt(svgY(e.clientY));
      lastDrag.current = p;
      onDragLevel(drag, p, false);
      return;
    }
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      // Защита от деления на ноль — редкий, но возможный случай, когда два
      // указателя совпадают по координате в момент начала пинча.
      const ratio = pinch.dist === 0 ? 1 : dist / pinch.dist;
      const newCount = clamp(Math.round(pinch.count / ratio), MIN_COUNT, MAX_COUNT);
      const baseIdx = pinch.anchorT != null ? indexAtOrAfter(candles, pinch.anchorT) : 0;
      const focalIdx = baseIdx + pinch.midFrac * pinch.count;
      const maxStart = Math.max(0, candles.length - newCount);
      const newStart = clamp(Math.round(focalIdx - pinch.midFrac * newCount), 0, maxStart);
      setView({ count: newCount, anchorTime: newStart >= maxStart ? null : candles[newStart]?.t ?? null });
      return;
    }
    const pan = panRef.current;
    if (!pan) return;
    const dx = svgX(e.clientX) - pan.startX;
    const deltaSlots = Math.round(dx / pan.slot);
    const baseIdx = pan.anchorT != null ? indexAtOrAfter(candles, pan.anchorT) : 0;
    const maxStart = Math.max(0, candles.length - pan.count);
    const newStart = clamp(baseIdx - deltaSlots, 0, maxStart);
    setView({ count: pan.count, anchorTime: newStart >= maxStart ? null : candles[newStart]?.t ?? null });
  };

  const endDrag = (e: PointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(e.pointerId);
    const remaining = [...pointersRef.current.entries()];
    if (remaining.length < 2) pinchRef.current = null;
    if (drag && e.pointerId === dragPointerId.current) {
      if (onDragLevel && lastDrag.current != null) onDragLevel(drag, lastDrag.current, true);
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
      panRef.current = { startX: svgX(pos.x), anchorT: candles[startIdx]?.t ?? null, count, slot };
    } else {
      panRef.current = null;
    }
  };

  const goLive = () => setView((v) => ({ ...v, anchorTime: null }));

  const ticks = Array.from({ length: TICKS }, (_, i) => lo + ((i + 0.5) / TICKS) * (hi - lo));
  const timeIdx = shown.length ? [...new Set([0.15, 0.5, 0.85].map((f) => Math.floor(f * (shown.length - 1))))] : [];

  return (
    <div className="replay-chart-wrap">
      <svg
        ref={svgRef}
        className="replay-chart"
        viewBox={`0 0 ${W} ${H}`}
        onPointerDown={startPan}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {ticks.map((p) => (
          <g key={p}>
            <line x1={0} x2={PW} y1={y(p)} y2={y(p)} stroke="var(--color-line)" strokeWidth={px(1)} />
            <text x={PW + px(6)} y={y(p) + px(3.5)} fill="var(--color-muted)" fontSize={px(10)} fontFamily="var(--font-mono)">
              {formatPriceGrouped(p)}
            </text>
          </g>
        ))}

        {shown.map((c, i) => {
          // Последняя свеча во время анимации минутки — берём анимированные
          // значения, а не финальные: они и так почти совпадают в конце пути,
          // разница видна только на глаз, не на шкале.
          const draw = animCandle && i === shown.length - 1 && animCandle.t === c.t ? animCandle : c;
          const color = draw.c >= draw.o ? 'var(--profit)' : 'var(--loss)';
          const top = y(Math.max(draw.o, draw.c));
          const bottom = y(Math.min(draw.o, draw.c));
          return (
            <g key={c.t}>
              <line x1={cx(i)} x2={cx(i)} y1={y(draw.h)} y2={y(draw.l)} stroke={color} strokeWidth={px(1)} />
              <rect x={cx(i) - bodyW / 2} y={top} width={bodyW} height={Math.max(px(1), bottom - top)} fill={color} />
            </g>
          );
        })}

        {timeIdx.map((i) => (
          <text key={i} x={cx(i)} y={H - px(7)} fill="var(--color-muted)" fontSize={px(10)} textAnchor="middle">
            {labelFor(shown[i].t)}
          </text>
        ))}

        {levels.map((l) => (
          <g key={l.kind}>
            <line
              x1={0}
              x2={PW}
              y1={y(l.price)}
              y2={y(l.price)}
              stroke={LEVEL_COLOR[l.kind]}
              strokeWidth={px(1.25)}
              strokeDasharray={l.kind === 'entry' ? undefined : `${px(5)} ${px(4)}`}
            />
            <text x={px(4)} y={y(l.price) - px(4)} fill={LEVEL_COLOR[l.kind]} fontSize={px(10)} fontFamily="var(--font-mono)">
              {levelLabel(l.kind)} {formatPriceGrouped(l.price)}
            </text>
            {l.draggable && onDragLevel && (
              <rect
                className="lvl-hit"
                x={0}
                y={y(l.price) - px(8)}
                width={PW}
                height={px(16)}
                fill="transparent"
                onPointerDown={startDrag(l.kind)}
              />
            )}
          </g>
        ))}
      </svg>
      {!live && (
        <Button className="replay-live" onClick={goLive}>
          {liveLabel}
        </Button>
      )}
    </div>
  );
}
