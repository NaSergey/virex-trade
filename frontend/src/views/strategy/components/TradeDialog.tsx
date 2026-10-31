'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/features/auth';
import { Button } from '@/shared/ui/Button';
import { dateFormat } from '@/shared/lib/utils/intl';
import { Dialog, DialogContent, DialogHeader, useDialogFade } from '@/shared/ui/dialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { LedgerTable, type LedgerColumn } from '@/shared/ui/LedgerTable';
import { KeyValue } from '@/shared/ui/Lookup';
import { Seg } from '@/shared/ui/Seg';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  DrawingStyleBar,
  DrawingToolbar,
  ReplayChart,
  useDrawingTools,
  type ChartRange,
  type Level,
  type LevelKind,
  type Marker,
} from '@/widgets/backtest-session';
import { useTradeCandles } from '../api/hooks';
import type { TradeRow } from '../api/types';
import { fmtDateTime, fmtPct, fmtPrice, fmtR, OUTCOME_LABELS, tone } from '../model/format';
import { fmtDuration, fmtMove, levelLines, moveOf, planMoveOf, type LevelLine } from '../model/trade';

const TF_OPTIONS = [
  { value: 15, label: '15m' },
  { value: 60, label: '1H' },
  { value: 240, label: '4H' },
];
/** Сколько свечей догружать, когда сдвинули график к левому краю. */
const MORE_HISTORY = 300;
const MAX_VISIBLE = 600;

const levelColumns: LedgerColumn<LevelLine>[] = [
  { key: 'label', header: 'Уровень', render: (l) => l.label },
  { key: 'price', header: 'Цена', align: 'right', cellClassName: 'n', render: (l) => fmtPrice(l.price) },
  {
    key: 'move',
    header: 'От входа',
    align: 'right',
    cellClassName: 'n',
    render: (l) => <span className={tone(l.move)}>{fmtMove(l.move)}</span>,
  },
  { key: 'state', header: 'Исполнение', render: (l) => <span className={l.done ? undefined : 'muted'}>{l.state}</span> },
];

const levelKindOf = (l: LevelLine): LevelKind =>
  l.kind === 'take' ? 'take' : l.kind === 'stop' ? 'stop' : l.kind === 'trail' ? 'limitClose' : l.done ? 'limitEntry' : 'pendingEntry';

