import type { OrderTab } from '../components/OrderPanel';
import type { Level } from '../components/ReplayChart';
import { draftTakeFits, fromScreen, gridPrices, impliedDirection, levelImpact, previewGrid, previewSize } from './money';

/** Черновики панели ордера числами: то, что уже разобрано из её полей. */
export interface DraftLevelsInput {
  /** Открытая вкладка тикета — рисуется только её черновик. */
  tab: OrderTab;
  /** «Маркет» — уже без уровней занятых сторон (`withoutLockedLevels`). */
  market: { stop: number; take: number | null; risk: number };
  limit: { entry: number | null; stop: number; take: number | null; risk: number };
  scaled: { upper: number | null; lower: number | null; stop: number; take: number | null; count: number; risk: number };
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
export function draftLevels({ tab, market, limit, scaled, livePrice, screenPrice, balance, leverage, scale }: DraftLevelsInput): Level[] {
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
        return qty != null ? levelImpact(dir, livePrice, fromScreen(p, scale), qty).usdt : null;
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
        return dir != null && qty != null ? levelImpact(dir, livePrice, fromScreen(p, scale), qty).usdt : null;
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
      return qty != null ? levelImpact(dir, entryReal, levelReal, qty).usdt : null;
    };
    if (limit.stop > 0) list.push({ id: 'draft-limit-stop', kind: 'stop', price: limit.stop, draggable: true, qty: limitQty, impactAt });
    // Якорь тейка — цена входа, а пока её не задали, текущая цена: тот же приём,
    // что и у lAnchor в OrderPanel (см. его комментарий). Без этого падения на
    // цену тейк, поставленный раньше входа, не показывался бы вовсе — хотя стоп
    // выше уже не требует входа для показа.
    const lAnchor = limit.entry != null && limit.entry > 0 ? limit.entry : screenPrice;
    if (limit.take != null && limit.take > 0 && draftTakeFits(limit.stop, limit.take, lAnchor)) {
      list.push({ id: 'draft-limit-take', kind: 'take', price: limit.take, draggable: true, qty: limitQty, impactAt });
    }
  }
  // Черновик сетки на вход (Scaled) — до отправки просто верх/низ диапазона,
  // без отдельных уровней: их сервер разложит равномерно только на отправке.
  // Граница рисуется только тронутая: обе, прибитые к текущей цене, ложились
  // бы двумя подписанными линиями поверх свечей у всякого, кто просто открыл
  // вкладку и ничего ещё не решил.
  if (tab === 'scaled' && livePrice != null) {
    if (scaled.upper != null && scaled.upper > 0) {
      list.push({ id: 'draft-grid-upper', kind: 'gridUpper', price: scaled.upper, draggable: true });
    }
    if (scaled.lower != null && scaled.lower > 0) {
      list.push({ id: 'draft-grid-lower', kind: 'gridLower', price: scaled.lower, draggable: true });
    }
    // Стоп и тейк сетки — на весь её результат, поэтому и считаются от
    // среднего входа при полном исполнении (previewGrid), а не от одного уровня.
    const pricesReal =
      scaled.upper != null && scaled.lower != null
        ? gridPrices(Math.min(scaled.lower, scaled.upper), Math.max(scaled.lower, scaled.upper), scaled.count).map((p) => fromScreen(p, scale))
        : [];
    const impactAt = (p: number) => {
      if (pricesReal.length === 0) return null;
      const levelReal = fromScreen(p, scale);
      const dir = levelReal < Math.min(...pricesReal) ? 'long' : 'short';
      const grid = previewGrid(balance, scaled.risk, pricesReal, levelReal, leverage, dir);
      return grid ? levelImpact(dir, grid.avgEntry, levelReal, grid.qty).usdt : null;
    };
    if (scaled.stop > 0) list.push({ id: 'draft-grid-stop', kind: 'stop', price: scaled.stop, draggable: true, impactAt });
    if (scaled.take != null && scaled.take > 0) {
      list.push({ id: 'draft-grid-take', kind: 'take', price: scaled.take, draggable: true, impactAt });
    }
  }

  return list;
}
