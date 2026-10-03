import { Injectable, Logger } from '@nestjs/common';
import type { Prisma, Tournament } from '@prisma/client';
import { closedNumbers, summarize } from '../backtest/backtest-math';
import { BattlePassService } from '../battlepass/battlepass.service';
import { tournamentXp } from '../battlepass/xp-registry';
import { CoinsService } from '../coins/coins.service';
import { LiveMarketService } from '../market-data/live-market.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTournamentDto } from './dto/tournament.dto';
import { boardOrder, type BoardRelation } from './board';
import { teamOutcome, teamPrizes } from './teams';
import { rankParticipants } from './leaderboard';
import { payouts, prizePool, validateShares } from './prize';
import { pickRows, rankAll, type RatingRow } from './rating';
import { startTimeFrom } from './schedule';
import { FEED_LIMIT, FINAL_GRACE_MS, MIN_PLAYERS, PUBLIC_LIST_LIMIT, RATING_LIMIT } from './tournament.config';
import {
  badPayout,
  badStart,
  badTeamSize,
  creatorLeave,
  notCreator,
  notLobby,
  notParticipant,
  notRunning,
  notTeams,
  notTournamentAdmin,
  scheduledStart,
  teamFull,
  teamRequired,
  tournamentClosed,
  tournamentFull,
  tournamentNotFound,
} from './tournament-errors';
import { isOwnerEmail } from '../admin/owner';

const MINUTE_MS = 60_000;
/** Рейтинг пересчитывается не чаще раза в час — см. `rankedTable`. */
const RATING_TTL_MS = 60 * MINUTE_MS;

