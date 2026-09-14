'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Settings as SettingsIcon } from 'lucide-react';
import { TagsDialog, useTags } from '@/entities/tag';
import { useAuth } from '@/features/auth';
import { useLocaleControl } from '@/shared/i18n';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog, type ConfirmRequest } from '@/shared/ui/ConfirmDialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { SectionHead } from '@/shared/ui/SectionHead';
import { Seg, type SegOption } from '@/shared/ui/Seg';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Wrap } from '@/shared/ui/Wrap';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
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
  draftTakeFits,
  fromScreen,
  impliedDirection,
  levelImpact,
  liquidationPrice,
  previewSize,
  toInput,
  toInputPrice,
  toScreen,
} from '../lib/money';
import { useDefaultLeverage } from '../model/useDefaultLeverage';
import { useDrawingTools } from '../model/useDrawingTools';
import { SPEEDS, useReplay } from '../model/useReplay';
import { AddToPositionModal } from './AddToPositionModal';
import { DrawingStyleBar } from './drawings/DrawingStyleBar';
import { DrawingToolbar } from './drawings/DrawingToolbar';
import { ChangeLevelsModal } from './ChangeLevelsModal';
import { LeverageModal } from './LeverageModal';
import { LimitCloseModal } from './LimitCloseModal';
import { MarketCloseModal } from './MarketCloseModal';
import { OpenPositionsPanel } from './OpenPositionsPanel';
import { OrderPanel, type Draft } from './OrderPanel';
import { ReplayChart, type Level, type LevelKind, type Marker } from './ReplayChart';
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
  if (data.synthOutdated)
    return (
      <Wrap page>
        <OutdatedSession detail={data} onLeave={onLeave} />
      </Wrap>
    );
  return <ActiveSession detail={data} onLeave={onLeave} />;
}

/**
 * Тренажёр прежней версии генератора: графика больше нет, торговать не на чем.
 * Остаётся завершить — открытые сделки сервер сам закроет по цене входа.
 */
