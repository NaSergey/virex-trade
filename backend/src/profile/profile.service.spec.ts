import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { AggregateCacheService } from '../trades/aggregate-cache';
import { AVATAR_MAX_BYTES } from './avatar';
import { ProfileService, TRADES_PAGE_SIZE } from './profile.service';

const ID = '3f2c8a4e-1b7d-4c3a-9e2f-0a1b2c3d4e5f';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

/** Игрок, у которого всё читается: остальное тесты добавляют по месту. */
const PLAYER = {
  name: 'Ника',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  coinBalance: 4200,
  avatarAt: null,
};

/** Подмена Prisma: всё, что читает `overview`, отвечает пусто. */
function fakePrisma(user: unknown) {
  const empty = { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) };
  return {
    user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn() },
    userAvatar: { upsert: jest.fn(), deleteMany: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) },
    coinTransaction: { ...empty, aggregate: jest.fn().mockResolvedValue({ _max: { balanceAfter: null } }) },
    tournamentParticipant: { count: jest.fn().mockResolvedValue(0) },
    battlePassProgress: { findMany: jest.fn().mockResolvedValue([{ season: '2026-Q4', xp: 250 }]) },
    jetpackBet: { aggregate: jest.fn().mockResolvedValue({ _max: { cashoutX100: null } }) },
    trade: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn().mockResolvedValue([]),
  };
}

const make = (user: unknown) => {
  const prisma = fakePrisma(user);
  const tournaments = { ratingOf: jest.fn().mockResolvedValue(null) };
  // Настоящий кэш, а не заглушка: его попадания — часть поведения листа чужого
  // журнала, и подменой мы проверяли бы подмену.
  const cache = new AggregateCacheService();
  const dataVersion = { get: jest.fn().mockResolvedValue(0) };
  return {
    prisma,
    tournaments,
    cache,
    dataVersion,
    service: new ProfileService(prisma as never, tournaments as never, dataVersion as never, cache),
  };
};

