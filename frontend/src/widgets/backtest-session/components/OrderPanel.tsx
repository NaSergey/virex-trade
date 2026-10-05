'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Field, Input } from '@/shared/ui/Field';
import { KeyValue } from '@/shared/ui/Lookup';
import { Seg } from '@/shared/ui/Seg';
import { Slider } from '@/shared/ui/Slider';
import { cn } from '@/shared/lib/utils/css';
import { fmtPctSigned, formatPriceGrouped, formatQty } from '@/shared/lib/utils/format';
import type { Direction } from '../api/types';
import {
  applyEntryChange,
  applyStopChange,
  curvedSliderPos,
  curvedSliderValue,
  draftTakeFits,
  fromScreen,
  gridPrices,
  gridTakeProfit,
  impliedDirection,
  levelImpact,
  levelSliderRange,
  previewGrid,
  previewSize,
  riskAmount,
  signedPctFromStop,
  stopFromSignedPct,
  STOP_RISK_PCT,
  toInput,
  toInputPrice,
  toScreen,
} from '../lib/money';

/** Заголовок тейка: прибыль по нему, пока он стоит, иначе «(по желанию)». */
/**
 * Место ползунка, пока цены ещё нет: тот же range, выключенный и без бегунка.
 * Без него поле росло вдвое, когда приходила цена, и сдвигало всё под собой.
 */
export function SliderSlot() {
  return <input type="range" className="slider slider-slot" disabled tabIndex={-1} aria-hidden />;
}

function TakeTitle({ profit }: { profit: number | null }) {
  const t = useTranslations('backtest');
  return (
    <span>
      {t('take')}{' '}
      {profit != null ? (
        <span className="pos">
          {profit >= 0 ? '+' : '−'}
          {formatPriceGrouped(Math.abs(profit))} USDT
        </span>
      ) : (
        t('takeOptional')
      )}
    </span>
  );
}

/** Поля панели — строками, как их набирает человек, и в экранных ценах. */
export interface Draft {
  risk: string;
  stop: string;
  take: string;
  leverage: string;
}

/** Черновик одиночного отложенного ордера на вход: та же сетка из одного
 * уровня (см. ScaledDraft), поэтому и на сервер уходит тем же запросом. */
export interface LimitDraft {
  risk: string;
  stop: string;
  take: string;
  entry: string;
}

/** Черновик сетки на вход (Scaled order) — риск общий на всю сетку, поровну по
 * уровням; плечо общее с рыночной вкладкой (см. Draft.leverage), своего нет. */
export interface ScaledDraft {
  risk: string;
  stop: string;
  take: string;
  upper: string;
  lower: string;
  count: string;
}

/** Какой тикет открыт. Живёт у родителя: переключение чистит уровни
 * остальных вкладок, чтобы их линии не оставались на графике. */
export type OrderTab = 'market' | 'limit' | 'scaled';

const MIN_GRID_ORDERS = 1;
const MAX_GRID_ORDERS = 10;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const MIN_LEVERAGE = 1;
const MAX_LEVERAGE = 100;
/** Плечо — фиксированный список значений, не произвольное целое 1—100. */
const LEVERAGE_OPTIONS = [1, 3, 5, 10, 25, 50, 100];

/**
 * Вход, уровни, риск и плечо. Про открытые сделки панель знает одно — какие
 * стороны заняты (`lockedSides`): для них стоп и тейк «Маркета» не ставятся,
 * потому что «Лонг/Шорт» по занятой стороне доливает позицию по её стопу (развилка
 * — в `open` у `SessionScreen`). Сама открытая позиция (хедж — до двух сделок
 * разом), её уровни и закрытие живут в `OpenPositionsPanel` под графиком.
 *
 * Слайдер стопа задаёт направление и дистанцию одним движением: центр — цена,
 * вправо (плюс) — лонг, влево (минус) — шорт, по 7% в каждую сторону
 * (`stopFromSignedPct`/`signedPctFromStop`). Тейк идёт следом: направление
 * стопа — общее для обоих уровней (`impliedDirection`), диапазон тейка
 * сужается на верную сторону, как только сторона стопа известна
 * (`levelSliderRange`), а если стоп меняет сторону — уже введённый тейк
 * зеркалится вместе с ним, синхронно, в том же обработчике, что двигает стоп
 * (`applyStopChange`).
 */
