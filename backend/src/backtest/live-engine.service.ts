import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { LiveMarketService } from '../market-data/live-market.service';
import type { Candle } from '../market-data/market-data.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Direction } from './backtest-math';
import { BacktestService } from './backtest.service';
import { checkMinute, touchedEntries } from './fills';
import { barForTrade, buildSegments, type Bar, type Segment, type Snapshot } from './live-segments';

const MINUTE_MS = 60_000;

/**
 * Хранилище отдаёт свечи именованными полями, правила исполнения работают с
 * короткими `t/o/h/l/c` — теми же, что и в браузере, потому что `checkMinute`
 * перенесён оттуда без изменений.
 */
/** Ключ снимка: поток и монета. `|` не встречается ни в id, ни в символах Binance. */
const snapshotKey = (stream: string, symbol: string) => `${stream}|${symbol}`;

const toBar = (c: Candle): Bar => ({ t: c.time.getTime(), o: c.open, h: c.high, l: c.low, c: c.close });

/**
 * Движок эфира: исполняет стопы, тейки, лимитки на закрытие и уровни на вход
 * по живым минуткам — у всех сессий, где цену ведёт сервер.
 *
 * Существует потому, что время идёт и без человека: у закрытой вкладки стоп
 * обязан сработать, иначе результат врёт. Браузеру эфира не верят вовсе.
 *
 * Работает **потоками**. Поток — это турнир (все его сессии идут одним рынком
 * и одним курсором, `Tournament.processedUntil`) или своя сессия эфира
 * (`BacktestSession.processedUntil`). Курсор хранит вызывающий, движок держит
 * только снимок недоформированной минутки — в памяти процесса: перезапуск его
 * теряет, и первая минутка после старта проверяется целиком. Это осознанная
 * цена за то, чтобы не писать в базу состояние, меняющееся каждые две секунды;
 * позиции, открытые в этой минутке, по-прежнему проверяются от своего входа.
 *
 * Внутри потока монеты разбираются по отдельности — только те, где есть
 * открытая сделка или уровень на вход: свои минутки, свои отрезки, свой снимок
 * (ключ `поток|монета`). Курсор у потока один: сдвигать его можно, только когда
 * разобраны все монеты, и повтор после сбоя одной безопасен по тем же причинам,
 * что и повтор всего потока.
 */
