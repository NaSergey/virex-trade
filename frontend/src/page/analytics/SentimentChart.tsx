'use client';

import { useEffect, useRef } from 'react';
import type { MouseEventParams, Time, UTCTimestamp } from 'lightweight-charts';
import { useLightweightChart } from '@/shared/ui/chart/useLightweightChart';
import type { SentimentPoint } from '@/shared/api/analytics/hooks';

/** $6.1B / $840M — компактные доллары для оси и тултипа. */
export function fmtUsdCompact(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

/**
 * Доля лонг-аккаунтов (правая шкала, в процентах, пунктир на 50% = «толпа
 * нейтральна») + открытый интерес в долларах (левая шкала). Тултип на
 * кроссхейре расшифровывает обе линии словами.
 */
export function SentimentChart({ data }: { data: SentimentPoint[] }) {
  const { containerRef, chart } = useLightweightChart({ leftPriceScale: true });
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chart) return;

    // Long ratio — right scale, 0–100%
    const buySeries = chart.addAreaSeries({
      lineColor: 'rgba(34, 197, 94, 0.9)',
      topColor: 'rgba(34, 197, 94, 0.2)',
      bottomColor: 'rgba(239, 68, 68, 0.2)',
      lineWidth: 2,
      priceScaleId: 'right',
      priceFormat: { type: 'custom', formatter: (v: number) => `${v.toFixed(0)}%` },
    });
    // Ориентир: выше — лонгов больше, ниже — шортов больше.
    buySeries.createPriceLine({
      price: 50,
      color: '#4b5563',
      lineWidth: 1,
      lineStyle: 2, // dashed
      axisLabelVisible: false,
      title: '',
    });

    // Open interest ($) — left scale
    const oiSeries = chart.addAreaSeries({
      lineColor: 'rgba(99, 102, 241, 0.6)',
      topColor: 'rgba(99, 102, 241, 0.12)',
      bottomColor: 'rgba(99, 102, 241, 0.02)',
      lineWidth: 1,
      priceScaleId: 'left',
      priceFormat: { type: 'custom', formatter: fmtUsdCompact },
    });

    const mapped = data.map((p) => ({
      time: (p.timestamp / 1000) as UTCTimestamp,
      value: p.buyRatio * 100,
    }));
    const oiMapped = data
      .filter((p) => p.openInterestUsd > 0)
      .map((p) => ({ time: (p.timestamp / 1000) as UTCTimestamp, value: p.openInterestUsd }));
    buySeries.setData(mapped);
    oiSeries.setData(oiMapped);
    chart.timeScale().fitContent();

    // Плавающий тултип: «дата — лонгов X% / шортов Y% — OI $Z».
    const onCrosshair = (param: MouseEventParams<Time>) => {
      const el = tooltipRef.current;
      const box = containerRef.current;
      if (!el || !box) return;
      // Обе серии — area, их точки всегда несут value.
      const longPct = (param.seriesData.get(buySeries) as { value?: number } | undefined)?.value;
      if (param.time == null || !param.point || longPct == null) {
        el.style.display = 'none';
        return;
      }
      const oiUsd = (param.seriesData.get(oiSeries) as { value?: number } | undefined)?.value;
      const dt = new Date((param.time as number) * 1000);
      const when = dt.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      el.innerHTML =
        `<div class="text-subtle">${when}</div>` +
        `<div><span style="color:#22c55e">Лонг ${longPct.toFixed(1)}%</span>` +
        ` · <span style="color:#ef4444">Шорт ${(100 - longPct).toFixed(1)}%</span></div>` +
        (oiUsd != null ? `<div style="color:#818cf8">OI ${fmtUsdCompact(oiUsd)}</div>` : '');
      el.style.display = 'block';
      // Не даём тултипу вылезать за правый край.
      const flip = param.point.x > box.clientWidth - 170;
      el.style.left = flip ? '' : `${param.point.x + 14}px`;
      el.style.right = flip ? `${box.clientWidth - param.point.x + 14}px` : '';
      el.style.top = `${Math.max(4, param.point.y - 14)}px`;
    };
    chart.subscribeCrosshairMove(onCrosshair);

    return () => {
      // The chart instance may already be disposed by useLightweightChart's own
      // cleanup (e.g. React StrictMode's double-effect-invocation in dev) by the
      // time this runs — removeSeries on a disposed chart throws internally.
      try {
        chart.unsubscribeCrosshairMove(onCrosshair);
        chart.removeSeries(buySeries);
        chart.removeSeries(oiSeries);
      } catch {
        // Chart already disposed — nothing to clean up.
      }
    };
  }, [chart, data, containerRef]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute z-10 hidden rounded-md border border-line bg-surface/95 px-2.5 py-1.5 font-mono text-[11px] leading-4 text-fg shadow-lg shadow-black/30"
      />
    </div>
  );
}
