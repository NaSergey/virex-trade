'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import { Settings as SettingsIcon, Volume2, VolumeX } from 'lucide-react';
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
import { useBacktestSession, isLiveSession, useDecimalsOf, useFinishSession, useLivePrices, useLiveSymbols } from '../api/hooks';
import {
  DEFAULT_SYMBOL,
  type BacktestTrade,
  type Direction,
  type ExitReason,
  type LiveSymbol,
  type SessionDetail,
} from '../api/types';
import { TIMEFRAMES, dayNumber, scaleCandle } from '../lib/candles';
import { CLOSE_GRID_FIRST_ID, CLOSE_GRID_LAST_ID, closeGridLevels, initCloseGrid, type CloseGridDraft } from '../lib/close-grid';
import { draftLevels } from '../lib/draft-levels';
import { isPartialExit } from '../lib/fills';
import {
  applyEntryChange,
  applyStopChange,
  checkEntrySide,
  checkGridLevels,
  checkLevels,
  draftTakeFits,
  fromScreen,
  gridPrices,
  levelDirection,
  levelImpact,
  liquidationPrice,
  openPnl,
  previewSize,
  toInput,
  toInputPrice,
  toScreen,
  withoutLockedLevels,
} from '../lib/money';
import type { TerminalSound } from '../lib/sounds';
import { useSessionActions, type TerminalActions } from '../model/actions';
import { useRsiOn } from '../model/useChartSettings';
import { useMaxRisk } from '../model/useRiskSettings';
import { useLiveSymbol } from '../model/useLiveSymbol';
import { useDefaultLeverage } from '../model/useDefaultLeverage';
import { useDrawingTools } from '../model/useDrawingTools';
import { useLiveFeed, type LiveSource } from '../model/useLiveFeed';
import { SPEEDS, useReplay } from '../model/useReplay';
import { sessionSounds, useSnapshotSound, useTerminalSoundOn } from '../model/useTerminalSound';
import { DrawingStyleBar } from './drawings/DrawingStyleBar';
import { DrawingToolbar } from './drawings/DrawingToolbar';
import { ChangeLevelsModal } from './ChangeLevelsModal';
import { CloseGridPanel } from './CloseGridPanel';
import { LimitCloseModal } from './LimitCloseModal';
import { MarketCloseModal } from './MarketCloseModal';
import { OpenPositionsPanel } from './OpenPositionsPanel';
import { OrdersPanel } from './OrdersPanel';
import { OrderPanel, type Draft, type LimitDraft, type OrderTab, type ScaledDraft } from './OrderPanel';
import { ChartSettingsPanel } from './ChartSettingsPanel';
import { ReplayChart, type Level, type LevelKind, type Marker } from './ReplayChart';
import { SessionSummary } from './SessionSummary';
import { SessionTrades } from './SessionTrades';
import { ChartSkeleton, CoinSkeleton, TerminalSkeleton } from './TerminalSkeleton';
import { CoinPicker } from './CoinPicker';

/**
 * Сессия целиком: загрузка, прокрутка активной или итог завершённой.
 *
 * Обёртку страницы (`.wrap`, читательская колонка в 1360px) выбирает это
 * состояние, а не вызывающий `Page.tsx`: итог завершённой сессии — такой же
 * отчёт, как остальные страницы продукта, а вот у активной сессии свой
 * терминал во всю ширину окна (см. `.bt-live` и комментарий в `ActiveSession`).
 */