/** Поля сделки для ленты и для блока «Сделки» в окне турнира — одна форма на оба. */
const FEED_SELECT = {
  id: true,
  symbol: true,
  direction: true,
  leverage: true,
  entryTime: true,
  entryPrice: true,
  stopLoss: true,
  takeProfit: true,
  exitTime: true,
  pnl: true,
  session: {
    select: {
      userId: true,
      user: { select: { name: true } },
      tournament: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.BacktestTradeSelect;

/** В каждой команде хотя бы один — без этого командному турниру не с кем играть. */
function bothTeams(participants: { team: number | null }[]): boolean {
  return participants.some((p) => p.team === 0) && participants.some((p) => p.team === 1);
}

/** Сделка плоской строкой: игрок и турнир рядом с ценами, без вложенной сессии. */
function feedRow({ session, ...trade }: Prisma.BacktestTradeGetPayload<{ select: typeof FEED_SELECT }>) {
  return {
    id: trade.id,
    tournamentId: session.tournament!.id,
    tournamentName: session.tournament!.name,
    userId: session.userId,
    playerName: session.user?.name ?? null,
    symbol: trade.symbol,
    direction: trade.direction,
    leverage: trade.leverage,
    entryTime: trade.entryTime,
    entryPrice: trade.entryPrice,
    stopLoss: trade.stopLoss,
    takeProfit: trade.takeProfit,
    exitTime: trade.exitTime,
    pnl: trade.pnl,
  };
}

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
    private readonly battlePass: BattlePassService,
  ) {}

  async create(userId: string, dto: CreateTournamentDto) {
    const teams = dto.format === 'teams';
    if (teams && dto.teamSize == null) throw badTeamSize();
    // У команд места, победители и доли выводятся из размера команды: фонд —
    // победившей стороне поровну (`teamPrizes`), делить его по местам не на
    // что. Присланное формой для команд не читается.
    const maxPlayers = teams ? dto.teamSize! * 2 : dto.maxPlayers;
    const winnersCount = teams ? 1 : dto.winnersCount;
    const payoutShares = teams ? [100] : dto.payoutShares;
    // Победителей арены должно быть меньше, чем мест: иначе приз получают все,
    // и соревнование теряет смысл ещё до старта.
    if (!teams && winnersCount >= maxPlayers) throw badPayout();
    if (!validateShares(payoutShares, winnersCount)) throw badPayout();
    const startsAt = dto.startsAt != null ? startTimeFrom(dto.startsAt, Date.now()) : null;
    if (dto.startsAt != null && startsAt == null) throw badStart();

    return this.prisma.$transaction(async (tx) => {
      const tournament = await tx.tournament.create({
        data: {
          name: dto.name.trim(),
          mode: 'live',
          visibility: dto.visibility ?? 'private',
          format: teams ? 'teams' : 'arena',
          teamSize: teams ? dto.teamSize : null,
          startBalance: dto.startBalance,
          maxPlayers,
          entryFee: dto.entryFee,
          prizeBonus: dto.prizeBonus,
          winnersCount,
          payoutShares,
          durationMin: dto.durationMin,
          startsAt,
          creatorId: userId,
        },
      });
      // Создатель командного турнира встаёт в команду A; переставить себя
      // он может так же, как любого другого (`moveTeam`).
      const participant = await tx.tournamentParticipant.create({
        data: { tournamentId: tournament.id, userId, team: teams ? 0 : null },
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

  /**
   * Общая таблица турниров — одна на странице игры (решение владельца
   * 2026-09-26; прежде было два списка, «Мои» и «Открытые»).
   *
   * Свои — все, в любом статусе: к ним возвращаются торговать и за итогами.
   * Чужие — только публичные в наборе и идущие, заполненные тоже: за идущим
   * смотрят, а не только входят в него. Чужие завершённые не показываются —
   * это уже архив, а не «куда войти и на что посмотреть». Закрытые чужие —
   * только по ссылке, как и раньше.
   *
   * Фонд — собранный сейчас, то же число, что в шапке окна турнира: две
   * разные суммы у одного турнира читались бы как ошибка. Порядок строк —
   * `boardOrder`.
   */
  async board(userId: string) {
    const include = {
      creator: { select: { name: true } },
      _count: { select: { participants: true } },
    } satisfies Prisma.TournamentInclude;
    const [mine, others] = await Promise.all([
      this.prisma.tournament.findMany({ where: { participants: { some: { userId } } }, include }),
      this.prisma.tournament.findMany({
        where: { visibility: 'public', status: { in: ['lobby', 'running'] }, participants: { none: { userId } } },
        orderBy: { createdAt: 'desc' },
        take: PUBLIC_LIST_LIMIT,
        include,
      }),
    ]);
    const row = ({ _count, creator, ...t }: (typeof mine)[number], relation: BoardRelation) => ({
      ...t,
      relation,
      players: _count.participants,
      creatorName: creator?.name ?? null,
      prizePool: prizePool(t, _count.participants),
    });
    return boardOrder([
      ...mine.map((t) => row(t, t.creatorId === userId ? 'created' : 'joined')),
      ...others.map((t) => row(t, 'other')),
    ]);
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
    // Сессии турнира целиком — из них берётся и своя (для кнопки «Торговать»),
    // и сводка по каждому участнику. Одним запросом, а не двумя: он и так
    // повторяется поллингом страницы, пока турнир идёт.
    //
    // Берутся только закрытые сделки (`exitTime: { not: null }`) и только
    // числа результата: сводка — это итог, а в итог открытое не входит.
    // Сами сделки, открытые тоже, видны всем в ленте (`feed`) — запрет на
    // чужие открытые позиции снят владельцем 2026-09-26.
    const sessions = await this.prisma.backtestSession.findMany({
      where: { tournamentId: id },
      select: {
        id: true,
        userId: true,
        trades: { where: { exitTime: { not: null } }, select: { pnl: true, r: true } },
      },
    });
    const mySession = sessions.find((s) => s.userId === userId) ?? null;
    // summarize — тот же счёт, что у сводки сессии бектеста: винрейт не должен
    // считаться в продукте двумя разными способами.
    const statsOf = new Map(sessions.map((s) => [s.userId, summarize(s.trades.map(closedNumbers))]));

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
      // Состав со сводкой по закрытым сделкам каждого. `stats` — null, пока у
      // участника нет сессии (турнир в лобби): нулевая сводка и «ещё не
      // торговал» — разные вещи, и показывать их одинаково нельзя.
      participants: participants.map((p) => ({
        userId: p.userId,
        name: nameOf.get(p.userId) ?? null,
        // Готовность — про лобби: в идущем и законченном турнире она ничего не
        // значит, и показывать её там незачем.
        ready: p.ready,
        team: p.team,
        stats: statsOf.get(p.userId) ?? null,
      })),
      // Призёры появляются только после финала — до него места не существует.
      winners: finished
        ? participants
            .filter((p) => p.place != null && p.place <= tournament.winnersCount)
            .sort((a, b) => a.place! - b.place!)
            .map((p) => ({ userId: p.userId, name: nameOf.get(p.userId) ?? null, place: p.place, prizeWon: p.prizeWon }))
        : [],
      me: me
        ? { place: me.place, finalEquity: me.finalEquity, prizeWon: me.prizeWon, ready: me.ready, team: me.team }
        : null,
      isParticipant: me != null,
      isCreator: tournament.creatorId === userId,
      sessionId: mySession?.id ?? null,
    };
  }

  /**
   * Вход — только в набор (решение владельца 2026-09-27): кто вошёл и внёс
   * взнос, тот при старте получает сессию, нажал он «Готов» или нет, а в
   * начавшийся турнир войти нельзя. Вход в идущий, сделанный 2026-09-26, был
   * неверным прочтением и снят.
   *
   * У командного турнира вход — в выбранную команду, пока в ней есть место.
   */
  async join(userId: string, id: string, team?: number) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const tournament = await tx.tournament.findUnique({ where: { id } });
      if (!tournament) throw tournamentNotFound();
      if (tournament.status === 'running') throw notLobby();
      if (tournament.status !== 'lobby') throw tournamentClosed();

      // Повторный вход — успех без изменений: человек мог обновить страницу
      // или нажать дважды, второй взнос за это брать не за что.
      const already = await tx.tournamentParticipant.findUnique({
        where: { tournamentId_userId: { tournamentId: id, userId } },
      });
      if (already) return { tournament };

      const players = await tx.tournamentParticipant.count({ where: { tournamentId: id } });
      if (players >= tournament.maxPlayers) throw tournamentFull();

      let teamOfJoiner: number | null = null;
      if (tournament.format === 'teams') {
        if (team !== 0 && team !== 1) throw teamRequired();
        const inTeam = await tx.tournamentParticipant.count({ where: { tournamentId: id, team } });
        if (inTeam >= tournament.teamSize!) throw teamFull();
        teamOfJoiner = team;
      }

      const participant = await tx.tournamentParticipant.create({
        data: { tournamentId: id, userId, team: teamOfJoiner },
      });
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

  /**
   * Создатель переставляет игрока в другую команду — только в наборе и только
   * если там есть место (решение владельца 2026-09-27: игрок выбирает команду
   * сам, создатель может переставить). После старта составы не меняются.
   */
  async moveTeam(creatorId: string, id: string, userId: string, team: number) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const tournament = await tx.tournament.findUnique({ where: { id } });
      if (!tournament) throw tournamentNotFound();
      if (tournament.creatorId !== creatorId) throw notCreator();
      if (tournament.status !== 'lobby') throw notLobby();
      if (tournament.format !== 'teams') throw notTeams();

      const key = { tournamentId_userId: { tournamentId: id, userId } };
      const participant = await tx.tournamentParticipant.findUnique({ where: key });
      if (!participant) throw notParticipant();
      if (participant.team === team) return;

      const inTeam = await tx.tournamentParticipant.count({ where: { tournamentId: id, team } });
      if (inTeam >= tournament.teamSize!) throw teamFull();
      await tx.tournamentParticipant.update({ where: key, data: { team } });
    });
    return this.get(creatorId, id);
  }

  async leave(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
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
      // Ушёл тот, кого ждали: остальные готовы, и ждать больше некого.
      await this.launchIfReady(tx, id);
      return { success: true as const };
    });
  }

  /**
   * Отметить свою готовность (или снять её) — и, если этого хватило, начать.
   *
   * Кнопки старта у создателя нет: турнир выходит из лобби только так. Одна
   * точка, где раздаются сессии, — после неё турнир уже не переиграть, и
   * второй путь к тому же состоянию означал бы второе место, где эта раздача
   * может разойтись.
   *
   * Переключателем, а не необратимым «готов»: иначе единственным способом
   * передумать остался бы выход из турнира, то есть возврат взноса и потеря
   * места, о которой человек не просил.
   */
  async setReady(userId: string, id: string, ready: boolean) {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const tournament = await tx.tournament.findUnique({ where: { id } });
      if (!tournament) throw tournamentNotFound();
      if (tournament.status !== 'lobby') throw notLobby();
      // У турнира по времени готовность ничего не решает — он начнётся сам.
      // Отказ, а не молчаливая отметка: кнопка, которая ничего не делает,
      // хуже кнопки, которой нет.
      if (tournament.startsAt) throw scheduledStart();

      const updated = await tx.tournamentParticipant.updateMany({
        where: { tournamentId: id, userId },
        data: { ready },
      });
      if (updated.count === 0) throw notParticipant();

      await this.launchIfReady(tx, id);
    });
    // Ответ — весь турнир: нажавший должен увидеть и себя, и то, начался ли он.
    return this.get(userId, id);
  }

  /**
   * Лобби, где готовы все, турнир не ждёт. Зовётся после каждого события,
   * меняющего состав или готовность (`setReady`, `leave`); после `join` звать
   * нечего — новый участник входит неготовым, и это же защищает от старта у
   * него за спиной.
   *
   * Молчит, когда стартовать рано: это не ошибка вызывающего, а обычное
   * состояние лобби.
   *
   * Турнир с назначенным временем готовностью не стартует вовсе: его
   * запускает `startScheduled`, и старт раньше объявленного времени отнял бы
   * турнир у тех, кто собирался войти к нему.
   */
  private async launchIfReady(tx: Prisma.TransactionClient, id: string) {
    const tournament = await tx.tournament.findUnique({ where: { id } });
    if (!tournament || tournament.status !== 'lobby' || tournament.startsAt) return;

    const participants = await tx.tournamentParticipant.findMany({ where: { tournamentId: id } });
    // Делить фонд не на кого, если призовых мест не меньше, чем участников; у
    // команд — если хоть одна сторона пуста.
    if (tournament.format === 'teams' ? !bothTeams(participants) : participants.length <= tournament.winnersCount) {
      return;
    }
    if (!participants.every((p) => p.ready)) return;

    await this.launch(tx, tournament);
  }

  /** Лобби, чьё назначенное время пришло. Их разбирает движок турниров каждый тик. */
  dueForStart(now: Date) {
    return this.prisma.tournament.findMany({ where: { status: 'lobby', startsAt: { lte: now } } });
  }

  /**
   * Старт турнира по назначенному времени — зовёт `TournamentRunner`.
   *
   * Двое и больше — старт тем же `launch`, что и по готовности, но без
   * готовности и без сравнения с числом призовых мест (решение владельца
   * 2026-09-26: «в любом случае начинается, если в лобби двое»). Призовых мест
   * тогда может оказаться не меньше, чем игроков, — это разбирает `finalize`.
   *
   * Один — играть не с кем: турнир отменяется, взнос и добавка возвращаются.
   * Строка остаётся со статусом `cancelled`, а не удаляется: создатель должен
   * увидеть в «Моих турнирах», что с его турниром случилось.
   *
   * `null` — делать нечего: время не пришло, турнир уже не в лобби (второй
   * тик, удаление) или вовсе не по расписанию.
   */
  async startScheduled(id: string, now: Date): Promise<'started' | 'cancelled' | null> {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const tournament = await tx.tournament.findUnique({ where: { id } });
      if (!tournament || tournament.status !== 'lobby' || !tournament.startsAt || tournament.startsAt > now) {
        return null;
      }

      const participants = await tx.tournamentParticipant.findMany({ where: { tournamentId: id } });
      // Стартует с теми, кто вошёл: у арены — двое и больше, у команд — хотя бы
      // по одному в каждой (разный размер разбирает средний результат).
      const enough =
        tournament.format === 'teams' ? bothTeams(participants) : participants.length >= MIN_PLAYERS;
      if (enough) {
        await this.launch(tx, tournament);
        return 'started' as const;
      }

      await tx.tournament.update({ where: { id }, data: { status: 'cancelled', finishedAt: now } });
      await this.refundLobby(tx, tournament, participants);
      return 'cancelled' as const;
    });
  }

  /**
   * Строка турнира под замок до конца транзакции.
   *
   * Вход, выход, готовность и старт иначе расходятся на READ COMMITTED: вход
   * прочитал «лобби», старт в это время раздал сессии тем, кого видел, — и
   * вошедший следом оказывался в идущем турнире без сессии, заплатив взнос.
   * Под замком одно из двух идёт вторым и видит результат первого: старт —
   * нового участника, вход — уже идущий турнир (и открывает себе сессию сам).
   * Заодно два одновременных входа не займут одно последнее место.
   */
  private async lock(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM tournaments WHERE id = ${id} FOR UPDATE`;
  }

  /**
   * Раздача сессий и перевод турнира в `running` — один кусок кода на все пути
   * к старту.
   *
   * Переход условный (`status: 'lobby'` в `where`): двое, нажавшие «готов»
   * одновременно, оба досчитают до «все готовы», но раздача достанется
   * первому. Второй молча выходит — турнир уже идёт, а это ровно то, чего он и
   * хотел.
   */
  private async launch(tx: Prisma.TransactionClient, tournament: Tournament) {
    // Конец выровнен по минуте: финальная цена обязана быть закрытием
    // конкретной минутки, одинаковым для всех участников.
    const startedAt = new Date();
    const endsAt = new Date(
      Math.floor(startedAt.getTime() / MINUTE_MS) * MINUTE_MS + tournament.durationMin * MINUTE_MS,
    );

    const moved = await tx.tournament.updateMany({
      where: { id: tournament.id, status: 'lobby' },
      data: { status: 'running', startedAt, endsAt },
    });
    if (moved.count === 0) return;

    // Состав читается после перевода статуса, а не до: так сессию получает
    // каждый, кто успел войти до старта, — см. `lock`.
    const participants = await tx.tournamentParticipant.findMany({ where: { tournamentId: tournament.id } });
    for (const p of participants) {
      await this.openSession(tx, tournament, p.userId, startedAt, endsAt);
    }
  }

  /** Сессия участника турнира — одна и та же на старте и при входе в идущий. */
  private openSession(
    tx: Prisma.TransactionClient,
    tournament: Tournament,
    userId: string,
    startedAt: Date,
    endsAt: Date,
  ) {
    return tx.backtestSession.create({
      data: {
        userId,
        tournamentId: tournament.id,
        startTime: startedAt,
        cursorTime: startedAt,
        endTime: endsAt,
        startBalance: tournament.startBalance,
        balance: tournament.startBalance,
        // В эфире торгуют настоящий рынок: прятать дату и масштабировать цену
        // бессмысленно — и то и другое видно в любом терминале.
        hideDate: false,
        hidePrice: false,
        priceScale: 1,
        status: 'active',
      },
    });
  }

  /**
   * Возврат денег лобби: взносы — каждому по ключу его участия, добавка —
   * создателю. Один кусок кода на удаление лобби и отмену по времени, чтобы
   * ключи журнала у двух путей не разошлись.
   */
  private async refundLobby(
    tx: Prisma.TransactionClient,
    tournament: Tournament,
    participants: { userId: string; joinedAt: Date }[],
  ) {
    for (const p of participants) {
      await this.coins.refund(tx, p.userId, tournament.entryFee, feeRef(tournament.id, p.joinedAt));
    }
    if (tournament.creatorId) {
      await this.coins.refund(tx, tournament.creatorId, tournament.prizeBonus, `${tournament.id}:bonus`);
    }
  }

  /**
   * Досрочный конец турнира — создателем или владельцем сервиса.
   *
   * Итоги здесь не подводятся: метод только переносит конец турнира на
   * «сейчас», а дальше всё делает тот же `TournamentRunner`, что и по
   * истечении срока — закрывает позиции по финальной цене, считает места и
   * платит призы одной транзакцией. Второго пути к выплатам не заводим
   * намеренно: деньги должны расходиться ровно одним куском кода, иначе
   * однажды разойдутся дважды. Отсюда и задержка в несколько секунд
   * (`FINAL_GRACE_MS` плюс тик движка) — она не ошибка, а цена того, что финал
   * один на оба случая.
   *
   * Конец — именно текущий момент, а не граница минутки, как у планового
   * (см. `start`): выровняв его вниз, мы поставили бы время выхода раньше
   * времени входа у всех сделок, открытых в текущей минутке, а вверх — заставили
   * бы ждать конца минутки турнир, который просили закончить сейчас. Требование
   * «одна цена на всех» при этом держится: её сервер читает один раз.
   *
   * Сессиям конец переносится в той же транзакции: запрет торговать стоит на
   * `BacktestSession.endTime`, и без этого до ближайшего тика движка участники
   * продолжали бы торговать в уже законченном турнире.
   */
  async finishEarly(userId: string, email: string | null | undefined, id: string) {
    const tournament = await this.prisma.tournament.findUnique({ where: { id } });
    if (!tournament) throw tournamentNotFound();
    if (tournament.creatorId !== userId && !isOwnerEmail(email)) throw notTournamentAdmin();
    if (tournament.status !== 'running') throw notRunning();

    const endsAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.tournament.updateMany({ where: { id, status: 'running' }, data: { endsAt } });
      // Финал успели подвести между чтением и записью — второй конец не нужен.
      if (moved.count === 0) throw notRunning();
      await tx.backtestSession.updateMany({ where: { tournamentId: id }, data: { endTime: endsAt } });
      return { success: true as const, endsAt };
    });
  }

  /**
   * Удаляет лобби или уже подведённый итог. Идущий турнир — нет: у него есть
   * незакрытые сессии остальных участников, и досрочный конец подводит
   * `finishEarly`, а не удаление.
   *
   * Деньги трогаются только из лобби: там взнос списан, а игры ещё не было.
   * У завершённого турнира призы уже разошлись через `TournamentRunner`
   * одной транзакцией — трогать их здесь второй раз значит удвоить выплату. У
   * отменённого взносы уже вернула сама отмена (`startScheduled`).
   */
  async remove(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const tournament = await tx.tournament.findUnique({ where: { id } });
      if (!tournament) throw tournamentNotFound();
      if (tournament.creatorId !== userId) throw notCreator();
      if (tournament.status === 'running') throw notLobby();

      if (tournament.status === 'lobby') {
        const participants = await tx.tournamentParticipant.findMany({ where: { tournamentId: id } });
        await this.refundLobby(tx, tournament, participants);
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
    const teams = tournament.format === 'teams';
    let placeOf: Map<string, number>;
    let prizeOf: Map<string, number>;
    if (teams) {
      // Команды: победившей стороне места 1, проигравшей — 2; фонд — победителям
      // поровну. См. teams.ts.
      const teamOf = new Map(participants.filter((p) => p.team != null).map((p) => [p.userId, p.team!]));
      const { winner } = teamOutcome(ranked, teamOf, tournament.startBalance);
      placeOf = new Map(ranked.map((r) => [r.userId, teamOf.get(r.userId) === winner ? 1 : 2]));
      prizeOf = teamPrizes(
        pool,
        ranked.filter((r) => teamOf.get(r.userId) === winner).map((r) => r.userId),
      );
    } else {
      // Доли только существующих мест. Турнир по времени стартует и с двумя
      // игроками при трёх призовых местах; доля пустого места уходит первому
      // вместе с остатком округления — фонд обязан разойтись целиком.
      const prizes = payouts(pool, tournament.payoutShares.slice(0, participants.length));
      placeOf = new Map(ranked.map((r) => [r.userId, r.place]));
      prizeOf = new Map(
        ranked.map((r) => [r.userId, r.place <= tournament.winnersCount ? (prizes[r.place - 1] ?? 0) : 0]),
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const moved = await tx.tournament.updateMany({
        where: { id: tournament.id, status: 'running' },
        data: { status: 'finished', finishedAt: new Date() },
      });
      if (moved.count === 0) return false; // финал уже подвели

      for (const row of ranked) {
        const place = placeOf.get(row.userId)!;
        const prize = prizeOf.get(row.userId) ?? 0;
        await tx.tournamentParticipant.update({
          where: { tournamentId_userId: { tournamentId: tournament.id, userId: row.userId } },
          data: { finalEquity: row.equity, place, prizeWon: prize },
        });
        await this.coins.credit(tx, row.userId, prize, 'TOURNAMENT_PRIZE', tournament.id);
        // XP за турнир — в той же транзакции, что место и приз: разойтись эти
        // три записи не должны. Размер турнира входит в цену победы, см.
        // battlepass/xp-registry.ts. Команды — две стороны, как дуэль.
        await this.battlePass.award(
          tx,
          row.userId,
          'game.tournament',
          tournament.id,
          teams ? tournamentXp(2, place) : tournamentXp(ranked.length, place),
        );
      }
      return true;
    });
  }

  /**
   * Лента сделок идущих турниров — вкладка «Сделки игроков» рядом с рейтингом.
   *
   * Открытые сделки со стороной, входом и уровнями видны всем, соперникам
   * тоже (решение владельца 2026-09-26: за турниром смотрят). Закрытый турнир
   * сюда не попадает, если смотрящий в нём не играет: он «только по ссылке»,
   * и лента не должна раскрывать ни его, ни его сделки.
   *
   * Свежие входы сверху; строка открытой сделки меняется на месте, когда
   * сделку закроют, — лента опрашивается, а не дописывается.
   */
  async feed(userId: string) {
    const rows = await this.prisma.backtestTrade.findMany({
      where: {
        session: {
          tournament: {
            is: {
              status: 'running',
              OR: [{ visibility: 'public' }, { participants: { some: { userId } } }],
            },
          },
        },
      },
      orderBy: { entryTime: 'desc' },
      take: FEED_LIMIT,
      select: FEED_SELECT,
    });
    return rows.map(feedRow);
  }

  /**
   * Сделки одного турнира — блок «Сделки» в его окне, у идущего и
   * завершённого. Видит любой, у кого есть окно: ссылка на турнир и есть
   * приглашение, а закрытость — только отсутствие в общих списках и ленте.
   */
  async trades(id: string) {
    const tournament = await this.prisma.tournament.findUnique({ where: { id }, select: { id: true } });
    if (!tournament) throw tournamentNotFound();
    const rows = await this.prisma.backtestTrade.findMany({
      where: { session: { tournamentId: id } },
      orderBy: { entryTime: 'desc' },
      take: FEED_LIMIT,
      select: FEED_SELECT,
    });
    return rows.map(feedRow);
  }

  /** Рейтинг игры — по всем завершённым турнирам. См. `rating.ts`. */
  async rating(userId: string | undefined) {
    return pickRows(await this.rankedTable(), userId, RATING_LIMIT);
  }

  /**
   * Строка одного игрока в рейтинге — для его профиля, кто бы его ни
   * смотрел. null — он ещё не доиграл ни одного турнира.
   */
  async ratingOf(userId: string) {
    return (await this.rankedTable()).find((r) => r.userId === userId) ?? null;
  }

  /**
   * Ранжированная таблица рейтинга — пересчитывается не чаще раза в час
   * (решение владельца 2026-10-02). Расчёт читает места всех участников всех
   * завершённых турниров платформы и ранжирует всех, а шёл он на каждый
   * просмотр любого профиля и страницы рейтинга, хотя меняется таблица только
   * на финале турнира.
   *
   * Следствие, которое надо помнить: после финала новые очки видны не сразу,
   * а до часа спустя. Сбросить кэш на финале нельзя — финал подводит `worker`,
   * а кэш живёт в памяти `api`, общей памяти у них нет.
   *
   * Хранится промис, а не значение: два запроса в момент пересчёта ждут один
   * расчёт, а не запускают два. Упавший расчёт не кэшируется.
   */
  private ranked: { at: number; table: Promise<RatingRow[]> } | null = null;

  private rankedTable(): Promise<RatingRow[]> {
    const now = Date.now();
    if (this.ranked && now - this.ranked.at < RATING_TTL_MS) return this.ranked.table;
    const table = this.ratingInput().then(rankAll);
    const slot = { at: now, table };
    table.catch(() => {
      if (this.ranked === slot) this.ranked = null;
    });
    this.ranked = slot;
    return table;
  }

  private async ratingInput() {
    const rows = await this.prisma.tournamentParticipant.findMany({
      where: { place: { not: null }, tournament: { status: 'finished' } },
      select: { tournamentId: true, userId: true, place: true, team: true, user: { select: { name: true } } },
    });
    return rows.map((r) => ({
      tournamentId: r.tournamentId,
      userId: r.userId,
      name: r.user?.name ?? '—',
      place: r.place!,
      team: r.team,
    }));
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
