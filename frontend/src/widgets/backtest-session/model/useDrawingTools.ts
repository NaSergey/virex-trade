'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';
import type { ChartDrawingProps } from '../components/drawings/useDrawingGestures';
import { hotkeyOf, isTypingTarget } from '../lib/drawings/hotkeys';
import { translate } from '../lib/drawings/geometry';
import type { Drawing, DrawingColor, DrawingWidth, ToolId } from '../lib/drawings/types';
import { fromScreen, toScreen } from '../lib/money';
import { useSessionDrawings } from './useSessionDrawings';

const MAGNET_KEY = 'virex:drawings:magnet';
const decodeMagnet = (raw: string | null) => raw === '1';
const encodeMagnet = (v: boolean) => (v ? '1' : null);

/** Глубина отмены: правки рисунков мелкие, сотни шагов назад никто не идёт. */
const HISTORY_MAX = 100;
/** Вставленная копия встаёт на столько свечей правее оригинала — иначе её не видно под ним. */
const PASTE_SHIFT_BARS = 5;

const histories = new Map<string, { past: Drawing[][]; future: Drawing[][] }>();
function historyOf(key: string) {
  let h = histories.get(key);
  if (!h) {
    h = { past: [], future: [] };
    histories.set(key, h);
  }
  return h;
}

/** Снимок «до» правки — в отмену; ветка повтора после новой правки теряет смысл. */
function pushHistory(key: string, before: Drawing[]) {
  const h = historyOf(key);
  h.past = [...h.past.slice(-(HISTORY_MAX - 1)), before];
  h.future = [];
}

/** Шаг назад (`back`) или вперёд: возвращает список, который встаёт на график, и кладёт `cur` в обратную сторону. */
function stepHistory(key: string, back: boolean, cur: Drawing[]): Drawing[] | null {
  const h = historyOf(key);
  const from = back ? h.past : h.future;
  const prev = from.at(-1);
  if (!prev) return null;
  if (back) {
    h.past = from.slice(0, -1);
    h.future = [...h.future, cur];
  } else {
    h.future = from.slice(0, -1);
    h.past = [...h.past, cur];
  }
  return prev;
}

