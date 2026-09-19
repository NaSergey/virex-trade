'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { magnetPrice, makePosition, moveAnchor, placement, simplifyIdx, translate } from '../../lib/drawings/geometry';
import type { DPoint, Drawing, DrawingColor, DrawingKind, DrawingWidth, ToolId } from '../../lib/drawings/types';

/** Всё, что график отдаёт слою рисунков. Объект обязан быть стабильным между рендерами — график в memo. */
export interface ChartDrawingProps {
  /** В экранных ценах. */
  drawings: Drawing[];
  tool: ToolId | null;
  selectedId: string | null;
  hidden: boolean;
  magnet: boolean;
  style: { color: DrawingColor; width: DrawingWidth };
  onSelect: (id: string | null) => void;
  /** Новая фигура или правка существующей — один раз на завершённое действие. */
  onCommit: (d: Drawing) => void;
  /** Фигура поставлена — панель возвращается к курсору. */
  onToolDone: () => void;
}

/** Текущая геометрия графика — пишется каждый рендер, читается в обработчиках событий. */
export interface ChartGeo {
  svg: SVGSVGElement | null;
  svgX: (clientX: number) => number;
  svgY: (clientY: number) => number;
  /** `snap` — к центру свечи; кисть рисует без привязки. */
  timeAt: (x: number, snap: boolean) => number;
  priceAt: (y: number) => number;
  yOf: (p: number) => number;
  candleAt: (t: number) => { o: number; h: number; l: number; c: number } | null;
  px: (n: number) => number;
  PW: number;
  lo: number;
  hi: number;
  tfMs: number;
}

export interface Ruler {
  a: DPoint;
  b: DPoint;
}

/** Дальше этого сдвига (экранные px) нажатие — уже протяжка, а не клик. */
const CLICK_PX = 4;
const MAGNET_PX = 14;
const BRUSH_EPS_PX = 1;
/** Позиция по клику: стоп на эту долю видимого диапазона цены, длина — в свечах. */
const POSITION_RISK_FRAC = 0.06;
const POSITION_BARS = 20;
/** Двойной клик сразу после действия рисования — не жест графика (сброс зума, «к живому краю»). */
const DBLCLICK_GUARD_MS = 450;

