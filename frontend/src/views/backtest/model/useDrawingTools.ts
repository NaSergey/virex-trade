'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePersistentValue } from '@/shared/lib/storage/usePersistentValue';
import type { ChartDrawingProps } from '../components/drawings/useDrawingGestures';
import type { Drawing, DrawingColor, DrawingWidth, ToolId } from '../lib/drawings/types';
import { fromScreen, toScreen } from '../lib/money';
import { useSessionDrawings } from './useSessionDrawings';

const MAGNET_KEY = 'virex:drawings:magnet';
const decodeMagnet = (raw: string | null) => raw === '1';
const encodeMagnet = (v: boolean) => (v ? '1' : null);

const scaled = (d: Drawing, k: (p: number) => number): Drawing => ({ ...d, points: d.points.map((q) => ({ t: q.t, p: k(q.p) })) });

/**
 * Состояние разметки сессии: фигуры, выбранный инструмент и фигура, стиль новых,
 * магнит. В хранилище цены настоящие, графику уходят экранные (`priceScale`).
 */
export function useDrawingTools(userId: string, sessionId: string, scale: number) {
  const store = useSessionDrawings(userId, sessionId);
  const [tool, setToolState] = useState<ToolId | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [style, setStyle] = useState<{ color: DrawingColor; width: DrawingWidth }>({ color: 'blue', width: 2 });
  const [magnet, setMagnet] = usePersistentValue(MAGNET_KEY, decodeMagnet, false, encodeMagnet);

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

  const { upsert, remove, clear } = store;
  const onCommit = useCallback((d: Drawing) => upsert(scaled(d, (p) => fromScreen(p, scale))), [upsert, scale]);
  // Кисть остаётся взятой: штрихов обычно несколько подряд.
  const onToolDone = useCallback(() => setToolState((cur) => (cur === 'brush' ? cur : null)), []);

  const restyle = (patch: Partial<Pick<Drawing, 'color' | 'width'>>) => {
    setStyle((s) => ({ ...s, ...patch }));
    if (selected) upsert({ ...selected, ...patch });
  };

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    remove(selectedId);
    setSelectedId(null);
  }, [selectedId, remove]);

  useEffect(() => {
    if (!tool) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setToolState(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool]);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      e.preventDefault();
      deleteSelected();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, deleteSelected]);

  const clearAll = useCallback(() => {
    clear();
    setSelectedId(null);
  }, [clear]);

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
    saveFailed: store.saveFailed,
  };
}
