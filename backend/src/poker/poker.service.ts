import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { gameTableNotFound } from '../games/game-errors';
import { GamesGateway } from '../games/games.gateway';
import { GamesService, TableEngine } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { shuffled } from '../games/cards';
import { Action, act, forceFold, HandState, HoldemError, legal, startHand } from './holdem';
import { FIRST_HAND_MS, NEXT_HAND_MS, TURN_MS } from './poker.config';
import { pokerBadAction, pokerNoHand, pokerNotPoker, pokerNotYourTurn } from './poker-errors';
import { buildView, SeatRow, TableRow } from './poker-view';


interface Runtime {
  hand: HandState | null;
  handId: string | null;
  /** Номер места прошлой кнопки — кнопка идёт по кругу. */
  buttonSeat: number;
  sitOut: Set<string>;
  foldAny: Set<string>;
  /** Последнее действие на текущей улице — подпись у места. */
  lastAction: Map<string, string>;
  queue: Promise<unknown>;
  /** Растёт на каждом изменении: таймер, заведённый до него, устарел. */
  seq: number;
  deadline: number | null;
  turnTimer: NodeJS.Timeout | null;
  nextTimer: NodeJS.Timeout | null;
}

/**
 * Рантайм покерных столов: раздача в памяти процесса игр, деньги — в БД.
 *
 * Все операции стола идут через одну очередь (`exclusive`): действие, таймаут,
 * старт раздачи, уход. Фишки, поставленные в банк, списываются с места той же
 * транзакцией, что записывает вклад в `GameHand`, — поэтому перезапуск посреди
 * раздачи не теряет денег: вклады возвращаются при старте
 * (`GamesService.onApplicationBootstrap`). Подробности — спека
 * `docs/superpowers/specs/2026-09-23-poker-holdem-design.md`.
 */
