'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTags } from '@/entities/tag';
import { useLocaleControl } from '@/shared/i18n';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog, type ConfirmRequest } from '@/shared/ui/ConfirmDialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { SectionHead } from '@/shared/ui/SectionHead';
import { Seg, type SegOption } from '@/shared/ui/Seg';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Wrap } from '@/shared/ui/Wrap';
import {
  useAddToTrade,
  useBacktestSession,
  useCancelCloseOrder,
  useCloseTrade,
  useCreateCloseOrder,
  useFinishSession,
  useModifyTrade,
  useOpenTrade,
  useSetBacktestTags,
} from '../api/hooks';
import type { BacktestTrade, Direction, ExitReason, SessionDetail } from '../api/types';
import { TIMEFRAMES, dayNumber, scaleCandle } from '../lib/candles';
import {
  applyStopChange,
  checkLevels,
  fromScreen,
  impliedDirection,
  levelImpact,
  liquidationPrice,
  previewSize,
  toInputPrice,
  toScreen,
} from '../lib/money';
import { SPEEDS, useReplay } from '../model/useReplay';
import { ChangeLevelsModal } from './ChangeLevelsModal';
import { LimitCloseModal } from './LimitCloseModal';
import { MarketCloseModal } from './MarketCloseModal';
import { OpenPositionsPanel } from './OpenPositionsPanel';
import { OrderPanel, type Draft } from './OrderPanel';
import { ReplayChart, type Level, type LevelKind } from './ReplayChart';
import { SessionSummary } from './SessionSummary';
import { SessionTrades } from './SessionTrades';

/**
 * Сессия целиком: загрузка, прокрутка активной или итог завершённой.
 *
 * Обёртку страницы (`.wrap`, читательская колонка в 1360px) выбирает это
 * состояние, а не вызывающий `Page.tsx`: итог завершённой сессии — такой же
 * отчёт, как остальные страницы продукта, а вот у активной сессии свой
 * терминал во всю ширину окна (см. `.bt-live` и комментарий в `ActiveSession`).
 */
