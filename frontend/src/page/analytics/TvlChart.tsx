'use client';

import { useEffect } from 'react';
import type { UTCTimestamp } from 'lightweight-charts';
import { useLightweightChart } from '@/shared/ui/chart/useLightweightChart';
import type { TvlPoint } from '@/shared/api/analytics/hooks';

export function TvlChart({ data }: { data: TvlPoint[] }) {
  const { containerRef, chart } = useLightweightChart();

  useEffect(() => {
    if (!chart) return;
    const series = chart.addAreaSeries({
      lineColor: '#3b82f6',
      topColor: 'rgba(59,130,246,0.25)',
      bottomColor: 'rgba(59,130,246,0.02)',
      lineWidth: 2,
    });
    series.setData(data.map((p) => ({ time: p.date as UTCTimestamp, value: p.tvl })));
    chart.timeScale().fitContent();
    return () => {
      // The chart instance may already be disposed by useLightweightChart's own
      // cleanup (e.g. React StrictMode's double-effect-invocation in dev) by the
      // time this runs — removeSeries on a disposed chart throws internally.
      try {
        chart.removeSeries(series);
      } catch {
        // Chart already disposed — nothing to clean up.
      }
    };
  }, [chart, data]);

  return <div ref={containerRef} className="h-full w-full" />;
}
