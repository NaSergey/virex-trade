import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CoinsService } from '../coins/coins.service';
import { gameNotSeated, gameTableNotFound } from '../games/game-errors';
import { GamesGateway } from '../games/games.gateway';
import { GamesService, TableEngine } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { act, BjActionType, BlackjackError, newShoe, RoundState, standAll, startRound, wagered } from './blackjack';
import {
  BET_MS,
  DEAL_SHOW_MS,
  DEALER_DRAW_MS,
  FIRST_ROUND_MS,
  NEXT_ROUND_MS,
  RETRY_MS,
  TURN_MS,
} from './blackjack.config';
import { bjBadAction, bjBadBet, bjNoRound, bjNotBetting, bjNotBlackjack, bjNotYourTurn } from './blackjack-errors';
import { buildView, Phase, SeatRow } from './blackjack-view';

interface Runtime {
  phase: Phase;
  /** Ставки открытого окна: в памяти, со стеков не списаны. */
  bets: Map<string, number>;
  round: RoundState | null;
  roundId: string | null;
  sitOut: Set<string>;
  queue: Promise<unknown>;
  /** Растёт на каждом изменении: таймер, заведённый до него, устарел. */
  seq: number;
  deadline: number | null;
  /** Окно ставок или ход — одновременно их не бывает. */
  timer: NodeJS.Timeout | null;
  /** Пауза перед следующим окном ставок. */
  nextTimer: NodeJS.Timeout | null;
  /** За столом один человек: ждать некому, и таймеров у стола нет. */
  solo: boolean;
}

type TableWithSeats = Prisma.GameTableGetPayload<{ include: { seats: true } }>;

/**
 * Рантайм столов блэкджека: раунд в памяти процесса игр, деньги — в БД.
 * Всё — через одну очередь на стол (`exclusive`): ставка, ход, таймеры, уход.
 *
 * Ставка окна живёт в памяти и со стека не списывается — до сдачи деньги не
 * движутся. Сдача — одна транзакция (строка `GameHand` с вкладами и списание
 * ставок); дабл и сплит — свои транзакции; расчёт — в транзакции последнего
 * хода. Прерванный перезапуском раунд возвращает вклады в `GamesService`.
 * Спека — `docs/superpowers/specs/2026-09-24-blackjack-design.md`.
 */
