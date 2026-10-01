import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { BybitApiKeyService } from '../bybit/services/bybit-api-key.service';
import { BybitCredentials } from '../bybit/services/bybit-auth.service';
import { CredentialsService } from '../credentials/credentials.service';
import { BybitTerminalClient } from './bybit-terminal.client';
import { CloseGridDto, ClosePositionDto, MoveOrderDto, PlaceOrderDto, SetLevelsDto } from './dto/terminal.dto';
import {
  gridPartial,
  oppositePosition,
  positionNotFound,
  qtyTooLarge,
  qtyTooSmall,
  stopRequired,
  stopSide,
  takeSide,
} from './terminal-errors';
import {
  closeSide,
  entrySide,
  floorToStep,
  levelsError,
  modeOf,
  positionIdxOf,
  qtyByRisk,
  roundToTick,
  stepDecimals,
  toOrder,
  toPosition,
  type Direction,
  type Instrument,
  type TerminalOrder,
  type TerminalPosition,
} from './terminal-math';
import { TerminalMarketService } from './terminal-market.service';

/** Почему терминала нет — фронт переводит причину по ключу. */
export type AccessReason = 'NO_EXCHANGE' | 'NOT_BYBIT' | 'READ_ONLY' | 'UNKNOWN';

export interface TerminalAccess {
  available: boolean;
  reason: AccessReason | null;
  exchange: string | null;
}

/** Bybit: «плечо уже такое» — не отказ. */
const LEVERAGE_NOT_MODIFIED = 110043;
/** Bybit: «стоп и тейк уже такие» — не отказ. */
const LEVELS_NOT_MODIFIED = 34040;
/** Bybit: «ордера уже нет» — он исполнен или снят, и отменять больше нечего. */
const ORDER_GONE = 110001;
/** Страниц открытых ордеров за один снимок: двести ордеров — больше, чем ставят руками. */
const ORDER_PAGES = 4;

const reasonOf = (e: unknown): string => {
  if (e instanceof HttpException) {
    const body = e.getResponse();
    if (typeof body === 'object' && body && 'message' in body) return String((body as { message: unknown }).message);
    return e.message;
  }
  return e instanceof Error ? e.message : String(e);
};

/**
 * Биржевой терминал: торговля на Bybit ключом пользователя.
 *
 * Своего исполнения здесь нет — ордер уходит на биржу, и дальше стопы, тейки и
 * лимиты исполняет она. Сервер делает то, что браузеру доверять нельзя:
 * считает объём от риска по свежим балансу и цене, выбирает `positionIdx` по
 * режиму аккаунта и подгоняет числа к шагам инструмента.
 *
 * Работает только с Bybit: это единственная биржа, у которой читаются права
 * ключа и написан торговый слой.
 */
@Injectable()
export class TerminalService {
  private readonly logger = new Logger(TerminalService.name);

  constructor(
    private readonly credentials: CredentialsService,
    private readonly bybit: BybitTerminalClient,
    private readonly market: TerminalMarketService,
    private readonly apiKeys: BybitApiKeyService,
  ) {}

  /**
   * Показывать ли терминал: активная биржа — Bybit, и её ключ умеет ставить
   * ордера. «Биржа не сказала» — не доступ: терминал, в котором каждый ордер
   * отклоняется, хуже отсутствующего пункта меню.
   */
  async access(userId: string): Promise<TerminalAccess> {
    const exchange = await this.credentials.activeExchange(userId);
    if (!exchange) return { available: false, reason: 'NO_EXCHANGE', exchange: null };
    if (exchange !== 'bybit') return { available: false, reason: 'NOT_BYBIT', exchange };
    const creds = await this.credentials.get(userId, 'bybit');
    if (!creds) return { available: false, reason: 'NO_EXCHANGE', exchange: null };
    const info = await this.apiKeys.getApiKeyInfo(creds);
    if (!info.success) return { available: false, reason: 'UNKNOWN', exchange };
    return info.canPlaceOrders
      ? { available: true, reason: null, exchange }
      : { available: false, reason: 'READ_ONLY', exchange };
  }

  /** Всё, что экран показывает о счёте: баланс, позиции и висящие лимиты — одним снимком. */
  async state(userId: string) {
    const creds = await this.creds(userId);
    const [wallet, positions, orders] = await Promise.all([
      this.wallet(creds),
      this.bybit.privateGet(creds, '/position/list', { category: 'linear', settleCoin: 'USDT', limit: '200' }),
      this.openOrders(creds),
    ]);
    return {
      serverTime: new Date().toISOString(),
      ...wallet,
      positions: ((positions.list ?? []) as unknown[]).map(toPosition).filter((p): p is TerminalPosition => p != null),
      orders,
    };
  }

