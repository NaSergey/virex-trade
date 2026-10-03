import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CoinsService } from '../coins/coins.service';
import { GamesGateway } from '../games/games.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { crashX100, msTo, payout, randomUnit, x100At } from './jetpack';
import {
  BET_MS,
  BROADCAST_MS,
  CRASH_PAUSE_MS,
  HISTORY_SIZE,
  MAX_BET,
  MAX_X100,
  MIN_AUTO_X100,
  MIN_BET,
  RETRY_MS,
  ROOM,
} from './jetpack.config';
import { jpAlreadyBet, jpBadBet, jpNoBet, jpNotBetting, jpNotFlying, jpTooLate } from './jetpack-errors';
import { buildView, Phase, RuntimeBet, Snapshot } from './jetpack-view';

type TimerName = 'launch' | 'crash' | 'next' | 'finish';

/**
 * Рантайм джетпака: раунд один на всех и живёт в памяти процесса игр
 * (`ROLE=games`) — отсюда, как у раздачи покера, требование держать этот
 * процесс одним.
 * Деньги — транзакциями в базе; строки раундов и ставок нужны истории и
 * возврату раунда, прерванного перезапуском.
 *
 * Все операции — ставка, вывод, взлёт, краш, автовывод — через одну очередь
 * (`exclusive`). «Успел ли» решает время прихода запроса, а не обработки: оно
 * снимается до постановки в очередь, а краш ставит в очередь таймер ровно в
 * момент краша, поэтому всё, что пришло раньше, разбирается раньше него.
 *
 * Цикл спит, когда смотреть некому: после паузы краша сервер смотрит, есть ли
 * сокеты в комнате, и без них окно не открывает. Будит открытие страницы
 * (`GET /api/jetpack`). Спека — `2026-09-25-jetpack-crash-design.md`.
 */