@Injectable()
export class PokerService implements TableEngine, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PokerService.name);
  private readonly tables = new Map<string, Runtime>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly games: GamesService,
    private readonly gateway: GamesGateway,
  ) {}

  onModuleInit() {
    this.games.registerEngine('poker', this);
  }

  onModuleDestroy() {
    for (const rt of this.tables.values()) {
      if (rt.turnTimer) clearTimeout(rt.turnTimer);
      if (rt.nextTimer) clearTimeout(rt.nextTimer);
    }
  }

  private rt(tableId: string): Runtime {
    let rt = this.tables.get(tableId);
    if (!rt) {
      rt = {
        hand: null,
        handId: null,
        buttonSeat: -1,
        sitOut: new Set(),
        foldAny: new Set(),
        lastAction: new Map(),
        queue: Promise.resolve(),
        seq: 0,
        deadline: null,
        turnTimer: null,
        nextTimer: null,
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

  private live(rt: Runtime) {
    return rt.hand && rt.hand.street !== 'done' ? rt.hand : null;
  }

  // ── TableEngine ───────────────────────────────────────────────

  async onLeaving(tableId: string, userId: string) {
    const rt = this.rt(tableId);
    rt.sitOut.delete(userId);
    rt.foldAny.delete(userId);
    const hand = this.live(rt);
    if (!hand || !hand.players.some((p) => p.userId === userId && !p.folded)) return;
    await this.commit(tableId, rt, forceFold(hand, userId), userId, 'fold');
  }

  onSeatsChanged(tableId: string) {
    const rt = this.rt(tableId);
    if (!this.live(rt)) this.scheduleNext(tableId, rt, rt.hand ? NEXT_HAND_MS : FIRST_HAND_MS);
    void this.broadcast(tableId);
  }

  // ── Действия игрока ───────────────────────────────────────────

  async view(userId: string, tableId: string) {
    const base = await this.loadBase(tableId);
    if (!base) throw gameTableNotFound();
    if (base.table.gameType !== 'poker') throw pokerNotPoker();
    // Раздача живёт в памяти, и после перезапуска `api` стол о себе не
    // вспомнит, пока кто-нибудь не сядет или не встанет. Открытие стола —
    // тоже повод проверить, не пора ли раздавать: иначе люди сидели бы за
    // замершим столом. Лишнего не будет: `scheduleNext` не заводит второй
    // таймер, а `tryStart` молчит, когда рано.
    if (base.table.status === 'open' && base.seats.length >= 2) {
      const rt = this.rt(tableId);
      if (!this.live(rt)) this.scheduleNext(tableId, rt, FIRST_HAND_MS);
    }
    return buildView(base.table, base.seats, this.snapshot(tableId), userId);
  }

  act(userId: string, tableId: string, action: Action) {
    return this.exclusive(tableId, async () => {
      const rt = this.rt(tableId);
      const hand = this.live(rt);
      if (!hand) throw pokerNoHand();
      let next: HandState;
      try {
        next = act(hand, userId, action);
      } catch (e) {
        if (e instanceof HoldemError && e.code === 'NOT_YOUR_TURN') throw pokerNotYourTurn();
        if (e instanceof HoldemError) throw pokerBadAction();
        throw e;
      }
      await this.commit(tableId, rt, next, userId, action.type);
      return { success: true as const };
    });
  }

  /** Переключатели игрока. Sit out действует со следующей раздачи. */
  async setFlags(userId: string, tableId: string, flags: { sitOut?: boolean; foldAny?: boolean }) {
    await this.exclusive(tableId, async () => {
      const rt = this.rt(tableId);
      if (flags.sitOut !== undefined) {
        if (flags.sitOut) rt.sitOut.add(userId);
        else rt.sitOut.delete(userId);
      }
      if (flags.foldAny !== undefined) {
        if (flags.foldAny) rt.foldAny.add(userId);
        else rt.foldAny.delete(userId);
      }
      // Вернулся из sit out — может, теперь хватает игроков на раздачу.
      if (!this.live(rt)) this.scheduleNext(tableId, rt, FIRST_HAND_MS);
      // «Сброс на любую ставку», включённый в свой ход, срабатывает сразу.
      this.armTurn(tableId, rt);
    });
    void this.broadcast(tableId);
    return { success: true as const };
  }

  // ── Раздача ───────────────────────────────────────────────────

  private scheduleNext(tableId: string, rt: Runtime, delay: number) {
    if (rt.nextTimer) return;
    rt.nextTimer = setTimeout(() => {
      rt.nextTimer = null;
      void this.exclusive(tableId, () => this.tryStart(tableId)).catch((e: Error) =>
        this.logger.error(`start hand ${tableId}: ${e.message}`),
      );
    }, delay);
  }

  private async tryStart(tableId: string) {
    const rt = this.rt(tableId);
    if (this.live(rt)) return;
    const table = await this.prisma.gameTable.findUnique({ where: { id: tableId }, include: { seats: true } });
    if (!table || table.status !== 'open' || table.gameType !== 'poker' || !table.bigBlind) return;
    const players = table.seats
      .filter((s) => s.stack > 0 && !rt.sitOut.has(s.userId))
      .map((s) => ({ userId: s.userId, seatIndex: s.seatIndex, stack: s.stack }));
    if (players.length < 2) {
      // Раздавать не с кем — стол ждёт. Итог прошлой раздачи с него убирается:
      // он уже показан положенную паузу, а оставленный висеть выглядел бы
      // идущей раздачей — с рубашками карт у того, кто остался за столом.
      if (rt.hand) {
        rt.hand = null;
        rt.handId = null;
        rt.lastAction.clear();
        void this.broadcast(tableId);
      }
      return;
    }
    const bb = table.bigBlind;
    const hand = startHand(players, rt.buttonSeat, Math.floor(bb / 2), bb, shuffled());
    const contributions = Object.fromEntries(hand.players.map((p) => [p.userId, p.committed]));

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.gameHand.create({ data: { tableId, contributions } });
      for (const p of hand.players) {
        if (p.committed > 0) {
          await tx.gameSeat.update({
            where: { tableId_userId: { tableId, userId: p.userId } },
            data: { stack: { decrement: p.committed } },
          });
        }
      }
      if (hand.street === 'done') await this.settle(tx, tableId, created.id, hand);
      return created;
    });

    rt.hand = hand;
    rt.handId = row.id;
    rt.buttonSeat = hand.players[hand.button].seatIndex;
    rt.lastAction.clear();
    this.afterChange(tableId, rt);
  }

  /**
   * Новое состояние раздачи — в БД и в память. Разница вкладов списывается со
   * стеков той же транзакцией, что пишет вклады; конец раздачи — выплаты туда же.
   */
  private async commit(tableId: string, rt: Runtime, next: HandState, userId: string, label: string) {
    const prev = rt.hand!;
    const handId = rt.handId!;
    await this.prisma.$transaction(async (tx) => {
      for (const p of next.players) {
        const before = prev.players.find((o) => o.userId === p.userId)!.committed;
        if (p.committed > before) {
          await tx.gameSeat.update({
            where: { tableId_userId: { tableId, userId: p.userId } },
            data: { stack: { decrement: p.committed - before } },
          });
        }
      }
      const contributions = Object.fromEntries(next.players.map((p) => [p.userId, p.committed]));
      await tx.gameHand.update({ where: { id: handId }, data: { contributions } });
      if (next.street === 'done') await this.settle(tx, tableId, handId, next);
    });

    // Подпись действия живёт до конца улицы; сброшенного и так видно по месту.
    if (next.street !== prev.street && next.street !== 'done') rt.lastAction.clear();
    else rt.lastAction.set(userId, label);
    rt.hand = next;
    this.afterChange(tableId, rt);
  }

  private async settle(tx: Prisma.TransactionClient, tableId: string, handId: string, hand: HandState) {
    for (const [userId, amount] of Object.entries(hand.result!.payouts)) {
      if (amount > 0) {
        await tx.gameSeat.update({
          where: { tableId_userId: { tableId, userId } },
          data: { stack: { increment: amount } },
        });
      }
    }
    await tx.gameHand.update({ where: { id: handId }, data: { finishedAt: new Date() } });
  }

  private afterChange(tableId: string, rt: Runtime) {
    rt.seq++;
    this.clearTurn(rt);
    if (this.live(rt)) this.armTurn(tableId, rt);
    else {
      // «Сброс на любую ставку» — отметка на одну раздачу, как в любом
      // клиенте: оставленная навсегда, она сбрасывала бы все следующие руки
      // человека, который о ней забыл.
      rt.foldAny.clear();
      this.scheduleNext(tableId, rt, NEXT_HAND_MS);
    }
    void this.broadcast(tableId);
  }

  private clearTurn(rt: Runtime) {
    if (rt.turnTimer) clearTimeout(rt.turnTimer);
    rt.turnTimer = null;
    rt.deadline = null;
  }

  /** Таймер хода — или немедленный автоход, если у игрока стоит «сброс на любую ставку». */
  private armTurn(tableId: string, rt: Runtime) {
    const hand = this.live(rt);
    if (!hand || hand.toAct === null) return;
    const player = hand.players[hand.toAct];
    const seq = rt.seq;
    const auto = (timedOut: boolean) =>
      this.exclusive(tableId, async () => {
        const cur = this.live(rt);
        if (!cur || rt.seq !== seq || cur.toAct === null || cur.players[cur.toAct].userId !== player.userId) return;
        const type = legal(cur, player.userId)!.canCheck ? 'check' : 'fold';
        // Отошедший не должен тормозить и следующие раздачи.
        if (timedOut) rt.sitOut.add(player.userId);
        await this.commit(tableId, rt, act(cur, player.userId, { type }), player.userId, type);
      }).catch((e: Error) => this.logger.error(`auto action ${tableId}: ${e.message}`));

    if (rt.foldAny.has(player.userId)) {
      this.clearTurn(rt);
      setTimeout(() => void auto(false), 300);
      return;
    }
    if (rt.turnTimer) return; // таймер этого хода уже идёт
    rt.deadline = Date.now() + TURN_MS;
    rt.turnTimer = setTimeout(() => void auto(true), TURN_MS);
  }

  // ── Вид ───────────────────────────────────────────────────────

  private snapshot(tableId: string) {
    const rt = this.tables.get(tableId);
    if (!rt) return null;
    return {
      hand: rt.hand,
      handId: rt.handId,
      deadline: rt.deadline,
      sitOut: rt.sitOut,
      foldAny: rt.foldAny,
      lastAction: rt.lastAction,
    };
  }

  private async loadBase(tableId: string): Promise<{ table: TableRow; seats: SeatRow[] } | null> {
    const table = await this.prisma.gameTable.findUnique({
      where: { id: tableId },
      include: { seats: { include: { user: { select: { name: true } } } } },
    });
    if (!table) return null;
    const { seats, ...rest } = table;
    return {
      table: rest,
      seats: seats.map((s) => ({
        userId: s.userId,
        seatIndex: s.seatIndex,
        stack: s.stack,
        // Почту чужим не показываем даже куском: без имени место подписывает фронт.
        name: s.user?.name || null,
      })),
    };
  }

  /** Каждому зрителю стола — его вид: свои карты видит только владелец. */
  private async broadcast(tableId: string) {
    try {
      const base = await this.loadBase(tableId);
      if (!base) return;
      const snap = this.snapshot(tableId);
      await this.gateway.emitPersonal(tableId, 'poker_state', (userId) =>
        buildView(base.table, base.seats, snap, userId),
      );
    } catch (e) {
      this.logger.error(`broadcast ${tableId}: ${(e as Error).message}`);
    }
  }
}
