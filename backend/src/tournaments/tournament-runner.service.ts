import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import type { Direction } from '../backtest/backtest-math';
import { BacktestService } from '../backtest/backtest.service';
import { checkMinute } from '../backtest/fills';
import { LiveMarketService } from '../market-data/live-market.service';
import type { Candle } from '../market-data/market-data.service';
import { PrismaService } from '../prisma/prisma.service';
import { runsBackgroundJobs } from '../role';
import { barForTrade, buildSegments, type Bar, type Snapshot } from './live-segments';
import { TournamentsService } from './tournaments.service';

const TICK_MS = 2_000;
const MINUTE_MS = 60_000;

/**
 * Хранилище отдаёт свечи именованными полями, правила исполнения работают с
 * короткими `t/o/h/l/c` — теми же, что и в браузере, потому что `checkMinute`
 * перенесён оттуда без изменений.
 */
const toBar = (c: Candle): Bar => ({ t: c.time.getTime(), o: c.open, h: c.high, l: c.low, c: c.close });

/**
 * Движок турниров в эфире: исполняет стопы, тейки и лимит-ордера по живым
 * минуткам и подводит итоги.
 *
 * Существует потому, что время идёт и без участника: у закрытой вкладки стоп
 * обязан сработать, иначе результат врёт, а финал нечем подвести. Браузеру
 * турнира не верят вовсе — на кону призовой фонд.
 *
 * Снимок недоформированной минутки живёт в памяти процесса, а `processedUntil`
 * — в базе. Перезапуск теряет снимок, и первая минутка после старта
 * проверяется целиком: это осознанная цена за то, чтобы не хранить в базе
 * состояние, которое меняется каждые две секунды. Позиции, открытые в этой
 * минутке, по-прежнему проверяются от своего входа.
 */
@Injectable()
export class TournamentRunnerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TournamentRunnerService.name);
  private timer?: NodeJS.Timeout;
  private busy = false;
  /** Незакрытая минутка каждого турнира, какой её видел прошлый тик. */
  private snapshots = new Map<string, Snapshot>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly live: LiveMarketService,
    private readonly backtest: BacktestService,
    private readonly tournaments: TournamentsService,
  ) {}

  onApplicationBootstrap() {
    // T11: фоновый сервис — только роль worker (и дефолтная all). Второй
    // экземпляр движка исполнял бы те же уровни второй раз.
    if (!runsBackgroundJobs()) return;
    this.timer = setInterval(() => {
      this.tick().catch((e) => this.logger.error('тик движка турниров упал', e as Error));
    }, TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.finishDue();
      await this.processRunning();
    } finally {
      this.busy = false;
    }
  }

  /** Итоги турниров, у которых вышел срок и закрылась последняя минутка. */
  private async finishDue(): Promise<void> {
    const due = await this.tournaments.dueForFinal(new Date());
    for (const t of due) {
      try {
        if (!t.endsAt) continue;
        // Цена финала — закрытие минутки, которой турнир кончается. Пока её
        // нет (Binance молчит), турнир ждёт следующего тика: сделки после
        // endsAt сервер всё равно не принимает, и ожидание ничего не меняет.
        const price = await this.finalPrice(t.endsAt);
        if (price == null) continue;

        const sessions = await this.prisma.backtestSession.findMany({
          where: { tournamentId: t.id, status: 'active' },
          select: { id: true },
        });
        for (const s of sessions) {
          await this.backtest.finishTournamentSession(s.id, t.endsAt, price);
        }
        await this.tournaments.finalize(t);
        this.snapshots.delete(t.id);
      } catch (e) {
        // Один турнир не должен лишить остальных финала: у каждого свои
        // деньги, и падение чужой транзакции их не касается.
        this.logger.error(`финал турнира ${t.id} упал`, e as Error);
      }
    }
  }

  /** Закрытие минутки, в которую попадает конец турнира. */
  private async finalPrice(endsAt: Date): Promise<number | null> {
    const from = endsAt.getTime() - MINUTE_MS;
    const minutes = await this.live.minutesSince(from, endsAt.getTime());
    const last = minutes.at(-1);
    return last ? last.close : null;
  }

  private async processRunning(): Promise<void> {
    const running = await this.prisma.tournament.findMany({
      where: { status: 'running', mode: 'live' },
    });
    for (const t of running) {
      try {
        await this.processTournament(t);
      } catch (e) {
        this.logger.error(`тик турнира ${t.id} упал`, e as Error);
      }
    }
  }

  private async processTournament(t: {
    id: string;
    endsAt: Date | null;
    processedUntil: Date | null;
  }): Promise<void> {
    const now = Date.now();
    // Дальше конца турнира движок не смотрит: то, что случилось после, к
    // результату отношения не имеет — его подведёт финал.
    const until = Math.min(now, t.endsAt?.getTime() ?? now);
    const snap = this.snapshots.get(t.id) ?? null;
    const from = snap?.minuteT ?? t.processedUntil?.getTime() ?? until - MINUTE_MS;
    if (until <= from) return;

    const minutes = await this.live.minutesSince(from, until);
    const { segments, next } = buildSegments(snap, minutes.map(toBar), until);

    for (const seg of segments) {
      const trades = await this.prisma.backtestTrade.findMany({
        where: { session: { tournamentId: t.id }, exitTime: null },
        include: { closeOrders: true },
      });
      for (const trade of trades) {
        await this.applySegment(seg, trade);
      }
    }

    if (next) this.snapshots.set(t.id, next);
    else this.snapshots.delete(t.id);
    await this.prisma.tournament.update({ where: { id: t.id }, data: { processedUntil: new Date(until) } });
  }

  /**
   * Уровни одной позиции на одном отрезке. После частичного закрытия лимиткой
   * тот же отрезок проверяется снова: сработать может следующий ордер или
   * стоп, и откладывать это до следующего тика значило бы исполнить их по
   * цене, до которой рынок уже ушёл.
   */
  private async applySegment(
    seg: ReturnType<typeof buildSegments>['segments'][number],
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
}
