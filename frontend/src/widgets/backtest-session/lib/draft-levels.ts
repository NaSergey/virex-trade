import type { OrderTab } from '../components/OrderPanel';
import type { Level } from '../components/ReplayChart';
import type { Direction } from './fills';
import { draftTakeFits, fromScreen, gridPrices, impliedDirection, levelMove, previewSize } from './money';
import { entryGridTable, gridOrderCount } from './level-table';

/** Черновики панели ордера числами: то, что уже разобрано из её полей. */
export interface DraftLevelsInput {
  /** Открытая вкладка тикета — рисуется только её черновик. */
  tab: OrderTab;
  /** «Маркет» — уже без уровней занятых сторон (`withoutLockedLevels`). */
  market: { stop: number; take: number | null; risk: number };
  limit: { entry: number | null; stop: number; take: number | null; risk: number };
  scaled: {
    upper: number | null;
    lower: number | null;
    stop: number;
    take: number | null;
    count: number;
    risk: number;
    /** Закрепления долей по номеру уровня — как в таблице панели. */
    qtyPins: Record<number, number>;
    /** Распределение объёма по цене (−100…100). */
    tilt: number;
  };
  /** Черновик грид-бота; null — бот работает или вкладки нет. */
  bot?: { upper: number | null; lower: number | null; stop: number; count: number } | null;
  /** Настоящая цена и она же в экранных единицах; null — цены ещё нет. */
  livePrice: number | null;
  screenPrice: number | null;
  balance: number;
  leverage: number;
  scale: number;
}

/**
 * Линии черновика следующего ордера на графике — общие у терминала бектеста и
 * биржевого: панель ордера у них одна, и её черновик обязан выглядеть на
 * графике одинаково.
 *
 * В списке уровней они идут ПЕРВЫМИ: SVG рисует последующее поверх, и там,
 * где черновая линия легла рядом с уровнем открытой сделки, захват достаётся
 * сделке. Иначе жест «подвинуть стоп позиции» тянул бы черновик панели.
 *
 * Рисуется только черновик ОТКРЫТОЙ вкладки тикета: у каждой свои стоп и
 * тейк, и линии закрытых вкладок висели бы на графике уровнями ордера,
 * которого никто не собирается отправлять.
 */