  /**
   * Ордер на вход: рыночный, лимит или сетка лимитов.
   *
   * Объём считает сервер — от риска и расстояния до стопа, по балансу и цене
   * этой секунды, вниз до шага лота. Присланного браузером объёма нет вовсе:
   * число на экране — предпросмотр.
   *
   * Если позиция этой стороны уже открыта и у неё стоит стоп, ордер её
   * доливает: объём — от её стопа, а стоп и тейк к ордеру не прикладываются,
   * иначе они заменили бы уровни позиции. То же правило, что в бектесте.
   */
  async placeOrders(userId: string, dto: PlaceOrderDto) {
    const limit = dto.kind === 'limit';
    if (limit && !dto.prices?.length) throw new BadRequestException('Лимитному ордеру нужна цена');

    const creds = await this.creds(userId);
    const inst = await this.market.requireInstrument(dto.symbol);
    const [wallet, rows, last] = await Promise.all([
      this.wallet(creds),
      this.positionRows(creds, dto.symbol),
      limit ? null : this.market.lastPrice(dto.symbol),
    ]);

    const mode = modeOf(rows);
    const open = rows.map(toPosition).filter((p): p is TerminalPosition => p != null);
    // В one-way противоположный ордер не открывает вторую позицию, а режет
    // первую: стоп «шорта» лёг бы на лонг, и размер от риска потерял бы смысл.
    if (mode === 'oneWay' && open.some((p) => p.direction !== dto.direction)) throw oppositePosition(dto.symbol);

    const ownStop = open.find((p) => p.direction === dto.direction)?.stopLoss ?? null;
    const stop = ownStop ?? dto.stopLoss ?? null;
    if (stop == null) throw stopRequired();
    const attach = ownStop == null;
    const take = attach ? (dto.takeProfit ?? null) : null;

    // Сначала считается всё, потом отправляется: сетка, у которой третий
    // уровень не проходит по размеру, не должна оставить на бирже первые два.
    const entries = limit ? dto.prices! : [last!];
    const plan = entries.map((entry) => {
      const err = levelsError(dto.direction, entry, stop, take);
      if (err) throw err === 'stopSide' ? stopSide() : takeSide();
      const qty = floorToStep(qtyByRisk(wallet.balance, dto.riskPct, entry, stop) ?? 0, inst.qtyStep);
      const n = Number(qty);
      if (!(n >= inst.minQty) || n * entry < inst.minNotional) throw qtyTooSmall(dto.symbol, String(inst.minQty));
      const max = limit ? inst.maxQty : inst.maxMarketQty;
      if (n > max) throw qtyTooLarge(dto.symbol, String(max));
      return { entry, qty };
    });

    if (dto.leverage != null) await this.applyLeverage(creds, inst, dto.leverage);

    const placed: { orderId: string; price: number | null; qty: number }[] = [];
    for (const p of plan) {
      const body: Record<string, string | number | boolean> = {
        category: 'linear',
        symbol: dto.symbol,
        side: entrySide(dto.direction),
        orderType: limit ? 'Limit' : 'Market',
        qty: p.qty,
        positionIdx: positionIdxOf(mode, dto.direction),
      };
      if (limit) {
        body.price = roundToTick(p.entry, inst.tickSize);
        body.timeInForce = 'GTC';
      }
      if (attach) {
        body.stopLoss = roundToTick(stop, inst.tickSize);
        if (take != null) body.takeProfit = roundToTick(take, inst.tickSize);
      }
      try {
        const result = await this.bybit.privatePost(creds, '/order/create', body);
        placed.push({ orderId: String(result.orderId), price: limit ? Number(body.price) : null, qty: Number(p.qty) });
      } catch (e) {
        if (placed.length === 0) throw e;
        this.logger.warn(`user ${userId}: grid ${dto.symbol} stopped at ${placed.length}/${plan.length}`);
        throw gridPartial(placed.length, plan.length, reasonOf(e));
      }
    }

    this.logger.log(`user ${userId}: ${dto.kind} ${dto.direction} ${dto.symbol} × ${placed.length}`);
    return { success: true, orders: placed };
  }

  /** Висящий лимит перенесён на графике: меняется цена, объём остаётся — как при правке ордера на бирже. */
  async moveOrder(userId: string, orderId: string, dto: MoveOrderDto) {
    const creds = await this.creds(userId);
    const inst = await this.market.requireInstrument(dto.symbol);
    await this.bybit.privatePost(creds, '/order/amend', {
      category: 'linear',
      symbol: dto.symbol,
      orderId,
      price: roundToTick(dto.price, inst.tickSize),
    });
    this.logger.log(`user ${userId}: move order ${dto.symbol}`);
    return { success: true };
  }