@Injectable()
export class JetpackService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(JetpackService.name);
  private queue: Promise<unknown> = Promise.resolve();
  private phase: Phase = 'idle';
  private roundId: string | null = null;
  private launchAt: number | null = null;
  private launchedAt: number | null = null;
  private crashPoint: number | null = null;
  private bets = new Map<string, RuntimeBet>();
  private history: number[] = [];
  private historyLoaded = false;
  private readonly timers = new Map<TimerName, NodeJS.Timeout>();
  private autoTimers: NodeJS.Timeout[] = [];
  private broadcastTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly coins: CoinsService,
    private readonly gateway: GamesGateway,
  ) {}

  /**
   * Раунд без `finishedAt` при старте — прерван перезапуском: ставкам без
   * вывода возвращается сумма, выведенные уже оплачены. Банк теряется, деньги
   * — нет (тот же принцип, что у раздач столов).
   */
  async onApplicationBootstrap() {
    // Проверки роли нет: модуль входит только в граф процесса игр, и он один.
    // Сбой чтения не роняет весь `api`: деньги прерванного раунда вернёт
    // следующий старт, а упавший процесс не вернул бы вообще ничего.
    let open: { id: string }[];
    try {
      open = await this.prisma.jetpackRound.findMany({ where: { finishedAt: null }, select: { id: true } });
    } catch (e) {
      this.logger.error(`interrupted rounds: ${(e as Error).message}`);
      return;
    }
    for (const r of open) {
      try {
        await this.voidRound(r.id);
      } catch (e) {
        this.logger.error(`void round ${r.id}: ${(e as Error).message}`);
      }
    }
  }

  onModuleDestroy() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this.clearAutoTimers();
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer);
  }

  private async voidRound(roundId: string) {
    await this.prisma.$transaction(async (tx) => {
      // CAS: вторая попытка того же возврата ничего не найдёт.
      const moved = await tx.jetpackRound.updateMany({
        where: { id: roundId, finishedAt: null },
        data: { finishedAt: new Date(), voided: true },
      });
      if (moved.count === 0) return;
      const open = await tx.jetpackBet.findMany({ where: { roundId, cashoutX100: null } });
      for (const b of open) await this.coins.credit(tx, b.userId, b.amount, 'JETPACK_REFUND', roundId);
    });
  }

  // ── очередь и таймеры ─────────────────────────────────────────

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private log(what: string) {
    return (e: Error) => this.logger.error(`${what}: ${e.message}`);
  }

  /** Именованный будильник: один на имя, ставится в очередь. */
  private schedule(name: TimerName, ms: number, fn: () => Promise<void>) {
    const prev = this.timers.get(name);
    if (prev) clearTimeout(prev);
    this.timers.set(
      name,
      setTimeout(() => {
        this.timers.delete(name);
        void this.exclusive(fn).catch(this.log(name));
      }, ms),
    );
  }

  private clearAutoTimers() {
    for (const t of this.autoTimers) clearTimeout(t);
    this.autoTimers = [];
  }

  // ── вид и рассылка ────────────────────────────────────────────

  private snapshot(): Snapshot {
    return {
      phase: this.phase,
      roundId: this.roundId,
      launchAt: this.launchAt,
      launchedAt: this.launchedAt,
      crashX100: this.crashPoint,
      history: [...this.history],
      bets: [...this.bets.values()].map((b) => ({ ...b })),
    };
  }

  private emit() {
    const snap = this.snapshot();
    const now = Date.now();
    return this.gateway.emitPersonal(ROOM, 'jetpack_state', (userId) => buildView(snap, userId, now));
  }

  /** Ставка, вывод — рассылка пачкой: не чаще раза в BROADCAST_MS. */
  private touch() {
    if (this.broadcastTimer) return;
    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      void this.emit().catch(this.log('broadcast'));
    }, BROADCAST_MS);
  }

  /** Смена фазы — сразу: краш должен дойти до экрана без задержки. */
  private flush() {
    if (this.broadcastTimer) clearTimeout(this.broadcastTimer);
    this.broadcastTimer = null;
    void this.emit().catch(this.log('broadcast'));
  }

  private viewFor(userId: string) {
    return buildView(this.snapshot(), userId, Date.now());
  }

  // ── действия игрока ───────────────────────────────────────────

  /** Открытие страницы будит цикл: после перезапуска или сна раунда нет. */
  async view(userId: string) {
    await this.exclusive(() => this.wake()).catch(this.log('wake'));
    return this.viewFor(userId);
  }

  bet(userId: string, amount: number, autoCashout?: number) {
    const auto = autoCashout === undefined ? null : Math.round(autoCashout * 100);
    return this.exclusive(async () => {
      if (this.phase !== 'betting' || !this.roundId) throw jpNotBetting();
      if (this.bets.has(userId)) throw jpAlreadyBet();
      if (
        !Number.isInteger(amount) ||
        amount < MIN_BET ||
        amount > MAX_BET ||
        (auto !== null && (auto < MIN_AUTO_X100 || auto > MAX_X100))
      ) {
        throw jpBadBet();
      }
      const roundId = this.roundId;
      let row: { id: string; user: { name: string | null } };
      try {
        row = await this.prisma.$transaction(async (tx) => {
          await this.coins.charge(tx, userId, amount, 'JETPACK_BET', roundId);
          return tx.jetpackBet.create({
            data: { roundId, userId, amount, autoX100: auto },
            select: { id: true, user: { select: { name: true } } },
          });
        });
      } catch (e) {
        // Уникальный ключ ставки или журнала монет — вторая вкладка успела первой.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw jpAlreadyBet();
        throw e;
      }
      this.bets.set(userId, {
        id: row.id,
        userId,
        name: row.user.name,
        amount,
        autoX100: auto,
        cashoutX100: null,
        payout: null,
      });
      this.touch();
      return this.viewFor(userId);
    });
  }

  /**
   * Ручной вывод. Время прихода снимается до очереди; множитель вывода —
   * меньшее из множителя в этот момент и цели автовывода: автовывод, если он
   * уже наступил, случился раньше, даже если его таймер опоздал.
   */
  cashout(userId: string) {
    const at = Date.now();
    return this.exclusive(async () => {
      const bet = this.bets.get(userId);
      if (!bet || bet.cashoutX100 !== null || this.phase === 'idle') throw jpNoBet();
      if (this.phase === 'betting' || this.launchedAt === null || at < this.launchedAt) throw jpNotFlying();
      if (this.phase !== 'flying' || at >= this.crashAt()) throw jpTooLate();
      const x = Math.min(x100At(at - this.launchedAt), bet.autoX100 ?? MAX_X100, this.crashPoint!);
      await this.payOut(this.roundId!, bet, x);
      this.touch();
      return this.viewFor(userId);
    });
  }

  // ── раунд ─────────────────────────────────────────────────────

  private crashAt() {
    return this.launchedAt! + msTo(this.crashPoint!);
  }

  private async watched() {
    return (await this.gateway.roomSize(ROOM)) > 0;
  }

  private async wake() {
    if (this.phase !== 'idle' || this.timers.has('next')) return;
    await this.openOrRetry();
  }

  /**
   * После паузы краша: смотрит кто-нибудь — новое окно, нет — сон. Раунд
   * со стола при этом убирается: оставленный, он выглядел бы идущим, когда
   * страницу откроют снова.
   */
  private async next() {
    if (!(await this.watched())) {
      this.phase = 'idle';
      this.roundId = null;
      this.launchedAt = null;
      this.crashPoint = null;
      this.bets = new Map();
      return;
    }
    await this.openOrRetry();
  }

  /** Строка раунда не записалась — цикл повторит, пока на странице кто-то есть. */
  private async openOrRetry() {
    try {
      await this.openBetting();
    } catch (e) {
      this.phase = 'idle';
      this.schedule('next', RETRY_MS, () => this.next());
      throw e;
    }
  }

  private async loadHistory() {
    if (this.historyLoaded) return;
    const rows = await this.prisma.jetpackRound.findMany({
      where: { finishedAt: { not: null }, voided: false, crashX100: { not: null } },
      orderBy: { finishedAt: 'desc' },
      take: HISTORY_SIZE,
      select: { crashX100: true },
    });
    this.history = rows.map((r) => r.crashX100!);
    this.historyLoaded = true;
  }

  private async openBetting() {
    await this.loadHistory();
    const row = await this.prisma.jetpackRound.create({ data: {}, select: { id: true } });
    this.phase = 'betting';
    this.roundId = row.id;
    this.launchAt = Date.now() + BET_MS;
    this.launchedAt = null;
    this.crashPoint = null;
    this.bets = new Map();
    this.schedule('launch', BET_MS, () => this.launch(row.id));
    this.flush();
  }

  /**
   * Взлёт. Точка краша вытягивается здесь и до краша живёт только в памяти.
   * Часы полёта идут от момента обработки, а не от запланированного взлёта:
   * ставка, разобранная в очереди перед взлётом, не должна его сдвинуть назад.
   */
  private async launch(roundId: string) {
    if (this.phase !== 'betting' || this.roundId !== roundId) return;
    const crash = crashX100(randomUnit());
    this.phase = 'flying';
    this.launchAt = null;
    this.launchedAt = Date.now();
    this.crashPoint = crash;
    this.schedule('crash', msTo(crash), () => this.crash(roundId));
    this.clearAutoTimers();
    for (const b of this.bets.values()) {
      if (b.autoX100 === null || b.autoX100 > crash) continue;
      const userId = b.userId;
      this.autoTimers.push(
        setTimeout(() => {
          void this.exclusive(() => this.autoCashout(roundId, userId)).catch(this.log('auto'));
        }, msTo(b.autoX100)),
      );
    }
    this.flush();
  }

  /** Будильник автовывода: платит ровно по цели, если игрок не вывел раньше руками. */
  private async autoCashout(roundId: string, userId: string) {
    const bet = this.bets.get(userId);
    if (this.roundId !== roundId || this.phase !== 'flying' || !bet) return;
    if (bet.cashoutX100 !== null || bet.autoX100 === null) return;
    await this.payOut(roundId, bet, bet.autoX100);
    this.touch();
  }

  /**
   * Краш. Таймер Node может сработать на долю мс раньше — тогда будильник
   * переставляется на остаток: краш раньше своего момента отнял бы у
   * успевших законный вывод.
   */
  private async crash(roundId: string) {
    if (this.roundId !== roundId || this.phase !== 'flying') return;
    const left = this.crashAt() - Date.now();
    if (left > 0) {
      this.schedule('crash', left, () => this.crash(roundId));
      return;
    }
    this.phase = 'crashed';
    this.clearAutoTimers();
    this.flush();
    await this.finish(roundId);
  }

  /**
   * Краш в базе: автовыводы, чей таймер не успел (выигрыш решает правило, а
   * не то, какой колбэк сработал первым), и строка раунда условным
   * `updateMany`. Сбой — повтор: раунд без `finishedAt` при перезапуске
   * отменился бы, и проигравшим вернулись бы их ставки. Следующее окно
   * открывается только после записи.
   */
  private async finish(roundId: string) {
    const crash = this.crashPoint!;
    try {
      for (const b of this.bets.values()) {
        if (b.cashoutX100 === null && b.autoX100 !== null && b.autoX100 <= crash) {
          await this.payOut(roundId, b, b.autoX100);
        }
      }
      await this.prisma.jetpackRound.updateMany({
        where: { id: roundId, finishedAt: null },
        data: { crashX100: crash, finishedAt: new Date() },
      });
    } catch (e) {
      this.schedule('finish', RETRY_MS, () => this.finish(roundId));
      throw e;
    }
    this.history = [crash, ...this.history].slice(0, HISTORY_SIZE);
    this.flush();
    this.schedule('next', CRASH_PAUSE_MS, () => this.next());
  }

  /**
   * Вывод ставки: compare-and-set по строке ставки (`cashoutX100: null`) и
   * начисление — одной транзакцией; двойной клик второй раз ничего не
   * найдёт. Не нашёл — память берёт то, что записано в базе: запись могла
   * пройти, а ответ базы — потеряться.
   */
  private async payOut(roundId: string, bet: RuntimeBet, x100: number) {
    const win = payout(bet.amount, x100);
    const res = await this.prisma.$transaction(async (tx) => {
      const moved = await tx.jetpackBet.updateMany({
        where: { id: bet.id, cashoutX100: null },
        data: { cashoutX100: x100, payout: win },
      });
      if (moved.count === 0) {
        return tx.jetpackBet.findUniqueOrThrow({ where: { id: bet.id }, select: { cashoutX100: true, payout: true } });
      }
      await this.coins.credit(tx, bet.userId, win, 'JETPACK_WIN', roundId);
      return { cashoutX100: x100, payout: win };
    });
    bet.cashoutX100 = res.cashoutX100;
    bet.payout = res.payout;
  }
}