export function draftLevels({ tab, market, limit, scaled, bot, livePrice, screenPrice, balance, leverage, scale }: DraftLevelsInput): Level[] {
  const list: Level[] = [];

  if (tab === 'market' && market.stop > 0 && livePrice != null && screenPrice != null) {
    list.push({
      id: 'draft-stop',
      kind: 'stop',
      price: market.stop,
      draggable: true,
      qty: previewSize(balance, market.risk, livePrice, fromScreen(market.stop, scale), leverage, 'long')?.qty,
      // Размер позиции зависит от самого стопа, а сторона — от того, по какую
      // сторону цены он стоит: на цене под курсором считается и то и другое.
      impactAt: (p) => {
        const dir = p < screenPrice ? 'long' : 'short';
        const qty = previewSize(balance, market.risk, livePrice, fromScreen(p, scale), leverage, dir)?.qty;
        return qty != null ? levelMove(dir, livePrice, fromScreen(p, scale), qty) : null;
      },
    });
  }
  // Тейк не по ту сторону цены не рисуется вовсе: подпись «тейк −2.68 USDT» под
  // стопом — не цель сделки, а противоречие. Проверка здесь, а не только в правках:
  // черновик хранит цены, и цена прокрутки выводит тейк из строя сама, без действия
  // пользователя. Значение в поле остаётся, линия вернётся, как только тейк снова верен.
  if (
    tab === 'market' &&
    market.take != null &&
    market.take > 0 &&
    livePrice != null &&
    screenPrice != null &&
    draftTakeFits(market.stop, market.take, screenPrice)
  ) {
    const stop = market.stop;
    const qty = stop > 0 ? previewSize(balance, market.risk, livePrice, fromScreen(stop, scale), leverage, 'long')?.qty : null;
    list.push({
      id: 'draft-take',
      kind: 'take',
      price: market.take,
      draggable: true,
      qty: qty ?? undefined,
      impactAt: (p) => {
        const dir = impliedDirection(null, stop, p, screenPrice);
        return dir != null && qty != null ? levelMove(dir, livePrice, fromScreen(p, scale), qty) : null;
      },
    });
  }

  // Черновик одиночного лимита: своя цена входа плюс стоп и тейк,
  // которые считаются от неё, а не от рыночной цены (см. lAnchor в OrderPanel).
  if (tab === 'limit' && livePrice != null && screenPrice != null) {
    const entryReal = limit.entry != null && limit.entry > 0 ? fromScreen(limit.entry, scale) : null;
    // Результат уровня — от цены самого лимита: сделка откроется по ней.
    const limitQty =
      entryReal != null && limit.stop > 0
        ? previewSize(balance, limit.risk, entryReal, fromScreen(limit.stop, scale), leverage, 'long')?.qty
        : undefined;
    if (limit.entry != null && limit.entry > 0) {
      list.push({ id: 'draft-limit-entry', kind: 'limitEntry', price: limit.entry, draggable: true, qty: limitQty });
    }
    const impactAt = (p: number) => {
      if (entryReal == null) return null;
      const levelReal = fromScreen(p, scale);
      const dir = levelReal < entryReal ? 'long' : 'short';
      const qty = previewSize(balance, limit.risk, entryReal, levelReal, leverage, dir)?.qty;
      return qty != null ? levelMove(dir, entryReal, levelReal, qty) : null;
    };
    if (limit.stop > 0) list.push({ id: 'draft-limit-stop', kind: 'stop', price: limit.stop, draggable: true, qty: limitQty, impactAt });
    // Якорь тейка — цена входа, а пока её не задали, текущая цена: тот же приём,
    // что и у lAnchor в OrderPanel (см. его комментарий). Без этого падения на
    // цену тейк, поставленный раньше входа, не показывался бы вовсе — хотя стоп
    // выше уже не требует входа для показа.
    const lAnchor = limit.entry != null && limit.entry > 0 ? limit.entry : screenPrice;
    if (limit.take != null && limit.take > 0 && draftTakeFits(limit.stop, limit.take, lAnchor)) {
      // Объём тейка — от стопа ордера, а не от самого тейка (как у «Маркета»): с общим
      // `impactAt` тейк считался стопом и подписывался минус риском (найдено 2026-10-17).
      const takeAt = (p: number) => {
        const dir = impliedDirection(null, limit.stop, p, lAnchor);
        return dir != null && entryReal != null && limitQty != null ? levelMove(dir, entryReal, fromScreen(p, scale), limitQty) : null;
      };
      list.push({ id: 'draft-limit-take', kind: 'take', price: limit.take, draggable: true, qty: limitQty, impactAt: takeAt });
    }
  }
  // Черновик сетки на вход (Scaled) — до отправки просто верх/низ диапазона,
  // без отдельных уровней: их сервер разложит равномерно только на отправке.
  // Граница рисуется только тронутая: обе, прибитые к текущей цене, ложились
  // бы двумя подписанными линиями поверх свечей у всякого, кто просто открыл
  // вкладку и ничего ещё не решил.
  if (tab === 'scaled' && livePrice != null) {
    const count = gridOrderCount(scaled.count);
    // Цены ордеров — те же, что уйдут на сервер (`gridPrices`), в настоящих единицах.
    const pricesReal =
      scaled.upper != null && scaled.lower != null
        ? gridPrices(Math.min(scaled.lower, scaled.upper), Math.max(scaled.lower, scaled.upper), count).map((p) => fromScreen(p, scale))
        : [];
    // Сторона — как у панели (`sDirection`): ордера ниже цены — лонг. По стопу её не
    // выбрать: стоп, заехавший внутрь сетки, перевернул бы знаки подписей. Без цены — по стопу.
    const side = screenPrice != null ? impliedDirection(null, scaled.lower ?? scaled.upper ?? 0, scaled.upper, screenPrice) : null;
    // Таблица сетки при данном стопе — та же, что у панели и отправки (доли, закрепления
    // по строкам исполнения, распределение). Объём считается от стопа: без него таблицы нет.
    const tableAt = (stopReal: number) => {
      if (pricesReal.length === 0 || !(stopReal > 0) || !(scaled.risk > 0)) return null;
      const direction: Direction = side ?? (stopReal < Math.min(...pricesReal) ? 'long' : 'short');
      const { rows } = entryGridTable({
        prices: pricesReal,
        direction,
        stop: stopReal,
        riskPct: scaled.risk,
        balance,
        qtyPins: scaled.qtyPins,
        stopTargets: {},
        stopFollow: false,
        tilt: scaled.tilt,
      });
      return { direction, rows };
    };
    const table = tableAt(scaled.stop > 0 ? fromScreen(scaled.stop, scale) : 0);
    // Объём каждого ордера — из таблицы. Ордер ближе всего к линии получает её объём.
    const qtyAt = (screenPrice: number): number | undefined => {
      if (!table) return undefined;
      const target = fromScreen(screenPrice, scale);
      let best: { d: number; qty: number } | null = null;
      for (const r of table.rows) {
        const d = Math.abs(r.price - target);
        if (!best || d < best.d) best = { d, qty: r.qty };
      }
      return best?.qty;
    };
    if (scaled.upper != null && scaled.upper > 0) {
      list.push({ id: 'draft-grid-upper', kind: 'gridUpper', price: scaled.upper, draggable: true, qty: qtyAt(scaled.upper) });
    }
    if (scaled.lower != null && scaled.lower > 0) {
      list.push({ id: 'draft-grid-lower', kind: 'gridLower', price: scaled.lower, draggable: true, qty: qtyAt(scaled.lower) });
    }
    // Ордера между верхом и низом — те же цены, что уйдут на сервер (`gridPrices`), по одной
    // линии без захвата: двигается диапазон, а не промежуточный ордер. Края уже нарисованы выше.
    if (scaled.upper != null && scaled.upper > 0 && scaled.lower != null && scaled.lower > 0 && count > 2) {
      const steps = gridPrices(Math.min(scaled.lower, scaled.upper), Math.max(scaled.lower, scaled.upper), count).slice(1, -1);
      steps.forEach((price, i) => list.push({ id: `draft-grid-step-${i}`, kind: 'gridStep', price, draggable: false, qty: qtyAt(price) }));
    }
    // Стоп и тейк сетки — на весь её результат при полном исполнении: ход цены до
    // уровня по каждому ордеру таблицы, без комиссии (`levelMove`). У стопа объём
    // считается от цены под курсором — его и тянут, подпись — ровно риск панели; у
    // тейка — от стопа сетки. Тейк здесь стоял с объёмом «от самого тейка», будто он
    // стоп, и подписывался минус риском при любом распределении (найдено 2026-10-17).
    const moveAt = (t: ReturnType<typeof tableAt>, levelReal: number) =>
      t ? t.rows.reduce((sum, r) => sum + levelMove(t.direction, r.price, levelReal, r.qty), 0) : null;
    if (scaled.stop > 0) {
      list.push({
        id: 'draft-grid-stop',
        kind: 'stop',
        price: scaled.stop,
        draggable: true,
        impactAt: (p) => moveAt(tableAt(fromScreen(p, scale)), fromScreen(p, scale)),
      });
    }
    if (scaled.take != null && scaled.take > 0) {
      list.push({ id: 'draft-grid-take', kind: 'take', price: scaled.take, draggable: true, impactAt: (p) => moveAt(table, fromScreen(p, scale)) });
    }
  }

  // Черновик грид-бота: верх и низ тянутся, промежуточные покупки — без захвата
  // (двигается диапазон, а не отдельный уровень), стоп тянется.
  if (tab === 'bot' && bot && livePrice != null) {
    const { upper, lower, stop, count } = bot;
    if (upper != null && upper > 0) list.push({ id: 'draft-bot-upper', kind: 'gridUpper', price: upper, draggable: true });
    if (lower != null && lower > 0) list.push({ id: 'draft-bot-lower', kind: 'gridLower', price: lower, draggable: true });
    if (upper != null && lower != null && upper > lower && count >= 2) {
      const step = (upper - lower) / count;
      for (let j = 1; j < count; j++) {
        list.push({ id: `draft-bot-step-${j}`, kind: 'gridStep', price: lower + j * step, draggable: false });
      }
    }
    if (stop > 0) list.push({ id: 'draft-bot-stop', kind: 'stop', price: stop, draggable: true });
  }

  return list;
}