export function SessionScreen({ id, onLeave }: { id: string; onLeave: () => void }) {
  const t = useTranslations('backtest');
  const { data, error } = useBacktestSession(id);
  if (error)
    return (
      <Wrap page>
        <ErrorNote error={error} fallback={t('loadFailed')} />
      </Wrap>
    );
  if (!data)
    return (
      <Wrap page>
        <Skeleton height={380} />
      </Wrap>
    );
  if (data.session.status === 'finished')
    return (
      <Wrap page>
        <SessionSummary detail={data} onLeave={onLeave} />
      </Wrap>
    );
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
  const addM = useAddToTrade(session.id);
  const modifyM = useModifyTrade(session.id);
  const closeM = useCloseTrade(session.id);
  const createOrderM = useCreateCloseOrder(session.id);
  const cancelOrderM = useCancelCloseOrder(session.id);
  const finishM = useFinishSession(session.id);
  const tagsM = useSetBacktestTags(session.id);

  const closeTrade = (trade: BacktestTrade, time: number, price: number, reason: ExitReason, qty?: number, closeOrderId?: string) =>
    closeM.mutateAsync({ tradeId: trade.id, exitTime: new Date(time).toISOString(), exitPrice: price, reason, qty, closeOrderId });

  const replay = useReplay(detail, (trade, exit) => {
    void closeTrade(trade, exit.time, exit.price, exit.reason, exit.qty, exit.closeOrderId).catch(() => undefined);
  });

  const [draft, setDraft] = useState<Draft>({ risk: '1', stop: '', take: '', leverage: '1' });
  const [hint, setHint] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [limitModal, setLimitModal] = useState(false);
  const [marketModal, setMarketModal] = useState(false);
  const [levelsModal, setLevelsModal] = useState(false);
  const [tab, setTab] = useState<'open' | 'history'>('open');

  const screenPrice = replay.price != null ? toScreen(replay.price, scale) : null;
  const stopN = Number(draft.stop);
  const takeN = draft.take.trim() ? Number(draft.take) : null;

  // Направление одно на стоп и тейк — решает его стоп (или тейк, пока стоп
  // пуст), см. impliedDirection: иначе стоп и тейк могли бы разойтись по одну
  // сторону цены, хотя слайдер такого уже не даст набрать. Смена стороны —
  // с зеркалированием уже введённого тейка — происходит синхронно там, где
  // стоп реально меняется: в OrderPanel (слайдер, поле) и в onDragLevel ниже
  // (драг по графику), одной и той же функцией `applyStopChange` — не здесь
  // реактивно, чтобы не ловить кадр со старым, ещё не поправленным тейком.
  const direction = screenPrice != null ? impliedDirection(openTrade?.direction ?? null, stopN, takeN, screenPrice) : null;

  const screenCandles = useMemo(() => replay.candles.map((c) => scaleCandle(c, scale)), [replay.candles, scale]);

  const screenGlide = useMemo(
    () => (replay.glide ? { minute: scaleCandle(replay.glide.minute, scale), durationMs: replay.glide.durationMs } : null),
    [replay.glide, scale],
  );

  // Размер — тот же, что уже выбран: у открытой сделки её qty, у ещё не
  // открытой — предпросмотр по риску и дистанции до стопа (тот же qty
  // используют оба уровня: позицию размерил стоп, а не тейк).
  const impactQty = openTrade
    ? openTrade.qty
    : stopN > 0 && replay.price != null
      ? previewSize(session.balance, Number(draft.risk), replay.price, fromScreen(stopN, scale), Number(draft.leverage) || 1, direction ?? 'long')
          ?.qty ?? null
      : null;
  const impactRef = openTrade ? openTrade.entryPrice : replay.price;

  // Уровни — своим useMemo, а не строятся прямо в теле рендера: ReplayChart
  // (memo, см. его комментарий) сверяет этот массив по ссылке, и без useMemo
  // она менялась бы на любой тик любого слайдера панели, включая риск на
  // сделке без стопа — там числа на графике вообще не меняются, но график всё
  // равно перерисовывался бы целиком.
  const levels = useMemo<Level[]>(() => {
    /** Результат в USDT, если цена дойдёт до levelReal — та же формула, что у «Сейчас» в панели. */
    const levelUsdt = (levelReal: number) =>
      direction != null && impactQty != null && impactRef != null ? levelImpact(direction, impactRef, levelReal, impactQty).usdt : null;
    const list: Level[] = [];
    if (openTrade) {
      list.push({ id: 'entry', kind: 'entry', price: toScreen(openTrade.entryPrice, scale), draggable: false });
      list.push({
        id: 'liq',
        kind: 'liq',
        price: toScreen(liquidationPrice(openTrade.direction, openTrade.entryPrice, openTrade.leverage), scale),
        draggable: false,
      });
    }
    if (stopN > 0) list.push({ id: 'stop', kind: 'stop', price: stopN, draggable: true, impact: levelUsdt(fromScreen(stopN, scale)) });
    if (takeN != null && takeN > 0) list.push({ id: 'take', kind: 'take', price: takeN, draggable: true, impact: levelUsdt(fromScreen(takeN, scale)) });
    for (const o of detail.closeOrders) {
      list.push({ id: o.id, kind: 'limitClose', price: toScreen(o.price, scale), draggable: false, impact: levelUsdt(o.price) });
    }
    return list;
  }, [openTrade, scale, stopN, takeN, direction, impactQty, impactRef, detail.closeOrders]);

  // Скрытая дата: день недели и время суток видны (биржевые сессии, выходные),
  // год и число — нет; вместо даты — номер дня от старта. useCallback по той же
  // причине, что и levels выше — стабильная ссылка нужна memo(ReplayChart).
  const labelFor = useCallback(
    (ms: number) => {
      const d = new Date(ms);
      const time = d.toLocaleTimeString(intl, { hour: '2-digit', minute: '2-digit' });
      return session.hideDate
        ? `${d.toLocaleDateString(intl, { weekday: 'short' })} ${time} · ${t('dayN', { n: dayNumber(ms, startMs) })}`
        : `${d.toLocaleDateString(intl, { day: 'numeric', month: 'short', year: '2-digit' })} ${time}`;
    },
    [intl, session.hideDate, startMs, t],
  );
  // Тем же поводом, что и labelFor выше — стабильная ссылка для memo(ReplayChart).
  const levelLabel = useCallback((kind: LevelKind) => t(`level.${kind}`), [t]);

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
    // Открытие сделки — значимое событие: автопрокрутка встаёт, как и при
    // срабатывании уровня уже открытой сделки. Пока сервер не ответил и сделка
    // не появилась в detail.trades, курсор иначе продолжал бы уезжать вперёд, и
    // минутки между входом и новым курсором не проверились бы на стоп/тейк.
    replay.setSpeed(null);
    openM.mutate({
      direction,
      entryTime: new Date(replay.cursor).toISOString(),
      // Настоящая цена минутки, а не обратный пересчёт экранной: без округлений.
      entryPrice: replay.price,
      stopLoss: fromScreen(stopN, scale),
      takeProfit: takeN != null ? fromScreen(takeN, scale) : undefined,
      riskPct: risk,
      leverage: Number(draft.leverage) || 1,
    });
  };

  const addToPosition = (direction: Direction) => {
    if (replay.price == null || !openTrade || openTrade.direction !== direction) return;
    const risk = Number(draft.risk);
    if (!(risk >= 0.01 && risk <= 100)) {
      setHint(t('riskInvalid'));
      return;
    }
    addM.mutate({ tradeId: openTrade.id, entryPrice: replay.price, riskPct: risk });
  };

  const applyLevels = (stop: number, take: number | null) => {
    if (!openTrade || screenPrice == null) return;
    const err = checkLevels(openTrade.direction, screenPrice, stop, take);
    setHint(err ? t(err) : null);
    if (err) return;
    modifyM.mutate(
      { tradeId: openTrade.id, stopLoss: fromScreen(stop, scale), takeProfit: take != null ? fromScreen(take, scale) : null },
      { onSuccess: () => setLevelsModal(false) },
    );
  };

  // applyLevels меняется каждый рендер (замыкает openTrade/screenPrice/t) —
  // onDragLevel читает его через реф, а не напрямую, чтобы у самого onDragLevel
  // была стабильная ссылка: иначе она менялась бы на каждый тик риска в
  // OrderPanel, хотя драг по графику тут ни при чём, и рвала бы memo(ReplayChart).
  const applyLevelsRef = useRef(applyLevels);
  applyLevelsRef.current = applyLevels;
  const dragCtxRef = useRef({ draft, openTrade, screenPrice, stopN });
  dragCtxRef.current = { draft, openTrade, screenPrice, stopN };

  const onDragLevel = useCallback((kind: LevelKind, price: number, done: boolean) => {
    if (kind === 'entry') return;
    const { draft: d, openTrade: ot, screenPrice: sp, stopN: sn } = dragCtxRef.current;
    // Драг стопа по графику — та же смена стороны с зеркалированием тейка,
    // что и в OrderPanel (`applyStopChange`): третье место, откуда стоп можно
    // подвинуть, не должно вести себя иначе, чем слайдер и поле.
    const next = kind === 'stop' && sp != null ? applyStopChange(d, price, sp, ot?.direction ?? null) : { stop: d.stop, take: toInputPrice(price) };
    setDraft((prev) => ({ ...prev, ...next }));
    // На сервер — только отпускание: сохранять каждое движение мыши незачем.
    if (done && ot) {
      const nextTake = next.take.trim() ? Number(next.take) : null;
      applyLevelsRef.current(kind === 'stop' ? price : sn, kind === 'take' ? price : nextTake);
    }
  }, [setDraft]);

  const submitLimit = (price: number, qty: number) => {
    if (!openTrade) return;
    createOrderM.mutate({ tradeId: openTrade.id, price, qty }, { onSuccess: () => setLimitModal(false) });
  };

  const submitMarket = (qty: number) => {
    if (!openTrade || replay.price == null || !canClose) return;
    void closeTrade(openTrade, replay.cursor, replay.price, 'manual', qty).then(() => setMarketModal(false)).catch(() => undefined);
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
    // Терминал во всю ширину окна — единственное место продукта без .wrap
    // (см. комментарий у SessionScreen). Итог той же сессии после завершения
    // возвращается в обычную читательскую колонку сам, через SessionScreen.
    <div className="bt-live">
      <SectionHead title={t('timeframe')}>
        <Seg options={tfOptions} value={replay.tf} onChange={replay.setTf} ariaLabel={t('timeframe')} />
      </SectionHead>

      <div className="asym terminal">
        <div>
          {replay.ready ? (
            <ReplayChart
              // Пересоздаём при смене ТФ: окно показа (пан/зум) — локальное
              // состояние графика, набранное на одном ТФ, бессмысленно на
              // другом наборе свечей.
              key={replay.tf}
              candles={screenCandles}
              levels={levels}
              labelFor={labelFor}
              levelLabel={levelLabel}
              liveLabel={t('live')}
              glide={screenGlide}
              onDragLevel={onDragLevel}
              onNeedHistory={replay.loadMoreHistory}
              historyLoading={replay.historyLoading}
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
            sameDirectionOpen={openTrade?.direction ?? null}
            openLeverage={openTrade?.leverage ?? null}
            scale={scale}
            price={replay.price}
            balance={session.balance}
            disabled={busy || closePending || !replay.ready}
            hint={hint}
            onOpen={open}
            onAdd={addToPosition}
            onFinish={askFinish}
          />
          <ErrorNote error={openM.error ?? addM.error ?? finishM.error} fallback={t('actionFailed')} />
        </div>
      </div>

      {closeM.isError && closeM.variables && (
        <p className="neg">
          {t('closeFailed')}{' '}
          <Button tight onClick={() => closeM.mutate(closeM.variables!)}>
            {t('retryClose')}
          </Button>
        </p>
      )}

      <SectionHead title={tab === 'open' ? t('openPositionsTab') : t('historyTab')}>
        <Seg
          options={[
            { value: 'open' as const, label: t('openPositionsTab') },
            { value: 'history' as const, label: t('historyTab') },
          ]}
          value={tab}
          onChange={setTab}
          ariaLabel={t('openPositionsTab')}
        />
      </SectionHead>
      {tab === 'open' ? (
        <OpenPositionsPanel
          trade={openTrade}
          scale={scale}
          price={replay.price}
          closeOrders={detail.closeOrders}
          onLimit={() => setLimitModal(true)}
          onMarket={() => setMarketModal(true)}
          onCancelOrder={(id) => cancelOrderM.mutate(id)}
          onChangeLevels={() => setLevelsModal(true)}
        />
      ) : (
        <SessionTrades
          trades={trades}
          scale={scale}
          labelFor={labelFor}
          tags={tagsData?.tags ?? []}
          onSetTags={(tradeId, tagIds) => tagsM.mutate({ tradeId, tagIds })}
        />
      )}

      {levelsModal && openTrade && screenPrice != null && (
        <ChangeLevelsModal
          trade={openTrade}
          scale={scale}
          screenPrice={screenPrice}
          onApply={applyLevels}
          onClose={() => setLevelsModal(false)}
          isPending={modifyM.isPending}
          error={modifyM.error}
        />
      )}
      {limitModal && openTrade && screenPrice != null && (
        <LimitCloseModal
          trade={openTrade}
          remaining={openTrade.qty - openTrade.closedQty}
          scale={scale}
          screenPrice={screenPrice}
          onSubmit={submitLimit}
          onClose={() => setLimitModal(false)}
          isPending={createOrderM.isPending}
          error={createOrderM.error}
        />
      )}
      {marketModal && openTrade && screenPrice != null && (
        <MarketCloseModal
          trade={openTrade}
          remaining={openTrade.qty - openTrade.closedQty}
          screenPrice={screenPrice}
          canClose={canClose}
          onSubmit={submitMarket}
          onClose={() => setMarketModal(false)}
          isPending={closeM.isPending}
          error={closeM.isError ? closeM.error : null}
        />
      )}

      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
