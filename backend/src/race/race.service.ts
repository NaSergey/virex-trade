import { randomInt, randomUUID } from 'crypto';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { BattlePassService } from '../battlepass/battlepass.service';
import { XP_SOURCES } from '../battlepass/xp-registry';
import { CoinsService } from '../coins/coins.service';
import { GamesGateway } from '../games/games.gateway';
import { PrismaService } from '../prisma/prisma.service';
import {
  BOT_NAMES,
  INPUT_RATE,
  RESULT_KEEP_MS,
  RETRY_MS,
  ROOM_PREFIX,
  STAKES,
  TICK_MS,
  WAIT_MS,
} from './race.config';
import {
  raceAlreadyIn,
  raceBadCar,
  raceBadStake,
  raceNotIn,
  raceStarted,
} from './race-errors';
import { RaceRuntime } from './race-runtime';
import {
  buildView,
  type Entry,
  type RaceRecord,
  type RaceWire,
  type ResultRow,
} from './race-view';
import { CAR_IDS, progressOf, ranking, type CarId, type SimEvent } from './sim';

/**
 * Гонки: лобби по ставкам, старт с ботами, такт симуляции, финиш с выплатой.
 * Всё в памяти процесса игр (`ROLE=games`, он один) — как раздачи и раунд
 * джетпака; деньги — транзакциями. Спека — `2026-10-18-race-game-design.md`.
 *
 * Лобби, старт, выход и финиш — через одну очередь (`exclusive`): вход и
 * таймер ботов не должны разойтись на одном месте. Такт симуляции идёт мимо
 * очереди — он трогает только память.
 */
