import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isOwnerEmail } from '../admin/owner';
import { CoinsService } from '../coins/coins.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGameTableDto } from './dto/game-table.dto';
import {
  gameAlreadySeated,
  gameBadBuyInRange,
  gameBadSeats,
  gameBuyInOutOfRange,
  gameNotCreatorOrAdmin,
  gameNotSeated,
  gameSeatRace,
  gameTableClosed,
  gameTableFull,
  gameTableNotEmpty,
  gameTableNotFound,
} from './game-errors';
import { GameType, PUBLIC_LIST_LIMIT, SEATS_RANGE } from './games.config';
import { GamesGateway } from './games.gateway';

/**
 * Общая инфраструктура столов покера/блэкджека: лобби, посадка/уход с
 * эскроу фишек в монетах. Правила самой раздачи — вне этого сервиса,
 * отдельные модули поверх него.
 */
@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coins: CoinsService,
    private readonly gateway: GamesGateway,
  ) {}

  /** Создатель не садится автоматически: buy-in ещё не выбран, и стол для чужой игры — законный случай. */
  async create(userId: string, dto: CreateGameTableDto) {
    const seatsRange = SEATS_RANGE[dto.gameType];
    if (dto.maxSeats < seatsRange[0] || dto.maxSeats > seatsRange[1]) throw gameBadSeats();
    if (dto.maxBuyIn < dto.minBuyIn) throw gameBadBuyInRange();

    return this.prisma.gameTable.create({
      data: {
        gameType: dto.gameType,
        name: dto.name.trim(),
        visibility: dto.visibility ?? 'private',
        minBuyIn: dto.minBuyIn,
        maxBuyIn: dto.maxBuyIn,
        maxSeats: dto.maxSeats,
        creatorId: userId,
      },
    });
  }

  /**
   * Мои столы: где я сижу — всегда, каким бы ни был статус, потому что в
   * месте лежат мои фишки и их должно быть видно, чем бы стол ни кончился;
   * где я лишь создатель — только пока он открыт.
   */
  async listMine(userId: string) {
    const rows = await this.prisma.gameTable.findMany({
      where: { OR: [{ seats: { some: { userId } } }, { creatorId: userId, status: 'open' }] },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { seats: true } } },
    });
    return rows.map(({ _count, ...t }) => ({ ...t, players: _count.seats }));
  }

  /**
   * Открытые публичные столы без меня. Заполненные отсеиваются после чтения
   * — условие «мест меньше maxSeats» в одном запросе Prisma не выразить, а
   * открытых столов в системе всегда немного (тот же приём, что
   * `TournamentsService.listPublic`).
   */
  async listPublic(userId: string, gameType?: GameType) {
    const rows = await this.prisma.gameTable.findMany({
      where: {
        visibility: 'public',
        status: 'open',
        ...(gameType ? { gameType } : {}),
        seats: { none: { userId } },
      },
      orderBy: { createdAt: 'desc' },
      take: PUBLIC_LIST_LIMIT,
      include: { creator: { select: { name: true } }, _count: { select: { seats: true } } },
    });
    return rows
      .filter((t) => t._count.seats < t.maxSeats)
      .map(({ _count, creator, ...t }) => ({ ...t, players: _count.seats, creatorName: creator?.name ?? null }));
  }

  /** Стол и его места, глазами конкретного пользователя. Доступен по id любому вошедшему. */
  async get(userId: string, id: string) {
    const state = await this.snapshot(id);
    if (!state) throw gameTableNotFound();
    return {
      ...state,
      isCreator: state.table.creatorId === userId,
      mySeat: state.seats.find((s) => s.userId === userId)?.seatIndex ?? null,
    };
  }

  /** Снимок стола без взгляда конкретного пользователя — то, что рассылается комнате (Task 5). */
  private async snapshot(id: string) {
    const table = await this.prisma.gameTable.findUnique({
      where: { id },
      include: { seats: { include: { user: { select: { name: true } } } }, creator: { select: { name: true } } },
    });
    if (!table) return null;
    const { seats, creator, ...rest } = table;
    return {
      table: { ...rest, creatorName: creator?.name ?? null, players: seats.length },
      seats: [...seats]
        .sort((a, b) => a.seatIndex - b.seatIndex)
        .map((s) => ({ userId: s.userId, name: s.user?.name ?? null, seatIndex: s.seatIndex, stack: s.stack })),
    };
  }

  /**
   * Посадка: выбрать свободный номер места и списать buy-in одной
   * транзакцией. Гонка за один и тот же `seatIndex` (или повторная посадка
   * одного пользователя) ловится уникальным индексом БД — `P2002`
   * превращается в понятную ошибку для повторной попытки, а не в 500.
   */
  async join(userId: string, id: string, buyIn: number) {
    await this.prisma.$transaction(async (tx) => {
      const table = await tx.gameTable.findUnique({ where: { id }, include: { seats: true } });
      if (!table) throw gameTableNotFound();
      if (table.status !== 'open') throw gameTableClosed();
      if (table.seats.some((s) => s.userId === userId)) throw gameAlreadySeated();
      if (buyIn < table.minBuyIn || buyIn > table.maxBuyIn) throw gameBuyInOutOfRange();

      const taken = new Set(table.seats.map((s) => s.seatIndex));
      let seatIndex = -1;
      for (let i = 0; i < table.maxSeats; i++) {
        if (!taken.has(i)) {
          seatIndex = i;
          break;
        }
      }
      if (seatIndex === -1) throw gameTableFull();

      let seat;
      try {
        seat = await tx.gameSeat.create({ data: { tableId: id, userId, seatIndex, stack: buyIn } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw gameSeatRace();
        throw e;
      }
      await this.coins.charge(tx, userId, buyIn, 'GAME_BUYIN', seat.id);
    });
    await this.pushState(id);
    return this.get(userId, id);
  }

  private async pushState(id: string) {
    const state = await this.snapshot(id);
    if (state) this.gateway.broadcastTableState(id, state);
  }

  /** Уход: остаток стека возвращается монетами, место освобождается для следующего. */
  async leave(userId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      // Удаление и есть чтение: DELETE берёт блокировку строки и возвращает её
      // актуальную версию. Читать стек отдельным запросом нельзя — между
      // чтением и удалением игровая логика успеет его изменить, и кэшаут уйдёт
      // на устаревшую сумму.
      let seat;
      try {
        seat = await tx.gameSeat.delete({ where: { tableId_userId: { tableId: id, userId } } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw gameNotSeated();
        throw e;
      }
      await this.coins.credit(tx, userId, seat.stack, 'GAME_CASHOUT', seat.id);
    });
    await this.pushState(id);
    return { success: true as const };
  }

  /**
   * Закрыть стол — создатель или владелец сервиса, и только когда стол пуст:
   * закрыть стол с чужими деньгами на нём нельзя. Проверка пустоты — часть
   * самого `updateMany` (`seats: { none: {} } `), а не отдельное чтение до
   * записи: место, занятое между чтением и записью, иначе закрыло бы стол с
   * игроком внутри.
   */
  async close(userId: string, email: string | null | undefined, id: string) {
    const table = await this.prisma.gameTable.findUnique({ where: { id } });
    if (!table) throw gameTableNotFound();
    if (table.creatorId !== userId && !isOwnerEmail(email)) throw gameNotCreatorOrAdmin();
    if (table.status !== 'open') throw gameTableClosed();

    const moved = await this.prisma.gameTable.updateMany({
      where: { id, status: 'open', seats: { none: {} } },
      data: { status: 'closed', closedAt: new Date() },
    });
    if (moved.count === 0) throw gameTableNotEmpty();
    await this.pushState(id);
    return { success: true as const };
  }
}