@Injectable()
export class BlackjackService implements TableEngine, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BlackjackService.name);
  private readonly tables = new Map<string, Runtime>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly coins: CoinsService,
    private readonly games: GamesService,
    private readonly gateway: GamesGateway,
  ) {}

  onModuleInit() {
    this.games.registerEngine('blackjack', this);
  }

  onModuleDestroy() {
    for (const rt of this.tables.values()) {
      if (rt.timer) clearTimeout(rt.timer);
      if (rt.nextTimer) clearTimeout(rt.nextTimer);
    }
  }

  private rt(tableId: string): Runtime {
    let rt = this.tables.get(tableId);
    if (!rt) {
      rt = {
        phase: 'idle',
        bets: new Map(),
        round: null,
        roundId: null,
        sitOut: new Set(),
        queue: Promise.resolve(),
        seq: 0,
        deadline: null,
        timer: null,
        nextTimer: null,
        solo: false,
      };
      this.tables.set(tableId, rt);
    }
    return rt;
  }

  exclusive<T>(tableId: string, fn: () => Promise<T>): Promise<T> {
    const rt = this.rt(tableId);
    const run = rt.queue.then(fn);
    rt.queue = run.catch(() => undefined);
    return run;
  }

  private log(what: string) {
    return (e: Error) => this.logger.error(`${what}: ${e.message}`);
  }

  // ── TableEngine ───────────────────────────────────────────────

  /**
   * Встающий посреди раунда не теряет ставку: его оставшиеся руки стоят, а
   * выигрыш после хода крупье придёт монетами (`settle`). До сдачи ставка
   * лежит только в памяти — её просто нет.
   */
  async onLeaving(tableId: string, userId: string) {
    const rt = this.rt(tableId);
    rt.sitOut.delete(userId);
    rt.bets.delete(userId);
    const round = rt.round;
    if (rt.phase !== 'playing' || !round) return;
    const p = round.players.find((x) => x.userId === userId);
    if (!p || p.hands.every((h) => h.done)) return;
    await this.commit(tableId, rt, standAll(round, userId));
  }

  onSeatsChanged(tableId: string) {
    const rt = this.rt(tableId);
    this.wake(tableId, rt);
    void this.exclusive(tableId, () => this.retime(tableId)).catch(this.log(`retime ${tableId}`));
    void this.broadcast(tableId);
  }

  /**
   * Состав стола сменился — пересчитать будильники. Остался один — таймеры
   * снимаются: окно ставок и ход ждут его сколько угодно, ведь никого другого
   * он не задерживает. Подсел второй — окну и ходу, шедшим без таймера,
   * заводится полный срок. Встал последний, кого ждало окно, — сдавать можно
   * сразу.
   */
  private async retime(tableId: string) {
    const rt = this.rt(tableId);
    const table = await this.loadTable(tableId);
    if (!table) return;
    this.setSolo(rt, table);
    if (rt.phase === 'betting' && table.seats.length === 0) {
      // Встали все, так и не поставив: окно ждать некому.
      rt.bets.clear();
      rt.seq++;
      this.clearTimer(rt);
      rt.phase = 'idle';
      void this.broadcast(tableId);
      return;
    }
    if (rt.solo) {
      this.clearTimer(rt);
    } else if (!rt.timer) {
      if (rt.phase === 'betting') this.armClose(tableId, rt, rt.seq, BET_MS);
      if (rt.phase === 'playing') this.armTurn(tableId, rt);
    }
    if (rt.phase === 'betting') await this.dealIfAllBet(tableId, table);
    void this.broadcast(tableId);
  }

  /**
   * Один за столом — «пропускает раунды» с него снимается: переключателя у
   * одинокого игрока нет, и отметка, оставшаяся с тех пор, как за столом
   * были другие, заперла бы его без окна ставок.
   */
  private setSolo(rt: Runtime, table: TableWithSeats) {
    rt.solo = table.seats.length <= 1;
    if (rt.solo) rt.sitOut.clear();
  }

  // ── Действия игрока ───────────────────────────────────────────

  async view(userId: string, tableId: string) {
    const base = await this.loadBase(tableId);
    if (!base) throw gameTableNotFound();
    if (base.table.gameType !== 'blackjack') throw bjNotBlackjack();
    // После перезапуска `api` рантайм пуст: открытие стола — тоже повод
    // открыть окно ставок, иначе сидящие ждали бы чужой посадки. Лишнего не
    // будет: `scheduleNext` второй таймер не заводит, а `openBetting` молчит,
    // когда играть некому.
    if (base.table.status === 'open' && base.seats.length > 0) this.wake(tableId, this.rt(tableId));
    return buildView(base.table, base.seats, this.snapshot(tableId), userId);
  }

  /** Ставка в открытое окно; повторная — переставляет. Поставивший возвращается из «пропускает». */
  bet(userId: string, tableId: string, amount: number) {
    return this.exclusive(tableId, async () => {
      const rt = this.rt(tableId);
      if (rt.phase !== 'betting') throw bjNotBetting();
      const table = await this.loadTable(tableId);
      if (!table) throw gameTableNotFound();
      const seat = table.seats.find((s) => s.userId === userId);
      if (!seat) throw gameNotSeated();
      if (amount < (table.minBet ?? 0) || amount > (table.maxBet ?? 0) || amount > seat.stack) throw bjBadBet();
      rt.sitOut.delete(userId);
      rt.bets.set(userId, amount);
      if (!(await this.dealIfAllBet(tableId, table))) void this.broadcast(tableId);
      return { success: true as const };
    });
  }

  act(userId: string, tableId: string, type: BjActionType) {
    return this.exclusive(tableId, async () => {
      const rt = this.rt(tableId);
      if (rt.phase !== 'playing' || !rt.round) throw bjNoRound();
      let next: RoundState;
      try {
        next = act(rt.round, userId, type);
      } catch (e) {
        if (e instanceof BlackjackError) throw e.code === 'NOT_YOUR_TURN' ? bjNotYourTurn() : bjBadAction();
        throw e;
      }
      await this.commit(tableId, rt, next);
      return { success: true as const };
    });
  }

  /** «Пропустить раунд» действует со следующего окна: поставленное в открытое окно играет. */
  async setFlags(userId: string, tableId: string, flags: { sitOut: boolean }) {
    await this.exclusive(tableId, async () => {
      const rt = this.rt(tableId);
      if (flags.sitOut) rt.sitOut.add(userId);
      else rt.sitOut.delete(userId);
      this.wake(tableId, rt);
      if (rt.phase === 'betting') await this.dealIfAllBet(tableId);
    });
    void this.broadcast(tableId);
    return { success: true as const };
  }

  // ── Раунд ─────────────────────────────────────────────────────

  private scheduleNext(tableId: string, rt: Runtime, delay: number) {
    if (rt.nextTimer) return;
    rt.nextTimer = setTimeout(() => {
      rt.nextTimer = null;
      void this.exclusive(tableId, () => this.openBetting(tableId)).catch(this.log(`open betting ${tableId}`));
    }, delay);
  }

  /**
   * Раунда нет — пора открывать окно ставок. «Итог показан» (`done`) сюда
   * тоже относится: если таймер паузы по какой-то причине не открыл окно
   * (упала база), стол не должен стоять, пока его кто-нибудь не тронет.
   * Лишнего не будет: второй таймер `scheduleNext` не заводит.
   */
  private wake(tableId: string, rt: Runtime) {
    if (rt.phase === 'idle' || rt.phase === 'done') {
      this.scheduleNext(tableId, rt, rt.phase === 'done' ? NEXT_ROUND_MS : FIRST_ROUND_MS);
    }
  }

  private clearTimer(rt: Runtime) {
    if (rt.timer) clearTimeout(rt.timer);
    rt.timer = null;
    rt.deadline = null;
  }

  /**
   * Окно ставок. Играть некому — стол ждёт, и итог прошлого раунда с него
   * убирается: оставленный, он выглядел бы идущим раундом.
   */
  private async openBetting(tableId: string) {
    const rt = this.rt(tableId);
    if (rt.phase === 'betting' || rt.phase === 'playing') return;
    const table = await this.loadTable(tableId);
    if (!table || table.status !== 'open' || table.gameType !== 'blackjack') return;
    this.setSolo(rt, table);
    const minBet = table.minBet ?? 0;
    const players = table.seats.filter((s) => s.stack >= minBet && !rt.sitOut.has(s.userId));
    rt.round = null;
    rt.roundId = null;
    rt.bets.clear();
    rt.seq++;
    this.clearTimer(rt);
    if (!players.length) {
      rt.phase = 'idle';
      void this.broadcast(tableId);
      return;
    }
    rt.phase = 'betting';
    // Одному ждать некого: окно открыто, пока он не поставит.
    if (!rt.solo) this.armClose(tableId, rt, rt.seq, BET_MS);
    void this.broadcast(tableId);
  }

  /**
   * Будильник окна ставок. Не закрылось из-за сбоя базы — будильник ставится
   * снова: иначе окно висело бы открытым, пока не поставят все.
   */
  private armClose(tableId: string, rt: Runtime, seq: number, delay: number) {
    rt.deadline = Date.now() + delay;
    rt.timer = setTimeout(() => {
      void this.exclusive(tableId, () => this.closeBetting(tableId, seq)).catch((e: Error) => {
        this.logger.error(`close betting ${tableId}: ${e.message}`);
        if (rt.seq === seq && rt.phase === 'betting') this.armClose(tableId, rt, seq, RETRY_MS);
      });
    }, delay);
  }

  /** Окно истекло. Не поставивший — отошёл: иначе каждое следующее окно ждало бы его до конца. */
  private async closeBetting(tableId: string, seq: number) {
    const rt = this.rt(tableId);
    if (rt.phase !== 'betting' || rt.seq !== seq) return;
    const table = await this.loadTable(tableId);
    if (!table) return;
    const minBet = table.minBet ?? 0;
    for (const s of table.seats) if (s.stack >= minBet && !rt.bets.has(s.userId)) rt.sitOut.add(s.userId);
    await this.deal(tableId, rt, table);
  }

  /** Поставили все, кого ждало окно, — сдавать, не дожидаясь таймера. */
  private async dealIfAllBet(tableId: string, loaded?: TableWithSeats): Promise<boolean> {
    const rt = this.rt(tableId);
    if (rt.phase !== 'betting' || rt.bets.size === 0) return false;
    const table = loaded ?? (await this.loadTable(tableId));
    if (!table) return false;
    const minBet = table.minBet ?? 0;
    const waiting = table.seats.some((s) => s.stack >= minBet && !rt.sitOut.has(s.userId) && !rt.bets.has(s.userId));
    if (waiting) return false;
    await this.deal(tableId, rt, table);
    return true;
  }

  /** Сдача: строка раунда с вкладами и списание ставок — одной транзакцией. */
  private async deal(tableId: string, rt: Runtime, table: TableWithSeats) {
    this.clearTimer(rt);
    const entries = table.seats
      .filter((s) => {
        const bet = rt.bets.get(s.userId) ?? 0;
        return bet > 0 && bet <= s.stack;
      })
      .map((s) => {
        const bet = rt.bets.get(s.userId)!;
        return { userId: s.userId, seatIndex: s.seatIndex, stack: s.stack - bet, bet };
      });
    rt.bets.clear();
    rt.seq++;
    if (!entries.length) {
      rt.phase = 'idle';
      void this.broadcast(tableId);
      return;
    }
    const round = startRound(entries, newShoe());
    let row: { id: string };
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.gameHand.create({ data: { tableId, contributions: wagered(round) } });
        for (const e of entries) await this.debit(tx, tableId, e.userId, e.bet);
        if (round.phase === 'done') await this.settle(tx, tableId, created.id, round);
        return created;
      });
    } catch (e) {
      // Деньги не сдвинулись — стол просто ждёт следующего повода открыть окно.
      rt.phase = 'idle';
      void this.broadcast(tableId);
      throw e;
    }
    rt.round = round;
    rt.roundId = row.id;
    this.afterChange(tableId, rt, true);
  }

  /** Новое состояние раунда — в БД и в память: добавленное к ставкам списывается, конец — расчёт. */
  private async commit(tableId: string, rt: Runtime, next: RoundState) {
    const handId = rt.roundId!;
    const before = wagered(rt.round!);
    const after = wagered(next);
    await this.prisma.$transaction(async (tx) => {
      for (const [userId, amount] of Object.entries(after)) {
        const extra = amount - (before[userId] ?? 0);
        if (extra > 0) await this.debit(tx, tableId, userId, extra);
      }
      await tx.gameHand.update({ where: { id: handId }, data: { contributions: after } });
      if (next.phase === 'done') await this.settle(tx, tableId, handId, next);
    });
    rt.round = next;
    this.afterChange(tableId, rt);
  }

  /**
   * Списание со стека — compare-and-set в самом UPDATE (`stack >= n`), как у
   * монет: правила и очередь стола уже не дают поставить больше стека, но
   * деньги не должны зависеть от того, что в них никто никогда не ошибётся.
   */
  private async debit(tx: Prisma.TransactionClient, tableId: string, userId: string, n: number) {
    const res = await tx.gameSeat.updateMany({
      where: { tableId, userId, stack: { gte: n } },
      data: { stack: { decrement: n } },
    });
    if (res.count === 0) throw new Error(`stack of ${userId} at ${tableId} is below ${n}`);
  }

  /**
   * Расчёт. Сидящему — на место; вставшему посреди раунда — монетами: его
   * руки доиграны за него, и сгоревшая ставка была бы штрафом за уход.
   */
  private async settle(tx: Prisma.TransactionClient, tableId: string, handId: string, round: RoundState) {
    for (const [userId, amount] of Object.entries(round.payouts ?? {})) {
      if (!(amount > 0)) continue;
      const paid = await tx.gameSeat.updateMany({ where: { tableId, userId }, data: { stack: { increment: amount } } });
      if (paid.count === 0) await this.coins.credit(tx, userId, amount, 'GAME_PAYOUT', `${handId}:${userId}`);
    }
    await tx.gameHand.update({ where: { id: handId }, data: { finishedAt: new Date() } });
  }

  /** Сколько стол доигрывает кончившийся раунд, прежде чем открыть окно ставок. */
  private pauseAfter(round: RoundState | null, endedOnDeal: boolean) {
    const draws = Math.max(0, (round?.dealer.length ?? 2) - 2);
    return NEXT_ROUND_MS + draws * DEALER_DRAW_MS + (endedOnDeal ? DEAL_SHOW_MS : 0);
  }

  private afterChange(tableId: string, rt: Runtime, dealt = false) {
    rt.seq++;
    this.clearTimer(rt);
    if (rt.round?.phase === 'playing') {
      rt.phase = 'playing';
      // Одного за столом торопить незачем: его ход никого не задерживает.
      if (!rt.solo) this.armTurn(tableId, rt);
    } else {
      rt.phase = 'done';
      this.scheduleNext(tableId, rt, this.pauseAfter(rt.round, dealt));
    }
    void this.broadcast(tableId);
  }

  /** Таймер хода. Истёк — оставшиеся руки стоят, игрок пропускает следующие раунды. */
  private armTurn(tableId: string, rt: Runtime, delay = TURN_MS) {
    const round = rt.round;
    if (!round || round.phase !== 'playing' || !round.turn) return;
    const userId = round.players[round.turn.p].userId;
    const seq = rt.seq;
    rt.deadline = Date.now() + delay;
    rt.timer = setTimeout(() => {
      void this.exclusive(tableId, async () => {
        const cur = rt.round;
        if (rt.seq !== seq || !cur || cur.phase !== 'playing' || !cur.turn) return;
        if (cur.players[cur.turn.p].userId !== userId) return;
        rt.sitOut.add(userId);
        await this.commit(tableId, rt, standAll(cur, userId));
      }).catch((e: Error) => {
        this.logger.error(`turn timeout ${tableId}: ${e.message}`);
        // База не приняла автоход — раунд не сдвинулся, а будильник уже
        // сгорел. Без нового стол стоял бы для всех сидящих.
        if (rt.seq === seq) this.armTurn(tableId, rt, RETRY_MS);
      });
    }, delay);
  }

  // ── Вид ───────────────────────────────────────────────────────

  private snapshot(tableId: string) {
    const rt = this.tables.get(tableId);
    if (!rt) return null;
    return {
      phase: rt.phase,
      bets: rt.bets,
      round: rt.round,
      roundId: rt.roundId,
      deadline: rt.deadline,
      sitOut: rt.sitOut,
    };
  }

  private loadTable(tableId: string) {
    return this.prisma.gameTable.findUnique({ where: { id: tableId }, include: { seats: true } });
  }

  private async loadBase(tableId: string) {
    const table = await this.prisma.gameTable.findUnique({
      where: { id: tableId },
      include: { seats: { include: { user: { select: { name: true } } } } },
    });
    if (!table) return null;
    const { seats, ...rest } = table;
    const rows: SeatRow[] = seats.map((s) => ({
      userId: s.userId,
      seatIndex: s.seatIndex,
      stack: s.stack,
      // Почту чужим не показываем даже куском: без имени место подписывает фронт.
      name: s.user?.name || null,
    }));
    return { table: rest, seats: rows };
  }

  /** Каждому зрителю — его вид: ходы и своя ставка у каждого свои. */
  private async broadcast(tableId: string) {
    try {
      const base = await this.loadBase(tableId);
      if (!base) return;
      const snap = this.snapshot(tableId);
      await this.gateway.emitPersonal(tableId, 'blackjack_state', (userId) =>
        buildView(base.table, base.seats, snap, userId),
      );
    } catch (e) {
      this.logger.error(`broadcast ${tableId}: ${(e as Error).message}`);
    }
  }
}
