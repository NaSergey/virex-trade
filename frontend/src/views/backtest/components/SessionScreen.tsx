'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTags } from '@/entities/tag';
import { useLocaleControl } from '@/shared/i18n';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog, type ConfirmRequest } from '@/shared/ui/ConfirmDialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { SectionHead } from '@/shared/ui/SectionHead';
import { Seg, type SegOption } from '@/shared/ui/Seg';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  useBacktestSession,
  useCloseTrade,
  useFinishSession,
  useModifyTrade,
  useOpenTrade,
  useSetBacktestTags,
} from '../api/hooks';
import type { BacktestTrade, Direction, ExitReason, SessionDetail } from '../api/types';
import { TIMEFRAMES, dayNumber } from '../lib/candles';
import { checkLevels, fromScreen, toInput, toScreen } from '../lib/money';
import { SPEEDS, useReplay } from '../model/useReplay';
import { OrderPanel, type Draft } from './OrderPanel';
import { ReplayChart, type Level, type LevelKind } from './ReplayChart';
import { SessionSummary } from './SessionSummary';
import { SessionTrades } from './SessionTrades';

/** Сессия целиком: загрузка, прокрутка активной или итог завершённой. */
export function SessionScreen({ id, onLeave }: { id: string; onLeave: () => void }) {
  const t = useTranslations('backtest');
  const { data, error } = useBacktestSession(id);
  if (error) return <ErrorNote error={error} fallback={t('loadFailed')} />;
  if (!data) return <Skeleton height={380} />;
  if (data.session.status === 'finished') return <SessionSummary detail={data} onLeave={onLeave} />;
  return <ActiveSession detail={data} onLeave={onLeave} />;
}