  async cancelOrder(userId: string, orderId: string, symbol: string) {
    const creds = await this.creds(userId);
    await this.market.requireInstrument(symbol);
    await this.bybit.privatePost(creds, '/order/cancel', { category: 'linear', symbol, orderId }, [ORDER_GONE]);
    this.logger.log(`user ${userId}: cancel order ${symbol}`);
    return { success: true };
  }

  /**
   * Стоп и тейк открытой позиции. Стоп терминал только ставит и двигает — снять
   * его нельзя, а не заданный остаётся как был; тейк без значения снимается
   * («0» у Bybit).
   *
   * Сторону уровней сервер не проверяет: стоп в безубытке стоит по «неверную»
   * сторону от входа, а верную — относительно цены этой секунды — знает биржа,
   * и отказ придёт её словами.
   */
  async setLevels(userId: string, dto: SetLevelsDto) {
    const creds = await this.creds(userId);
    const inst = await this.market.requireInstrument(dto.symbol);
    const row = await this.positionRow(creds, dto.symbol, dto.direction);
    const body: Record<string, string | number | boolean> = {
      category: 'linear',
      symbol: dto.symbol,
      // Индекс самой позиции, а не выведенный из режима: он точен по построению.
      positionIdx: Number(row.positionIdx) || 0,
      tpslMode: 'Full',
      takeProfit: dto.takeProfit != null ? roundToTick(dto.takeProfit, inst.tickSize) : '0',
    };
    if (dto.stopLoss != null) body.stopLoss = roundToTick(dto.stopLoss, inst.tickSize);
    await this.bybit.privatePost(creds, '/position/trading-stop', body, [LEVELS_NOT_MODIFIED]);
    this.logger.log(`user ${userId}: levels ${dto.direction} ${dto.symbol}`);
    return { success: true };
  }

  /** Закрытие позиции целиком или частью — по рынку сейчас или лимитом (reduce-only). */
  async closePosition(userId: string, dto: ClosePositionDto) {
    const limit = dto.kind === 'limit';
    if (limit && dto.price == null) throw new BadRequestException('Лимитному закрытию нужна цена');

    const creds = await this.creds(userId);
    const inst = await this.market.requireInstrument(dto.symbol);
    const row = await this.positionRow(creds, dto.symbol, dto.direction);
    const size = parseFloat(row.size);

    // Вся позиция уходит строкой самой биржи: пересчёт через шаг лота мог бы
    // оставить пыль, которую потом нечем закрыть.
    let qty = String(row.size);
    if (dto.qty != null && dto.qty < size * (1 - 1e-9)) {
      qty = floorToStep(dto.qty, inst.qtyStep);
      if (!(Number(qty) >= inst.minQty)) throw qtyTooSmall(dto.symbol, String(inst.minQty));
    }

    const body: Record<string, string | number | boolean> = {
      category: 'linear',
      symbol: dto.symbol,
      side: closeSide(dto.direction),
      orderType: limit ? 'Limit' : 'Market',
      qty,
      positionIdx: Number(row.positionIdx) || 0,
      reduceOnly: true,
    };
    if (limit) {
      body.price = roundToTick(dto.price!, inst.tickSize);
      body.timeInForce = 'GTC';
    }
    const result = await this.bybit.privatePost(creds, '/order/create', body);
    this.logger.log(`user ${userId}: close ${dto.kind} ${dto.direction} ${dto.symbol}`);
    return { success: true, orderId: String(result.orderId) };
  }

  /**
   * Сетка фиксации: N reduce-only лимитов равными частями позиции, последний
   * забирает остаток деления. ЗАМЕНЯЕТ прежние лимиты закрытия позиции — иначе
   * сумма ордеров превысила бы её размер. То же правило, что в бектесте
   * (`createCloseGrid`), кроме «стопа за тейками»: там стоп двигает наш движок,
   * а здесь ордера исполняет биржа, и двигать его некому.
   *
   * Объёмы считаются до того, как что-либо снято: сетка, у которой часть
   * меньше минимального ордера, не должна оставить позицию без прежних лимитов.
   */
  async closeGrid(userId: string, dto: CloseGridDto) {
    const creds = await this.creds(userId);
    const inst = await this.market.requireInstrument(dto.symbol);
    const row = await this.positionRow(creds, dto.symbol, dto.direction);
    const size = parseFloat(row.size);
    const n = dto.prices.length;

    const part = floorToStep(size / n, inst.qtyStep);
    if (!(Number(part) >= inst.minQty)) throw qtyTooSmall(dto.symbol, String(inst.minQty));
    // Размер позиции и часть кратны шагу лота — остаток тоже; toFixed лишь снимает хвост double.
    const last = (size - Number(part) * (n - 1)).toFixed(stepDecimals(inst.qtyStep));

    const open = await this.bybit.privateGet(creds, '/order/realtime', {
      category: 'linear',
      symbol: dto.symbol,
      limit: '50',
    });
    const stale = ((open.list ?? []) as unknown[])
      .map(toOrder)
      .filter((o): o is TerminalOrder => o != null && o.kind === 'close' && o.direction === dto.direction);
    for (const o of stale) {
      await this.bybit.privatePost(
        creds,
        '/order/cancel',
        { category: 'linear', symbol: dto.symbol, orderId: o.id },
        [ORDER_GONE],
      );
    }

    let placed = 0;
    for (const [i, price] of dto.prices.entries()) {
      try {
        await this.bybit.privatePost(creds, '/order/create', {
          category: 'linear',
          symbol: dto.symbol,
          side: closeSide(dto.direction),
          orderType: 'Limit',
          qty: i === n - 1 ? last : part,
          price: roundToTick(price, inst.tickSize),
          timeInForce: 'GTC',
          positionIdx: Number(row.positionIdx) || 0,
          reduceOnly: true,
        });
        placed++;
      } catch (e) {
        if (placed === 0 && stale.length === 0) throw e;
        this.logger.warn(`user ${userId}: close grid ${dto.symbol} stopped at ${placed}/${n}`);
        throw gridPartial(placed, n, reasonOf(e));
      }
    }

    this.logger.log(`user ${userId}: close grid ${dto.direction} ${dto.symbol} × ${n}`);
    return { success: true };
  }