function OutdatedSession({ detail, onLeave }: { detail: SessionDetail; onLeave: () => void }) {
  const t = useTranslations('backtest');
  const finishM = useFinishSession(detail.session.id);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const hasOpen = detail.trades.some((x) => x.exitTime == null);

  return (
    <>
      <SectionHead title={t('outdatedTitle')}>
        <Button tight onClick={onLeave}>
          {t('backToList')}
        </Button>
      </SectionHead>
      <p>{t('outdatedText')}</p>
      <Button
        variant="solid"
        disabled={finishM.isPending}
        onClick={() =>
          setConfirm({
            title: t('finishTitle'),
            subtitle: t('finishSubtitle'),
            consequences: [...(hasOpen ? [t('outdatedOpenTrades')] : []), t('finishRevealSynthetic')],
            word: t('finishWord'),
            onConfirm: () => finishM.mutate(),
          })
        }
      >
        {t('finish')}
      </Button>
      <ErrorNote error={finishM.error} fallback={t('actionFailed')} />
      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </>
  );
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

  const { user } = useAuth();
  const drawings = useDrawingTools(user?.id ?? 'anon', session.id, scale);

  const replay = useReplay(detail, (trade, exit) => {
    void closeTrade(trade, exit.time, exit.price, exit.reason, exit.qty, exit.closeOrderId).catch(() => undefined);
  });

  // Плечо новой сделки берёт последнее сохранённое (см. useDefaultLeverage) —
  // только на посев начального состояния: экран монтируется, когда `detail`
  // уже загружен, то есть уже после гидрации, и здесь безопасно взять текущее
  // значение хранилища без риска разойтись с серверной разметкой.
  const [defaultLeverage, setDefaultLeverage] = useDefaultLeverage();
  const [draft, setDraft] = useState<Draft>({ risk: '1', stop: '', take: '', leverage: toInput(defaultLeverage) });
  const [hint, setHint] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [limitModalFor, setLimitModalFor] = useState<string | null>(null);
  const [marketModalFor, setMarketModalFor] = useState<string | null>(null);
  const [levelsModalFor, setLevelsModalFor] = useState<string | null>(null);
  const [tagsModalFor, setTagsModalFor] = useState<string | null>(null);
  const [addModalFor, setAddModalFor] = useState<string | null>(null);
  /** Плечо открытых позиций, пока диалог открыт; null — закрыт. */
  const [leverageEdit, setLeverageEdit] = useState<number | null>(null);
  const [tab, setTab] = useState<'open' | 'history'>('open');
  // Ошибки действий над открытыми позициями — своя строка над таблицей позиций, а не
  // `hint` панели ордера: панель про следующий ордер и чужих отказов не показывает.
  const [positionHint, setPositionHint] = useState<string | null>(null);
  // Уровень открытой сделки, отпущенный на графике, пока сервер его не сохранил и
  // сессия не перечиталась: без него линия на это время откатывалась бы на старую
  // цену и прыгала обратно (см. onDragLevel и onSettled у useModifyTrade).
  const [pendingLevel, setPendingLevel] = useState<{ tradeId: string; kind: 'stop' | 'take'; price: number } | null>(null);

  const screenPrice = replay.price != null ? toScreen(replay.price, scale) : null;
  const stopN = Number(draft.stop);
  const takeN = draft.take.trim() ? Number(draft.take) : null;

  const screenCandles = useMemo(() => replay.candles.map((c) => scaleCandle(c, scale)), [replay.candles, scale]);

  const screenGlide = useMemo(
    () => (replay.glide ? { minute: scaleCandle(replay.glide.minute, scale), durationMs: replay.glide.durationMs } : null),
    [replay.glide, scale],
  );

  const balance = session.balance;
  const draftRisk = Number(draft.risk);
  const draftLeverage = Number(draft.leverage) || 1;
  const livePrice = replay.price;

  // Уровни — своим useMemo, а не строятся прямо в теле рендера: ReplayChart
  // (memo, см. его комментарий) сверяет этот массив по ссылке, и без useMemo
  // она менялась бы на любой тик любого слайдера панели, включая риск на
  // сделке без стопа — там числа на графике вообще не меняются, но график всё
  // равно перерисовывался бы целиком.
  const levels = useMemo<Level[]>(() => {
    const list: Level[] = [];

    // Черновик следующего ордера — первым: SVG рисует последующее поверх, и там,
    // где черновая линия легла рядом с уровнем открытой сделки, захват достаётся
    // сделке. Иначе жест «подвинуть стоп позиции» тянул бы черновик панели.
    if (stopN > 0 && livePrice != null && screenPrice != null) {
      list.push({
        id: 'draft-stop',
        kind: 'stop',
        price: stopN,
        draggable: true,
        // Размер позиции зависит от самого стопа, а сторона — от того, по какую
        // сторону цены он стоит: на цене под курсором считается и то и другое.
        impactAt: (p) => {
          const dir = p < screenPrice ? 'long' : 'short';
          const qty = previewSize(balance, draftRisk, livePrice, fromScreen(p, scale), draftLeverage, dir)?.qty;
          return qty != null ? levelImpact(dir, livePrice, fromScreen(p, scale), qty).usdt : null;
        },
      });
    }
    // Тейк не по ту сторону цены не рисуется вовсе: подпись «тейк −2.68 USDT» под
    // стопом — не цель сделки, а противоречие. Проверка здесь, а не только в правках:
    // черновик хранит цены, и цена прокрутки выводит тейк из строя сама, без действия
    // пользователя. Значение в поле остаётся, линия вернётся, как только тейк снова верен.
    if (takeN != null && takeN > 0 && livePrice != null && screenPrice != null && draftTakeFits(stopN, takeN, screenPrice)) {
      const qty = stopN > 0 ? previewSize(balance, draftRisk, livePrice, fromScreen(stopN, scale), draftLeverage, 'long')?.qty : null;
      list.push({
        id: 'draft-take',
        kind: 'take',
        price: takeN,
        draggable: true,
        impactAt: (p) => {
          const dir = impliedDirection(null, stopN, p, screenPrice);
          return dir != null && qty != null ? levelImpact(dir, livePrice, fromScreen(p, scale), qty).usdt : null;
        },
      });
    }

    // Уровни уже открытых сделок — от их собственных stopLoss/takeProfit, не от
    // черновика панели: с хеджем сделок может быть две, у каждой свои уровни.
    for (const trade of openTrades) {
      const remaining = trade.qty - trade.closedQty;
      const impactAt = (qty: number) => (p: number) => levelImpact(trade.direction, trade.entryPrice, fromScreen(p, scale), qty).usdt;
      const pending = pendingLevel?.tradeId === trade.id ? pendingLevel : null;
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
        price: pending?.kind === 'stop' ? pending.price : toScreen(trade.stopLoss, scale),
        draggable: true,
        impactAt: impactAt(remaining),
      });
      const take = pending?.kind === 'take' ? pending.price : trade.takeProfit != null ? toScreen(trade.takeProfit, scale) : null;
      if (take != null) {
        list.push({ id: `take-${trade.id}`, kind: 'take', tradeId: trade.id, price: take, draggable: true, impactAt: impactAt(remaining) });
      }
      for (const o of detail.closeOrders) {
        if (o.tradeId !== trade.id) continue;
        list.push({
          id: o.id,
          kind: 'limitClose',
          tradeId: o.tradeId,
          price: toScreen(o.price, scale),
          draggable: false,
          impactAt: impactAt(o.qty),
        });
      }
    }
    return list;
  }, [openTrades, scale, stopN, takeN, livePrice, screenPrice, balance, draftRisk, draftLeverage, detail.closeOrders, pendingLevel]);

  // Отметки сделок на графике: где вошли и где вышли. Своим useMemo — по той
  // же причине, что и levels выше: ReplayChart сверяет массив по ссылке.
  // Берутся из всех сделок сессии, не только открытых: разбор в том и состоит,
  // чтобы видеть свои прошлые входы на тех же свечах, а не только в таблице.
  const markers = useMemo<Marker[]>(() => {
    const list: Marker[] = [];
    for (const trade of trades) {
      list.push({
        id: `m-entry-${trade.id}`,
        kind: 'entry',
        time: Date.parse(trade.entryTime),
        price: toScreen(trade.entryPrice, scale),
        direction: trade.direction,
        label: t('marker.entry'),
      });
      if (trade.exitTime != null && trade.exitPrice != null) {
        list.push({
          id: `m-exit-${trade.id}`,
          kind: 'exit',
          time: Date.parse(trade.exitTime),
          price: toScreen(trade.exitPrice, scale),
          direction: trade.direction,
          // Ноль — не прибыль и не убыток: у такой сделки нейтральный цвет.
          tone: trade.pnl == null || trade.pnl === 0 ? null : trade.pnl > 0 ? 'profit' : 'loss',
          label: t('marker.exit'),
        });
      }
    }
    return list;
  }, [trades, scale, t]);

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

  // Панель ордера ждёт только своего: открытия и завершения. Правки, доборы и закрытия
  // уже открытых сделок её не блокируют — вторую сделку в сторону, где позиция ещё
  // открыта, сервер не примет сам (BACKTEST_OPEN_TRADE).
  const orderBusy = openM.isPending || finishM.isPending || !replay.ready;
  // Завершение само закрывает открытые сделки: пока закрытие в полёте или упало,
  // повторное закрытие той же сделки сервер отверг бы.
  const finishBusy = orderBusy || closeM.isPending || closeM.isError;
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
      leverage: draftLeverage,
    }, {
      // Ордер ушёл — его стоп и тейк теперь живут у сделки. Оставленный черновик лёг бы
      // линиями ровно поверх уровней новой позиции, и жест по ним тянул бы черновик.
      onSuccess: () => setDraft((prev) => ({ ...prev, stop: '', take: '' })),
    });
  };

  const addToPosition = (trade: BacktestTrade, riskPct: number) => {
    if (replay.price == null) return;
    addM.mutate({ tradeId: trade.id, entryPrice: replay.price, riskPct }, { onSuccess: () => setAddModalFor(null) });
  };

  // Принимает screenPrice параметром, а не читает внешний: onDragLevel ниже зовёт её
  // из рефа, модалка «Изменить уровни» — из своего рендера, и цена у каждого своя.
  const applyLevels = (trade: BacktestTrade, screenPriceNow: number, stop: number, take: number | null, onSettled?: () => void) => {
    const err = checkLevels(trade.direction, screenPriceNow, stop, take);
    setPositionHint(err ? t(err) : null);
    if (err) {
      onSettled?.();
      return;
    }
    modifyM.mutate(
      { tradeId: trade.id, stopLoss: fromScreen(stop, scale), takeProfit: take != null ? fromScreen(take, scale) : null },
      { onSuccess: () => setLevelsModalFor(null), onSettled },
    );
  };

  // Свежие значения для onDragLevel: тот стабилен ради memo(ReplayChart) и читает их
  // отсюда. Пишется в эффекте, а не в рендере — жест случается уже после коммита.
  const dragCtxRef = useRef({ draft, openTrades, screenPrice, applyLevels });
  useLayoutEffect(() => {
    dragCtxRef.current = { draft, openTrades, screenPrice, applyLevels };
  });

  const onDragLevel = useCallback((kind: LevelKind, price: number, tradeId?: string) => {
    if (kind !== 'stop' && kind !== 'take') return;
    const { draft: d, openTrades: ots, screenPrice: sp, applyLevels: apply } = dragCtxRef.current;
    if (sp == null) return;
    if (tradeId != null) {
      // Уровень открытой сделки — направление зафиксировано, зеркалить нечего. Линия
      // держится в точке отпускания (pendingLevel), пока сервер не сохранит и сессия не
      // перечитается; отказ проверки или сервера возвращает её на прежнюю цену.
      const trade = ots.find((x) => x.id === tradeId);
      if (!trade) return;
      setPendingLevel({ tradeId, kind, price });
      const nextStop = kind === 'stop' ? price : toScreen(trade.stopLoss, scale);
      const nextTake = kind === 'take' ? price : trade.takeProfit != null ? toScreen(trade.takeProfit, scale) : null;
      apply(trade, sp, nextStop, nextTake, () =>
        setPendingLevel((prev) => (prev?.tradeId === tradeId && prev.kind === kind ? null : prev)),
      );
      return;
    }
    // Черновик следующего ордера — направление ещё не зафиксировано, стоп может
    // поменять сторону и утянуть за собой уже введённый тейк (applyStopChange).
    if (kind === 'stop') {
      const next = applyStopChange(d, toInputPrice(price), sp, null);
      setDraft((prev) => ({ ...prev, ...next }));
      return;
    }
    // Тейк, отпущенный по сторону стопа, не принимается — как и у открытой сделки:
    // линия возвращается на прежнюю цену, причина — в подсказке панели. Слайдер
    // тейка туда и так не пускает (его диапазон сужен по стороне стопа).
    const take = toInputPrice(price);
    if (!draftTakeFits(Number(d.stop), Number(take), sp)) {
      setHint(t('takeSide'));
      return;
    }
    setHint(null);
    setDraft((prev) => ({ ...prev, take }));
  }, [scale, t]);

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
  useLayoutEffect(() => {
    finishRef.current = finishNow;
  });
  useEffect(() => {
    if (replay.ended) void finishRef.current();
  }, [replay.ended]);

  // Плечо открытых позиций правится из таблицы позиций, а не слайдером панели: тот
  // задаёт плечо следующего ордера и открытых сделок не касается. Сервер держит плечо
  // общим на все открытые сделки сессии и меняет его у всех разом — отсюда одно значение
  // и одна отправка, по закрытию диалога, а не на каждое движение слайдера.
  const openLeverage = openTrades[0]?.leverage ?? null;
  const commitOpenLeverage = () => {
    if (leverageEdit != null && leverageEdit !== openLeverage) setLeverageM.mutate(leverageEdit);
    setLeverageEdit(null);
  };

  const askFinish = () =>
    setConfirm({
      title: t('finishTitle'),
      subtitle: t('finishSubtitle'),
      consequences: [
        ...(openTrades.length > 0 ? [t('finishOpenTrade')] : []),
        session.dataSource === 'synthetic' ? t('finishRevealSynthetic') : t('finishReveal'),
      ],
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
      <div className="asym terminal">
        <div>
          {/* Без заголовка «Таймфрейм» — сами кнопки ТФ слева и есть подпись себе.
              Разметка та же, что у SectionHead (.h2row: линейка снизу, выключка вправо),
              но без <h2>: он тут просто нечем заполнить. */}
          <div className="h2row">
            <Seg options={tfOptions} value={replay.tf} onChange={replay.setTf} ariaLabel={t('timeframe')} />
            <Button variant="bare" tight aria-label={t('chartSettings')} title={t('chartSettings')}>
              <SettingsIcon size={16} />
            </Button>
          </div>
          <div className="chart-tools">
            <DrawingToolbar
              tool={drawings.tool}
              onTool={drawings.setTool}
              magnet={drawings.magnet}
              onMagnet={drawings.setMagnet}
              hidden={drawings.hidden}
              onHidden={drawings.setHidden}
              canClear={drawings.count > 0}
              onClear={() =>
                setConfirm({
                  title: t('drawings.clearTitle'),
                  subtitle: t('drawings.clearSubtitle', { n: drawings.count }),
                  consequences: [t('drawings.clearConsequence')],
                  word: t('drawings.clearWord'),
                  onConfirm: drawings.clearAll,
                })
              }
            />
            <div className="chart-tools-main">
          {drawings.selected && !drawings.hidden && (
            <DrawingStyleBar drawing={drawings.selected} onStyle={drawings.restyle} onDelete={drawings.deleteSelected} />
          )}
          {replay.ready ? (
            <ReplayChart
              // Не key: пересоздание на каждой смене ТФ перерисовывало график с нуля.
              // Окно показа при смене ТФ сбрасывает сам ReplayChart.
              timeframe={replay.shownTf}
              candles={screenCandles}
              levels={levels}
              markers={markers}
              labelFor={labelFor}
              levelLabel={levelLabel}
              glide={screenGlide}
              onDragLevel={onDragLevel}
              onNeedHistory={replay.loadMoreHistory}
              historyLoading={replay.historyLoading}
              drawing={drawings.chart}
            />
          ) : (
            <Skeleton height={380} />
          )}
            </div>
          </div>
          {drawings.saveFailed && <p className="neg">{t('drawings.saveFailed')}</p>}
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
            {session.dataSource === 'synthetic' && <span className="muted">{t('syntheticBadge')}</span>}
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
            scale={scale}
            price={replay.price}
            balance={session.balance}
            disabled={orderBusy}
            finishDisabled={finishBusy}
            hint={hint}
            onOpen={open}
            onFinish={askFinish}
            onLeverageCommit={setDefaultLeverage}
          />
          <ErrorNote error={openM.error ?? finishM.error} fallback={t('actionFailed')} />
          {/* На уровне replay-controls слева (см. .marg ниже) — переключатель не
              часть тикета ордера, а команда таблицы под графиком. */}
          <Seg
            className="view-switch"
            options={[
              { value: 'open' as const, label: t('openPositionsTab') },
              { value: 'history' as const, label: t('historyTab') },
            ]}
            value={tab}
            onChange={setTab}
            ariaLabel={t('openPositionsTab')}
          />
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

      <div className="bt-table">
        {tab === 'open' && positionHint && <p className="neg">{positionHint}</p>}
        {tab === 'open' && <ErrorNote error={modifyM.error ?? setLeverageM.error ?? cancelOrderM.error} fallback={t('actionFailed')} />}
        {tab === 'open' ? (
          <OpenPositionsPanel
            trades={openTrades}
            scale={scale}
            price={replay.price}
            cursor={replay.cursor}
            closeOrders={detail.closeOrders}
            onAdd={(trade) => setAddModalFor(trade.id)}
            onLeverage={(trade) => setLeverageEdit(trade.leverage)}
            onLimit={(trade) => setLimitModalFor(trade.id)}
            onMarket={(trade) => setMarketModalFor(trade.id)}
            onCancelOrder={(id) => cancelOrderM.mutate(id)}
            onChangeLevels={(trade) => setLevelsModalFor(trade.id)}
            onTags={(trade) => setTagsModalFor(trade.id)}
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
      </div>

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
      {addModalFor != null && replay.price != null && (() => {
        const trade = openTrades.find((x) => x.id === addModalFor);
        return trade ? (
          <AddToPositionModal
            trade={trade}
            balance={session.balance}
            price={replay.price}
            scale={scale}
            onSubmit={(riskPct) => addToPosition(trade, riskPct)}
            onClose={() => setAddModalFor(null)}
            isPending={addM.isPending}
            error={addM.error}
          />
        ) : null;
      })()}
      {leverageEdit != null && (
        <LeverageModal leverage={leverageEdit} subtitle={t('leverageOpenHint')} onChange={setLeverageEdit} onClose={commitOpenLeverage} />
      )}
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
      {tagsModalFor != null && (() => {
        const trade = openTrades.find((x) => x.id === tagsModalFor);
        return trade ? (
          <TagsDialog
            title={t('positionTagsTitle')}
            subtitle={`${t(`direction.${trade.direction}`)} · ${formatPriceGrouped(toScreen(trade.entryPrice, scale))}`}
            initialTagIds={trade.tags.map((g) => g.id)}
            isPending={tagsM.isPending}
            error={tagsM.error}
            onSave={(tagIds) => tagsM.mutate({ tradeId: trade.id, tagIds }, { onSuccess: () => setTagsModalFor(null) })}
            onClose={() => setTagsModalFor(null)}
          />
        ) : null;
      })()}

      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