const scaled = (d: Drawing, k: (p: number) => number): Drawing => ({ ...d, points: d.points.map((q) => ({ t: q.t, p: k(q.p) })) });

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `d-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Состояние разметки сессии: фигуры, выбранный инструмент и фигура, стиль новых,
 * магнит, отмена правок и буфер копирования. В хранилище цены настоящие, графику
 * уходят экранные (`priceScale`).
 *
 * Горячие клавиши (раскладка TradingView, `lib/drawings/hotkeys.ts`) слушает
 * этот хук, а не график: инструмент берут и тогда, когда фокус на панели ордера.
 */
export function useDrawingTools(userId: string, sessionId: string, scale: number, tfMs = 60_000) {
  const store = useSessionDrawings(userId, sessionId);
  const [tool, setToolState] = useState<ToolId | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [style, setStyle] = useState<{ color: DrawingColor; width: DrawingWidth }>({ color: 'blue', width: 2 });
  const [magnet, setMagnet] = usePersistentValue(MAGNET_KEY, decodeMagnet, false, encodeMagnet);

  // История — снимки списка до правки. Своя у каждой сессии и монеты: отмена на
  // графике ETH не должна возвращать линию на графике BTC. Живёт в модуле, а не в
  // хуке: вернувшись на монету, отменять можно с того же места.
  const histKey = `${userId}:${sessionId}`;
  const h = historyOf(histKey);
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((n) => n + 1), []);

  const clipboard = useRef<Drawing | null>(null);

  const screenDrawings = useMemo(() => store.drawings.map((d) => scaled(d, (p) => toScreen(p, scale))), [store.drawings, scale]);
  const selected = store.drawings.find((d) => d.id === selectedId) ?? null;

  // Взятый инструмент показывает скрытую разметку: рисовать вслепую незачем.
  const setTool = useCallback((next: ToolId | null) => {
    setToolState(next);
    if (next) {
      setHidden(false);
      setSelectedId(null);
    }
  }, []);

  const { snapshot, replace } = store;
  /** Любая правка списка — через неё: снимок «до» уходит в историю. */
  const change = useCallback(
    (fn: (cur: Drawing[]) => Drawing[]) => {
      const cur = snapshot();
      const next = fn(cur);
      if (next === cur) return;
      pushHistory(histKey, cur);
      replace(next);
      bump();
    },
    [histKey, snapshot, replace, bump],
  );

  const upsert = useCallback(
    (d: Drawing) =>
      change((cur) => {
        const i = cur.findIndex((x) => x.id === d.id);
        return i === -1 ? [...cur, d] : cur.map((x) => (x.id === d.id ? d : x));
      }),
    [change],
  );

  const onCommit = useCallback((d: Drawing) => upsert(scaled(d, (p) => fromScreen(p, scale))), [upsert, scale]);
  // Кисть остаётся взятой: штрихов обычно несколько подряд.
  const onToolDone = useCallback(() => setToolState((cur) => (cur === 'brush' ? cur : null)), []);

  const restyle = (patch: Partial<Pick<Drawing, 'color' | 'width' | 'text' | 'locked'>>) => {
    if (patch.color || patch.width) setStyle((s) => ({ color: patch.color ?? s.color, width: patch.width ?? s.width }));
    if (selected) upsert({ ...selected, ...patch });
  };

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    change((cur) => cur.filter((x) => x.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, change]);

  const clearAll = useCallback(() => {
    change((cur) => (cur.length ? [] : cur));
    setSelectedId(null);
  }, [change]);

  const step = useCallback(
    (back: boolean) => {
      const prev = stepHistory(histKey, back, snapshot());
      if (!prev) return false;
      replace(prev);
      setSelectedId((id) => (id && prev.some((d) => d.id === id) ? id : null));
      bump();
      return true;
    },
    [histKey, snapshot, replace, bump],
  );
  const undo = useCallback(() => step(true), [step]);
  const redo = useCallback(() => step(false), [step]);

  const copy = useCallback(() => {
    const d = snapshot().find((x) => x.id === selectedId);
    if (d) clipboard.current = d;
    return !!d;
  }, [snapshot, selectedId]);

  const paste = useCallback(() => {
    const src = clipboard.current;
    if (!src) return false;
    const d = { ...translate(src, PASTE_SHIFT_BARS * tfMs, 0), id: newId(), locked: false };
    // Следующая вставка — правее этой, а не поверх неё.
    clipboard.current = d;
    change((cur) => [...cur, d]);
    setHidden(false);
    setSelectedId(d.id);
    return true;
  }, [tfMs, change]);

  // Esc снимает инструмент, а без него — выделение.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isTypingTarget(e.target)) return;
      if (tool) setToolState(null);
      else setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool]);

  const keysRef = useRef({ setTool, undo, redo, copy, paste, deleteSelected, setHidden, tool, selectedId });
  useEffect(() => {
    keysRef.current = { setTool, undo, redo, copy, paste, deleteSelected, setHidden, tool, selectedId };
  }, [setTool, undo, redo, copy, paste, deleteSelected, tool, selectedId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat && e.code !== 'KeyZ' && e.code !== 'KeyY') return;
      if (isTypingTarget(e.target)) return;
      const action = hotkeyOf(e);
      if (!action) return;
      const k = keysRef.current;
      switch (action.type) {
        case 'tool':
          k.setTool(k.tool === action.tool ? null : action.tool);
          break;
        case 'undo':
          if (!k.undo()) return;
          break;
        case 'redo':
          if (!k.redo()) return;
          break;
        case 'copy':
          // Выделенный текст страницы копируется как обычно — фигура только без него.
          if (window.getSelection()?.toString() || !k.copy()) return;
          break;
        case 'paste':
          if (!k.paste()) return;
          break;
        case 'hide':
          k.setHidden((v) => !v);
          break;
        case 'delete':
          if (!k.selectedId) return;
          k.deleteSelected();
          break;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const chart = useMemo<ChartDrawingProps>(
    () => ({ drawings: screenDrawings, tool, selectedId, hidden, magnet, style, onSelect: setSelectedId, onCommit, onToolDone }),
    [screenDrawings, tool, selectedId, hidden, magnet, style, onCommit, onToolDone],
  );

  return {
    chart,
    tool,
    setTool,
    selected,
    restyle,
    deleteSelected,
    hidden,
    setHidden,
    magnet,
    setMagnet,
    count: store.drawings.length,
    clearAll,
    undo,
    redo,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
    copy,
    paste,
    saveFailed: store.saveFailed,
  };
}