  private creds(userId: string): Promise<BybitCredentials> {
    return this.credentials.require(userId, 'bybit');
  }

  /**
   * Депозит — текущий: USDT кошелька вместе с нереализованным результатом
   * открытых позиций (`equity` у Bybit). От него считается риск и его же
   * показывает панель ордера (требование владельца 2026-09-30). Голый кошелёк
   * при позициях в минусе завышал депозит — и объём «от одного процента» брался
   * от денег, которых на счёте уже нет. Нет `equity` — складываем сами.
   *
   * Свободные средства биржа отдаёт только на весь счёт, в долларах.
   */
  private async wallet(creds: BybitCredentials): Promise<{ balance: number; available: number | null }> {
    const result = await this.bybit.privateGet(creds, '/account/wallet-balance', { accountType: 'UNIFIED' });
    const account = result.list?.[0];
    const usdt = account?.coin?.find((c: { coin?: string }) => c.coin === 'USDT');
    const equity = parseFloat(usdt?.equity ?? '');
    const wallet = parseFloat(usdt?.walletBalance ?? '') || 0;
    const open = parseFloat(usdt?.unrealisedPnl ?? '') || 0;
    const available = parseFloat(account?.totalAvailableBalance ?? '');
    return {
      balance: Number.isFinite(equity) ? equity : wallet + open,
      available: Number.isFinite(available) ? available : null,
    };
  }

  /** Строки позиций одного символа: биржа отдаёт их и без открытой позиции — по ним виден режим. */
  private async positionRows(creds: BybitCredentials, symbol: string): Promise<any[]> {
    const result = await this.bybit.privateGet(creds, '/position/list', { category: 'linear', symbol });
    return result.list ?? [];
  }

  private async positionRow(creds: BybitCredentials, symbol: string, direction: Direction): Promise<any> {
    const rows = await this.positionRows(creds, symbol);
    const row = rows.find((r) => toPosition(r)?.direction === direction);
    if (!row) throw positionNotFound();
    return row;
  }

  private async openOrders(creds: BybitCredentials): Promise<TerminalOrder[]> {
    const orders: TerminalOrder[] = [];
    let cursor = '';
    for (let page = 0; page < ORDER_PAGES; page++) {
      const params: Record<string, string> = { category: 'linear', settleCoin: 'USDT', limit: '50' };
      if (cursor) params.cursor = cursor;
      const result = await this.bybit.privateGet(creds, '/order/realtime', params);
      for (const row of result.list ?? []) {
        const order = toOrder(row);
        if (order) orders.push(order);
      }
      cursor = result.nextPageCursor || '';
      if (!cursor) break;
    }
    return orders;
  }

  /**
   * Плечо перед ордером — в границах инструмента. Отказ ордер не останавливает:
   * риск задаёт расстояние до стопа, а плечо — только маржу; если её не хватит,
   * об этом скажет сам ордер.
   */
  private async applyLeverage(creds: BybitCredentials, inst: Instrument, leverage: number): Promise<void> {
    const lev = String(Math.min(inst.maxLeverage, Math.max(inst.minLeverage, leverage)));
    try {
      await this.bybit.privatePost(
        creds,
        '/position/set-leverage',
        { category: 'linear', symbol: inst.symbol, buyLeverage: lev, sellLeverage: lev },
        [LEVERAGE_NOT_MODIFIED],
      );
    } catch (e) {
      this.logger.warn(`leverage ${inst.symbol} ${lev}×: ${reasonOf(e)}`);
    }
  }
}