@Injectable()
export class RaceService
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(RaceService.name);
  private queue: Promise<unknown> = Promise.resolve();
  /** Собирающаяся гонка ставки. */
  private readonly lobbies = new Map<number, RaceRecord>();
  /** Все гонки в памяти: лобби, идущие и законченные, пока помнится итог. */
  private readonly races = new Map<string, RaceRecord>();
  /** Где человек сейчас: лобби или идущая гонка. */
  private readonly seatOf = new Map<string, string>();
  /** Последняя законченная гонка человека — для итога на странице. */
  private readonly lastOf = new Map<string, string>();
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly rate = new Map<string, { sec: number; n: number }>();
  private loop: NodeJS.Timeout | null = null;

  /** Зерно — криптослучайное; тесты подменяют. */
  seed: () => number = () => randomInt(0, 2 ** 31 - 1);

  constructor(
    private readonly prisma: PrismaService,
    private readonly coins: CoinsService,
    private readonly gateway: GamesGateway,
    private readonly battlePass: BattlePassService,
  ) {}

  onModuleInit() {
    this.gateway.listen('race_input', (userId, payload) =>
      this.input(userId, payload),
    );
  }

  /**
   * Гонка без `finishedAt` при старте процесса — прервана перезапуском (лобби
   * тоже): живым возвращаются взносы. Банк теряется, деньги — нет.
   */
  async onApplicationBootstrap() {
    let open: {
      id: string;
      stake: number;
      entries: { userId: string | null; joinedAt: Date }[];
    }[];
    try {
      open = await this.prisma.raceRound.findMany({
        where: { finishedAt: null },
        select: {
          id: true,
          stake: true,
          entries: { select: { userId: true, joinedAt: true } },
        },
      });
    } catch (e) {
      this.logger.error(`interrupted races: ${(e as Error).message}`);
      return;
    }
    for (const r of open) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const moved = await tx.raceRound.updateMany({
            where: { id: r.id, finishedAt: null },
            data: { finishedAt: new Date(), voided: true },
          });
          if (moved.count === 0) return;
          for (const e of r.entries)
            if (e.userId)
              await this.coins.credit(
                tx,
                e.userId,
                r.stake,
                'RACE_REFUND',
                refOf(r.id, e.joinedAt),
              );
        });
      } catch (e) {
        this.logger.error(`void race ${r.id}: ${(e as Error).message}`);
      }
    }
  }

  onModuleDestroy() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
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

  private later(ms: number, fn: () => Promise<void>) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      void this.exclusive(fn).catch(this.log('timer'));
    }, ms);
    this.timers.add(t);
  }

  private emit(rec: RaceRecord, events: SimEvent[]) {
    const now = Date.now();
    void this.gateway
      .emitPersonal(ROOM_PREFIX + rec.id, 'race_state', (userId) =>
        buildView(rec, userId, now, events),
      )
      .catch(this.log('emit'));
  }

  // ── действия игрока ───────────────────────────────────────────

  view(userId: string): RaceWire {
    const id = this.seatOf.get(userId) ?? this.lastOf.get(userId);
    return buildView(
      (id && this.races.get(id)) || null,
      userId,
      Date.now(),
      [],
    );
  }

  join(userId: string, stake: number, car: string): Promise<RaceWire> {
    return this.exclusive(async () => {
      if (!STAKES.includes(stake)) throw raceBadStake();
      if (!(CAR_IDS as readonly string[]).includes(car)) throw raceBadCar();
      if (this.seatOf.has(userId)) throw raceAlreadyIn();

      // Строка гонки создаётся той же транзакцией, что и взнос: отказ в монетах
      // не оставляет пустого лобби.
      const open = this.lobbies.get(stake);
      const id = open?.id ?? randomUUID();
      const seed = open?.seed ?? this.seed();
      const slot = [0, 1, 2].find(
        (s) => !open?.entries.some((e) => e.slot === s),
      )!;
      const joinedAt = new Date();
      const row = await this.prisma.$transaction(async (tx) => {
        if (!open) await tx.raceRound.create({ data: { id, stake, seed } });
        await this.coins.charge(
          tx,
          userId,
          stake,
          'RACE_STAKE',
          refOf(id, joinedAt),
        );
        return tx.raceEntry.create({
          data: { raceId: id, userId, slot, car, joinedAt },
          select: { id: true, user: { select: { name: true } } },
        });
      });

      let rec = open;
      if (!rec) {
        const now = Date.now();
        rec = {
          id,
          stake,
          seed,
          createdAt: now,
          lobbyEndsAt: now + WAIT_MS,
          entries: [],
          runtime: null,
          result: null,
          finishing: false,
          closed: false,
        };
        this.lobbies.set(stake, rec);
        this.races.set(id, rec);
        const opened = rec;
        this.later(WAIT_MS, () => this.start(opened));
      }
      rec.entries.push({
        entryId: row.id,
        slot,
        userId,
        name: row.user?.name ?? null,
        car: car as CarId,
        joinedAt,
        bot: false,
      });
      rec.entries.sort((a, b) => a.slot - b.slot);
      this.seatOf.set(userId, id);
      this.lastOf.delete(userId);
      if (rec.entries.length === 3) {
        // Полное лобби больше не принимает: если старт не пройдёт с первого раза,
        // следующий вошедший откроет новое, а не упрётся в занятые места.
        this.lobbies.delete(stake);
        await this.start(rec);
      } else this.emit(rec, []);
      return buildView(rec, userId, Date.now(), []);
    });
  }

  leave(userId: string): Promise<RaceWire> {
    return this.exclusive(async () => {
      const id = this.seatOf.get(userId);
      const rec = id ? this.races.get(id) : undefined;
      if (!rec) throw raceNotIn();
      if (rec.runtime) throw raceStarted();
      const entry = rec.entries.find((e) => e.userId === userId)!;
      const last = rec.entries.length === 1;
      await this.prisma.$transaction(async (tx) => {
        await tx.raceEntry.delete({ where: { id: entry.entryId } });
        await this.coins.credit(
          tx,
          userId,
          rec.stake,
          'RACE_REFUND',
          refOf(rec.id, entry.joinedAt),
        );
        if (last) await tx.raceRound.delete({ where: { id: rec.id } });
      });
      rec.entries = rec.entries.filter((e) => e !== entry);
      this.seatOf.delete(userId);
      this.rate.delete(userId);
      if (last) {
        rec.closed = true;
        if (this.lobbies.get(rec.stake) === rec) this.lobbies.delete(rec.stake);
        this.races.delete(rec.id);
      } else this.emit(rec, []);
      return buildView(null, userId, Date.now(), []);
    });
  }

  /**
   * Нажатия из сокета: `{ raceId, t, l, r, b }`. Чужая гонка, кривая форма и
   * больше `INPUT_RATE` в секунду — мимо: это руль, а не деньги, и отказ ему
   * не нужен.
   */
  input(userId: string, payload: unknown) {
    if (!payload || typeof payload !== 'object') return;
    const p = payload as Record<string, unknown>;
    const id = this.seatOf.get(userId);
    if (!id || p.raceId !== id || typeof p.t !== 'number') return;
    const rec = this.races.get(id);
    const rt = rec?.runtime;
    if (!rec || !rt || rec.result) return;
    const now = Date.now();
    const sec = Math.floor(now / 1000);
    const r = this.rate.get(userId);
    if (r && r.sec === sec) {
      if (++r.n > INPUT_RATE) return;
    } else this.rate.set(userId, { sec, n: 1 });
    const slot = rec.entries.find((e) => e.userId === userId)?.slot;
    if (slot === undefined) return;
    rt.push(
      slot,
      p.t,
      { left: p.l === true, right: p.r === true, brake: p.b === true },
      now,
    );
  }

  // ── жизнь гонки ───────────────────────────────────────────────

  /** Старт: пустые места — ботам, строка гонки и опыт живым — одной транзакцией. */
  private async start(rec: RaceRecord) {
    if (rec.closed || rec.runtime) return;
    const humans = rec.entries.filter((e) => !e.bot);
    if (!humans.length) return;
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const free = [0, 1, 2].filter(
      (s) => !rec.entries.some((e) => e.slot === s),
    );
    const joinedAt = new Date();
    const bots: Entry[] = free.map((slot, i) => ({
      entryId: '',
      slot,
      userId: null,
      name: names[i],
      car: CAR_IDS[randomInt(CAR_IDS.length)],
      joinedAt,
      bot: true,
    }));
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.raceRound.updateMany({
          where: { id: rec.id, startedAt: null },
          data: { startedAt: new Date() },
        });
        if (bots.length)
          await tx.raceEntry.createMany({
            data: bots.map((b) => ({
              raceId: rec.id,
              userId: null,
              botName: b.name,
              slot: b.slot,
              car: b.car,
              joinedAt,
            })),
          });
        for (const h of humans)
          await this.battlePass.award(
            tx,
            h.userId!,
            'game.race',
            rec.id,
            XP_SOURCES['game.race'].base,
          );
      });
    } catch (e) {
      this.logger.error(`start race ${rec.id}: ${(e as Error).message}`);
      this.later(RETRY_MS, () => this.start(rec));
      return;
    }
    rec.entries = [...rec.entries, ...bots].sort((a, b) => a.slot - b.slot);
    if (this.lobbies.get(rec.stake) === rec) this.lobbies.delete(rec.stake);
    rec.runtime = new RaceRuntime(
      Date.now(),
      rec.seed,
      rec.entries.map((e) => ({ slot: e.slot, car: e.car, bot: e.bot })),
      this.seed(),
    );
    this.emit(rec, []);
    if (!this.loop) this.loop = setInterval(() => this.tick(), TICK_MS);
  }

  /** Такт: догнать симуляцию, разослать снимок, закончившуюся — к финишу. */
  private tick() {
    const now = Date.now();
    let running = 0;
    for (const rec of this.races.values()) {
      const rt = rec.runtime;
      if (!rt || rec.result) continue;
      running++;
      // Сбой одной гонки не должен ронять процесс игр: в нём же раздачи и джетпак.
      try {
        rt.advance(now);
        this.emit(rec, rt.drain());
      } catch (e) {
        this.logger.error(`tick race ${rec.id}: ${(e as Error).message}`);
        continue;
      }
      if (rt.state.over && !rec.finishing) {
        rec.finishing = true;
        void this.exclusive(() => this.finish(rec)).catch(this.log('finish'));
      }
    }
    if (!running && this.loop) {
      clearInterval(this.loop);
      this.loop = null;
    }
  }

  /**
   * Финиш: места и выплата — одной транзакцией, условным `updateMany` по
   * `finishedAt: null`: второй финиш той же гонки ничего не найдёт и не заплатит.
   * Выигрыш бота сгорает — он играет за заведение.
   */
  private async finish(rec: RaceRecord) {
    const rt = rec.runtime!;
    const order = ranking(rt.state.cars);
    const pot = rec.stake * 3;
    const winner = rec.entries[order[0].slot];
    const rows: ResultRow[] = order.map((c, i) => ({
      slot: c.slot,
      place: i + 1,
      finishMs: c.finished ? Math.round(c.finishT * 1000) : null,
      progress: progressOf(c),
      payout: i === 0 && !winner.bot ? pot : 0,
    }));
    try {
      await this.prisma.$transaction(async (tx) => {
        const done = await tx.raceRound.updateMany({
          where: { id: rec.id, finishedAt: null },
          data: { finishedAt: new Date() },
        });
        if (done.count === 0) return;
        for (const r of rows)
          await tx.raceEntry.updateMany({
            where: { raceId: rec.id, slot: r.slot },
            data: {
              place: r.place,
              finishMs: r.finishMs,
              progress: r.progress,
              payout: r.payout,
            },
          });
        // Аккаунт победителя удалён — платить некому; без проверки начисление
        // падало бы на каждом повторе, и гонка не заканчивалась бы ни для кого.
        const payee =
          !winner.bot &&
          (await tx.user.findUnique({
            where: { id: winner.userId! },
            select: { id: true },
          }));
        if (payee)
          await this.coins.credit(tx, winner.userId!, pot, 'RACE_WIN', rec.id);
      });
    } catch (e) {
      this.logger.error(`finish race ${rec.id}: ${(e as Error).message}`);
      this.later(RETRY_MS, () => this.finish(rec));
      return;
    }
    rec.result = rows;
    for (const e of rec.entries) {
      if (!e.userId) continue;
      this.seatOf.delete(e.userId);
      this.lastOf.set(e.userId, rec.id);
      this.rate.delete(e.userId);
    }
    this.emit(rec, rt.drain());
    this.later(RESULT_KEEP_MS, async () => {
      this.races.delete(rec.id);
      for (const e of rec.entries)
        if (e.userId && this.lastOf.get(e.userId) === rec.id)
          this.lastOf.delete(e.userId);
    });
  }
}

/** Ключ журнала монет участия: вход и выход в ту же гонку — два участия, как у турнира. */
const refOf = (raceId: string, joinedAt: Date) =>
  `${raceId}:${joinedAt.getTime()}`;