const utcLabel = (ms: number) =>
  dateFormat('ru-RU', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(ms);

/** Подпись нужна графику только у уровней без своего текста — здесь таких нет. */
const noLevelLabel = () => '';

/**
 * Разбор сделки: настоящий график терминала со шкалой цены, разметкой и линейкой, таймфреймы
 * стратегии, цены и проценты каждого уровня, ход цены за сделку.
 */
export function TradeDialog({ trade, onClose }: { trade: TradeRow; onClose: () => void }) {
  const { closing, close } = useDialogFade(onClose);
  const { user } = useAuth();
  const [tf, setTf] = useState(60);
  const [extra, setExtra] = useState(0);
  const q = useTradeCandles(trade, tf, extra);
  const candles = q.data?.candles;
  const shownTf = q.data?.tf ?? tf;
  const drawings = useDrawingTools(user?.id ?? 'anon', `strategy:${trade.id}`, 1, shownTf * 60_000);
  const direction = trade.dir === 1 ? 'long' : 'short';
  const lines = useMemo(() => levelLines(trade), [trade]);

  const levels = useMemo<Level[]>(
    () =>
      lines.map((l) => ({
        id: l.key,
        kind: levelKindOf(l),
        price: l.price,
        draggable: false,
        label: `${l.label} ${fmtPrice(l.price)} · ${fmtMove(l.move)}`,
      })),
    [lines],
  );

  const markers = useMemo<Marker[]>(() => {
    const out: Marker[] = [
      { id: 'entry', kind: 'entry', time: trade.fillMs, price: trade.entries[0], direction, label: 'Вход' },
      {
        id: 'exit',
        kind: 'exit',
        time: trade.exitMs - 1,
        price: trade.exit,
        direction,
        tone: trade.rNet > 0 ? 'profit' : 'loss',
        label: `Выход ${fmtR(trade.rNet)}`,
      },
    ];
    if (!candles?.length) return out;
    const candleAt = (ms: number) => {
      let k = 0;
      while (k + 1 < candles.length && candles[k + 1].t <= ms) k++;
      return candles[k];
    };
    // Подпись свипа и FVG — со стороны экстремума, слома — с другой: на 1H они в одной свече со входом.
    const note = (id: string, ms: number | null, label: string, far: boolean) => {
      if (ms == null) return;
      const c = candleAt(ms);
      const low = (trade.dir === 1) !== far;
      out.push({ id, kind: 'note', time: ms, price: low ? c.l : c.h, direction: low ? 'long' : 'short', label });
    };
    note('sweep', trade.sweepMs, 'свип', false);
    note('fvg', trade.fvgMs, 'FVG 1H', false);
    note('bos', trade.bosMs, 'слом 15m', true);
    return out;
  }, [trade, candles, direction]);

  const ranges = useMemo<ChartRange[]>(
    () => [
      {
        id: 'block',
        kind: 'range',
        from: trade.obMs,
        seen: trade.obMs,
        end: trade.exitMs,
        steps: [{ t: trade.obMs, lo: Math.min(trade.blockTop, trade.stop), hi: Math.max(trade.blockTop, trade.stop) }],
      },
    ],
    [trade],
  );

  const moreHistory = useCallback(() => {
    if (!q.isFetching) setExtra((e) => e + MORE_HISTORY);
  }, [q.isFetching]);

  const held = trade.exitMs - trade.fillMs;
  const exitMove = moveOf(trade, trade.exit);

  return (
    <Dialog open={!closing} onOpenChange={(v) => !v && close()}>
      <DialogContent className="st-tm">
        <DialogHeader
          title={`${trade.dir === 1 ? 'Лонг' : 'Шорт'} BTCUSDT · ${fmtPrice(trade.avgEntry)} → ${fmtPrice(trade.exit)}`}
          subtitle={`${fmtDateTime(trade.fillMs)} — ${fmtDateTime(trade.exitMs)} UTC · ${fmtDuration(held)}`}
          aside={<span className={tone(trade.rNet)}>{fmtR(trade.rNet)}</span>}
        />
        <div className="st-tm-body">
          <div className="st-tm-main">
            <div className="st-tm-bar">
              <Seg
                options={TF_OPTIONS}
                value={tf}
                onChange={(v) => {
                  setTf(v);
                  setExtra(0);
                }}
                ariaLabel="Таймфрейм"
              />
              <span className="muted">Линейка: Shift и клик по графику, она покажет проценты. Время — UTC.</span>
              <Button className="st-tm-close" onClick={close}>
                Закрыть
              </Button>
            </div>
            <ErrorNote error={q.error} fallback="Свечи не загрузились" />
            <div className="chart-tools st-tm-chart">
              <DrawingToolbar
                tool={drawings.tool}
                onTool={drawings.setTool}
                magnet={drawings.magnet}
                onMagnet={drawings.setMagnet}
                hidden={drawings.hidden}
                onHidden={drawings.setHidden}
                canClear={drawings.count > 0}
                onClear={drawings.clearAll}
              />
              <div className="chart-tools-main">
                {drawings.selected && !drawings.hidden && (
                  <DrawingStyleBar
                    drawing={drawings.selected}
                    onStyle={drawings.restyle}
                    onDelete={drawings.deleteSelected}
                    onCopy={() => drawings.copy() && drawings.paste()}
                  />
                )}
                {candles?.length ? (
                  <ReplayChart
                    timeframe={shownTf}
                    candles={candles}
                    levels={levels}
                    markers={markers}
                    ranges={ranges}
                    labelFor={utcLabel}
                    levelLabel={noLevelLabel}
                    glide={null}
                    drawing={drawings.chart}
                    onNeedHistory={moreHistory}
                    historyLoading={q.isFetching}
                    defaultCount={Math.min(MAX_VISIBLE, candles.length)}
                  />
                ) : q.isLoading ? (
                  <Skeleton height={320} />
                ) : (
                  <p className="muted">Свечей за этот отрезок нет.</p>
                )}
              </div>
            </div>
          </div>
          <aside className="st-tm-side">
            <h3 className="st-sub">Итог</h3>
            <KeyValue label="Результат" valueClassName={`n ${tone(trade.rNet) ?? ''}`}>
              {fmtR(trade.rNet)}
            </KeyValue>
            <KeyValue label="До комиссии">{fmtR(trade.rGross)}</KeyValue>
            <KeyValue label="На счёте при риске 1 %" valueClassName={`n ${tone(trade.rNet) ?? ''}`}>
              {fmtMove(trade.rNet / 100)}
            </KeyValue>
            <KeyValue label="Средний вход">{fmtPrice(trade.avgEntry)}</KeyValue>
            <KeyValue label="Выход">{fmtPrice(trade.exit)}</KeyValue>
            <KeyValue label="Причина выхода" valueClassName="">
              {OUTCOME_LABELS[trade.outcome]}
            </KeyValue>
            <KeyValue label="Ход цены от входа до выхода" valueClassName={`n ${tone(exitMove) ?? ''}`}>
              {fmtMove(exitMove)}
            </KeyValue>
            <KeyValue label="Макс. ход в прибыль" valueClassName="n pos">
              {fmtMove(trade.maxUp)}
            </KeyValue>
            <KeyValue label="Макс. ход против" valueClassName="n neg">
              {fmtMove(-trade.maxDown)}
            </KeyValue>
            <KeyValue label="Стоп от первого входа">{fmtMove(planMoveOf(trade, trade.stop))}</KeyValue>
            <KeyValue label="Цель от первого входа">{fmtMove(planMoveOf(trade, trade.target))}</KeyValue>
            <KeyValue label="Исполнено входов">{`${trade.filled} из ${trade.entries.length}`}</KeyValue>
            <KeyValue label="Взято тейков">{`${trade.takesHit} из ${trade.takes.length}`}</KeyValue>
            <KeyValue label="В сделке">{fmtDuration(held)}</KeyValue>
            {trade.odds && (
              <KeyValue label="Шанс успеха / нужно">{`${fmtPct(trade.odds.p, 0)} / ${fmtPct(trade.odds.needed, 0)}`}</KeyValue>
            )}

            <h3 className="st-sub">Уровни</h3>
            <LedgerTable columns={levelColumns} rows={lines} rowKey={(l) => l.key} minWidth={380} />

            <h3 className="st-sub">Как шла сделка, UTC</h3>
            <KeyValue label="Свип на 1H">{fmtDateTime(trade.sweepMs)}</KeyValue>
            {trade.fvgMs != null && <KeyValue label="FVG на 1H">{fmtDateTime(trade.fvgMs)}</KeyValue>}
            <KeyValue label="Снятый уровень">{fmtPrice(trade.level)}</KeyValue>
            {trade.rangeLo != null && trade.rangeHi != null && (
              <>
                <KeyValue label="Диапазон 30 свечей 4H">{`${fmtPrice(trade.rangeLo)} – ${fmtPrice(trade.rangeHi)}`}</KeyValue>
                <KeyValue label="Вход в диапазоне, от низа">
                  {fmtPct((trade.entries[0] - trade.rangeLo) / (trade.rangeHi - trade.rangeLo), 0)}
                </KeyValue>
              </>
            )}
            {trade.atr4 != null && (
              <KeyValue label="ATR 4H">{`${fmtPrice(trade.atr4)} · ${fmtPct(trade.atr4 / Math.abs(trade.entries[0]), 2)}`}</KeyValue>
            )}
            <KeyValue label="План, стоп к цели">{fmtR(trade.plannedR)}</KeyValue>
            <KeyValue label="Ордерблок 1H">{`${fmtPrice(Math.min(trade.blockTop, trade.stop))} – ${fmtPrice(Math.max(trade.blockTop, trade.stop))}`}</KeyValue>
            {trade.bosMs != null && <KeyValue label="Слом на 15m">{fmtDateTime(trade.bosMs)}</KeyValue>}
            <KeyValue label="Вход">{fmtDateTime(trade.fillMs)}</KeyValue>
            <KeyValue label="Выход">{fmtDateTime(trade.exitMs)}</KeyValue>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
