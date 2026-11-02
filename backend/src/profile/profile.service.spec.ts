import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { AVATAR_MAX_BYTES } from './avatar';
import { ProfileService } from './profile.service';

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
    trade: { findFirst: jest.fn().mockResolvedValue(null) },
    openPositionSeen: { findFirst: jest.fn().mockResolvedValue(null) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn().mockResolvedValue([]),
  };
}

const make = (user: unknown) => {
  const prisma = fakePrisma(user);
  const tournaments = { ratingOf: jest.fn().mockResolvedValue(null) };
  return { prisma, tournaments, service: new ProfileService(prisma as never, tournaments as never) };
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

  it('журнала в ответе нет: ни признаков, ни запросов к сделкам и позициям', async () => {
    const { service, prisma } = make(PLAYER);
    const out = await service.overview(ID, now);
    expect(out).not.toHaveProperty('hasExchangeTrades');
    expect(out).not.toHaveProperty('hasOpenPositions');
    expect(prisma.trade.findFirst).not.toHaveBeenCalled();
    expect(prisma.openPositionSeen.findFirst).not.toHaveBeenCalled();
  });

  it('значков десять: разметки и бектеста среди них нет', async () => {
    const { service } = make(PLAYER);
    const ids = (await service.overview(ID, now)).achievements.map((a) => a.id);
    expect(ids).toHaveLength(10);
    expect(ids).not.toContain('tagger_100');
    expect(ids).not.toContain('backtest_10');
  });
});

describe('ProfileService.setAvatar', () => {
  it('пустой файл, чужой тип и лишний размер — отказ без записи', async () => {
    const { service, prisma } = make({ email: 'nika@example.com' });
    await expect(service.setAvatar(ID, undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setAvatar(ID, Buffer.from('<svg></svg>'))).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setAvatar(ID, Buffer.concat([PNG, Buffer.alloc(AVATAR_MAX_BYTES)])),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('PNG пишется одной транзакцией и возвращает версионный адрес', async () => {
    const { service, prisma } = make({ email: 'nika@example.com' });
    const out = await service.setAvatar(ID, PNG);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.userAvatar.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ mime: 'image/png' }) }),
    );
    expect(out.avatar).toMatch(new RegExp(`^/api/profile/${ID}/avatar\\?v=\\d+$`));
  });
});

describe('ProfileService.setName', () => {
  it('сохраняет имя и отдаёт его', async () => {
    const { service, prisma } = make({ email: 'nika@example.com' });
    prisma.user.update.mockResolvedValue({ name: 'Ника' });

    await expect(service.setName(ID, 'Ника')).resolves.toEqual({ name: 'Ника' });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: ID }, data: { name: 'Ника' }, select: { name: true } });
  });

  it('мусор вместо имени — 400 без записи: те же правила, что при регистрации', async () => {
    const { service, prisma } = make({ email: 'nika@example.com' });
    await expect(service.setName(ID, 'ыфвфыв')).rejects.toMatchObject({ response: { code: 'NAME_NOT_READABLE' } });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('демо-аккаунт — 403 без записи: его имя видит каждый посетитель витрины', async () => {
    const { service, prisma } = make({ email: 'demo@example.com' });
    await expect(service.setName(ID, 'Хакер')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('ProfileService: картинка демо-аккаунта', () => {
  it('ни поставить, ни снять — 403 без записи', async () => {
    const { service, prisma } = make({ email: 'demo@example.com' });
    await expect(service.setAvatar(ID, PNG)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.removeAvatar(ID)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

});
