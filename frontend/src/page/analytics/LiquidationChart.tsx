'use client';

import { useEffect } from 'react';
import type { UTCTimestamp } from 'lightweight-charts';
import { useLightweightChart } from '@/shared/ui/chart/useLightweightChart';

interface LiquidationBucket {
  timestamp: number;
  buys: number;
  sells: number;
}

export function LiquidationChart({ data }: { data: LiquidationBucket[] }) {
  const { containerRef, chart } = useLightweightChart();

  useEffect(() => {
    if (!chart) return;

    // Buy side (shorts liquidated) — green above baseline
    const buySeries = chart.addHistogramSeries({
      color: 'rgba(34, 197, 94, 0.75)',
      base: 0,
      priceScaleId: 'right',
    });

    // Sell side (longs liquidated) — red below baseline (negative values)
    const sellSeries = chart.addHistogramSeries({
      color: 'rgba(239, 68, 68, 0.75)',
      base: 0,
      priceScaleId: 'right',
    });

    buySeries.setData(data.map((d) => ({ time: (d.timestamp / 1000) as UTCTimestamp, value: d.buys })));
    sellSeries.setData(data.map((d) => ({ time: (d.timestamp / 1000) as UTCTimestamp, value: -d.sells })));
    chart.timeScale().fitContent();

    return () => {
      // The chart instance may already be disposed by useLightweightChart's own
      // cleanup (e.g. React StrictMode's double-effect-invocation in dev) by the
      // time this runs — removeSeries on a disposed chart throws internally.
      try {
        chart.removeSeries(buySeries);
        chart.removeSeries(sellSeries);
      } catch {
        // Chart already disposed — nothing to clean up.
      }
    };
  }, [chart, data]);

  return <div ref={containerRef} className="h-full w-full" />;
}
