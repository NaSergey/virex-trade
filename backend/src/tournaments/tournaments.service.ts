import { Injectable, Logger } from '@nestjs/common';
import type { Prisma, Tournament } from '@prisma/client';
import { CoinsService } from '../coins/coins.service';
import { LiveMarketService } from '../market-data/live-market.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTournamentDto } from './dto/tournament.dto';
import { rankParticipants } from './leaderboard';
import { payouts, prizePool, validateShares } from './prize';
import { ratingRows } from './rating';
import { FINAL_GRACE_MS, PUBLIC_LIST_LIMIT, RATING_LIMIT } from './tournament.config';
import {
  badPayout,
  creatorLeave,
  notCreator,
  notLobby,
  tooFewPlayers,
  tournamentFull,
  tournamentNotFound,
} from './tournament-errors';

const MINUTE_MS = 60_000;

/**
 * Ключ строки журнала монет для одного участия. Выход и повторный вход — это
 * два разных участия, и пара «взнос — возврат» у каждого своя: без времени
 * входа в ключе второй взнос упёрся бы в уникальный индекс журнала.
 */
const feeRef = (tournamentId: string, joinedAt: Date) => `${tournamentId}:${joinedAt.getTime()}`;

/**
 * Торговый турнир: лобби, старт, финал, рейтинг игры.
 *
 * Монеты и участие меняются одной транзакцией — состояние «взнос списан, а
 * участника нет» (и обратное) не должно существовать даже на мгновение.
 */
@Injectable()
export class TournamentsService {
  private readonly logger = new Logger(TournamentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly coins: CoinsService,
    private readonly live: LiveMarketService,
  ) {}

