'use client';

import { memo, useMemo, type ComponentProps, type PointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/utils/css';
import { DEFAULT_SYMBOL, type SessionDetail } from '../api/types';
import { scaleCandle } from '../lib/candles';
import { positionLevels, tradeMarkers } from '../lib/chart-levels';
import { drawingScope } from '../lib/drawings/store';
import type { DrawingColor, DrawingWidth } from '../lib/drawings/types';
import { toScreen } from '../lib/money';
import type { Pane } from '../lib/panes';
import { useLiveFeed, type LiveSource } from '../model/useLiveFeed';
import { useSessionDrawings } from '../model/useSessionDrawings';
import type { ChartDrawingProps } from './drawings/useDrawingGestures';
import { ReplayChart, type Level, type Marker } from './ReplayChart';
import { ChartSkeleton } from './TerminalSkeleton';

export type ChartProps = ComponentProps<typeof ReplayChart>;

const NO_ANCHORS: readonly number[] = [];
const NO_LEVELS: Level[] = [];
const NO_MARKERS: Marker[] = [];
const STYLE: { color: DrawingColor; width: DrawingWidth } = { color: 'blue', width: 2 };
const noop = () => undefined;

/**
 * Ячейка сетки графиков терминала (спека 2026-11-17). В каждой ячейке — этот же
 * компонент, активная отличается только пропсами: так `ReplayChart` внутри не
 * пересоздаётся при переключении, и масштаб со сдвигом остаются.
 *
 * - У ячейки своя лента (`useLiveFeed`) своей монеты и ТФ. Пока ячейка активна,
 *   лента стоит: свечи даёт лента терминала (`main`). Пока та не готова для этой
 *   монеты и ТФ — сразу после переключения, — рисуются свои последние свечи.
 * - Активная ячейка рисует график терминала целиком: черновик, жесты, рисование.
 * - Неактивная — свою монету: позиции и ордера без перетаскивания, отметки
 *   сделок и рисунки без правки. Нажатие делает её активной и дальше не идёт —
 *   жест на неактивном графике не начинается. Перекрестие и колесо работают.
 *
 * memo: неактивная ячейка перерисовывается на свой хвост и смену счёта, а не на
 * каждую перерисовку терминала.
 */
export const ChartPane = memo(function ChartPane({
  index,
  pane,
  active,
  main,
  mainReady,
  detail,
  source,
  scale,
  decimalsOf,
  qtyStepOf,
  labelFor,
  levelLabel,
  rsi,
  volume,
  oddsOn,
  userId,
  drawingsHidden,
  sourceLabel,
  onActivate,
}: {
  index: number;
  pane: Pane;
  active: boolean;
  /** Пропсы графика терминала — только у активной ячейки. */
  main: ChartProps | null;
  /** Лента терминала уже показывает монету и ТФ этой ячейки. */
  mainReady: boolean;
  detail: SessionDetail;
  source: LiveSource | undefined;
  scale: number;
  decimalsOf: (symbol: string) => number | undefined;
  qtyStepOf: (symbol: string) => number;
  labelFor: (t: number) => string;
  levelLabel: ChartProps['levelLabel'];
  rsi: boolean;
  volume: boolean;
  oddsOn: boolean;
  userId: string;
  drawingsHidden: boolean;
  sourceLabel: string | null;
  onActivate: (index: number) => void;
}) {
  const t = useTranslations('backtest');
  // У активной ячейки своя лента выключена целиком: свечи той же монеты и ТФ уже
  // грузит лента терминала, второй запрос был бы лишним. Загруженное остаётся —
  // им ячейка и рисует, пока лента терминала догоняет переключение.
  const feed = useLiveFeed(detail, !active, pane.symbol, source, active, NO_ANCHORS, pane.tf);
  const candles = useMemo(() => feed.candles.map((c) => scaleCandle(c, scale)), [feed.candles, scale]);
  const { trades, closeOrders, entryOrders, session } = detail;
  const price = feed.price;

  const levels = useMemo(
    () =>
      active
        ? NO_LEVELS
        : positionLevels({
            trades: trades.filter((x) => x.exitTime == null),
            closeOrders,
            entryOrders,
            symbol: pane.symbol,
            scale,
            livePrice: price,
            screenPrice: price != null ? toScreen(price, scale) : null,
            balance: session.balance,
            qtyStepOf,
            draggable: false,
            oddsOn,
            trailName: t('level.trailStop'),
          }),
    [active, trades, closeOrders, entryOrders, pane.symbol, scale, price, session.balance, qtyStepOf, oddsOn, t],
  );
  const markers = useMemo(() => (active ? NO_MARKERS : tradeMarkers(trades, pane.symbol, scale)), [active, trades, pane.symbol, scale]);

  // Рисунки своей монеты — то же хранилище, что у панели рисования: правка на
  // активном графике той же монеты видна здесь сразу. В эфире цена не
  // скрывается (масштаб 1), поэтому фигуры — как лежат.
  const { drawings } = useSessionDrawings(userId, drawingScope(session.id, pane.symbol, DEFAULT_SYMBOL));
  const drawing = useMemo<ChartDrawingProps>(
    () => ({
      drawings,
      tool: null,
      selectedId: null,
      hidden: drawingsHidden,
      magnet: false,
      style: STYLE,
      onSelect: noop,
      onCommit: noop,
      onToolDone: noop,
    }),
    [drawings, drawingsHidden],
  );
  const legend = [pane.symbol, t(`tf.${pane.tf}`), sourceLabel].filter(Boolean).join(' · ');

  const activate = (e: PointerEvent<HTMLDivElement>) => {
    if (active) return;
    e.stopPropagation();
    e.preventDefault();
    onActivate(index);
  };

  let chart;
  if (active && main && mainReady) chart = <ReplayChart {...main} />;
  else if (active && main && feed.ready) chart = <ReplayChart {...main} candles={candles} timeframe={feed.shownTf} glide={null} />;
  else if (feed.ready)
    chart = (
      <ReplayChart
        timeframe={feed.shownTf}
        candles={candles}
        levels={levels}
        markers={markers}
        labelFor={labelFor}
        levelLabel={levelLabel}
        glide={null}
        onNeedHistory={feed.loadMoreHistory}
        historyLoading={feed.historyLoading}
        drawing={drawing}
        priceDecimals={decimalsOf(pane.symbol)}
        rsi={rsi}
        volume={volume}
        legend={legend}
      />
    );
  else chart = <ChartSkeleton />;

  return (
    <div className={cn('pane', active && 'on')} onPointerDownCapture={activate}>
      {chart}
    </div>
  );
});
