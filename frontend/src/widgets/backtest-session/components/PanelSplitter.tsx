'use client';

import { useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { PANEL_WIDTH } from '../model/useChartSettings';

/** Графику остаётся не меньше этого — иначе колонка съела бы его целиком. */
const CHART_MIN = 480;
/** Шаг клавиш-стрелок. */
const KEY_STEP = 16;

/**
 * Разделитель между графиком и правой колонкой терминала: тонкая линия, ручка
 * появляется под курсором. Тянут мышью (стрелки — по 16 px, двойной клик —
 * ширина по умолчанию). Пока тянут, ширина пишется в CSS-переменную сетки
 * напрямую, а не состоянием: каждый кадр перерисовывал бы весь терминал. В
 * хранилище — один раз, по отпусканию.
 */
export function PanelSplitter({
  gridRef,
  width,
  onCommit,
}: {
  /** Сетка терминала — на ней переменная `--panel-w`. */
  gridRef: RefObject<HTMLDivElement | null>;
  width: number;
  onCommit: (width: number) => void;
}) {
  const t = useTranslations('backtest');
  const drag = useRef<{ startX: number; startW: number; w: number } | null>(null);

  const maxFor = () => {
    const grid = gridRef.current;
    const room = grid ? grid.clientWidth - CHART_MIN : PANEL_WIDTH.max;
    return Math.max(PANEL_WIDTH.min, Math.min(PANEL_WIDTH.max, room));
  };
  const clampW = (w: number) => Math.round(Math.min(maxFor(), Math.max(PANEL_WIDTH.min, w)));
  const paint = (w: number) => gridRef.current?.style.setProperty('--panel-w', `${w}px`);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.dataset.drag = '';
    drag.current = { startX: e.clientX, startW: width, w: width };
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    // Колонка справа: тянут влево — она шире.
    d.w = clampW(d.startW + (d.startX - e.clientX));
    paint(d.w);
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    delete e.currentTarget.dataset.drag;
    if (d.w !== width) onCommit(d.w);
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowLeft' ? KEY_STEP : e.key === 'ArrowRight' ? -KEY_STEP : 0;
    if (!step) return;
    e.preventDefault();
    const w = clampW(width + step);
    paint(w);
    onCommit(w);
  };

  return (
    <div
      className="term-split"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('panelResize')}
      aria-valuenow={width}
      aria-valuemin={PANEL_WIDTH.min}
      aria-valuemax={PANEL_WIDTH.max}
      title={t('panelResize')}
      tabIndex={0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
      onDoubleClick={() => {
        paint(PANEL_WIDTH.def);
        onCommit(PANEL_WIDTH.def);
      }}
    />
  );
}