  async create(userId: string, dto: CreateTournamentDto) {
    // Победителей должно быть меньше, чем мест: иначе приз получают все, и
    // соревнование теряет смысл ещё до старта.
    if (dto.winnersCount >= dto.maxPlayers) throw badPayout();
    if (!validateShares(dto.payoutShares, dto.winnersCount)) throw badPayout();

    return this.prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.create({
        data: {
          name: dto.name.trim(),
          mode: 'live',
          visibility: dto.visibility ?? 'private',
          startBalance: dto.startBalance,
          maxPlayers: dto.maxPlayers,
          entryFee: dto.entryFee,
          prizeBonus: dto.prizeBonus,
          winnersCount: dto.winnersCount,
          payoutShares: dto.payoutShares,
          durationMin: dto.durationMin,
          creatorId: userId,
        },
      });
      const participant = await tx.tournamentParticipant.create({
        data: { tournamentId: tournament.id, userId },
      });
      await this.coins.charge(
        tx,
        userId,
        tournament.entryFee,
        'TOURNAMENT_FEE',
        feeRef(tournament.id, participant.joinedAt),
      );
      // Добавка — отдельная строка журнала: это не взнос за участие, и при
      // удалении лобби она возвращается своим ключом.
      await this.coins.charge(tx, userId, tournament.prizeBonus, 'TOURNAMENT_BONUS', tournament.id);
      return { tournament };
    });
  }

  /** Турниры, где я участник. Чужие сюда не попадают — только через ссылку. */
  async listMine(userId: string) {
    const rows = await this.prisma.tournament.findMany({
      where: { participants: { some: { userId } } },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { participants: true } } },
    });
    return rows.map(({ _count, ...t }) => ({ ...t, players: _count.participants }));
  }

  /**
   * Общий список открытых турниров: публичные лобби, где ещё есть места.
   * Заполненные отсеиваются после чтения — условия «участников меньше
   * maxPlayers» в одном запросе Prisma не выразить, а лобби в системе всегда
   * единицы.
   */
  async listPublic() {
    const rows = await this.prisma.tournament.findMany({
      where: { visibility: 'public', status: 'lobby' },
      orderBy: { createdAt: 'desc' },
      take: PUBLIC_LIST_LIMIT,
      include: { creator: { select: { name: true } }, _count: { select: { participants: true } } },
    });
    return rows
      .filter((t) => t._count.participants < t.maxPlayers)
      .map(({ _count, creator, ...t }) => ({
        ...t,
        players: _count.participants,
        creatorName: creator?.name ?? null,
        prizePool: prizePool(t, t.maxPlayers),
      }));
  }

  /**
   * Турнир целиком: состав, фонд, моё участие и моя сессия. Видит любой
   * вошедший со ссылкой — ссылка и есть приглашение.
   */
  async get(userId: string, id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: { participants: true, creator: { select: { name: true } } },
    });
    if (!tournament) throw tournamentNotFound();

    const users = await this.prisma.user.findMany({
      where: { id: { in: tournament.participants.map((p) => p.userId) } },
      select: { id: true, name: true },
    });
    const nameOf = new Map(users.map((u) => [u.id, u.name]));
    const mySession = await this.prisma.backtestSession.findFirst({
      where: { tournamentId: id, userId },
      select: { id: true },
    });

    const { participants, creator, ...rest } = tournament;
    const finished = tournament.status === 'finished';
    const me = participants.find((p) => p.userId === userId) ?? null;

    return {
      tournament: {
        ...rest,
        creatorName: creator?.name ?? null,
        players: participants.length,
        prizePool: prizePool(tournament, participants.length),
      },
      // Состав — именами: чужие результаты в турнире не показываются, таблицы
      // участников в продукте нет.
      participants: participants.map((p) => ({ userId: p.userId, name: nameOf.get(p.userId) ?? null })),
      // Призёры появляются только после финала — до него места не существует.
      winners: finished
        ? participants
            .filter((p) => p.place != null && p.place <= tournament.winnersCount)
            .sort((a, b) => a.place! - b.place!)
            .map((p) => ({ userId: p.userId, name: nameOf.get(p.userId) ?? null, place: p.place, prizeWon: p.prizeWon }))
        : [],
      me: me ? { place: me.place, finalEquity: me.finalEquity, prizeWon: me.prizeWon } : null,
      isParticipant: me != null,
      isCreator: tournament.creatorId === userId,
      sessionId: mySession?.id ?? null,
    };
  }

  async join(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.findUnique({ where: { id } });
      if (!tournament) throw tournamentNotFound();
      if (tournament.status !== 'lobby') throw notLobby();

      // Повторный вход — успех без изменений: человек мог обновить страницу
      // или нажать дважды, второй взнос за это брать не за что.
      const already = await tx.tournamentParticipant.findUnique({
        where: { tournamentId_userId: { tournamentId: id, userId } },
      });
      if (already) return { tournament };

      const players = await tx.tournamentParticipant.count({ where: { tournamentId: id } });
      if (players >= tournament.maxPlayers) throw tournamentFull();

      const participant = await tx.tournamentParticipant.create({ data: { tournamentId: id, userId } });
      await this.coins.charge(
        tx,
        userId,
        tournament.entryFee,
        'TOURNAMENT_FEE',
        feeRef(id, participant.joinedAt),
      );
      return { tournament };
    });
  }

  async leave(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.findUnique({ where: { id } });
      if (!tournament) throw tournamentNotFound();
      if (tournament.status !== 'lobby') throw notLobby();
      // Создателю выходить некуда: турнир останется без хозяина и без кнопки
      // старта. Вместо выхода он удаляет лобби.
      if (tournament.creatorId === userId) throw creatorLeave();

      const participant = await tx.tournamentParticipant.findUnique({
        where: { tournamentId_userId: { tournamentId: id, userId } },
      });
      if (!participant) return { success: true as const };

      await tx.tournamentParticipant.delete({ where: { tournamentId_userId: { tournamentId: id, userId } } });
      await this.coins.refund(tx, userId, tournament.entryFee, feeRef(id, participant.joinedAt));
      return { success: true as const };
    });
  }

  async start(userId: string, id: string) {
    const tournament = await this.prisma.tournament.findUnique({ where: { id } });
    if (!tournament) throw tournamentNotFound();
    if (tournament.creatorId !== userId) throw notCreator();
    if (tournament.status !== 'lobby') throw notLobby();

    const participants = await this.prisma.tournamentParticipant.findMany({ where: { tournamentId: id } });
    // Делить фонд не на кого, если призовых мест не меньше, чем участников.
    if (participants.length <= tournament.winnersCount) throw tooFewPlayers();

    // Конец выровнен по минуте: финальная цена обязана быть закрытием
    // конкретной минутки, одинаковым для всех участников.
    const startedAt = new Date();
    const endsAt = new Date(Math.floor(startedAt.getTime() / MINUTE_MS) * MINUTE_MS + tournament.durationMin * MINUTE_MS);

    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.tournament.updateMany({
        where: { id, status: 'lobby' },
        data: { status: 'running', startedAt, endsAt },
      });
      // Кто-то успел стартовать первым — второй раздачи сессий быть не должно.
      if (moved.count === 0) throw notLobby();

      for (const p of participants) {
        await tx.backtestSession.create({
          data: {
            userId: p.userId,
            tournamentId: id,
            startTime: startedAt,
            cursorTime: startedAt,
            endTime: endsAt,
            startBalance: tournament.startBalance,
            balance: tournament.startBalance,
            // В эфире торгуют настоящий BTC: прятать дату и масштабировать
            // цену бессмысленно — и то и другое видно в любом терминале.
            hideDate: false,
            hidePrice: false,
            priceScale: 1,
            status: 'active',
          },
        });
      }
      return { tournament: { ...tournament, status: 'running', startedAt, endsAt } };
    });
  }

  async remove(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.findUnique({ where: { id } });
      if (!tournament) throw tournamentNotFound();
      if (tournament.creatorId !== userId) throw notCreator();
      // У идущего турнира есть сессии других людей — удалять его нельзя.
      if (tournament.status !== 'lobby') throw notLobby();

      const participants = await tx.tournamentParticipant.findMany({ where: { tournamentId: id } });
      for (const p of participants) {
        await this.coins.refund(tx, p.userId, tournament.entryFee, feeRef(id, p.joinedAt));
      }
      if (tournament.creatorId) {
        await this.coins.refund(tx, tournament.creatorId, tournament.prizeBonus, `${id}:bonus`);
      }
      await tx.tournament.delete({ where: { id } });
      return { success: true as const };
    });
  }

  /** Турниры, которым пора подводить итоги: срок вышел с запасом на минутку. */
  dueForFinal(now: Date) {
    return this.prisma.tournament.findMany({
      where: { status: 'running', endsAt: { lte: new Date(now.getTime() - FINAL_GRACE_MS) } },
    });
  }

  /**
   * Итоги турнира: места, выплаты, статус.
   *
   * Смена статуса — condition update (`running` → `finished`), и всё остальное
   * идёт в той же транзакции: второй финал не выплатит фонд повторно, а
   * упавший процесс не оставит завершённый турнир без мест.
   *
   * Позиции к этому моменту уже закрыты движком по цене последней минутки, так
   * что эквити равно депозиту сессии.
   */
  async finalize(tournament: Tournament): Promise<boolean> {
    const [participants, sessions] = await Promise.all([
      this.prisma.tournamentParticipant.findMany({ where: { tournamentId: tournament.id } }),
      this.prisma.backtestSession.findMany({ where: { tournamentId: tournament.id } }),
    ]);
    const sessionOf = new Map(sessions.map((s) => [s.userId, s]));
    const ranked = rankParticipants(
      participants.map((p) => ({
        userId: p.userId,
        joinedAt: p.joinedAt,
        session: sessionOf.get(p.userId) ?? null,
        openTrades: [],
        mark: null,
      })),
    );

    const pool = prizePool(tournament, participants.length);
    const prizes = payouts(pool, tournament.payoutShares);

    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.tournament.updateMany({
        where: { id: tournament.id, status: 'running' },
        data: { status: 'finished', finishedAt: new Date() },
      });
      if (moved.count === 0) return false; // финал уже подвели

      for (const row of ranked) {
        const prize = row.place <= tournament.winnersCount ? (prizes[row.place - 1] ?? 0) : 0;
        await tx.tournamentParticipant.update({
          where: { tournamentId_userId: { tournamentId: tournament.id, userId: row.userId } },
          data: { finalEquity: row.equity, place: row.place, prizeWon: prize },
        });
        await this.coins.credit(tx, row.userId, prize, 'TOURNAMENT_PRIZE', tournament.id);
      }
      return true;
    });
  }

  /** Рейтинг игры — по всем завершённым турнирам. См. `rating.ts`. */
  async rating(userId: string) {
    const rows = await this.prisma.tournamentParticipant.findMany({
      where: { place: { not: null }, tournament: { status: 'finished' } },
      select: { tournamentId: true, userId: true, place: true, user: { select: { name: true } } },
    });
    return ratingRows(
      rows.map((r) => ({
        tournamentId: r.tournamentId,
        userId: r.userId,
        name: r.user?.name ?? '—',
        place: r.place!,
      })),
      userId,
      RATING_LIMIT,
    );
  }

  /** Живая цена для оценки открытых позиций; недоступна — оценивать нечем. */
  async markPrice(): Promise<number | null> {
    try {
      return (await this.live.quote()).price;
    } catch {
      return null;
    }
  }
}
