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
  useSetLeverage,
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
  toInput,
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
  // useMemo, не голый .filter(): `levels` ниже держит openTrades в зависимостях, а
  // ReplayChart — memo (см. его комментарий) и сверяет уровни по ссылке. .find() у
  // одной сделки был стабилен сам по себе (тот же объект из массива), .filter() каждый
  // раз аллоцирует новый массив — без useMemo levels пересчитывался бы на любой рендер,
  // включая тик слайдера риска, который к открытым сделкам отношения не имеет.
  const openTrades = useMemo(() => trades.filter((x) => x.exitTime == null), [trades]);

  const { data: tagsData } = useTags();
  const openM = useOpenTrade(session.id);
  const addM = useAddToTrade(session.id);
  const modifyM = useModifyTrade(session.id);
  const closeM = useCloseTrade(session.id);
  const createOrderM = useCreateCloseOrder(session.id);
  const cancelOrderM = useCancelCloseOrder(session.id);
  const finishM = useFinishSession(session.id);
  const tagsM = useSetBacktestTags(session.id);
  const setLeverageM = useSetLeverage(session.id);

  const closeTrade = (trade: BacktestTrade, time: number, price: number, reason: ExitReason, qty?: number, closeOrderId?: string) =>
    closeM.mutateAsync({ tradeId: trade.id, exitTime: new Date(time).toISOString(), exitPrice: price, reason, qty, closeOrderId });

  const replay = useReplay(detail, (trade, exit) => {
    void closeTrade(trade, exit.time, exit.price, exit.reason, exit.qty, exit.closeOrderId).catch(() => undefined);
  });

  const [draft, setDraft] = useState<Draft>({ risk: '1', stop: '', take: '', leverage: '1' });
  const [hint, setHint] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [limitModalFor, setLimitModalFor] = useState<string | null>(null);
  const [marketModalFor, setMarketModalFor] = useState<string | null>(null);
  const [levelsModalFor, setLevelsModalFor] = useState<string | null>(null);
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
  const direction = screenPrice != null ? impliedDirection(null, stopN, takeN, screenPrice) : null;

  const screenCandles = useMemo(() => replay.candles.map((c) => scaleCandle(c, scale)), [replay.candles, scale]);

  const screenGlide = useMemo(
    () => (replay.glide ? { minute: scaleCandle(replay.glide.minute, scale), durationMs: replay.glide.durationMs } : null),
    [replay.glide, scale],
  );

  // Черновик описывает только следующий ордер — открытых сделок это больше не
  // касается, их уровни строятся из них самих ниже.
  const impactQty =
    stopN > 0 && replay.price != null
      ? previewSize(session.balance, Number(draft.risk), replay.price, fromScreen(stopN, scale), Number(draft.leverage) || 1, direction ?? 'long')
          ?.qty ?? null
      : null;
  const impactRef = replay.price;

  // Уровни — своим useMemo, а не строятся прямо в теле рендера: ReplayChart
  // (memo, см. его комментарий) сверяет этот массив по ссылке, и без useMemo
  // она менялась бы на любой тик любого слайдера панели, включая риск на
  // сделке без стопа — там числа на графике вообще не меняются, но график всё
  // равно перерисовывался бы целиком.
  const levels = useMemo<Level[]>(() => {
    const list: Level[] = [];

    // Уровни уже открытых сделок — от их собственных stopLoss/takeProfit, не от
    // черновика панели: с хеджем сделок может быть две, у каждой свои уровни.
    for (const trade of openTrades) {
      const remaining = trade.qty - trade.closedQty;
      list.push({ id: `entry-${trade.id}`, kind: 'entry', tradeId: trade.id, price: toScreen(trade.entryPrice, scale), draggable: false });
      list.push({
        id: `liq-${trade.id}`,
        kind: 'liq',
        tradeId: trade.id,
        price: toScreen(liquidationPrice(trade.direction, trade.entryPrice, trade.leverage), scale),
        draggable: false,
      });
      list.push({
        id: `stop-${trade.id}`,
        kind: 'stop',
        tradeId: trade.id,
        price: toScreen(trade.stopLoss, scale),
        draggable: true,
        impact: levelImpact(trade.direction, trade.entryPrice, trade.stopLoss, remaining).usdt,
      });
      if (trade.takeProfit != null) {
        list.push({
          id: `take-${trade.id}`,
          kind: 'take',
          tradeId: trade.id,
          price: toScreen(trade.takeProfit, scale),
          draggable: true,
          impact: levelImpact(trade.direction, trade.entryPrice, trade.takeProfit, remaining).usdt,
        });
      }
    }

    // Черновик следующего ордера — не привязан ни к какой сделке.
    if (stopN > 0) {
      list.push({
        id: 'draft-stop',
        kind: 'stop',
        price: stopN,
        draggable: true,
        impact:
          direction != null && impactQty != null && impactRef != null
            ? levelImpact(direction, impactRef, fromScreen(stopN, scale), impactQty).usdt
            : null,
      });
    }
    if (takeN != null && takeN > 0) {
      list.push({
        id: 'draft-take',
        kind: 'take',
        price: takeN,
        draggable: true,
        impact:
          direction != null && impactQty != null && impactRef != null
            ? levelImpact(direction, impactRef, fromScreen(takeN, scale), impactQty).usdt
            : null,
      });
    }

    for (const o of detail.closeOrders) {
      const trade = openTrades.find((t) => t.id === o.tradeId);
      if (!trade) continue;
      list.push({
        id: o.id,
        kind: 'limitClose',
        tradeId: o.tradeId,
        price: toScreen(o.price, scale),
        draggable: false,
        impact: levelImpact(trade.direction, trade.entryPrice, o.price, o.qty).usdt,
      });
    }
    return list;
  }, [openTrades, scale, stopN, takeN, direction, impactQty, impactRef, detail.closeOrders]);

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
  const canClose = (trade: BacktestTrade) => replay.cursor > Date.parse(trade.entryTime);

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
    if (replay.price == null) return;
    const trade = openTrades.find((x) => x.direction === direction);
    if (!trade) return;
    const risk = Number(draft.risk);
    if (!(risk >= 0.01 && risk <= 100)) {
      setHint(t('riskInvalid'));
      return;
    }
    addM.mutate({ tradeId: trade.id, entryPrice: replay.price, riskPct: risk });
  };

  // Принимает screenPrice параметром, а не читает внешний — иначе стал бы источником
  // рассинхрона у onDragLevel ниже: тот мемоизирован почти без зависимостей (стабильная
  // ссылка нужна memo(ReplayChart)) и звал бы эту функцию с ценой того рендера, на
  // котором она была создана, а не текущей. Модалка «Изменить уровни» вызывает эту же
  // функцию напрямую, из своего рендера — там внешний screenPrice и так свежий.
  const applyLevels = (trade: BacktestTrade, screenPriceNow: number, stop: number, take: number | null) => {
    const err = checkLevels(trade.direction, screenPriceNow, stop, take);
    setHint(err ? t(err) : null);
    if (err) return;
    modifyM.mutate(
      { tradeId: trade.id, stopLoss: fromScreen(stop, scale), takeProfit: take != null ? fromScreen(take, scale) : null },
      { onSuccess: () => setLevelsModalFor(null) },
    );
  };

  const dragCtxRef = useRef({ draft, openTrades, screenPrice });
  dragCtxRef.current = { draft, openTrades, screenPrice };

  const onDragLevel = useCallback((id: string, kind: LevelKind, price: number, done: boolean, tradeId?: string) => {
    if (kind === 'entry' || kind === 'liq') return;
    const { draft: d, openTrades: ots, screenPrice: sp } = dragCtxRef.current;
    if (tradeId != null) {
      // Уровень уже открытой сделки — направление зафиксировано, зеркалить нечего;
      // сохраняем на сервер только по отпусканию.
      if (!done || sp == null) return;
      const trade = ots.find((t) => t.id === tradeId);
      if (!trade) return;
      const nextStop = kind === 'stop' ? price : toScreen(trade.stopLoss, scale);
      const nextTake = kind === 'take' ? price : trade.takeProfit != null ? toScreen(trade.takeProfit, scale) : null;
      applyLevels(trade, sp, nextStop, nextTake);
      return;
    }
    // Черновик следующего ордера — направление ещё не зафиксировано, стоп может
    // поменять сторону и утянуть за собой уже введённый тейк (applyStopChange).
    if (sp == null) return;
    const next = kind === 'stop' ? applyStopChange(d, price, sp, null) : { stop: d.stop, take: toInputPrice(price) };
    setDraft((prev) => ({ ...prev, ...next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  const submitLimit = (trade: BacktestTrade, price: number, qty: number) => {
    createOrderM.mutate({ tradeId: trade.id, price, qty }, { onSuccess: () => setLimitModalFor(null) });
  };

  const submitMarket = (trade: BacktestTrade, qty: number) => {
    if (replay.price == null || !canClose(trade)) return;
    void closeTrade(trade, replay.cursor, replay.price, 'manual', qty).then(() => setMarketModalFor(null)).catch(() => undefined);
  };

  const finishing = useRef(false);
  const finishNow = async () => {
    if (finishing.current) return;
    finishing.current = true;
    replay.setSpeed(null);
    try {
      // Позицию закрывает браузер — он знает цену момента; сервер лишь проверяет, что открытых нет.
      if (replay.price != null) {
        for (const trade of openTrades) {
          if (canClose(trade)) await closeTrade(trade, replay.cursor, replay.price, 'finish');
        }
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

  // Плечо общее на все открытые сделки — держим черновик синхронным с сервером, пока
  // хоть одна открыта: свой слайдер стал бы источником рассинхрона. Не тот же приём,
  // что у стопа/тейка (те специально НЕ синкаются — черновик там всегда про следующий
  // ордер): плечо, в отличие от них, — общее состояние символа, а не намерение на будущее.
  //
  // Правится прямо в рендере, не в эффекте — официальный паттерн React для «поправить
  // состояние при смене внешнего значения» (adjust state while rendering): setState в
  // эффекте потребовал бы лишний цикл рендер → коммит → эффект → рендер на каждую смену
  // плеча, здесь же React перезапускает тот же рендер сразу, без лишнего коммита.
  const openLeverageValue = openTrades[0]?.leverage ?? null;
  const [syncedLeverage, setSyncedLeverage] = useState(openLeverageValue);
  if (openLeverageValue !== syncedLeverage) {
    setSyncedLeverage(openLeverageValue);
    if (openLeverageValue != null) setDraft((prev) => ({ ...prev, leverage: toInput(openLeverageValue) }));
  }

  // Коммит плеча — по паузе после последнего движения слайдера, не на каждый кадр
  // (Slider шлёт onChange через requestAnimationFrame). Тем же приёмом, что автосохранение
  // курсора в useReplay (SAVE_DELAY_MS). Сравнение с openLeverageValue — не оптимизация,
  // а разрыв цикла с эффектом синхронизации выше: тот при открытии новой сделки меняет
  // draft.leverage под сервер, и без проверки это тут же гнало бы то же значение обратно.
  useEffect(() => {
    if (openTrades.length === 0) return;
    const v = Number(draft.leverage);
    if (!(v >= 1) || v === openLeverageValue) return;
    const h = setTimeout(() => setLeverageM.mutate(v), 600);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.leverage, openTrades.length, openLeverageValue]);

  const askFinish = () =>
    setConfirm({
      title: t('finishTitle'),
      subtitle: t('finishSubtitle'),
      consequences: [...(openTrades.length > 0 ? [t('finishOpenTrade')] : []), t('finishReveal')],
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
            openDirections={openTrades.map((x) => x.direction)}
            scale={scale}
            price={replay.price}
            balance={session.balance}
            disabled={busy || closePending || !replay.ready}
            hint={hint}
            onOpen={open}
            onAdd={addToPosition}
            onFinish={askFinish}
          />
          <ErrorNote error={openM.error ?? addM.error ?? finishM.error ?? setLeverageM.error} fallback={t('actionFailed')} />
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
          trades={openTrades}
          scale={scale}
          price={replay.price}
          cursor={replay.cursor}
          closeOrders={detail.closeOrders}
          onLimit={(trade) => setLimitModalFor(trade.id)}
          onMarket={(trade) => setMarketModalFor(trade.id)}
          onCancelOrder={(id) => cancelOrderM.mutate(id)}
          onChangeLevels={(trade) => setLevelsModalFor(trade.id)}
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

      {levelsModalFor != null && screenPrice != null && (() => {
        const trade = openTrades.find((x) => x.id === levelsModalFor);
        return trade ? (
          <ChangeLevelsModal
            trade={trade}
            scale={scale}
            screenPrice={screenPrice}
            onApply={(stop, take) => applyLevels(trade, screenPrice, stop, take)}
            onClose={() => setLevelsModalFor(null)}
            isPending={modifyM.isPending}
            error={modifyM.error}
          />
        ) : null;
      })()}
      {limitModalFor != null && screenPrice != null && (() => {
        const trade = openTrades.find((x) => x.id === limitModalFor);
        return trade ? (
          <LimitCloseModal
            trade={trade}
            remaining={trade.qty - trade.closedQty}
            scale={scale}
            screenPrice={screenPrice}
            onSubmit={(price, qty) => submitLimit(trade, price, qty)}
            onClose={() => setLimitModalFor(null)}
            isPending={createOrderM.isPending}
            error={createOrderM.error}
          />
        ) : null;
      })()}
      {marketModalFor != null && screenPrice != null && (() => {
        const trade = openTrades.find((x) => x.id === marketModalFor);
        return trade ? (
          <MarketCloseModal
            trade={trade}
            remaining={trade.qty - trade.closedQty}
            screenPrice={screenPrice}
            canClose={canClose(trade)}
            onSubmit={(qty) => submitMarket(trade, qty)}
            onClose={() => setMarketModalFor(null)}
            isPending={closeM.isPending}
            error={closeM.isError ? closeM.error : null}
          />
        ) : null;
      })()}

      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
