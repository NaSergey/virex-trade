'use client';

import { useEffect } from 'react';
import { LineStyle, type SeriesMarker, type Time, type UTCTimestamp } from 'lightweight-charts';
import { useLightweightChart } from '@/shared/ui/chart/useLightweightChart';
import type { RangeCheckResponse } from '@/shared/api/bybit/hooks';

/**
 * Свечи таймфрейма с нанесённым окном измерения: горизонтальные линии high/low
 * того самого окна, по которому считался «диапазон входа», и цена входа между
 * ними. Смысл картинки ровно один — глазами убедиться, что число посчитано по
 * тем свечам и по той цене, по которым должно.
 *
 * lightweight-charts (а не inline-SVG, как equity-кривая): здесь нужны честные
 * свечи и ценовые линии, а это ровно то, что v4 умеет из коробки.
 */
export function RangeCheckChart({ data }: { data: RangeCheckResponse }) {
  const { containerRef, chart } = useLightweightChart();

  useEffect(() => {
    if (!chart || data.candles.length === 0) return;

    const series = chart.addCandlestickSeries({
      upColor: 'rgba(38,165,68,0.9)',
      downColor: 'rgba(235,87,87,0.9)',
      borderUpColor: '#26a544',
      borderDownColor: '#eb5757',
      wickUpColor: 'rgba(38,165,68,0.6)',
      wickDownColor: 'rgba(235,87,87,0.6)',
    });
    series.setData(data.candles.map((c) => ({ ...c, time: c.time as UTCTimestamp })));

    // Три числа, из которых и складывается метрика:
    // (вход − низ) / (верх − низ).
    if (data.window.high != null) {
      series.createPriceLine({
        price: data.window.high,
        color: '#eb5757',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'верх окна',
      });
    }
    if (data.window.low != null) {
      series.createPriceLine({
        price: data.window.low,
        color: '#26a544',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'низ окна',
      });
    }
    series.createPriceLine({
      price: data.entry.price,
      color: '#e6edf7',
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: 'вход',
    });

    // Метки входа и выхода. Время уже привязано бэкендом к конкретной свече —
    // маркер на «межсвечном» времени библиотека просто не покажет.
    const isLong = data.direction === 'long';
    const markers: SeriesMarker<Time>[] = [];
    if (data.entry.barTime != null) {
      markers.push({
        time: data.entry.barTime as UTCTimestamp,
        position: isLong ? 'belowBar' : 'aboveBar',
        color: '#e6edf7',
        shape: isLong ? 'arrowUp' : 'arrowDown',
        text: 'вход',
      });
    }
    if (data.exit.barTime != null) {
      markers.push({
        time: data.exit.barTime as UTCTimestamp,
        position: isLong ? 'aboveBar' : 'belowBar',
        color: data.closedPnl >= 0 ? '#26a544' : '#eb5757',
        shape: 'circle',
        text: 'выход',
      });
    }
    if (markers.length > 0) series.setMarkers(markers);

    chart.timeScale().fitContent();

    return () => {
      // Инстанс графика мог быть уже уничтожен собственной уборкой
      // useLightweightChart (например, двойным вызовом эффекта в StrictMode) —
      // removeSeries на мёртвом графике бросает изнутри.
      try {
        chart.removeSeries(series);
      } catch {
        // График уже уничтожен — убирать нечего.
      }
    };
  }, [chart, data]);

  return <div ref={containerRef} className="h-full w-full" />;
}