export function OrderPanel({
  tab,
  onTab,
  draft,
  onDraft,
  limitDraft,
  onLimitDraft,
  scaledDraft,
  onScaledDraft,
  scale,
  price,
  balance,
  disabled,
  hint,
  limitHint,
  scaledHint,
  onOpen,
  onOpenLimit,
  onOpenScaled,
  onLeverageCommit,
  priceDecimals,
  lockedSides,
  maxRisk: maxRiskSetting,
}: {
  tab: OrderTab;
  onTab: (tab: OrderTab) => void;
  draft: Draft;
  onDraft: (d: Draft) => void;
  limitDraft: LimitDraft;
  onLimitDraft: (d: LimitDraft) => void;
  scaledDraft: ScaledDraft;
  onScaledDraft: (d: ScaledDraft) => void;
  scale: number;
  /** Настоящая цена последней показанной минутки. */
  price: number | null;
  balance: number;
  /** Кнопки Лонг/Шорт (всех вкладок). */
  disabled: boolean;
  hint: string | null;
  limitHint: string | null;
  scaledHint: string | null;
  onOpen: (direction: Direction) => void;
  onOpenLimit: (direction: Direction) => void;
  onOpenScaled: (direction: Direction) => void;
  /** Плечо, выбранное в списке, запоминается как значение по умолчанию для
   * следующей сделки (см. useDefaultLeverage) — зовётся сразу же выбором пункта,
   * дожидаться отдельного подтверждения не у чего, список закрывается сам.
   * Общее на все вкладки: плечо — настройка сессии, не конкретного ордера
   * (см. setLeverage на сервере). */
  onLeverageCommit: (leverage: number) => void;
  /** Знаков цены монеты графика (эфир); не задано — общее правило формата. */
  priceDecimals?: number;
  /**
   * Стороны, по которым у монеты графика уже открыта позиция. Стоп и тейк
   * «Маркета» туда не ставятся (решение владельца 2026-09-26); заняты обе —
   * ползунки уровней выключены. Черновик приходит уже без уровней этих сторон
   * (`withoutLockedLevels`).
   */
  lockedSides: readonly Direction[];
  /** Верхняя граница ползунка риска, % депозита — из настроек терминала. */
  maxRisk: number;
}) {
  const t = useTranslations('backtest');
  const setScaled = (key: keyof ScaledDraft) => (e: ChangeEvent<HTMLInputElement>) =>
    onScaledDraft({ ...scaledDraft, [key]: e.target.value });

  // Свой список вместо <select>: нативный попап меню браузер рисует сам, вне
  // досягаемости CSS — ни анимации открытия, ни своих цветов у него не будет
  // никаким классом. Закрытие по клику вне — тем же приёмом, что и у групп
  // инструментов рисования (DrawingToolbar).
  const [leverageOpen, setLeverageOpen] = useState(false);
  const leverageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!leverageOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!leverageRef.current?.contains(e.target as Node)) setLeverageOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [leverageOpen]);

  const stop = Number(draft.stop);
  const take = draft.take.trim() ? Number(draft.take) : null;
  const risk = Number(draft.risk);
  const leverage = clamp(Number(draft.leverage) || MIN_LEVERAGE, MIN_LEVERAGE, MAX_LEVERAGE);
  const screenPrice = price != null ? toScreen(price, scale) : null;
  // Направление решают уже набранные стоп/тейк (см. impliedDirection), а не открытые сделки.
  const direction = screenPrice != null ? impliedDirection(null, stop, take, screenPrice) : null;
  // Занятая сторона закрывает свою половину обоих ползунков; свободная остаётся
  // одна — тейку сторона известна и без стопа.
  const longLocked = lockedSides.includes('long');
  const shortLocked = lockedSides.includes('short');
  const levelsLocked = longLocked && shortLocked;
  const freeSide: Direction | null = longLocked && !shortLocked ? 'short' : shortLocked && !longLocked ? 'long' : null;
  // Диапазон тейка сужается по стороне СТОПА, а не общего `direction`: тот, пока
  // стоп не поставлен, угадывает направление по самому тейку (см. impliedDirection).
  // Возьми диапазон оттуда — и первое же движение ползунка задавало бы новое
  // направление, диапазон в тот же кадр схлопывался из симметричных ±20% в
  // одностороннюю половину и переезжал под пальцем: та же экранная точка вдруг
  // оказывалась в другом конце трека, и тейк выглядел стартующим не от цены,
  // а от края диапазона.
  const stopDirection = screenPrice != null ? impliedDirection(null, stop, null, screenPrice) : null;
  const takeRange = screenPrice != null ? levelSliderRange('take', screenPrice, stopDirection ?? freeSide) : null;
  const stopSignedPct = screenPrice != null ? clamp(signedPctFromStop(stop || screenPrice, screenPrice), -STOP_RISK_PCT, STOP_RISK_PCT) : null;
  const stopPct = stopSignedPct != null ? -stopSignedPct : null;
  const takeValue = takeRange ? clamp(take ?? screenPrice!, takeRange.min, takeRange.max) : null;
  // Подпись — от самого тейка, а не от зажатого в диапазон слайдера: тейк не по ту
  // сторону цены иначе читался бы как «+0.00%», хотя в поле стоит совсем другая цена.
  const takeSet = take != null && take > 0;
  const takePct = screenPrice ? (((takeSet ? take : screenPrice) - screenPrice) / screenPrice) * 100 : null;
  const takeFits = !takeSet || screenPrice == null || draftTakeFits(stop, take, screenPrice);

  // Ползунки риска/стопа/тейка идут по дуге, не линейно: у нуля (0% риска,
  // цена для стопа/тейка) движение мыши даёт мелкий шаг, у края диапазона —
  // крупный. Слайдер получает и отдаёт готовую экранную позицию (−100…100),
  // а не само значение — обратно в значение она переводится в onChange.
  // Ноль в настройках — не шкала: ползунок тогда не на чем стоять.
  const maxRisk = Math.max(maxRiskSetting, 0.1);
  const riskPos = curvedSliderPos(clamp(risk || 0, 0, maxRisk), 0, maxRisk, 0);
  const stopPos = stopSignedPct != null ? curvedSliderPos(stopSignedPct, -STOP_RISK_PCT, STOP_RISK_PCT, 0) : null;
  const takePos =
    takeRange && takeValue != null && screenPrice != null
      ? curvedSliderPos(takeValue, takeRange.min, takeRange.max, screenPrice)
      : null;
  // Как только сторона стопа известна, диапазон тейка сужается на одну сторону от
  // цены (levelSliderRange) — цена становится краем диапазона, а не серединой.
  // Трек слайдера обязан сузиться вместе с ним: полная −100…100 при цене-крае
  // оставляла бы половину трека мёртвой зоной, куда ни попасть значением, ни
  // вытащить оттуда ползунок — он залипал бы в 0 на границе живой и мёртвой
  // половины, то есть на глаз ровно посередине трека.
  const takeSliderMin = takeRange && screenPrice != null && takeRange.min === screenPrice ? 0 : -100;
  const takeSliderMax = takeRange && screenPrice != null && takeRange.max === screenPrice ? 0 : 100;
  // Трек стопа — знаковый: плюс (стоп ниже цены) — лонг, минус — шорт.
  const stopSliderMin = shortLocked && !levelsLocked ? 0 : -100;
  const stopSliderMax = longLocked && !levelsLocked ? 0 : 100;

  /** Стоп получил новую цену — тейк зеркалится тут же, если новый стоп сделал его неверным. */
  const setStop = (newStopScreen: number) => {
    if (screenPrice == null) return;
    onDraft({ ...draft, ...applyStopChange(draft, toInputPrice(newStopScreen), screenPrice, null) });
  };

  /** Вход отложенного ордера получил новую цену — стоп и тейк переезжают вслед
   * за ним (`applyEntryChange`), а не остаются висеть на старой абсолютной цене. */
  const setLimitEntry = (newEntry: string) => {
    if (screenPrice == null) {
      onLimitDraft({ ...limitDraft, entry: newEntry });
      return;
    }
    onLimitDraft({ ...limitDraft, ...applyEntryChange(limitDraft, newEntry, screenPrice) });
  };
  const setLimitEntryText = (e: ChangeEvent<HTMLInputElement>) => setLimitEntry(e.target.value);

  const preview =
    price != null && stop > 0
      ? previewSize(balance, risk, price, fromScreen(stop, scale), leverage, direction ?? 'long')
      : null;
  const riskUsd = riskAmount(balance, risk);
  // Прибыль по тейку — та же формула, что «Сейчас» у открытой позиции (с комиссиями),
  // на размере предпросмотра. Пока тейк не стоит или не подходит стороне стопа — нет.
  const takeProfit =
    preview && takeSet && takeFits && price != null
      ? levelImpact(direction ?? 'long', price, fromScreen(take, scale), preview.qty).usdt
      : null;

  // Одиночный отложенный ордер: то же, что сетка из одного уровня, поэтому
  // цена входа здесь одна, а не диапазон — сторону она же и задаёт.
  const lRisk = Number(limitDraft.risk);
  const lStop = Number(limitDraft.stop);
  const lTake = limitDraft.take.trim() ? Number(limitDraft.take) : null;
  const lEntry = limitDraft.entry.trim() ? Number(limitDraft.entry) : null;
  const lDirection = screenPrice != null ? impliedDirection(null, lEntry ?? 0, null, screenPrice) : null;
  // Цена входа ходит в обе стороны от текущей — той же механикой, что стоп в
  // «Маркете» (`stopFromSignedPct`): центр трека — цена, вправо цена входа
  // ниже (лимит на покупку, лонг), влево выше (лимит на продажу, шорт).
  // Односторонний диапазон (`levelSliderRange`) тут не годится: у одиночного
  // ордера нет второго уровня, относительно которого сторона была бы занята.
  const lEntrySignedPct =
    screenPrice != null ? clamp(signedPctFromStop(lEntry || screenPrice, screenPrice), -STOP_RISK_PCT, STOP_RISK_PCT) : null;
  const lEntryPos = lEntrySignedPct != null ? curvedSliderPos(lEntrySignedPct, -STOP_RISK_PCT, STOP_RISK_PCT, 0) : null;
  /**
   * Стоп и тейк отложенного ордера отсчитываются от ЕГО цены, а не от текущей:
   * сделка откроется по ней, ею же меряется риск (|вход − стоп|), и она же
   * решает, по верную ли сторону стоит уровень (`checkGridLevels`). Со шкалой
   * от рыночной цены стоп лимитки, стоящей ниже рынка, в ±7% вокруг рынка
   * просто не попадал бы на верную сторону — его было «не поставить».
   *
   * Сторону при этом решать нечем, кроме самой цены ордера: выше рынка — это
   * продажа (шорт), и стоп идёт ещё выше; ниже рынка — покупка (лонг), и стоп
   * ниже входа. Поэтому диапазоны обоих уровней односторонние
   * (`levelSliderRange`), и поставить стоп не по ту сторону нельзя в принципе,
   * а не «можно, но потом откажет проверка».
   */
  const lAnchor = lEntry != null && lEntry > 0 ? lEntry : screenPrice;
  const lStopRange = lAnchor != null ? levelSliderRange('stop', lAnchor, lDirection) : null;
  const lStopVal = lStopRange && lAnchor != null ? clamp(lStop || lAnchor, lStopRange.min, lStopRange.max) : null;
  const lStopPos =
    lStopRange && lStopVal != null && lAnchor != null ? curvedSliderPos(lStopVal, lStopRange.min, lStopRange.max, lAnchor) : null;
  const lStopSliderMin = lStopRange && lAnchor != null && lStopRange.min === lAnchor ? 0 : -100;
  const lStopSliderMax = lStopRange && lAnchor != null && lStopRange.max === lAnchor ? 0 : 100;
  const lStopPct = lAnchor && lStop > 0 ? ((lStop - lAnchor) / lAnchor) * 100 : null;
  const lTakeRange = lAnchor != null ? levelSliderRange('take', lAnchor, lDirection) : null;
  const lTakeSet = lTake != null && lTake > 0;
  const lTakeVal = lTakeRange && lAnchor != null ? clamp(lTake ?? lAnchor, lTakeRange.min, lTakeRange.max) : null;
  const lTakePos =
    lTakeRange && lTakeVal != null && lAnchor != null ? curvedSliderPos(lTakeVal, lTakeRange.min, lTakeRange.max, lAnchor) : null;
  const lTakeSliderMin = lTakeRange && lAnchor != null && lTakeRange.min === lAnchor ? 0 : -100;
  const lTakeSliderMax = lTakeRange && lAnchor != null && lTakeRange.max === lAnchor ? 0 : 100;
  const lTakePct = lAnchor ? (((lTakeSet ? lTake : lAnchor) - lAnchor) / lAnchor) * 100 : null;
  const lTakeFits = !lTakeSet || lAnchor == null || draftTakeFits(lStop, lTake, lAnchor);
  // Размер — от цены самого ордера, а не от текущей: исполнится он по ней.
  const lPreview =
    lEntry != null && lEntry > 0 && lStop > 0 && lDirection
      ? previewSize(balance, lRisk, fromScreen(lEntry, scale), fromScreen(lStop, scale), leverage, lDirection)
      : null;
  const lTakeProfit =
    lPreview && lTakeSet && lTakeFits && lEntry != null && lDirection
      ? levelImpact(lDirection, fromScreen(lEntry, scale), fromScreen(lTake, scale), lPreview.qty).usdt
      : null;

  // Сетка на вход (Scaled): риск, стоп и тейк — те же поля, что у Market, но
  // на всю сетку целиком; направление решают Верх/Низ входа тем же приёмом,
  // что стоп у Market (impliedDirection), а не отдельная кнопка стороны.
  const sRisk = Number(scaledDraft.risk);
  const sStop = Number(scaledDraft.stop);
  const sTake = scaledDraft.take.trim() ? Number(scaledDraft.take) : null;
  const sCount = clamp(Math.round(Number(scaledDraft.count) || MIN_GRID_ORDERS), MIN_GRID_ORDERS, MAX_GRID_ORDERS);
  const sUpper = scaledDraft.upper.trim() ? Number(scaledDraft.upper) : null;
  const sLower = scaledDraft.lower.trim() ? Number(scaledDraft.lower) : null;
  const sDirection = screenPrice != null ? impliedDirection(null, sLower ?? sUpper ?? 0, sUpper, screenPrice) : null;
  // Диапазон на оба поля — ВСЕГДА симметричный ±7% вокруг цены, тем же
  // приёмом, что и у стопа в Market (там слайдер тоже всегда −100…100): каждая
  // граница крутится в обе стороны от цены независимо от того, куда уже
  // сдвинута другая. Сужать его по sDirection нельзя — direction сам
  // считается по уже введённой границе, и узкий с первого же движения
  // диапазон запирал бы вторую, ещё нетронутую границу в ту же сторону,
  // хотя вторая может стоять и по другую сторону цены (лесенка входов ниже
  // цены для лонга, выше — для шорта, но сама эта сторона решается ПОСЛЕ,
  // не до). Направление, которое эти границы уже задали, сужает только стоп
  // и тейк сетки ниже — они вторичны по отношению к границам входа, как тейк
  // вторичен по отношению к стопу в Market.
  const sRange = screenPrice != null ? levelSliderRange('stop', screenPrice, null) : null;
  const sUpperVal = sRange ? clamp(sUpper ?? screenPrice!, sRange.min, sRange.max) : null;
  const sLowerVal = sRange ? clamp(sLower ?? screenPrice!, sRange.min, sRange.max) : null;
  const sUpperPos =
    sRange && sUpperVal != null && screenPrice != null ? curvedSliderPos(sUpperVal, sRange.min, sRange.max, screenPrice) : null;
  const sLowerPos =
    sRange && sLowerVal != null && screenPrice != null ? curvedSliderPos(sLowerVal, sRange.min, sRange.max, screenPrice) : null;
  // Средняя точка входа сетки — если исполнятся оба уровня, это и есть цена,
  // от которой отсчитывается риск: тот же приём, что у screenPrice в Market,
  // только сама точка не рыночная, а середина верх/низ входа. Общий якорь на
  // стоп и тейк, не свой у каждого: levelSliderRange сама разводит их по
  // разные стороны от него (см. belowSide там же).
  const sAvgEntry = sUpperVal != null && sLowerVal != null ? (sUpperVal + sLowerVal) / 2 : null;
  const sStopAnchor = sAvgEntry ?? screenPrice;
  const sTakeAnchor = sAvgEntry ?? screenPrice;
  const sStopRange = sStopAnchor != null ? levelSliderRange('stop', sStopAnchor, sDirection) : null;
  const sStopVal = sStopRange && sStopAnchor != null ? clamp(sStop || sStopAnchor, sStopRange.min, sStopRange.max) : null;
  const sStopPos =
    sStopRange && sStopVal != null && sStopAnchor != null
      ? curvedSliderPos(sStopVal, sStopRange.min, sStopRange.max, sStopAnchor)
      : null;
  const sStopSliderMin = sStopRange && sStopAnchor != null && sStopRange.min === sStopAnchor ? 0 : -100;
  const sStopSliderMax = sStopRange && sStopAnchor != null && sStopRange.max === sStopAnchor ? 0 : 100;
  const sStopPct = sStopAnchor && sStop > 0 ? ((sStop - sStopAnchor) / sStopAnchor) * 100 : null;
  const sTakeRange = sTakeAnchor != null ? levelSliderRange('take', sTakeAnchor, sDirection) : null;
  const sTakeSet = sTake != null && sTake > 0;
  const sTakeVal = sTakeRange && sTakeAnchor != null ? clamp(sTake ?? sTakeAnchor, sTakeRange.min, sTakeRange.max) : null;
  const sTakePos =
    sTakeRange && sTakeVal != null && sTakeAnchor != null
      ? curvedSliderPos(sTakeVal, sTakeRange.min, sTakeRange.max, sTakeAnchor)
      : null;
  const sTakeSliderMin = sTakeRange && sTakeAnchor != null && sTakeRange.min === sTakeAnchor ? 0 : -100;
  const sTakeSliderMax = sTakeRange && sTakeAnchor != null && sTakeRange.max === sTakeAnchor ? 0 : 100;
  const sTakePct = sTakeAnchor ? (((sTakeSet ? sTake : sTakeAnchor) - sTakeAnchor) / sTakeAnchor) * 100 : null;
  const sTakeFits = !sTakeSet || sTakeAnchor == null || draftTakeFits(sStop, sTake, sTakeAnchor);
  // Реальные цены уровней — только для предпросмотра; те же самые пойдут на
  // сервер при отправке (см. onOpenScaled в SessionScreen).
  const sPrices =
    price != null && sUpperVal != null && sLowerVal != null
      ? gridPrices(Math.min(sLowerVal, sUpperVal), Math.max(sLowerVal, sUpperVal), sCount).map((p) => fromScreen(p, scale))
      : [];
  const sPreview =
    sPrices.length > 0 && sStop > 0 && sDirection
      ? previewGrid(balance, sRisk, sPrices, fromScreen(sStop, scale), leverage, sDirection)
      : null;
  const sTakeProfit =
    sPreview && sTakeSet && sTakeFits && sDirection
      ? gridTakeProfit(
          balance,
          sRisk,
          sPrices,
          fromScreen(sStop, scale),
          fromScreen(sTake, scale),
          sDirection,
        )
      : null;

  return (
    <div className="order-panel">
      <div className="panel-top">
        <div className="lev" ref={leverageRef}>
          <Button
            variant="none"
            className="lev-btn"
            aria-haspopup="listbox"
            aria-expanded={leverageOpen}
            aria-label={t('leverageLabel')}
            onClick={() => setLeverageOpen((v) => !v)}
          >
            {leverage}×<ChevronDown size={12} className="lev-caret" />
          </Button>
          <div className={cn('lev-menu', leverageOpen && 'open')} role="listbox" aria-label={t('leverageLabel')}>
            {LEVERAGE_OPTIONS.map((v) => (
              <Button
                key={v}
                variant="none"
                role="option"
                aria-selected={v === leverage}
                className={cn('lev-item', v === leverage && 'on')}
                onClick={() => {
                  setLeverageOpen(false);
                  onDraft({ ...draft, leverage: toInput(v) });
                  onLeverageCommit(v);
                }}
              >
                {v}×
              </Button>
            ))}
          </div>
        </div>
        <KeyValue label={t('balance')}>{formatPriceGrouped(balance)} USDT</KeyValue>
      </div>

      <Seg
        className="order-tabs"
        options={[
          { value: 'market' as const, label: t('orderTabMarket') },
          { value: 'limit' as const, label: t('orderTabLimit') },
          { value: 'scaled' as const, label: t('orderTabScaled') },
        ]}
        value={tab}
        onChange={onTab}
        ariaLabel={t('orderType')}
      />

      {tab === 'market' && (
        <>
      <Field
        label={
          <span className="fld-head">
            <span className="fld-left">
              <span className="fld-val"></span>
              <span>{t('risk')} {(risk || 0).toFixed(1)}%</span>
            </span>
            {riskUsd != null && <span className="fld-val">{formatPriceGrouped(riskUsd)} USDT</span>}
          </span>
        }
      >
        {() => (
          <Slider
            value={riskPos}
            min={0}
            max={100}
            step={0.25}
            onChange={(pos) => onDraft({ ...draft, risk: toInput(curvedSliderValue(pos, 0, maxRisk, 0)) })}
            aria-label={t('risk')}
          />
        )}
      </Field>

      <Field
        label={
          <span className="fld-head">
            <TakeTitle profit={takeProfit} />
            {takePct != null && <span className={cn('fld-val', !takeFits && 'neg')}>{fmtPctSigned(takePct)}</span>}
          </span>
        }
      >
        {() =>
          takeRange && takePos != null && screenPrice != null ? (
            <Slider
              value={takePos}
              min={takeSliderMin}
              max={takeSliderMax}
              step={0.5}
              disabled={levelsLocked}
              onChange={(pos) =>
                onDraft({ ...draft, take: pos === 0 ? '' : toInputPrice(curvedSliderValue(pos, takeRange.min, takeRange.max, screenPrice)) })
              }
              aria-label={t('take')}
            />
          ) : (
            <SliderSlot />
          )
        }
      </Field>
      <Field
        label={
          <span className="fld-head">
            <span>{t('stop')}</span>
            {stopPct != null && <span className="fld-val">{fmtPctSigned(stopPct)}</span>}
          </span>
        }
      >
        {() =>
          screenPrice != null && stopPos != null ? (
            <Slider
              value={stopPos}
              min={stopSliderMin}
              max={stopSliderMax}
              step={0.5}
              disabled={levelsLocked}
              onChange={(pos) => setStop(stopFromSignedPct(curvedSliderValue(pos, -STOP_RISK_PCT, STOP_RISK_PCT, 0), screenPrice))}
              aria-label={t('stop')}
            />
          ) : (
            <SliderSlot />
          )
        }
      </Field>

      <div className="size-preview">
        <KeyValue label={t('sizeCoin')}>{preview ? formatQty(Number(preview.qty.toFixed(3))) : '—'}</KeyValue>
        <KeyValue label={t('notionalLabel')}>{preview ? `${formatPriceGrouped(preview.notional)} USDT` : '—'}</KeyValue>
      </div>
      {hint && <p className="neg">{hint}</p>}

      <div className="order-actions">
        <Button variant="long" onClick={() => onOpen('long')} disabled={disabled || balance <= 0}>
          {t('long')}
        </Button>
        <Button variant="short" onClick={() => onOpen('short')} disabled={disabled || balance <= 0}>
          {t('short')}
        </Button>
      </div>
        </>
      )}

      {tab === 'limit' && (
        <>
          <Field
            label={
              <span className="fld-head">
                <span className="fld-left">
                  <span className="fld-val"></span>
                  <span>{t('risk')} {(lRisk || 0).toFixed(1)}%</span>
                </span>
                {riskAmount(balance, lRisk) != null && (
                  <span className="fld-val">{formatPriceGrouped(riskAmount(balance, lRisk)!)} USDT</span>
                )}
              </span>
            }
          >
            {() => (
              <Slider
                value={curvedSliderPos(clamp(lRisk || 0, 0, maxRisk), 0, maxRisk, 0)}
                min={0}
                max={100}
                step={0.25}
                onChange={(pos) => onLimitDraft({ ...limitDraft, risk: toInput(curvedSliderValue(pos, 0, maxRisk, 0)) })}
                aria-label={t('risk')}
              />
            )}
          </Field>

          <Field
            label={
              <span className="fld-head">
                <span>{t('entryPrice')}</span>
                {lEntrySignedPct != null && <span className="fld-val">{fmtPctSigned(-lEntrySignedPct)}</span>}
              </span>
            }
          >
            {(id) => (
              <>
                {lEntryPos != null && screenPrice != null && (
                  <Slider
                    value={lEntryPos}
                    min={-100}
                    max={100}
                    step={0.5}
                    onChange={(pos) =>
                      setLimitEntry(toInputPrice(stopFromSignedPct(curvedSliderValue(pos, -STOP_RISK_PCT, STOP_RISK_PCT, 0), screenPrice)))
                    }
                    aria-label={t('entryPrice')}
                  />
                )}
                <Input id={id} full inputMode="decimal" value={limitDraft.entry} onChange={setLimitEntryText} />
              </>
            )}
          </Field>

          <Field
            label={
              <span className="fld-head">
                <TakeTitle profit={lTakeProfit} />
                {lTakePct != null && <span className={cn('fld-val', !lTakeFits && 'neg')}>{fmtPctSigned(lTakePct)}</span>}
              </span>
            }
          >
            {() =>
              lTakeRange &&
              lTakePos != null &&
              lAnchor != null && (
                <Slider
                  value={lTakePos}
                  min={lTakeSliderMin}
                  max={lTakeSliderMax}
                  step={0.5}
                  onChange={(pos) =>
                    onLimitDraft({
                      ...limitDraft,
                      take: pos === 0 ? '' : toInputPrice(curvedSliderValue(pos, lTakeRange.min, lTakeRange.max, lAnchor)),
                    })
                  }
                  aria-label={t('take')}
                />
              )
            }
          </Field>
          <Field
            label={
              <span className="fld-head">
                <span>{t('stop')}</span>
                {lStopPct != null && <span className="fld-val">{fmtPctSigned(lStopPct)}</span>}
              </span>
            }
          >
            {() =>
              lStopRange &&
              lStopPos != null &&
              lAnchor != null && (
                <Slider
                  value={lStopPos}
                  min={lStopSliderMin}
                  max={lStopSliderMax}
                  step={0.5}
                  onChange={(pos) =>
                    onLimitDraft({ ...limitDraft, stop: toInputPrice(curvedSliderValue(pos, lStopRange.min, lStopRange.max, lAnchor)) })
                  }
                  aria-label={t('stop')}
                />
              )
            }
          </Field>

          <div className="size-preview">
            <KeyValue label={t('sizeCoin')}>{lPreview ? formatQty(Number(lPreview.qty.toFixed(3))) : '—'}</KeyValue>
            <KeyValue label={t('notionalLabel')}>{lPreview ? `${formatPriceGrouped(lPreview.notional)} USDT` : '—'}</KeyValue>
          </div>
          {limitHint && <p className="neg">{limitHint}</p>}

          <div className="order-actions">
            <Button variant="long" onClick={() => onOpenLimit('long')} disabled={disabled || balance <= 0}>
              {t('long')}
            </Button>
            <Button variant="short" onClick={() => onOpenLimit('short')} disabled={disabled || balance <= 0}>
              {t('short')}
            </Button>
          </div>
        </>
      )}

      {tab === 'scaled' && (
        <>
          <Field
            label={
              <span className="fld-head">
                <span className="fld-left">
                  <span className="fld-val"></span>
                  <span>{t('risk')} {(sRisk || 0).toFixed(1)}%</span>
                </span>
                {riskAmount(balance, sRisk) != null && (
                  <span className="fld-val">{formatPriceGrouped(riskAmount(balance, sRisk)!)} USDT</span>
                )}
              </span>
            }
          >
            {() => (
              <Slider
                value={curvedSliderPos(clamp(sRisk || 0, 0, maxRisk), 0, maxRisk, 0)}
                min={0}
                max={100}
                step={0.25}
                onChange={(pos) => onScaledDraft({ ...scaledDraft, risk: toInput(curvedSliderValue(pos, 0, maxRisk, 0)) })}
                aria-label={t('risk')}
              />
            )}
          </Field>

          <Field label={t('entryUpper')}>
            {() =>
              sRange &&
              sUpperPos != null &&
              screenPrice != null && (
                <Slider
                  value={sUpperPos}
                  min={-100}
                  max={100}
                  step={0.5}
                  onChange={(pos) =>
                    onScaledDraft({ ...scaledDraft, upper: toInputPrice(curvedSliderValue(pos, sRange.min, sRange.max, screenPrice)) })
                  }
                  aria-label={t('entryUpper')}
                />
              )
            }
          </Field>
          <Field label={t('entryLower')}>
            {() =>
              sRange &&
              sLowerPos != null &&
              screenPrice != null && (
                <Slider
                  value={sLowerPos}
                  min={-100}
                  max={100}
                  step={0.5}
                  onChange={(pos) =>
                    onScaledDraft({ ...scaledDraft, lower: toInputPrice(curvedSliderValue(pos, sRange.min, sRange.max, screenPrice)) })
                  }
                  aria-label={t('entryLower')}
                />
              )
            }
          </Field>
          <Field
            label={
              <span className="fld-head">
                <TakeTitle profit={sTakeProfit} />
                {sTakePct != null && <span className={cn('fld-val', !sTakeFits && 'neg')}>{fmtPctSigned(sTakePct)}</span>}
              </span>
            }
          >
            {() =>
              sTakeRange &&
              sTakePos != null &&
              sTakeAnchor != null && (
                <Slider
                  value={sTakePos}
                  min={sTakeSliderMin}
                  max={sTakeSliderMax}
                  step={0.5}
                  onChange={(pos) =>
                    onScaledDraft({
                      ...scaledDraft,
                      take: pos === 0 ? '' : toInputPrice(curvedSliderValue(pos, sTakeRange.min, sTakeRange.max, sTakeAnchor)),
                    })
                  }
                  aria-label={t('take')}
                />
              )
            }
          </Field>
          <Field
            label={
              <span className="fld-head">
                <span>{t('stop')}</span>
                {sStopPct != null && <span className="fld-val">{fmtPctSigned(sStopPct)}</span>}
              </span>
            }
          >
            {() =>
              sStopRange &&
              sStopPos != null &&
              sStopAnchor != null && (
                <Slider
                  value={sStopPos}
                  min={sStopSliderMin}
                  max={sStopSliderMax}
                  step={0.5}
                  onChange={(pos) =>
                    onScaledDraft({ ...scaledDraft, stop: toInputPrice(curvedSliderValue(pos, sStopRange.min, sStopRange.max, sStopAnchor)) })
                  }
                  aria-label={t('stop')}
                />
              )
            }
          </Field>

          <div className="size-preview">
            <KeyValue label={t('ordersCount')} control valueClassName="">
              <Input
                className="order-count"
                inputMode="numeric"
                value={scaledDraft.count}
                onChange={setScaled('count')}
                aria-label={t('ordersCount')}
              />
            </KeyValue>
            <KeyValue label={t('gridAvgEntry')}>{sAvgEntry != null ? formatPriceGrouped(sAvgEntry, priceDecimals) : '—'}</KeyValue>
          </div>
          <div className="size-preview">
            <KeyValue label={t('sizeCoin')}>{sPreview ? formatQty(Number(sPreview.qty.toFixed(3))) : '—'}</KeyValue>
            <KeyValue label={t('notionalLabel')}>{sPreview ? `${formatPriceGrouped(sPreview.notional)} USDT` : '—'}</KeyValue>
          </div>
          {scaledHint && <p className="neg">{scaledHint}</p>}

          <div className="order-actions">
            <Button variant="long" onClick={() => onOpenScaled('long')} disabled={disabled || balance <= 0}>
              {t('long')}
            </Button>
            <Button variant="short" onClick={() => onOpenScaled('short')} disabled={disabled || balance <= 0}>
              {t('short')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