function ActiveSession({ detail, onLeave }: { detail: SessionDetail; onLeave: () => void }) {
  const t = useTranslations('backtest');
  const { locale } = useLocaleControl();
  const intl = locale === 'en' ? 'en-US' : 'ru-RU';
  const { session, trades } = detail;
  const scale = session.priceScale;
  const startMs = Date.parse(session.startTime);
  const openTrade = trades.find((x) => x.exitTime == null) ?? null;

  const { data: tagsData } = useTags();
  const openM = useOpenTrade(session.id);
  const modifyM = useModifyTrade(session.id);
  const closeM = useCloseTrade(session.id);
  const finishM = useFinishSession(session.id);
  const tagsM = useSetBacktestTags(session.id);

  const closeTrade = (trade: BacktestTrade, time: number, price: number, reason: ExitReason) =>
    closeM.mutateAsync({ tradeId: trade.id, exitTime: new Date(time).toISOString(), exitPrice: price, reason });

  const replay = useReplay(detail, (trade, exit) => {
    void closeTrade(trade, exit.time, exit.price, exit.reason).catch(() => undefined);
  });

  const [draft, setDraft] = useState<Draft>({ risk: String(session.defaultRiskPct), stop: '', take: '' });
  const [hint, setHint] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);

  // Уровни открытой сделки приезжают в поля, когда сделка появляется или правка
  // сохранилась; закрылась — поля очищаются. Не на каждый рендер: иначе
  // набранное в полях стиралось бы.
  const openId = openTrade?.id;
  const openStop = openTrade?.stopLoss;
  const openTake = openTrade?.takeProfit;
  useEffect(() => {
    setDraft((d) =>
      openId == null || openStop == null
        ? { ...d, stop: '', take: '' }
        : {
            ...d,
            stop: toInput(toScreen(openStop, scale)),
            take: openTake != null ? toInput(toScreen(openTake, scale)) : '',
          },
    );
  }, [openId, openStop, openTake, scale]);

  const screenPrice = replay.price != null ? toScreen(replay.price, scale) : null;
  const stopN = Number(draft.stop);
  const takeN = draft.take.trim() ? Number(draft.take) : null;

  const screenCandles = useMemo(
    () =>
      scale === 1
        ? replay.candles
        : replay.candles.map((c) => ({ t: c.t, o: c.o * scale, h: c.h * scale, l: c.l * scale, c: c.c * scale })),
    [replay.candles, scale],
  );

  const levels: Level[] = [];
  if (openTrade) levels.push({ kind: 'entry', price: toScreen(openTrade.entryPrice, scale), draggable: false });
  if (stopN > 0) levels.push({ kind: 'stop', price: stopN, draggable: true });
  if (takeN != null && takeN > 0) levels.push({ kind: 'take', price: takeN, draggable: true });

  // Скрытая дата: день недели и время суток видны (биржевые сессии, выходные),
  // год и число — нет; вместо даты — номер дня от старта.
  const labelFor = (ms: number) => {
    const d = new Date(ms);
    const time = d.toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' });
    return session.hideDate
      ? `${d.toLocaleDateString(intl, { weekday: 'short' })} ${time} · ${t('dayN', { n: dayNumber(ms, startMs) })}`
      : `${d.toLocaleDateString(intl, { day: 'numeric', month: 'short', year: '2-digit' })} ${time}`;
  };

  const busy = openM.isPending || modifyM.isPending || closeM.isPending || finishM.isPending;
  // Пока закрытие не сохранено, новую сделку не открыть: сервер увидел бы две открытые.
  const closePending = closeM.isPending || closeM.isError;
  const canClose = openTrade != null && replay.cursor > Date.parse(openTrade.entryTime);

  const open = (direction: Direction) => {
    if (replay.price == null || screenPrice == null) return;
    const risk = Number(draft.risk);
    if (!(risk >= 0.01 && risk <= 100)) {
      setHint(t('riskInvalid'));
      return;
    }
    const err = checkLevels(direction, screenPrice, stopN, takeN);
    setHint(err ? t(err) : null);
    if (err) return;
    openM.mutate({
      direction,
      entryTime: new Date(replay.cursor).toISOString(),
      // Настоящая цена минутки, а не обратный пересчёт экранной: без округлений.
      entryPrice: replay.price,
      stopLoss: fromScreen(stopN, scale),
      takeProfit: takeN != null ? fromScreen(takeN, scale) : undefined,
      riskPct: risk,
    });
  };

  const applyLevels = (stop: number, take: number | null) => {
    if (!openTrade || screenPrice == null) return;
    const err = checkLevels(openTrade.direction, screenPrice, stop, take);
    setHint(err ? t(err) : null);
    if (err) return;
    modifyM.mutate({
      tradeId: openTrade.id,
      stopLoss: fromScreen(stop, scale),
      takeProfit: take != null ? fromScreen(take, scale) : null,
    });
  };

  const onDragLevel = (kind: LevelKind, price: number, done: boolean) => {
    if (kind === 'entry') return;
    setDraft((d) => ({ ...d, [kind]: toInput(price) }));
    // На сервер — только отпускание: сохранять каждое движение мыши незачем.
    if (done && openTrade) applyLevels(kind === 'stop' ? price : stopN, kind === 'take' ? price : takeN);
  };

  const closeManual = () => {
    if (!openTrade || replay.price == null || !canClose) return;
    void closeTrade(openTrade, replay.cursor, replay.price, 'manual').catch(() => undefined);
  };

  const finishing = useRef(false);
  const finishNow = async () => {
    if (finishing.current) return;
    finishing.current = true;
    replay.setSpeed(null);
    try {
      // Позицию закрывает браузер — он знает цену момента; сервер лишь проверяет, что открытых нет.
      if (openTrade && replay.price != null && canClose) {
        await closeTrade(openTrade, replay.cursor, replay.price, 'finish');
      }
      await replay.flush();
      await finishM.mutateAsync();
    } catch {
      finishing.current = false;
    }
  };

  // Минутки кончились — сессия завершается сама тем же путём.
  const finishRef = useRef(finishNow);
  finishRef.current = finishNow;
  useEffect(() => {
    if (replay.ended) void finishRef.current();
  }, [replay.ended]);

  const askFinish = () =>
    setConfirm({
      title: t('finishTitle'),
      subtitle: t('finishSubtitle'),
      consequences: [...(openTrade ? [t('finishOpenTrade')] : []), t('finishReveal')],
      word: t('finishWord'),
      onConfirm: () => void finishNow(),
    });

  const leave = async () => {
    replay.setSpeed(null);
    await replay.flush().catch(() => undefined);
    onLeave();
  };

  const tfOptions: SegOption<number>[] = TIMEFRAMES.map((tf) => ({ value: tf, label: t(`tf.${tf}`) }));
  const speedOptions: SegOption<number>[] = [
    { value: 0, label: t('pause') },
    ...SPEEDS.map((s) => ({ value: s, label: `×${s}` })),
  ];

  return (
    <>
      <SectionHead title={t('timeframe')}>
        <Seg options={tfOptions} value={replay.tf} onChange={replay.setTf} ariaLabel={t('timeframe')} />
      </SectionHead>

      <div className="asym">
        <div>
          {replay.ready ? (
            <ReplayChart
              candles={screenCandles}
              levels={levels}
              labelFor={labelFor}
              levelLabel={(k) => t(`level.${k}`)}
              onDragLevel={onDragLevel}
            />
          ) : (
            <Skeleton height={380} />
          )}
          <div className="replay-controls">
            <Button variant="solid" onClick={() => void replay.step()} disabled={!replay.ready || replay.ended}>
              {t('step')} ▶
            </Button>
            <Seg
              options={speedOptions}
              value={replay.speed ?? 0}
              onChange={(v) => replay.setSpeed(v || null)}
              ariaLabel={t('speed')}
            />
            <Button tight onClick={() => void leave()}>
              {t('backToList')}
            </Button>
          </div>
          {replay.ended && <p className="muted">{t('historyEnded')}</p>}
          <ErrorNote error={replay.error} fallback={t('loadFailed')} />
        </div>

        <div className="marg">
          <OrderPanel
            draft={draft}
            onDraft={setDraft}
            openTrade={openTrade}
            scale={scale}
            price={replay.price}
            balance={session.balance}
            disabled={busy || closePending || !replay.ready}
            canClose={canClose}
            hint={hint}
            onOpen={open}
            onApply={() => applyLevels(stopN, takeN)}
            onClose={closeManual}
            onFinish={askFinish}
          />
          <ErrorNote error={openM.error ?? modifyM.error ?? finishM.error} fallback={t('actionFailed')} />
          {closeM.isError && (
            <p className="neg">
              {t('closeFailed')}{' '}
              <Button tight onClick={() => closeM.variables && closeM.mutate(closeM.variables)}>
                {t('retryClose')}
              </Button>
            </p>
          )}
        </div>
      </div>

      <SessionTrades
        trades={trades}
        scale={scale}
        labelFor={labelFor}
        tags={tagsData?.tags ?? []}
        onSetTags={(tradeId, tagIds) => tagsM.mutate({ tradeId, tagIds })}
      />

      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </>
  );
}