export function SessionScreen({
  id,
  onLeave,
  live = false,
}: {
  id: string;
  onLeave: () => void;
  /** Сессия заведомо эфирная — заглушка до её прихода рисуется в виде эфира. */
  live?: boolean;
}) {
  const t = useTranslations('backtest');
  const { data, error } = useBacktestSession(id);
  if (error)
    return (
      <Wrap page>
        <ErrorNote error={error} fallback={t('loadFailed')} />
      </Wrap>
    );
  if (!data) return <TerminalSkeleton live={live} />;
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

/** Активная сессия бектеста или турнира: терминал с действиями нашего сервера. */
function ActiveSession({ detail, onLeave }: { detail: SessionDetail; onLeave: () => void }) {
  const actions = useSessionActions(detail.session.id);
  return <Terminal detail={detail} actions={actions} onLeave={onLeave} />;
}

/**
 * Чем терминал биржи отличается от терминала сессии — всё необязательное.
 * Экран один: у бектеста и турнира этих пропсов нет, и он работает как раньше.
 */
export interface TerminalProps {
  /** Счёт в форме сессии: баланс, сделки, ордера. */
  detail: SessionDetail;
  /** Куда уходят действия: наш сервер (сессия) или биржа. */
  actions: TerminalActions;
  /** «К списку» / «К турниру». Не задан — уходить некуда, кнопки нет. */
  onLeave?: () => void;
  /** Откуда лента берёт свечи; не задан — рынок продукта. */
  source?: LiveSource;
  /** Монеты графика; не заданы — монеты эфира с сервера. */
  symbols?: LiveSymbol[];
  /** Знаков цены монеты; не задано — по списку монет эфира. */
  decimalsOf?: (symbol: string) => number | undefined;
  /** Цена монеты, которой нет на графике; не задано — цены эфира с сервера. */
  priceOf?: (symbol: string) => number | null;
  /** Подпись у переключателя таблиц вместо «Эфир». */
  badge?: string;
  /** Сигналы по разнице снимков; не задано — правила сессии (`soundsOf`). Ссылка — стабильная. */
  soundsOf?: (was: SessionDetail, next: SessionDetail) => readonly TerminalSound[];
  /**
   * Вкладка «История»; не задана — сделки сессии. Компонентом: ему передаётся
   * переход к монете на графике по нажатию на символ (или undefined, где
   * монета одна).
   */
  history?: ComponentType<{ onSymbol?: (symbol: string) => void }>;
  /**
   * Теги позиций и сделок; по умолчанию есть. Терминал на главной их выключает:
   * список тегов живёт на сервере, а гость не вошёл — запрос получил бы 401, и
   * его обработчик увёл бы со страницы.
   */
  tags?: boolean;
}

/**
 * Терминал — один на бектест, турнир и биржу. Состояние приходит снимком счёта
 * в форме сессии (`detail`), действия — набором `actions`; сам экран не знает,
 * исполняет ли их наш движок или биржа.
 */
export function Terminal({
  detail,
  actions,
  onLeave,
  source,
  symbols,
  decimalsOf: decimalsOfProp,
  priceOf: priceOfProp,
  badge,
  soundsOf,
  history: History,
  tags = true,
}: TerminalProps) {
  const t = useTranslations('backtest');
  const { locale } = useLocaleControl();
  const intl = locale === 'en' ? 'en-US' : 'ru-RU';
  const { session, trades } = detail;
  const scale = session.priceScale;
  const startMs = Date.parse(session.startTime);
  /**
   * Сессия в прямом эфире — своя или турнирная. Здесь браузер не ведёт время и
   * не проверяет срабатывания: и то и другое делает сервер (см. `useLiveFeed`),
   * поэтому нет ни «Шага», ни скоростей.
   */
  const isLive = isLiveSession(detail);

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

  /**
   * Монета графика. У истории и тренажёра она одна — BTC; в эфире монет
   * несколько, и график, черновики и уровни на нём — одной монеты, а таблицы
   * позиций, ордеров и истории — всех (спека 2026-09-26).
   */
  // В живом режиме монета запоминается на устройстве (`useLiveSymbol`); остальные
  // режимы держат BTC в памяти экрана и ничего не пишут.
  const [liveSymbol, setLiveSymbol] = useLiveSymbol();
  const [localSymbol, setLocalSymbol] = useState(DEFAULT_SYMBOL);
  const symbol = isLive ? liveSymbol : localSymbol;
  const setSymbol = isLive ? setLiveSymbol : setLocalSymbol;
  // Своим useMemo — по той же причине, что и openTrades: levels сверяет по ссылке.
  const chartTrades = useMemo(() => openTrades.filter((x) => x.symbol === symbol), [openTrades, symbol]);
  // Стороны монеты графика с открытой позицией: «Лонг/Шорт» по ним доливает
  // позицию по её стопу, и стоп с тейком черновика туда не ставятся.
  const lockedSides = useMemo(() => [...new Set(chartTrades.map((x) => x.direction))], [chartTrades]);

  const {
    open: openM,
    addToTrade: addToTradeM,
    modify: modifyM,
    close: closeM,
    createCloseOrder: createOrderM,
    cancelCloseOrder: cancelOrderM,
    createEntryOrders: createEntryOrdersM,
    cancelEntryOrder: cancelEntryOrderM,
    moveEntryOrder: moveEntryOrderM,
    moveCloseOrder: moveCloseOrderM,
    closeGrid: closeGridM,
    finish: finishM,
    tags: tagsM,
  } = actions;

  // Звук терминала: исполнения — из разницы снимков сессии, отказ — по ошибке
  // любого действия над сделками и ордерами.
  const tAudio = useTranslations('audio');
  const [soundOn, setSoundOn] = useTerminalSoundOn();

  // Настройки графика — правая панель на месте панели ордера (шестерёнка над
  // графиком): индикаторы и верхняя граница ползунка риска.
  const [rsiOn, setRsiOn] = useRsiOn();
  const [chartSettingsOpen, setChartSettingsOpen] = useState(false);
  useSnapshotSound(
    detail,
    soundsOf ?? sessionSounds,
    [
      openM.error,
      addToTradeM.error,
      modifyM.error,
      closeM.error,
      createOrderM.error,
      cancelOrderM.error,
      createEntryOrdersM.error,
      cancelEntryOrderM.error,
      moveEntryOrderM.error,
      moveCloseOrderM.error,
      closeGridM.error,
    ],
    soundOn,
  );

  const closeTrade = (trade: BacktestTrade, time: number, price: number, reason: ExitReason, qty?: number, closeOrderId?: string) =>
    closeM.mutateAsync({ tradeId: trade.id, exitTime: new Date(time).toISOString(), exitPrice: price, reason, qty, closeOrderId });

  const { user } = useAuth();
  // Рисунки — у каждой монеты свои: линия по цене ETH на графике BTC ничего не
  // значит. Ключ BTC прежний — рисунки, сделанные до монет, не теряются.
  const drawings = useDrawingTools(
    user?.id ?? 'anon',
    symbol === DEFAULT_SYMBOL ? session.id : `${session.id}:${symbol}`,
    scale,
  );

  const replayFeed = useReplay(
    detail,
    // Всплывающая пауза автопрокрутки на срабатывании ордера/уровня и на открытии
    // позиции убрана намеренно (обсуждали отдельно от корректности): курсор всё
    // равно не движется дальше, пока хоть одна из этих мутаций в полёте (см.
    // `pending` ниже и комментарий у параметра в useReplay) — управление скоростью
    // остаётся только в руках пользователя.
    (trade, exit) => {
      // closingIds выставляется тут же, синхронно с отправкой: см. комментарий
      // у самого стейта выше про разрыв между ответом сервера и перечиткой сессии.
      // Только полное закрытие: после частичного (лимит закрытия, ступень сетки
      // фиксации) позиция остаётся открытой, и прятать её — значит потерять её с
      // графика и из таблицы до перезагрузки.
      if (!isPartialExit(trade, exit)) setClosingIds((prev) => new Set(prev).add(trade.id));
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
    // Ордер на вход сработал. Открыть позицию или долить уже открытую той же
    // стороны, решает сервер под замком сессии, а не этот экран: `detail.trades`
    // догоняет ответ сервера только перечиткой, и два ордера одной стороны,
    // сработавшие подряд, оба решили бы здесь «позиции нет». entryOrderId
    // удаляет сработавшую строку в той же транзакции — см. комментарий у
    // OpenTradeDto.entryOrderId на сервере.
    (order, fill) => {
      openM.mutate({
        symbol: order.symbol,
        direction: order.direction,
        entryTime: new Date(fill.time).toISOString(),
        entryPrice: fill.price,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit ?? undefined,
        riskPct: order.riskPct,
        leverage: order.leverage,
        entryOrderId: order.id,
      });
    },
    // Открытие/добор/срабатывание сетки/закрытие в полёте — сервер ещё не ответил,
    // и открытая позиция ещё не в `detail.trades`: курсор придержан внутри advance()
    // (см. параметр `pending` там), автопрокрутка тем временем просто не отдаёт
    // тиков, а не встаёт видимо для пользователя.
    openM.isPending || addToTradeM.isPending || createEntryOrdersM.isPending || closeM.isPending,
    !isLive,
  );
  // Хуки нельзя вызывать по условию, поэтому вызываются оба, а спит тот, чья
  // очередь не настала: в эфире свечи идут живым хвостом, а не прокруткой.
  const liveFeed = useLiveFeed(detail, isLive, symbol, source);
  const replay = isLive ? liveFeed : replayFeed;

  // Рынок — свой у того, кто его передал (биржа); иначе монеты и цены эфира с сервера.
  const { data: symbolsData } = useLiveSymbols(isLive && !symbols);
  const coins = symbols ?? symbolsData?.symbols;
  const liveDecimalsOf = useDecimalsOf(isLive && !decimalsOfProp);
  const decimalsOf = decimalsOfProp ?? liveDecimalsOf;
  const chartDecimals = decimalsOf(symbol);
  // Цены монет, по которым есть позиции, но которых нет на графике: отметка
  // позиции и окна её закрытия берут цену своей монеты, а не графика.
  const otherSymbols = useMemo(
    () => [...new Set(openTrades.map((x) => x.symbol))].filter((x) => x !== symbol),
    [openTrades, symbol],
  );
  const { data: otherPrices } = useLivePrices(otherSymbols, isLive && !priceOfProp);
  const priceOf = (sym: string): number | null => {
    if (sym === symbol) return replay.price;
    return priceOfProp ? priceOfProp(sym) : (otherPrices?.prices[sym] ?? null);
  };
  const screenPriceOf = (sym: string): number | null => {
    const p = priceOf(sym);
    return p != null ? toScreen(p, scale) : null;
  };

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
  // Черновик сетки фиксации: пока он есть, на месте панели ордера стоит панель
  // сетки, а её уровни — на графике (спека 2026-10-04-close-grid-panel-design.md).
  const [closeGrid, setCloseGrid] = useState<CloseGridDraft | null>(null);
  // Верхняя граница ползунка риска — настройка меню шестерёнки над графиком.
  const [maxRisk, setMaxRisk] = useMaxRisk();
  // Панели меняются анимацией (`.panel-swap`), но не на первой отрисовке
  // терминала: там нечего менять, панель ордера просто стоит.
  const [panelSwapped, setPanelSwapped] = useState(false);
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
  // То же для висящего ордера (лимит на вход или закрытия), перенесённого на графике:
  // экранная цена, пока сервер не сохранил её и сессия не перечиталась.
  const [pendingOrder, setPendingOrder] = useState<{ id: string; price: number } | null>(null);
  // Позиция панели сетки. Закрылась — панель уходит сама: черновик без позиции
  // ничего не значит, а ждать «Отмены» от человека незачем.
  const gridTrade = closeGrid ? (openTrades.find((x) => x.id === closeGrid.tradeId) ?? null) : null;

  const screenPrice = replay.price != null ? toScreen(replay.price, scale) : null;
  // Черновик «Маркета» без уровней занятых сторон — его видят панель, график,
  // жесты и отправка. Сырой `draft` остаётся только для записи.
  const marketDraft = screenPrice != null ? withoutLockedLevels(draft, screenPrice, lockedSides) : draft;
  const stopN = Number(marketDraft.stop);
  const takeN = marketDraft.take.trim() ? Number(marketDraft.take) : null;
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
    // Черновик следующего ордера — первым: под уровнями позиций (см. `draftLevels`).
    // Пока вместо панели ордера стоит панель сетки, её черновика на графике нет:
    // самой панели на экране нет, и линии висели бы уровнями ордера, который
    // сейчас никто не отправляет. Черновик при этом цел и вернётся с панелью.
    const list: Level[] = gridTrade
      ? []
      : draftLevels({
          tab: orderTab,
          market: { stop: stopN, take: takeN, risk: draftRisk },
          limit: { entry: lEntryN, stop: lStopN, take: lTakeN, risk: Number(limitDraft.risk) },
          scaled: { upper: sUpperN, lower: sLowerN, stop: sStopN, take: sTakeN, count: sCountN, risk: Number(scaledDraft.risk) },
          livePrice,
          screenPrice,
          balance,
          leverage: draftLeverage,
          scale,
        });

    // Уровни уже открытых сделок монеты графика — от их собственных
    // stopLoss/takeProfit, не от черновика панели: с хеджем сделок может быть
    // две, у каждой свои уровни.
    for (const trade of chartTrades) {
      const remaining = trade.qty - trade.closedQty;
      const impactAt = (qty: number) => (p: number) => levelImpact(trade.direction, trade.entryPrice, fromScreen(p, scale), qty).usdt;
      const pending = pendingLevel?.tradeId === trade.id ? pendingLevel : null;
      list.push({
        id: `entry-${trade.id}`,
        kind: 'entry',
        tradeId: trade.id,
        price: toScreen(trade.entryPrice, scale),
        draggable: false,
        qty: remaining,
        direction: trade.direction,
        pnl: openPnl(trade, livePrice),
      });
      // Биржа называет цену ликвидации сама (или не называет вовсе — null); у сделки сессии она считается.
      const liq = trade.liqPrice !== undefined ? trade.liqPrice : liquidationPrice(trade.direction, trade.entryPrice, trade.leverage);
      if (liq != null) {
        list.push({ id: `liq-${trade.id}`, kind: 'liq', tradeId: trade.id, price: toScreen(liq, scale), draggable: false });
      }
      // Стопа у позиции биржи может не быть (0): линии тогда нет, пока её не потянут от плашки.
      if (trade.stopLoss > 0 || pending?.kind === 'stop') {
        list.push({
          id: `stop-${trade.id}`,
          kind: 'stop',
          tradeId: trade.id,
          price: pending?.kind === 'stop' ? pending.price : toScreen(trade.stopLoss, scale),
          draggable: true,
          qty: remaining,
          impactAt: impactAt(remaining),
        });
      }
      const take = pending?.kind === 'take' ? pending.price : trade.takeProfit != null ? toScreen(trade.takeProfit, scale) : null;
      if (take != null) {
        list.push({ id: `take-${trade.id}`, kind: 'take', tradeId: trade.id, price: take, draggable: true, qty: remaining, impactAt: impactAt(remaining) });
      }
      for (const o of detail.closeOrders) {
        if (o.tradeId !== trade.id) continue;
        list.push({
          id: o.id,
          kind: 'limitClose',
          tradeId: o.tradeId,
          price: pendingOrder?.id === o.id ? pendingOrder.price : toScreen(o.price, scale),
          draggable: true,
          qty: o.qty,
          impactAt: impactAt(o.qty),
        });
      }
    }
    // Ещё не сработавшие лимиты на вход — независимо от того, есть ли уже
    // сделка этого направления: до срабатывания это не её уровень. Объём — тот,
    // что сервер посчитает на срабатывании (`openChecked`): риск лимита от стопа
    // позиции, если она этой стороны уже открыта, иначе от стопа самого лимита.
    // Депозит к срабатыванию может смениться, поэтому число — на сейчас.
    for (const o of detail.entryOrders) {
      if (o.symbol !== symbol) continue;
      const stop = chartTrades.find((x) => x.direction === o.direction)?.stopLoss ?? o.stopLoss;
      // У лимита биржи объём уже зафиксирован — пересчитывать его от риска нечего.
      const qty = o.qty ?? previewSize(balance, o.riskPct, o.price, stop, o.leverage, o.direction)?.qty;
      const price = pendingOrder?.id === o.id ? pendingOrder.price : toScreen(o.price, scale);
      list.push({ id: o.id, kind: 'pendingEntry', price, draggable: true, qty });
    }
    // Уровни сетки фиксации — последними, поверх уровней позиции, а не под ними,
    // как черновик ордера: в этом режиме человек занят сеткой, и совпавшая с ней
    // линия позиции не должна перехватывать захват.
    if (gridTrade && closeGrid && gridTrade.symbol === symbol) {
      // Ордера сетки, уже стоящие на бирже, — поверх её черновика: черновик
      // ставится на те же цены (по умолчанию тейки 1 % и 3 %) и закрывал бы их
      // плашки целиком. Захвата они не перехватывают — их не тянут, только ✕.
      const standing = list.filter((l) => l.kind === 'limitClose' && l.tradeId === gridTrade.id);
      return [
        ...list.filter((l) => !standing.includes(l)),
        ...closeGridLevels(gridTrade, closeGrid, scale),
        ...standing.map((l) => ({ ...l, draggable: false })),
      ];
    }
    return list;
  }, [
    gridTrade,
    closeGrid,
    pendingOrder,
    chartTrades,
    symbol,
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
      if (trade.symbol !== symbol) continue;
      // Одна стрелка на каждое исполнение (открытие + каждый добор сеткой), а
      // не одна на entryPrice/entryTime сделки — те усреднены по всем входам и
      // держат только время самого первого. У сделок, заведённых до этой
      // истории, entries пуст — тогда синтезируем одну запись из самой сделки,
      // иначе старые сессии остались бы вовсе без стрелки входа.
      const entries = trade.entries.length > 0 ? trade.entries : [{ id: trade.id, qty: trade.qty, price: trade.entryPrice, time: trade.entryTime }];
      for (const entry of entries) {
        // Время открытия позиции биржи бывает неизвестно — стрелку ставить некуда.
        if (!Number.isFinite(Date.parse(entry.time))) continue;
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
  }, [trades, scale, symbol, t]);

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
  // открытых сделок её не блокируют.
  const orderBusy = openM.isPending || finishM.isPending || !replay.ready;
  // «Не раньше входа» — отрицанием: у позиции биржи время входа бывает неизвестно
  // (NaN), и запирать её закрытие из-за этого нельзя.
  const canClose = (trade: BacktestTrade) => !(Date.parse(trade.entryTime) >= replay.cursor);

  /**
   * Смена типа тикета чистит уровни всех черновиков — иначе стоп «Маркета» и
   * цена ордера остались бы линиями на графике, пока открыт тикет, к которому
   * они не относятся. Риск, плечо и число ордеров переживают переключение:
   * это настройки, а не уровни, и набирать их заново незачем.
   */
  const clearDraftLevels = () => {
    setDraft((prev) => ({ ...prev, stop: '', take: '' }));
    setLimitDraft((prev) => ({ ...prev, stop: '', take: '', entry: '' }));
    setScaledDraft((prev) => ({ ...prev, stop: '', take: '', upper: '', lower: '' }));
    setHint(null);
    setLimitHint(null);
    setScaledHint(null);
  };

  const switchOrderTab = (next: OrderTab) => {
    setOrderTab(next);
    clearDraftLevels();
  };

  /**
   * Смена монеты чистит уровни черновиков тем же приёмом, что смена вкладки
   * тикета: стоп, выставленный по цене BTC, на графике ETH — не уровень, а
   * число из другого рынка. Риск и плечо переживают переключение.
   *
   * Панель сетки фиксации при этом уходит: её уровни стоят на графике монеты
   * позиции, и на графике другой монеты их ставить некуда.
   */
  const switchSymbol = (next: string) => {
    setSymbol(next);
    clearDraftLevels();
    setCloseGrid(null);
  };

  // График — ради прокрутки к нему, когда монету выбирают в таблице под ним.
  const chartRef = useRef<HTMLDivElement>(null);
  /**
   * Нажатие на символ монеты в таблицах — переход к её графику. Только там, где
   * монет несколько (эфир, биржа), и только к монете из списка графика: свечей
   * другой терминал не запросит. Таблицы стоят под графиком, и тот, кто их
   * листал, графика может не видеть — к нему прокручивается.
   */
  const pickSymbol =
    isLive && coins && coins.length > 0
      ? (next: string) => {
          if (!coins.some((c) => c.symbol === next)) return;
          if (next !== symbol) switchSymbol(next);
          chartRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      : undefined;

  /**
   * Лесенка на плашке позиции или в таблице — панель ордера сменяется панелью
   * сетки. Позиция другой монеты переключает на неё график: линии сетки иначе
   * ставить некуда. Повторное нажатие по той же позиции черновик не сбрасывает.
   */
  const openCloseGrid = (tradeId: string) => {
    if (closeGrid?.tradeId === tradeId && gridTrade) return;
    const trade = openTrades.find((x) => x.id === tradeId);
    const tradePrice = trade ? screenPriceOf(trade.symbol) : null;
    if (!trade || tradePrice == null) return;
    if (trade.symbol !== symbol) switchSymbol(trade.symbol);
    // На месте панели одна: открытая сетка вытесняет настройки и наоборот.
    setChartSettingsOpen(false);
    setCloseGrid(initCloseGrid(trade, scale, tradePrice, detail.closeOrders.filter((o) => o.tradeId === trade.id).length));
    setPanelSwapped(true);
  };

  const open = (direction: Direction) => {
    if (replay.price == null || screenPrice == null) return;
    const risk = Number(draft.risk);
    if (!(risk >= 0.01 && risk <= 100)) {
      setHint(t('riskInvalid'));
      return;
    }
    // Позиция в эту сторону уже открыта — рыночный ордер её доливает, тем же
    // приёмом, что сработавший уровень сетки: объём — от риска панели и стопа
    // позиции, уровни позиции не трогаются, и стоп панели для добора не нужен
    // (решение владельца 2026-09-26). Сама панель об открытых сделках так и не
    // знает: развилка здесь, а не в её пропсах.
    const existing = openTrades.find((x) => x.symbol === symbol && x.direction === direction);
    if (existing) {
      setHint(null);
      addToTradeM.mutate({
        tradeId: existing.id,
        entryTime: new Date(replay.cursor).toISOString(),
        entryPrice: replay.price,
        riskPct: risk,
      });
      return;
    }
    const err = checkLevels(direction, screenPrice, stopN, takeN);
    setHint(err ? t(err) : null);
    if (err) return;
    // Открытие в полёте — advance() придержан через `pending` (openM.isPending),
    // явную остановку автопрокрутки здесь не ставим.
    openM.mutate({
      symbol,
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
        symbol,
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
        symbol,
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

  /**
   * Висящий ордер отпущен на графике на новой цене (экранной). Лимит на вход
   * проверяется так же, как при выставлении: покупка — ниже цены, продажа — выше
   * (иначе это уже рынок), и свои стоп с тейком он не перепрыгивает. Отказ —
   * линия возвращается на место, причина — над таблицей. Лимит закрытия, как и
   * при выставлении, ставится на любую цену.
   */
  const moveOrder = (kind: 'pendingEntry' | 'limitClose', orderId: string, price: number) => {
    if (kind === 'pendingEntry') {
      const order = detail.entryOrders.find((o) => o.id === orderId);
      if (!order || screenPrice == null) return;
      const take = order.takeProfit != null ? toScreen(order.takeProfit, scale) : null;
      // Свой стоп есть не у каждого лимита биржи (0 — нет): сверять тогда не с чем.
      const err =
        checkEntrySide(order.direction, [price], screenPrice) ??
        (order.stopLoss > 0 ? checkGridLevels(order.direction, [price], toScreen(order.stopLoss, scale), take) : null);
      setPositionHint(err ? t(err) : null);
      if (err) return;
    } else {
      setPositionHint(null);
    }
    setPendingOrder({ id: orderId, price });
    const mutation = kind === 'pendingEntry' ? moveEntryOrderM : moveCloseOrderM;
    mutation.mutate(
      { orderId, price: fromScreen(price, scale) },
      { onSettled: () => setPendingOrder((prev) => (prev?.id === orderId ? null : prev)) },
    );
  };

  // Свежие значения для onDragLevel: тот стабилен ради memo(ReplayChart) и читает их
  // отсюда. Пишется в эффекте, а не в рендере — жест случается уже после коммита.
  const dragCtxRef = useRef({ draft: marketDraft, openTrades, screenPrice, applyLevels, orderTab, lockedSides, moveOrder, openCloseGrid });
  useLayoutEffect(() => {
    dragCtxRef.current = { draft: marketDraft, openTrades, screenPrice, applyLevels, orderTab, lockedSides, moveOrder, openCloseGrid };
  });

  const onDragLevel = useCallback((kind: LevelKind, price: number, tradeId?: string, levelId?: string) => {
    if (kind === 'gridTake') {
      // Тянутся только первый и последний тейк сетки; промежуточные встанут
      // между ними сами. Сторону проверяет панель — как у введённого в поле.
      if (levelId === CLOSE_GRID_FIRST_ID || levelId === CLOSE_GRID_LAST_ID) {
        const key = levelId === CLOSE_GRID_FIRST_ID ? 'first' : 'last';
        setCloseGrid((prev) => (prev ? { ...prev, [key]: Number(toInputPrice(price)) } : prev));
      }
      return;
    }
    if ((kind === 'pendingEntry' || kind === 'limitClose') && levelId != null) {
      dragCtxRef.current.moveOrder(kind, levelId, price);
      return;
    }
    if (kind === 'limitEntry') {
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
    const { draft: d, openTrades: ots, screenPrice: sp, applyLevels: apply, orderTab: activeTab, lockedSides: locked } =
      dragCtxRef.current;
    if (sp == null) return;
    // Стоп и тейк отложенных тикетов — просто новая цена в их черновике, без
    // зеркалирования: сторону они берут от цены ордера, а не от рыночной, и
    // проверяются целиком при отправке (checkGridLevels).
    if (tradeId == null && activeTab === 'limit') {
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
    // Уровень черновика, отпущенный на стороне с открытой позицией, не
    // принимается: там «Лонг/Шорт» доливает позицию по её стопу. Линия
    // возвращается на прежнюю цену, ползунки панели туда и так не пускают.
    if (locked.includes(levelDirection(kind, price, sp))) {
      setHint(t('sideLocked'));
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

  // ✕ на плашках графика — стабильные ради memo(ReplayChart), свежее берут из dragCtxRef.
  const onCloseTrade = useCallback((tradeId: string) => setMarketModalFor(tradeId), []);
  const onCloseGrid = useCallback((tradeId: string) => dragCtxRef.current.openCloseGrid(tradeId), []);
  const onClearTake = useCallback((tradeId: string) => {
    const { openTrades: ots, screenPrice: sp, applyLevels: apply } = dragCtxRef.current;
    const trade = ots.find((x) => x.id === tradeId);
    if (!trade || sp == null) return;
    apply(trade, sp, toScreen(trade.stopLoss, scale), null);
  }, [scale]);

  // ✕ на плашке ордера. `mutate` у мутаций стабилен — колбэк тоже, ради memo(ReplayChart).
  const cancelCloseOrder = cancelOrderM.mutate;
  const cancelEntryOrder = cancelEntryOrderM.mutate;
  const onCancelOrder = useCallback(
    (kind: LevelKind, orderId: string) => (kind === 'limitClose' ? cancelCloseOrder(orderId) : cancelEntryOrder(orderId)),
    [cancelCloseOrder, cancelEntryOrder],
  );

  const submitLimit = (trade: BacktestTrade, price: number, qty: number) => {
    createOrderM.mutate({ tradeId: trade.id, price, qty }, { onSuccess: () => setLimitModalFor(null) });
  };

  const submitMarket = (trade: BacktestTrade, qty: number) => {
    const price = priceOf(trade.symbol);
    if (price == null || !canClose(trade)) return;
    void closeTrade(trade, replay.cursor, price, 'manual', qty).then(() => setMarketModalFor(null)).catch(() => undefined);
  };

  const finishing = useRef(false);
  const finishNow = async () => {
    if (finishing.current) return;
    finishing.current = true;
    replay.setSpeed(null);
    try {
      // Позицию закрывает браузер — он знает цену момента; сервер лишь проверяет, что открытых нет.
      for (const trade of openTrades) {
        const price = priceOf(trade.symbol);
        if (price != null && canClose(trade)) await closeTrade(trade, replay.cursor, price, 'finish');
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
    onLeave?.();
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
          <div className="terminal-chart" ref={chartRef}>
            {/* Без заголовка «Таймфрейм» — сами кнопки ТФ слева и есть подпись себе.
                Разметка та же, что у SectionHead (.h2row: линейка снизу, выключка вправо),
                но без <h2>: он тут просто нечем заполнить. */}
            <div className="h2row">
              <div className="flex items-center gap-3">
                {/* Монета — только в эфире: у истории и тренажёра она одна. Пока
                    список едет — заглушка того же размера, а не пустое место. */}
                {isLive &&
                  (coins && coins.length > 0 ? (
                    <CoinPicker coins={coins} value={symbol} onChange={switchSymbol} />
                  ) : (
                    <CoinSkeleton />
                  ))}
                <Seg options={tfOptions} value={replay.tf} onChange={replay.setTf} ariaLabel={t('timeframe')} />
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="bare"
                  tight
                  aria-label={tAudio('sound')}
                  data-tour="term-sound"
                  aria-pressed={soundOn}
                  title={soundOn ? tAudio('mute') : tAudio('unmute')}
                  onClick={() => setSoundOn(!soundOn)}
                >
                  {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </Button>
                <Button
                  variant="bare"
                  tight
                  aria-label={t('chartSettings')}
                  title={t('chartSettings')}
                  aria-expanded={chartSettingsOpen}
                  onClick={() => {
                    // Одна панель на месте: настройки открываются вместо сетки и наоборот.
                    if (!chartSettingsOpen) setCloseGrid(null);
                    setChartSettingsOpen((v) => !v);
                  }}
                >
                  <SettingsIcon size={16} />
                </Button>
              </div>
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
                    onCloseTrade={onCloseTrade}
                    onClearTake={onClearTake}
                    onCancelOrder={onCancelOrder}
                    onCloseGrid={onCloseGrid}
                    onNeedHistory={replay.loadMoreHistory}
                    historyLoading={replay.historyLoading}
                    drawing={drawings.chart}
                    priceDecimals={chartDecimals}
                    rsi={rsiOn}
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
              {/* В эфире время ведут часы, а не участник: шагать и ускорять
                  нечего, и кнопки, которые ничего не делают, тут не стоят. */}
              {!isLive && (
                <>
                  <Button variant="solid" onClick={() => void replay.step()} disabled={!replay.ready || replay.ended}>
                    {t('step')} ▶
                  </Button>
                  <Seg
                    options={speedOptions}
                    value={replay.speed ?? 0}
                    onChange={(v) => replay.setSpeed(v || null)}
                    ariaLabel={t('speed')}
                  />
                </>
              )}
              {isLive && (
                <span className="muted" data-tour="term-badge">
                  {badge ?? t('liveBadge')}
                </span>
              )}
              {session.dataSource === 'synthetic' && <span className="muted">{t('syntheticBadge')}</span>}
              {onLeave && (
                <Button tight onClick={() => void leave()}>
                  {detail.tournament ? t('backToTournament') : t('backToList')}
                </Button>
              )}
              <Seg
                className="view-switch"
                data-tour="term-tables"
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
          {/* Сетка фиксации стоит на месте панели ордера, а не окном поверх: её
              уровни — на графике, и смотреть на них, настраивая, нужно рядом.
              Смена панели — сменой ключа: новая въезжает анимацией (.panel-swap). */}
          <div
            key={chartSettingsOpen ? 'settings' : gridTrade ? 'grid' : 'order'}
            className={gridTrade || chartSettingsOpen ? 'panel-swap panel-swap-fill' : 'panel-swap'}
            data-swap={panelSwapped ? (gridTrade || chartSettingsOpen ? 'in' : 'back') : undefined}
          >
            {chartSettingsOpen ? (
              <ChartSettingsPanel
                rsiOn={rsiOn}
                onRsi={setRsiOn}
                maxRisk={maxRisk}
                onMaxRisk={setMaxRisk}
                onClose={() => setChartSettingsOpen(false)}
              />
            ) : gridTrade && closeGrid ? (
              <CloseGridPanel
                trade={gridTrade}
                draft={closeGrid}
                onDraft={setCloseGrid}
                scale={scale}
                screenPrice={screenPriceOf(gridTrade.symbol)}
                closeOrdersCount={detail.closeOrders.filter((o) => o.tradeId === gridTrade.id).length}
                decimals={decimalsOf(gridTrade.symbol)}
                onSubmit={(grid) => closeGridM.mutate({ tradeId: gridTrade.id, ...grid }, { onSuccess: () => setCloseGrid(null) })}
                onCancel={() => setCloseGrid(null)}
                isPending={closeGridM.isPending}
                error={closeGridM.error}
              />
            ) : (
              <>
                <OrderPanel
                  tab={orderTab}
                  onTab={switchOrderTab}
                  maxRisk={maxRisk}
                  draft={marketDraft}
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
                  priceDecimals={chartDecimals}
                  lockedSides={lockedSides}
                />
                <ErrorNote error={openM.error ?? addToTradeM.error ?? createEntryOrdersM.error ?? finishM.error} fallback={t('actionFailed')} />
              </>
            )}
          </div>
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
        {/* Над любой вкладкой: уровни и ордера двигают и снимают прямо на графике,
            какая бы таблица ни была открыта под ним. */}
        {positionHint && <p className="neg">{positionHint}</p>}
        <ErrorNote
          error={modifyM.error ?? moveEntryOrderM.error ?? moveCloseOrderM.error ?? cancelOrderM.error ?? cancelEntryOrderM.error}
          fallback={t('actionFailed')}
        />
        {tab === 'open' && (
          <OpenPositionsPanel
            trades={openTrades}
            scale={scale}
            priceOf={priceOf}
            decimalsOf={decimalsOf}
            cursor={replay.cursor}
            onLimit={(trade) => setLimitModalFor(trade.id)}
            onMarket={(trade) => setMarketModalFor(trade.id)}
            onChangeLevels={(trade) => setLevelsModalFor(trade.id)}
            onCloseGrid={(trade) => onCloseGrid(trade.id)}
            onTags={tags ? (trade) => setTagsModalFor(trade.id) : undefined}
            onSymbol={pickSymbol}
          />
        )}
        {tab === 'orders' && (
          <div data-tour="term-orders">
          <OrdersPanel
            trades={openTrades}
            scale={scale}
            closeOrders={detail.closeOrders}
            entryOrders={detail.entryOrders}
            onCancelOrder={(id) => cancelOrderM.mutate(id)}
            onCancelEntryOrder={(id) => cancelEntryOrderM.mutate(id)}
            showSymbol={isLive}
            decimalsOf={decimalsOf}
            onSymbol={pickSymbol}
          />
          </div>
        )}
        {tab === 'history' && (
          <div data-tour="term-history">
          {History ? (
            <History onSymbol={pickSymbol} />
          ) : (
            <SessionTrades
              trades={trades}
              scale={scale}
              labelFor={labelFor}
              onEditTags={tags ? (trade) => setHistoryTagsFor(trade.id) : undefined}
              decimalsOf={decimalsOf}
              onSymbol={pickSymbol}
            />
          )}
          </div>
        )}
      </div>

      {/* Окна позиции берут цену монеты своей сделки, а не графика. */}
      {levelsModalFor != null && (() => {
        const trade = openTrades.find((x) => x.id === levelsModalFor);
        const tradePrice = trade ? screenPriceOf(trade.symbol) : null;
        return trade && tradePrice != null ? (
          <ChangeLevelsModal
            trade={trade}
            scale={scale}
            screenPrice={tradePrice}
            decimals={decimalsOf(trade.symbol)}
            onApply={(stop, take) => applyLevels(trade, tradePrice, stop, take)}
            onClose={() => setLevelsModalFor(null)}
            isPending={modifyM.isPending}
            error={modifyM.error}
          />
        ) : null;
      })()}
      {limitModalFor != null && (() => {
        const trade = openTrades.find((x) => x.id === limitModalFor);
        const tradePrice = trade ? screenPriceOf(trade.symbol) : null;
        return trade && tradePrice != null ? (
          <LimitCloseModal
            trade={trade}
            remaining={trade.qty - trade.closedQty}
            scale={scale}
            screenPrice={tradePrice}
            decimals={decimalsOf(trade.symbol)}
            onSubmit={(price, qty) => submitLimit(trade, price, qty)}
            onClose={() => setLimitModalFor(null)}
            isPending={createOrderM.isPending}
            error={createOrderM.error}
          />
        ) : null;
      })()}
      {marketModalFor != null && (() => {
        const trade = openTrades.find((x) => x.id === marketModalFor);
        const tradePrice = trade ? screenPriceOf(trade.symbol) : null;
        return trade && tradePrice != null ? (
          <MarketCloseModal
            trade={trade}
            remaining={trade.qty - trade.closedQty}
            screenPrice={tradePrice}
            decimals={decimalsOf(trade.symbol)}
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
            subtitle={`${trade.symbol} · ${t(`direction.${trade.direction}`)} · ${formatPriceGrouped(toScreen(trade.entryPrice, scale), decimalsOf(trade.symbol))}`}
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
            subtitle={`${trade.symbol} · ${t(`direction.${trade.direction}`)} · ${formatPriceGrouped(toScreen(trade.entryPrice, scale), decimalsOf(trade.symbol))}`}
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