describe('ProfileService.overview', () => {
  const now = new Date('2026-10-01T12:00:00Z');

  it('не UUID — 404 без запроса в базу', async () => {
    const { service, prisma } = make(null);
    await expect(service.overview('admin', now)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('нет такого игрока — 404', async () => {
    const { service } = make(null);
    await expect(service.overview(ID, now)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('чужой профиль: имя, картинка, сезон, баланс и строка рейтинга — без почты', async () => {
    const { service, tournaments } = make({
      name: 'Ника',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      coinBalance: 4200,
      avatarAt: new Date(1_700_000_000_000),
      showTrades: true,
    });
    tournaments.ratingOf.mockResolvedValue({ place: 3, userId: ID, name: 'Ника', points: 7, tournaments: 4, wins: 1 });
    const out = await service.overview(ID, now);
    expect(out.user).toEqual({ id: ID, name: 'Ника', avatar: `/api/profile/${ID}/avatar?v=1700000000000` });
    expect(out.balance).toBe(4200);
    expect(out.season).toMatchObject({ key: '2026-Q4', xp: 250 });
    expect(out.rating).toMatchObject({ place: 3, points: 7 });
    // Пустой журнал: множителя и серии нет, пик баланса — не ниже текущего.
    expect(out.records).toEqual({ bestX100: 0, bestStreak: 0, peakBalance: 4200 });
    expect(tournaments.ratingOf).toHaveBeenCalledWith(ID);
    expect(JSON.stringify(out)).not.toContain('@');
  });

  it('открытый показ — вкладке «Биржа» есть на что встать, и журнал не пересчитывается целиком', async () => {
    const { service, prisma } = make({ ...PLAYER, showTrades: true });
    prisma.trade.findFirst.mockResolvedValue({ id: 'r1' });

    await expect(service.overview(ID, now)).resolves.toMatchObject({ hasExchangeTrades: true });
    // Признак берётся первой строкой: счёт обошёл бы все сделки человека на
    // каждый просмотр любого его профиля.
    expect(prisma.trade.findFirst).toHaveBeenCalledWith({ where: { userId: ID }, select: { id: true } });
  });

  it('скрытый показ — признака нет, хотя сделки есть: выключатель не сообщает, что спрятано', async () => {
    const { service, prisma } = make({ ...PLAYER, showTrades: false });
    prisma.trade.findFirst.mockResolvedValue({ id: 'r1' });
    await expect(service.overview(ID, now)).resolves.toMatchObject({ hasExchangeTrades: false });
  });
});

describe('ProfileService.trades', () => {
  /** Закрывающий ордер: столько полей, сколько читает сборка позиций. */
  const part = (over: Partial<Record<string, unknown>> = {}) => ({
    id: 'r1',
    positionId: 'BTCUSDT:long:1700000000000',
    symbol: 'BTCUSDT',
    direction: 'long',
    qty: 1,
    avgEntryPrice: 100,
    avgExitPrice: 110,
    closedPnl: 10,
    openFee: 0,
    closeFee: 0,
    leverage: 10,
    closedAt: new Date('2026-09-01T10:00:00Z'),
    openedAt: new Date('2026-09-01T09:00:00Z'),
    ...over,
  });

  it('не UUID и нет игрока — 404, журнал не читается', async () => {
    const { service, prisma } = make(null);
    await expect(service.trades('admin')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.trades(ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.trade.findMany).not.toHaveBeenCalled();
  });

  it('скрыл показ — 403, а не пустой список: пустой читался бы как «не торгует»', async () => {
    const { service, prisma } = make({ showTrades: false });
    await expect(service.trades(ID)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.trade.findMany).not.toHaveBeenCalled();
  });

  it('части одной позиции сходятся в одну строку, а ручки разбора остаются на сервере', async () => {
    const { service, prisma } = make({ showTrades: true });
    prisma.trade.findMany.mockResolvedValue([part(), part({ id: 'r2', closedPnl: 5, qty: 1 })]);

    const out = await service.trades(ID);

    expect(out.total).toBe(1);
    expect(out.trades).toHaveLength(1);
    expect(out.trades[0]).toMatchObject({ symbol: 'BTCUSDT', closedPnl: 15, parts: 2 });
    expect(out.trades[0]).not.toHaveProperty('positionId');
    expect(out.trades[0]).not.toHaveProperty('tradeIds');
  });

  it('тегов в чужой сделке нет — их не просят у базы вовсе', async () => {
    const { service, prisma } = make({ showTrades: true });
    prisma.trade.findMany.mockResolvedValue([part()]);

    const out = await service.trades(ID);

    expect(out.trades[0]).not.toHaveProperty('tags');
    expect(prisma.trade.findMany.mock.calls[0][0].select).not.toHaveProperty('tags');
  });

  it('повторный тот же лист берётся из кэша — чужой журнал не читается заново', async () => {
    const { service, prisma } = make({ showTrades: true });
    prisma.trade.findMany.mockResolvedValue([part()]);

    const first = await service.trades(ID);
    const second = await service.trades(ID);

    expect(second).toBe(first);
    expect(prisma.trade.findMany).toHaveBeenCalledTimes(1);
  });

  it('новая сделка поднимает версию данных — кэш промахивается сам, без инвалидации', async () => {
    const { service, prisma, dataVersion } = make({ showTrades: true });
    prisma.trade.findMany.mockResolvedValue([part()]);

    await service.trades(ID);
    dataVersion.get.mockResolvedValue(1);
    await service.trades(ID);

    expect(prisma.trade.findMany).toHaveBeenCalledTimes(2);
  });

  it('лист режется после сборки позиций, страница меньше первой считается первой', async () => {
    const { service, prisma } = make({ showTrades: true });
    const rows = Array.from({ length: TRADES_PAGE_SIZE + 3 }, (_, i) =>
      part({ id: `r${i}`, positionId: `BTCUSDT:long:${1_700_000_000_000 + i}` }),
    );
    prisma.trade.findMany.mockResolvedValue(rows);

    await expect(service.trades(ID, 2)).resolves.toMatchObject({ page: 2, total: rows.length });
    expect((await service.trades(ID, 2)).trades).toHaveLength(3);
    expect(await service.trades(ID, 0)).toMatchObject({ page: 1 });
  });
});

describe('ProfileService.privacy', () => {
  it('читает и переключает флаг показа', async () => {
    const { service, prisma } = make({ showTrades: true });
    await expect(service.privacy(ID)).resolves.toEqual({ showTrades: true });

    prisma.user.update.mockResolvedValue({ showTrades: false });
    await expect(service.setPrivacy(ID, false)).resolves.toEqual({ showTrades: false });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { showTrades: false },
      select: { showTrades: true },
    });
  });
});

describe('ProfileService.setAvatar', () => {
  it('пустой файл, чужой тип и лишний размер — отказ без записи', async () => {
    const { service, prisma } = make(null);
    await expect(service.setAvatar(ID, undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setAvatar(ID, Buffer.from('<svg></svg>'))).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setAvatar(ID, Buffer.concat([PNG, Buffer.alloc(AVATAR_MAX_BYTES)])),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('PNG пишется одной транзакцией и возвращает версионный адрес', async () => {
    const { service, prisma } = make(null);
    const out = await service.setAvatar(ID, PNG);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.userAvatar.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ mime: 'image/png' }) }),
    );
    expect(out.avatar).toMatch(new RegExp(`^/api/profile/${ID}/avatar\\?v=\\d+$`));
  });
});
