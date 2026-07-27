'use client';

import { useCallback, useRef, type RefObject } from 'react';
import type { IChartApi, ISeriesApi, MouseEventParams, SeriesType, Time } from 'lightweight-charts';

export interface ChartTooltipSeries {
  series: ISeriesApi<SeriesType>;
  label: string;
  color: string;
  format?: (value: number) => string;
}

/**
 * Плавающая карточка на кроссхейре: дата сверху, затем цветная полоска +
 * label + значение на каждую переданную серию. Общий тултип для всех
 * lightweight-charts графиков — вынесен из SentimentChart, чтобы EquityChart
 * и остальные графики могли получить тот же hover-стиль без копипасты.
 *
 * `attach` вызывается внутри того же эффекта, где вызывающий код создаёт свои
 * серии (сразу после addAreaSeries/addHistogramSeries) — так серии не нужно
 * протаскивать через React state ради дочернего компонента, лишний ре-рендер
 * не нужен.
 */
export function useChartTooltip(containerRef: RefObject<HTMLDivElement | null>) {
  const tooltipRef = useRef<HTMLDivElement>(null);

  const attach = useCallback(
    (chart: IChartApi, series: ChartTooltipSeries[]) => {
      const onCrosshair = (param: MouseEventParams<Time>) => {
        const el = tooltipRef.current;
        const box = containerRef.current;
        if (!el || !box) return;

        const rows = series
          .map((s) => {
            const point = param.seriesData.get(s.series) as { value?: number } | undefined;
            if (point?.value == null) return null;
            const value = s.format ? s.format(point.value) : point.value.toLocaleString('ru-RU');
            return (
              `<div class="flex items-center gap-1.5">` +
              `<span class="inline-block h-2.5 w-0.5 shrink-0 rounded-full" style="background:${s.color}"></span>` +
              `<span class="text-subtle">${s.label}</span>` +
              `<span class="ml-auto font-mono text-fg">${value}</span>` +
              `</div>`
            );
          })
          .filter(Boolean)
          .join('');

        if (param.time == null || !param.point || !rows) {
          el.style.display = 'none';
          return;
        }

        const dt = new Date((param.time as number) * 1000);
        const when = dt.toLocaleString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
        el.innerHTML = `<div class="mb-1 text-[11px] font-semibold text-fg">${when}</div>${rows}`;
        el.style.display = 'block';
        // Не даём тултипу вылезать за правый край.
        const flip = param.point.x > box.clientWidth - 170;
        el.style.left = flip ? '' : `${param.point.x + 14}px`;
        el.style.right = flip ? `${box.clientWidth - param.point.x + 14}px` : '';
        el.style.top = `${Math.max(4, param.point.y - 14)}px`;
      };

      chart.subscribeCrosshairMove(onCrosshair);
      return () => {
        try {
          chart.unsubscribeCrosshairMove(onCrosshair);
        } catch {
          // Chart already disposed — nothing to clean up.
        }
      };
    },
    [containerRef],
  );

  return { tooltipRef, attach };
}

/** Разметка карточки тултипа — рендерится поверх графика, позиционируется через `attach`. */
export function ChartTooltipEl({ tooltipRef }: { tooltipRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={tooltipRef}
      className="pointer-events-none absolute z-10 hidden min-w-35 rounded-md border border-line bg-surface/95 px-2.5 py-2 font-mono text-[11px] leading-4 shadow-(--shadow-high)"
    />
  );
}