type Gesture =
  | { type: 'create'; kind: DrawingKind | 'ruler'; pointerId: number; downX: number; downY: number; a: DPoint; b: DPoint; phase: 'drag' | 'await' }
  | { type: 'brush'; pointerId: number; pts: DPoint[]; xs: number[]; ys: number[] }
  | { type: 'move'; pointerId: number; orig: Drawing; start: DPoint; next: Drawing | null }
  | { type: 'anchor'; pointerId: number; orig: Drawing; i: number; next: Drawing | null };

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `d-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Жесты рисования на графике. Обработчики `down/move/up` зовутся первыми из
 * обработчиков графика и возвращают `true`, если событие забрали, — тогда пан и
 * зум его не видят.
 *
 * Как и драг уровней, промежуточные кадры живут в состоянии слоя (`preview`,
 * `override`), а наружу уходит один `onCommit` по отпусканию: запись в хранилище
 * на каждый кадр жеста гоняла бы сериализацию всех фигур сессии.
 *
 * Две точки ставятся и протяжкой, и двумя кликами: короткое нажатие переводит
 * фигуру в ожидание второй точки, которая до клика едет за курсором.
 */
export function useDrawingGestures(opts: ChartDrawingProps | undefined, geoRef: RefObject<ChartGeo>) {
  const gesture = useRef<Gesture | null>(null);
  const [preview, setPreview] = useState<Drawing | null>(null);
  const [override, setOverride] = useState<Drawing | null>(null);
  const [ruler, setRuler] = useState<Ruler | null>(null);
  const lastAction = useRef(0);
  const pending = useRef<{ x: number; y: number } | null>(null);
  const raf = useRef(0);
  const optsRef = useRef(opts);
  useLayoutEffect(() => {
    optsRef.current = opts;
  });

  const pointAt = (clientX: number, clientY: number, snap: boolean, magnet: boolean): DPoint => {
    const g = geoRef.current;
    const x = g.svgX(clientX);
    const t = g.timeAt(x, snap);
    let p = g.priceAt(g.svgY(clientY));
    if (magnet && optsRef.current?.magnet) p = magnetPrice(g.candleAt(t), p, g.yOf, g.px(MAGNET_PX));
    return { t, p };
  };

  const draft = (kind: DrawingKind, points: DPoint[], id = newId()): Drawing => {
    const style = optsRef.current?.style ?? { color: 'blue' as const, width: 2 as const };
    return { id, kind, points, color: style.color, width: style.width };
  };

  const cancel = useCallback(() => {
    gesture.current = null;
    pending.current = null;
    setPreview(null);
    setOverride(null);
    setRuler(null);
  }, []);

  // Инструмент сменили или сняли посреди постановки — недорисованная фигура не остаётся висеть.
  const tool = opts?.tool ?? null;
  useEffect(() => {
    const g = gesture.current;
    if (g && (g.type === 'create' || g.type === 'brush')) cancel();
  }, [tool, cancel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancel]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const finishCreate = (g: Extract<Gesture, { type: 'create' }>, b: DPoint) => {
    const o = optsRef.current;
    gesture.current = null;
    setPreview(null);
    lastAction.current = performance.now();
    if (g.kind === 'ruler') {
      setRuler({ a: g.a, b });
      o?.onToolDone();
      return;
    }
    if (g.a.t === b.t && g.a.p === b.p) return;
    const d = draft(g.kind, [g.a, b]);
    o?.onCommit(d);
    o?.onSelect(d.id);
    o?.onToolDone();
  };

  const apply = () => {
    const at = pending.current;
    const g = gesture.current;
    pending.current = null;
    if (!at || !g) return;
    if (g.type === 'create') {
      g.b = pointAt(at.x, at.y, true, true);
      if (g.kind === 'ruler') setRuler({ a: g.a, b: g.b });
      else setPreview(draft(g.kind, [g.a, g.b], 'preview'));
    } else if (g.type === 'brush') {
      const geo = geoRef.current;
      g.pts.push(pointAt(at.x, at.y, false, false));
      g.xs.push(geo.svgX(at.x));
      g.ys.push(geo.svgY(at.y));
      setPreview(draft('brush', [...g.pts], 'preview'));
    } else if (g.type === 'move') {
      const pt = pointAt(at.x, at.y, true, false);
      g.next = translate(g.orig, pt.t - g.start.t, pt.p - g.start.p);
      setOverride(g.next);
    } else {
      g.next = moveAnchor(g.orig, g.i, pointAt(at.x, at.y, true, true));
      setOverride(g.next);
    }
  };
  const applyRef = useRef(apply);
  useLayoutEffect(() => {
    applyRef.current = apply;
  });

  const flush = () => {
    if (!raf.current) return;
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    applyRef.current();
  };

  const capture = (e: PointerEvent) => {
    e.preventDefault();
    geoRef.current.svg?.setPointerCapture(e.pointerId);
  };

  const down = (e: PointerEvent<SVGSVGElement>): boolean => {
    const o = optsRef.current;
    if (!o) return false;
    const geo = geoRef.current;
    if (geo.svgX(e.clientX) > geo.PW) return false;
    if (ruler) setRuler(null);
    const g = gesture.current;
    if (g?.type === 'create' && g.phase === 'await') {
      capture(e);
      finishCreate(g, pointAt(e.clientX, e.clientY, true, true));
      return true;
    }
    if (!o.tool) {
      if (o.selectedId) o.onSelect(null);
      return false;
    }
    capture(e);
    lastAction.current = performance.now();
    const pt = pointAt(e.clientX, e.clientY, true, true);
    const tool = o.tool;
    const how = tool === 'ruler' ? 2 : placement(tool);
    if (how === 1 && tool !== 'ruler') {
      const points =
        tool === 'long' || tool === 'short' ? makePosition(tool, pt, (geo.hi - geo.lo) * POSITION_RISK_FRAC, geo.tfMs * POSITION_BARS) : [pt];
      const d = draft(tool, points);
      o.onCommit(d);
      o.onSelect(d.id);
      o.onToolDone();
      return true;
    }
    if (how === 'drag') {
      const p = pointAt(e.clientX, e.clientY, false, false);
      gesture.current = { type: 'brush', pointerId: e.pointerId, pts: [p], xs: [geo.svgX(e.clientX)], ys: [geo.svgY(e.clientY)] };
      setPreview(draft('brush', [p], 'preview'));
      return true;
    }
    gesture.current = { type: 'create', kind: tool, pointerId: e.pointerId, downX: e.clientX, downY: e.clientY, a: pt, b: pt, phase: 'drag' };
    return true;
  };

  const move = (e: PointerEvent<SVGSVGElement>): boolean => {
    const g = gesture.current;
    if (!g) return false;
    // Ожидание второй точки идёт за любым указателем, в том числе без нажатия (наведение мыши).
    if (!(g.type === 'create' && g.phase === 'await') && e.pointerId !== g.pointerId) return false;
    pending.current = { x: e.clientX, y: e.clientY };
    if (!raf.current) {
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        applyRef.current();
      });
    }
    return true;
  };

  const up = (e: PointerEvent<SVGSVGElement>): boolean => {
    const g = gesture.current;
    if (!g) return false;
    if (g.type === 'create' && g.phase === 'await') return true;
    if (e.pointerId !== g.pointerId) return false;
    flush();
    const o = optsRef.current;
    if (g.type === 'create') {
      if (Math.hypot(e.clientX - g.downX, e.clientY - g.downY) < CLICK_PX) {
        g.phase = 'await';
        return true;
      }
      finishCreate(g, g.b);
      return true;
    }
    gesture.current = null;
    lastAction.current = performance.now();
    if (g.type === 'brush') {
      setPreview(null);
      if (g.pts.length >= 2) {
        const keep = simplifyIdx(g.xs, g.ys, geoRef.current.px(BRUSH_EPS_PX));
        o?.onCommit(draft('brush', keep.map((i) => g.pts[i])));
      }
      return true;
    }
    setOverride(null);
    if (g.next) o?.onCommit(g.next);
    return true;
  };

  const startShape = (d: Drawing, e: PointerEvent<SVGElement>) => {
    const o = optsRef.current;
    if (!o || o.tool) return;
    e.stopPropagation();
    capture(e);
    o.onSelect(d.id);
    gesture.current = { type: 'move', pointerId: e.pointerId, orig: d, start: pointAt(e.clientX, e.clientY, true, false), next: null };
  };

  const startAnchor = (d: Drawing, i: number, e: PointerEvent<SVGElement>) => {
    const o = optsRef.current;
    if (!o || o.tool) return;
    e.stopPropagation();
    capture(e);
    gesture.current = { type: 'anchor', pointerId: e.pointerId, orig: d, i, next: null };
  };

  const blocksDoubleClick = () => !!optsRef.current?.tool || performance.now() - lastAction.current < DBLCLICK_GUARD_MS;

  return { down, move, up, startShape, startAnchor, preview, override, ruler, blocksDoubleClick };
}
