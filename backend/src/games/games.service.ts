import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGameTableDto } from './dto/game-table.dto';
import { gameBadBuyInRange, gameBadSeats, gameTableNotFound } from './game-errors';
import { GameType, PUBLIC_LIST_LIMIT, SEATS_RANGE } from './games.config';

/**
 * Общая инфраструктура столов покера/блэкджека: лобби, посадка/уход с
 * эскроу фишек в монетах. Правила самой раздачи — вне этого сервиса,
 * отдельные модули поверх него.
 */
@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coins: unknown, // CoinsService — подключается в Task 5
    private readonly gateway: unknown, // GamesGateway — подключается в Task 5
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

  /** Столы, где я сижу или я создатель, ещё открытые. */
  async listMine(userId: string) {
    const rows = await this.prisma.gameTable.findMany({
      where: { status: 'open', OR: [{ creatorId: userId }, { seats: { some: { userId } } }] },
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
}