@Injectable()
export class LiveEngineService {
  /** Незакрытая минутка каждой монеты каждого потока (`поток|монета`), какой её видел прошлый тик. */
  private snapshots = new Map<string, Snapshot>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly live: LiveMarketService,
    private readonly backtest: BacktestService,
  ) {}

  /**
   * Разбирает рынок потока от его курсора до `until`.
   *
   * `true` — рынок до `until` разобран, курсор потока можно двигать; `false` —
   * время не шло и двигать нечего. Исключение — двигать нельзя: следующий тик
   * разберёт тот же кусок, и повтор безопасен — закрытия идут под CAS, а
   * исполненные уровни уже сняты.
   */
  async run(
    stream: string,
    cursor: Date | null,
    until: number,
    scope: Prisma.BacktestSessionWhereInput,
  ): Promise<boolean> {
    const symbols = await this.activeSymbols(scope);
    // Монета, у которой в потоке ничего не осталось, снимка не держит: иначе
    // следующая позиция по ней читала бы рынок от давно ушедшей минутки, а не
    // от курсора.
    for (const key of this.snapshots.keys()) {
      const [owner, symbol] = key.split('|');
      if (owner === stream && !symbols.includes(symbol)) this.snapshots.delete(key);
    }
    // Разбирать нечего — время всё равно идёт, и курсор потока обязан за ним.
    if (symbols.length === 0) return until > (cursor?.getTime() ?? Number.NEGATIVE_INFINITY);

    let moved = false;
    for (const symbol of symbols) {
      if (await this.runSymbol(stream, symbol, cursor, until, scope)) moved = true;
    }
    return moved;
  }

  /** Одна монета потока: минутки от её снимка (или курсора потока) до `until`. */
  private async runSymbol(
    stream: string,
    symbol: string,
    cursor: Date | null,
    until: number,
    scope: Prisma.BacktestSessionWhereInput,
  ): Promise<boolean> {
    const key = snapshotKey(stream, symbol);
    const snap = this.snapshots.get(key) ?? null;
    const from = snap?.minuteT ?? cursor?.getTime() ?? until - MINUTE_MS;
    if (until <= from) return false;

    const minutes = await this.live.minutesSince(symbol, from, until);
    const { segments, next } = buildSegments(snap, minutes.map(toBar), until);

    for (const seg of segments) {
      const trades = await this.prisma.backtestTrade.findMany({
        where: { session: scope, symbol, exitTime: null },
        include: { closeOrders: true },
      });
      for (const trade of trades) {
        await this.applySegment(seg, trade);
      }
      // После выходов, а не до них: порядок внутри отрезка не восстановить, и
      // стоп, задетый на нём, закрывает позицию такой, какой она на отрезок
      // пришла, — без добора, которого в момент стопа могло ещё не быть. Уровень,
      // задетый после полного закрытия, открывает новую позицию.
      await this.fillEntries(seg, scope, symbol);
    }

    if (next) this.snapshots.set(key, next);
    else this.snapshots.delete(key);
    return true;
  }

  /** Монеты потока, где есть что исполнять: открытая сделка или уровень на вход. */
  private async activeSymbols(scope: Prisma.BacktestSessionWhereInput): Promise<string[]> {
    const [trades, orders] = await Promise.all([
      this.prisma.backtestTrade.findMany({
        where: { session: scope, exitTime: null },
        select: { symbol: true },
        distinct: ['symbol'],
      }),
      this.prisma.backtestEntryOrder.findMany({
        where: { session: scope },
        select: { symbol: true },
        distinct: ['symbol'],
      }),
    ]);
    return [...new Set([...trades, ...orders].map((r) => r.symbol))].sort();
  }

  /** Поток кончился (финал турнира, сессия без позиций) — снимки его монет больше не нужны. */
  forget(stream: string): void {
    for (const key of this.snapshots.keys()) {
      if (key.split('|')[0] === stream) this.snapshots.delete(key);
    }
  }

  /**
   * Уровни одной позиции на одном отрезке. После частичного закрытия лимиткой
   * тот же отрезок проверяется снова: сработать может следующий ордер или
   * стоп, и откладывать это до следующего тика значило бы исполнить их по
   * цене, до которой рынок уже ушёл.
   */
  private async applySegment(
    seg: Segment,
    trade: {
      id: string;
      direction: string;
      entryTime: Date;
      entryPrice: number;
      stopLoss: number;
      takeProfit: number | null;
      closeOrders: { id: string; price: number; qty: number }[];
    },
  ): Promise<void> {
    const bar = barForTrade(seg, { entryTime: trade.entryTime.getTime(), entryPrice: trade.entryPrice });
    if (!bar) return;

    let orders = trade.closeOrders;
    // Ограничение на число проходов — страховка от неожиданного зацикливания:
    // ордеров у сделки конечное число, и каждый проход снимает хотя бы один.
    for (let pass = 0; pass <= orders.length; pass++) {
      const exit = checkMinute(
        { direction: trade.direction as Direction, stopLoss: trade.stopLoss, takeProfit: trade.takeProfit },
        bar,
        orders,
      );
      if (!exit) return;

      const closed = await this.backtest.systemClose(trade.id, {
        // Время выхода — конец отрезка: закрытие минутки или время тика.
        exitTime: new Date(seg.to),
        exitPrice: exit.price,
        reason: exit.reason,
        qty: exit.qty,
        closeOrderId: exit.closeOrderId,
      });
      // Сделку успели закрыть иначе — перечитается на следующем тике.
      if (!closed) return;
      // Стоп и тейк закрывают позицию целиком: проверять дальше нечего.
      if (exit.reason !== 'limit') return;
      orders = orders.filter((o) => o.id !== exit.closeOrderId);
    }
  }

  /**
   * Уровни на вход, задетые отрезком, — все, от ближайшего к открытию, по цене
   * уровня и временем конца отрезка (`systemEnter`). Позиция, открытая так, в
   * этом отрезке уже не проверяется: `barForTrade` отдаёт `null` при
   * `entryTime >= seg.to`.
   *
   * Уровень, выставленный внутри отрезка, ждёт следующего — тем же рассуждением,
   * что у `barForTrade`: экстремумы отрезка во времени не расположены, и
   * засчитать их уровню, которого тогда ещё не было, значило бы исполнить его
   * по цене, которой при нём не было.
   */
  private async fillEntries(seg: Segment, scope: Prisma.BacktestSessionWhereInput, symbol: string): Promise<void> {
    const orders = await this.prisma.backtestEntryOrder.findMany({
      where: { session: scope, symbol, createdAt: { lte: new Date(seg.from) } },
      select: { id: true, price: true },
    });
    for (const order of touchedEntries(orders, seg.bar)) {
      await this.backtest.systemEnter(order.id, new Date(seg.to));
    }
  }
}
