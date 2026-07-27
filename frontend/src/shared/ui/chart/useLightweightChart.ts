'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, LineStyle, type IChartApi } from 'lightweight-charts';

/**
 * Owns the createChart/ResizeObserver/dispose lifecycle shared by the dashboard
 * area/histogram charts (equity, sentiment, liquidation, TVL). Callers add their
 * own series once `chart` is available, since each caller configures a different
 * combination of series.
 */
export function useLightweightChart(options?: { leftPriceScale?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chart, setChart] = useState<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const chartInstance = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8b96a8',
        fontSize: 11,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: '#1c2330', style: LineStyle.Dotted },
      },
      crosshair: {
        vertLine: { color: '#3f4757', width: 1, style: LineStyle.Dashed, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
      rightPriceScale: { borderColor: '#2f3a4d' },
      ...(options?.leftPriceScale
        ? { leftPriceScale: { visible: true, borderColor: '#2f3a4d' } }
        : {}),
      timeScale: { borderColor: '#2f3a4d', timeVisible: true, secondsVisible: false },
      width: container.clientWidth,
      height: container.clientHeight,
    });

    setChart(chartInstance);

    const ro = new ResizeObserver(() => {
      chartInstance.applyOptions({ width: container.clientWidth, height: container.clientHeight });
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chartInstance.remove();
      setChart(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.leftPriceScale]);

  return { containerRef, chart };
}
