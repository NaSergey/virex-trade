'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Settings as SettingsIcon } from 'lucide-react';
import { TagsDialog } from '@/entities/tag';
import { useAuth } from '@/features/auth';
import { useLocaleControl } from '@/shared/i18n';
import { Button } from '@/shared/ui/Button';
import { ConfirmDialog, type ConfirmRequest } from '@/shared/ui/ConfirmDialog';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { SectionHead } from '@/shared/ui/SectionHead';
import { Seg, type SegOption } from '@/shared/ui/Seg';
import { Wrap } from '@/shared/ui/Wrap';
import { formatPriceGrouped } from '@/shared/lib/utils/format';
import {
  useAddToTrade,
  useBacktestSession,
  useCancelCloseOrder,
  useCancelEntryOrder,
  useCloseTrade,
  useCreateCloseOrder,
  useCreateEntryOrders,
  useFinishSession,
  useModifyTrade,
  useOpenTrade,
  useSetBacktestTags,
} from '../api/hooks';
import type { BacktestTrade, Direction, ExitReason, SessionDetail } from '../api/types';
import { TIMEFRAMES, dayNumber, scaleCandle } from '../lib/candles';
import {
  applyEntryChange,
  applyStopChange,
  checkEntrySide,
  checkGridLevels,
  checkLevels,
  draftTakeFits,
  fromScreen,
  gridPrices,
  impliedDirection,
  levelImpact,
  liquidationPrice,
  previewGrid,
  previewSize,
  toInput,
  toInputPrice,
  toScreen,
} from '../lib/money';
import { useDefaultLeverage } from '../model/useDefaultLeverage';
import { useDrawingTools } from '../model/useDrawingTools';
import { SPEEDS, useReplay } from '../model/useReplay';
import { DrawingStyleBar } from './drawings/DrawingStyleBar';
import { DrawingToolbar } from './drawings/DrawingToolbar';
import { ChangeLevelsModal } from './ChangeLevelsModal';
import { LimitCloseModal } from './LimitCloseModal';
import { MarketCloseModal } from './MarketCloseModal';
import { OpenPositionsPanel } from './OpenPositionsPanel';
import { OrdersPanel } from './OrdersPanel';
import { OrderPanel, type Draft, type LimitDraft, type OrderTab, type ScaledDraft } from './OrderPanel';
import { ReplayChart, type Level, type LevelKind, type Marker } from './ReplayChart';
import { SessionSummary } from './SessionSummary';
import { SessionTrades } from './SessionTrades';
import { ChartSkeleton, TerminalSkeleton } from './TerminalSkeleton';

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
  if (!data) return <TerminalSkeleton />;
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

  /**
   * Сделки, чьё закрытие уже отправлено на сервер, но сессия ещё не перечитана —
   * помечаются здесь же, в момент отправки (см. onExit у useReplay ниже), а не
   * определяются задним числом по `trades`. `detail.trades` докатывается только
   * после ответа сервера И следующего перечитывания сессии — двух сетевых
   * круга, не одного, — и без этой пометки открытая сделка (и её стоп/тейк на
   * графике) висела бы всё это время: раньше окно перекрывала принудительная
   * пауза автопрокрутки, которую убрали отдельно (см. комментарий у useReplay
   * ниже), и разрыв стал заметен. Обратный отказ (сервер не закрыл) снимает
   * пометку сам, в catch у onExit — Set иначе не пуст, но раз сделка и так
   * настоящей закрытой не станет, расти ему больше не с чего.
   */
  const [closingIds, setClosingIds] = useState<ReadonlySet<string>>(new Set());
  // useMemo, не голый .filter(): `levels` ниже держит openTrades в зависимостях, а
  // ReplayChart — memo (см. его комментарий) и сверяет уровни по ссылке. .find() у
  // одной сделки был стабилен сам по себе (тот же объект из массива), .filter() каждый
  // раз аллоцирует новый массив — без useMemo levels пересчитывался бы на любой рендер,
  // включая тик слайдера риска, который к открытым сделкам отношения не имеет.
  const openTrades = useMemo(() => trades.filter((x) => x.exitTime == null && !closingIds.has(x.id)), [trades, closingIds]);

  const openM = useOpenTrade(session.id);
  const addToTradeM = useAddToTrade(session.id);
  const modifyM = useModifyTrade(session.id);
  const closeM = useCloseTrade(session.id);
  const createOrderM = useCreateCloseOrder(session.id);
  const cancelOrderM = useCancelCloseOrder(session.id);
  const createEntryOrdersM = useCreateEntryOrders(session.id);
  const cancelEntryOrderM = useCancelEntryOrder(session.id);
  const finishM = useFinishSession(session.id);
  const tagsM = useSetBacktestTags(session.id);

  const closeTrade = (trade: BacktestTrade, time: number, price: number, reason: ExitReason, qty?: number, closeOrderId?: string) =>
    closeM.mutateAsync({ tradeId: trade.id, exitTime: new Date(time).toISOString(), exitPrice: price, reason, qty, closeOrderId });

  const { user } = useAuth();
  const drawings = useDrawingTools(user?.id ?? 'anon', session.id, scale);

  const replay = useReplay(
    detail,
    // Всплывающая пауза автопрокрутки на срабатывании ордера/уровня и на открытии
    // позиции убрана намеренно (обсуждали отдельно от корректности): курсор всё
    // равно не движется дальше, пока хоть одна из этих мутаций в полёте (см.
    // `pending` ниже и комментарий у параметра в useReplay) — управление скоростью
    // остаётся только в руках пользователя.
    (trade, exit) => {
      // closingIds выставляется тут же, синхронно с отправкой: см. комментарий
      // у самого стейта выше про разрыв между ответом сервера и перечиткой сессии.
      setClosingIds((prev) => new Set(prev).add(trade.id));
      void closeTrade(trade, exit.time, exit.price, exit.reason, exit.qty, exit.closeOrderId).catch(() => {
        // Отказ подтверждён — сделка на самом деле осталась открытой, снимаем
        // пометку немедленно: иначе она бы пряталась до конца сессии без единой
        // причины, ведь `trades` её и не переставали показывать открытой.
        setClosingIds((prev) => {
          if (!prev.has(trade.id)) return prev;
          const next = new Set(prev);
          next.delete(trade.id);
          return next;
        });
      });
    },
    // Уровень сетки на вход сработал: если сделка этого направления уже есть —
    // это добор (тем же приёмом, что ручной добор раньше делал addToTrade),
    // если нет — она эту сделку и открывает, со стопом/тейком/плечом самой
    // сетки. entryOrderId удаляет сработавшую строку в той же транзакции —
    // см. комментарий у OpenTradeDto.entryOrderId на сервере.
    (order, fill) => {
      const existing = openTrades.find((t) => t.direction === order.direction);
      if (existing) {
        addToTradeM.mutate({
          tradeId: existing.id,
          entryTime: new Date(fill.time).toISOString(),
          entryPrice: fill.price,
          riskPct: order.riskPct,
          entryOrderId: order.id,
        });
      } else {
        openM.mutate({
          direction: order.direction,
          entryTime: new Date(fill.time).toISOString(),
          entryPrice: fill.price,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit ?? undefined,
          riskPct: order.riskPct,
          leverage: order.leverage,
          entryOrderId: order.id,
        });
      }
    },
    // Открытие/добор/срабатывание сетки/закрытие в полёте — сервер ещё не ответил,
    // и открытая позиция ещё не в `detail.trades`: курсор придержан внутри advance()
    // (см. параметр `pending` там), автопрокрутка тем временем просто не отдаёт
    // тиков, а не встаёт видимо для пользователя.
    openM.isPending || addToTradeM.isPending || createEntryOrdersM.isPending || closeM.isPending,
  );

  // Плечо новой сделки берёт последнее сохранённое (см. useDefaultLeverage) —
  // только на посев начального состояния: экран монтируется, когда `detail`
  // уже загружен, то есть уже после гидрации, и здесь безопасно взять текущее
  // значение хранилища без риска разойтись с серверной разметкой.
  const [defaultLeverage, setDefaultLeverage] = useDefaultLeverage();
  const [draft, setDraft] = useState<Draft>({ risk: '1', stop: '', take: '', leverage: toInput(defaultLeverage) });
  const [orderTab, setOrderTab] = useState<OrderTab>('market');
  const [limitDraft, setLimitDraft] = useState<LimitDraft>({ risk: '1', stop: '', take: '', entry: '' });
  const [scaledDraft, setScaledDraft] = useState<ScaledDraft>({ risk: '1', stop: '', take: '', upper: '', lower: '', count: '5' });
  const [hint, setHint] = useState<string | null>(null);
  const [limitHint, setLimitHint] = useState<string | null>(null);
  const [scaledHint, setScaledHint] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [limitModalFor, setLimitModalFor] = useState<string | null>(null);
  const [marketModalFor, setMarketModalFor] = useState<string | null>(null);
  const [levelsModalFor, setLevelsModalFor] = useState<string | null>(null);
  const [tagsModalFor, setTagsModalFor] = useState<string | null>(null);
  /** Теги закрытой сделки из истории — отдельно от tagsModalFor: тот ищет среди
      openTrades, а история правит сделки, которых там уже нет. */
  const [historyTagsFor, setHistoryTagsFor] = useState<string | null>(null);
  const [tab, setTab] = useState<'open' | 'orders' | 'history'>('open');
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
  const lStopN = Number(limitDraft.stop);
  const lTakeN = limitDraft.take.trim() ? Number(limitDraft.take) : null;
  const lEntryN = limitDraft.entry.trim() ? Number(limitDraft.entry) : null;
  const sStopN = Number(scaledDraft.stop);
  const sTakeN = scaledDraft.take.trim() ? Number(scaledDraft.take) : null;
  const sUpperN = scaledDraft.upper.trim() ? Number(scaledDraft.upper) : null;
  const sLowerN = scaledDraft.lower.trim() ? Number(scaledDraft.lower) : null;
  const sCountN = Math.min(10, Math.max(1, Math.round(Number(scaledDraft.count) || 1)));

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
    //
    // Рисуется только черновик ОТКРЫТОЙ вкладки тикета: у каждой свои стоп и
    // тейк, и линии закрытых вкладок висели бы на графике уровнями ордера,
    // которого никто не собирается отправлять.
    if (orderTab === 'market' && stopN > 0 && livePrice != null && screenPrice != null) {
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
    if (
      orderTab === 'market' &&
      takeN != null &&
      takeN > 0 &&
      livePrice != null &&
      screenPrice != null &&
      draftTakeFits(stopN, takeN, screenPrice)
    ) {
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

    // Черновик одиночного отложенного ордера: своя цена входа плюс стоп и тейк,
    // которые считаются от неё, а не от рыночной цены (см. lAnchor в OrderPanel).
    if (orderTab === 'order' && livePrice != null && screenPrice != null) {
      const entryReal = lEntryN != null && lEntryN > 0 ? fromScreen(lEntryN, scale) : null;
      if (lEntryN != null && lEntryN > 0) {
        list.push({ id: 'draft-order-entry', kind: 'orderEntry', price: lEntryN, draggable: true });
      }
      // Результат уровня — от цены самого ордера: сделка откроется по ней.
      const impactAt = (p: number) => {
        if (entryReal == null) return null;
        const levelReal = fromScreen(p, scale);
        const dir = levelReal < entryReal ? 'long' : 'short';
        const qty = previewSize(balance, Number(limitDraft.risk), entryReal, levelReal, draftLeverage, dir)?.qty;
        return qty != null ? levelImpact(dir, entryReal, levelReal, qty).usdt : null;
      };
      if (lStopN > 0) list.push({ id: 'draft-order-stop', kind: 'stop', price: lStopN, draggable: true, impactAt });
      // Якорь тейка — цена входа, а пока её не задали, текущая цена: тот же приём,
      // что и у lAnchor в OrderPanel (см. его комментарий). Без этого падения на
      // цену тейк, поставленный раньше входа, не показывался бы вовсе — хотя стоп
      // выше уже не требует входа для показа.
      const lAnchor = lEntryN != null && lEntryN > 0 ? lEntryN : screenPrice;
      if (lTakeN != null && lTakeN > 0 && draftTakeFits(lStopN, lTakeN, lAnchor)) {
        list.push({ id: 'draft-order-take', kind: 'take', price: lTakeN, draggable: true, impactAt });
      }
    }
    // Черновик сетки на вход (Scaled) — до отправки просто верх/низ диапазона,
    // без отдельных уровней: их сервер разложит равномерно только на отправке.
    // Граница рисуется только тронутая: обе, прибитые к текущей цене, ложились
    // бы двумя подписанными линиями поверх свечей у всякого, кто просто открыл
    // вкладку и ничего ещё не решил.
    if (orderTab === 'scaled' && livePrice != null) {
      if (sUpperN != null && sUpperN > 0) {
        list.push({ id: 'draft-grid-upper', kind: 'gridUpper', price: sUpperN, draggable: true });
      }
      if (sLowerN != null && sLowerN > 0) {
        list.push({ id: 'draft-grid-lower', kind: 'gridLower', price: sLowerN, draggable: true });
      }
      // Стоп и тейк сетки — на весь её результат, поэтому и считаются от
      // среднего входа при полном исполнении (previewGrid), а не от одного уровня.
      const pricesReal =
        sUpperN != null && sLowerN != null
          ? gridPrices(Math.min(sLowerN, sUpperN), Math.max(sLowerN, sUpperN), sCountN).map((p) => fromScreen(p, scale))
          : [];
      const impactAt = (p: number) => {
        if (pricesReal.length === 0) return null;
        const levelReal = fromScreen(p, scale);
        const dir = levelReal < Math.min(...pricesReal) ? 'long' : 'short';
        const grid = previewGrid(balance, Number(scaledDraft.risk), pricesReal, levelReal, draftLeverage, dir);
        return grid ? levelImpact(dir, grid.avgEntry, levelReal, grid.qty).usdt : null;
      };
      if (sStopN > 0) list.push({ id: 'draft-grid-stop', kind: 'stop', price: sStopN, draggable: true, impactAt });
      if (sTakeN != null && sTakeN > 0) {
        list.push({ id: 'draft-grid-take', kind: 'take', price: sTakeN, draggable: true, impactAt });
      }
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
    // Ещё не сработавшие уровни сетки — независимо от того, есть ли уже
    // сделка этого направления: до срабатывания это не её уровень.
    for (const o of detail.entryOrders) {
      list.push({ id: o.id, kind: 'gridPending', price: toScreen(o.price, scale), draggable: false });
    }
    return list;
  }, [
    openTrades,
    scale,
    orderTab,
    stopN,
    takeN,
    lEntryN,
    lStopN,
    lTakeN,
    limitDraft.risk,
    sUpperN,
    sLowerN,
    sStopN,
    sTakeN,
    sCountN,
    scaledDraft.risk,
    livePrice,
    screenPrice,
    balance,
    draftRisk,
    draftLeverage,
    detail.closeOrders,
    detail.entryOrders,
    pendingLevel,
  ]);

  // Отметки сделок на графике: где вошли и где вышли. Своим useMemo — по той
  // же причине, что и levels выше: ReplayChart сверяет массив по ссылке.
  // Берутся из всех сделок сессии, не только открытых: разбор в том и состоит,
  // чтобы видеть свои прошлые входы на тех же свечах, а не только в таблице.
  const markers = useMemo<Marker[]>(() => {
    const list: Marker[] = [];
    for (const trade of trades) {
      // Одна стрелка на каждое исполнение (открытие + каждый добор сеткой), а
      // не одна на entryPrice/entryTime сделки — те усреднены по всем входам и
      // держат только время самого первого. У сделок, заведённых до этой
      // истории, entries пуст — тогда синтезируем одну запись из самой сделки,
      // иначе старые сессии остались бы вовсе без стрелки входа.
      const entries = trade.entries.length > 0 ? trade.entries : [{ id: trade.id, qty: trade.qty, price: trade.entryPrice, time: trade.entryTime }];
      for (const entry of entries) {
        list.push({
          id: `m-entry-${trade.id}-${entry.id}`,
          kind: 'entry',
          time: Date.parse(entry.time),
          price: toScreen(entry.price, scale),
          direction: trade.direction,
          label: t('marker.entry'),
        });
      }
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

  // Панель ордера ждёт только своего: открытия. Правки, доборы и закрытия уже
  // открытых сделок её не блокируют — вторую сделку в сторону, где позиция ещё
  // открыта, сервер не примет сам (BACKTEST_OPEN_TRADE).
  const orderBusy = openM.isPending || finishM.isPending || !replay.ready;
  const canClose = (trade: BacktestTrade) => replay.cursor > Date.parse(trade.entryTime);

  /**
   * Смена типа тикета чистит уровни всех черновиков — иначе стоп «Маркета» и
   * цена ордера остались бы линиями на графике, пока открыт тикет, к которому
   * они не относятся. Риск, плечо и число ордеров переживают переключение:
   * это настройки, а не уровни, и набирать их заново незачем.
   */
  const switchOrderTab = (next: OrderTab) => {
    setOrderTab(next);
    setDraft((prev) => ({ ...prev, stop: '', take: '' }));
    setLimitDraft((prev) => ({ ...prev, stop: '', take: '', entry: '' }));
    setScaledDraft((prev) => ({ ...prev, stop: '', take: '', upper: '', lower: '' }));
    setHint(null);
    setLimitHint(null);
    setScaledHint(null);
  };

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
    // Открытие в полёте — advance() придержан через `pending` (openM.isPending),
    // явную остановку автопрокрутки здесь не ставим.
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

  // Одиночный отложенный ордер — та же сетка из одного уровня: отдельного
  // эндпоинта у него нет, потому что отличалась бы только длина массива цен.
  const openLimit = (direction: Direction) => {
    if (replay.price == null || screenPrice == null) return;
    const risk = Number(limitDraft.risk);
    if (!(risk >= 0.01 && risk <= 100)) {
      setLimitHint(t('riskInvalid'));
      return;
    }
    if (lEntryN == null) {
      setLimitHint(t('entryPriceRequired'));
      return;
    }
    const err = checkEntrySide(direction, [lEntryN], screenPrice) ?? checkGridLevels(direction, [lEntryN], lStopN, lTakeN);
    setLimitHint(err ? t(err) : null);
    if (err) return;
    createEntryOrdersM.mutate(
      {
        direction,
        stopLoss: fromScreen(lStopN, scale),
        takeProfit: lTakeN != null ? fromScreen(lTakeN, scale) : undefined,
        riskPct: risk,
        leverage: draftLeverage,
        prices: [fromScreen(lEntryN, scale)],
      },
      {
        onSuccess: () => setLimitDraft((prev) => ({ ...prev, stop: '', take: '', entry: '' })),
      },
    );
  };

  const openScaled = (direction: Direction) => {
    if (replay.price == null || screenPrice == null) return;
    const risk = Number(scaledDraft.risk);
    if (!(risk >= 0.01 && risk <= 100)) {
      setScaledHint(t('riskInvalid'));
      return;
    }
    if (sUpperN == null || sLowerN == null) {
      setScaledHint(t('entryRangeRequired'));
      return;
    }
    const pricesScreen = gridPrices(Math.min(sLowerN, sUpperN), Math.max(sLowerN, sUpperN), sCountN);
    const err = checkEntrySide(direction, pricesScreen, screenPrice) ?? checkGridLevels(direction, pricesScreen, sStopN, sTakeN);
    setScaledHint(err ? t(err) : null);
    if (err) return;
    createEntryOrdersM.mutate(
      {
        direction,
        stopLoss: fromScreen(sStopN, scale),
        takeProfit: sTakeN != null ? fromScreen(sTakeN, scale) : undefined,
        // Общий риск сетки — поровну на каждый уровень: то же самое, что
        // сервер сложил бы обратно, если каждый уровень добирать по одному.
        riskPct: risk / pricesScreen.length,
        leverage: draftLeverage,
        prices: pricesScreen.map((p) => fromScreen(p, scale)),
      },
      {
        onSuccess: () => setScaledDraft((prev) => ({ ...prev, stop: '', take: '', upper: '', lower: '' })),
      },
    );
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
  const dragCtxRef = useRef({ draft, openTrades, screenPrice, applyLevels, orderTab });
  useLayoutEffect(() => {
    dragCtxRef.current = { draft, openTrades, screenPrice, applyLevels, orderTab };
  });

  const onDragLevel = useCallback((kind: LevelKind, price: number, tradeId?: string) => {
    if (kind === 'orderEntry') {
      const { screenPrice: sp } = dragCtxRef.current;
      const nextEntry = toInputPrice(price);
      setLimitDraft((prev) => (sp == null ? { ...prev, entry: nextEntry } : { ...prev, ...applyEntryChange(prev, nextEntry, sp) }));
      return;
    }
    if (kind === 'gridUpper' || kind === 'gridLower') {
      // Черновик сетки — просто верх/низ диапазона, без стороны и без
      // зеркалирования: у него нет второго уровня, который надо сверять.
      setScaledDraft((prev) => ({ ...prev, [kind === 'gridUpper' ? 'upper' : 'lower']: toInputPrice(price) }));
      return;
    }
    if (kind !== 'stop' && kind !== 'take') return;
    const { draft: d, openTrades: ots, screenPrice: sp, applyLevels: apply, orderTab: activeTab } = dragCtxRef.current;
    if (sp == null) return;
    // Стоп и тейк отложенных тикетов — просто новая цена в их черновике, без
    // зеркалирования: сторону они берут от цены ордера, а не от рыночной, и
    // проверяются целиком при отправке (checkGridLevels).
    if (tradeId == null && activeTab === 'order') {
      setLimitDraft((prev) => ({ ...prev, [kind]: toInputPrice(price) }));
      return;
    }
    if (tradeId == null && activeTab === 'scaled') {
      setScaledDraft((prev) => ({ ...prev, [kind]: toInputPrice(price) }));
      return;
    }
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
    <div className="bt-live px-4">
      <div className="asym terminal">
        <div className="terminal-main">
          <div className="terminal-chart">
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
                  <ChartSkeleton />
                )}
              </div>
            </div>
            {drawings.saveFailed && <p className="neg">{t('drawings.saveFailed')}</p>}
          </div>

          {/* Строка кнопок — низ окна терминала: график над ней забирает остаток
              высоты экрана (см. .terminal в globals.css), поэтому «Шаг», скорость
              и «К списку» всегда видны вместе с графиком. На широком экране она
              растянута на обе колонки грида, а не сидит в узкой колонке графика:
              место под тикетом справа иначе пустовало бы, а переключателю
              таблицы было бы тесно. */}
          <div className="terminal-controls">
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
              <Seg
                className="view-switch"
                options={[
                  { value: 'open' as const, label: t('openPositionsTab') },
                  { value: 'orders' as const, label: t('ordersTab') },
                  { value: 'history' as const, label: t('historyTab') },
                ]}
                value={tab}
                onChange={setTab}
                ariaLabel={t('openPositionsTab')}
              />
            </div>
            {replay.ended && <p className="muted">{t('historyEnded')}</p>}
            <ErrorNote error={replay.error} fallback={t('loadFailed')} />
          </div>
        </div>

        <div className="marg">
          <OrderPanel
            tab={orderTab}
            onTab={switchOrderTab}
            draft={draft}
            onDraft={setDraft}
            limitDraft={limitDraft}
            onLimitDraft={setLimitDraft}
            scaledDraft={scaledDraft}
            onScaledDraft={setScaledDraft}
            scale={scale}
            price={replay.price}
            balance={session.balance}
            disabled={orderBusy}
            hint={hint}
            limitHint={limitHint}
            scaledHint={scaledHint}
            onOpen={open}
            onOpenLimit={openLimit}
            onOpenScaled={openScaled}
            onLeverageCommit={setDefaultLeverage}
          />
          <ErrorNote error={openM.error ?? addToTradeM.error ?? createEntryOrdersM.error ?? finishM.error} fallback={t('actionFailed')} />
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
        {tab === 'open' && <ErrorNote error={modifyM.error} fallback={t('actionFailed')} />}
        {tab === 'orders' && <ErrorNote error={cancelOrderM.error ?? cancelEntryOrderM.error} fallback={t('actionFailed')} />}
        {tab === 'open' && (
          <OpenPositionsPanel
            trades={openTrades}
            scale={scale}
            price={replay.price}
            cursor={replay.cursor}
            onLimit={(trade) => setLimitModalFor(trade.id)}
            onMarket={(trade) => setMarketModalFor(trade.id)}
            onChangeLevels={(trade) => setLevelsModalFor(trade.id)}
            onTags={(trade) => setTagsModalFor(trade.id)}
          />
        )}
        {tab === 'orders' && (
          <OrdersPanel
            trades={openTrades}
            scale={scale}
            closeOrders={detail.closeOrders}
            entryOrders={detail.entryOrders}
            onCancelOrder={(id) => cancelOrderM.mutate(id)}
            onCancelEntryOrder={(id) => cancelEntryOrderM.mutate(id)}
          />
        )}
        {tab === 'history' && (
          <SessionTrades
            trades={trades}
            scale={scale}
            labelFor={labelFor}
            onEditTags={(trade) => setHistoryTagsFor(trade.id)}
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
      {historyTagsFor != null && (() => {
        const trade = trades.find((x) => x.id === historyTagsFor);
        return trade ? (
          <TagsDialog
            title={t('tradeTagsTitle')}
            subtitle={`${t(`direction.${trade.direction}`)} · ${formatPriceGrouped(toScreen(trade.entryPrice, scale))}`}
            initialTagIds={trade.tags.map((g) => g.id)}
            isPending={tagsM.isPending}
            error={tagsM.error}
            onSave={(tagIds) => tagsM.mutate({ tradeId: trade.id, tagIds }, { onSuccess: () => setHistoryTagsFor(null) })}
            onClose={() => setHistoryTagsFor(null)}
          />
        ) : null;
      })()}

      {confirm && <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
