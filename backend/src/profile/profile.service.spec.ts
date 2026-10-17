import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { AggregateCacheService } from '../trades/aggregate-cache';
import { AVATAR_MAX_BYTES } from './avatar';
import { POSITION_FRESH_MS, ProfileService, TRADES_PAGE_SIZE } from './profile.service';

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
    openPositionSeen: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
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

  it('открытые позиции в свежем снимке и показ открыт — вкладке «Открытые позиции» есть на что встать', async () => {
    const { service, prisma } = make({ ...PLAYER, showTrades: true });
    prisma.openPositionSeen.findFirst.mockResolvedValue({ id: 'p1' });

    await expect(service.overview(ID, now)).resolves.toMatchObject({ hasOpenPositions: true });
    expect(prisma.openPositionSeen.findFirst).toHaveBeenCalledWith({
      where: { userId: ID, size: { not: null }, snapshotAt: { gte: new Date(now.getTime() - POSITION_FRESH_MS) } },
      select: { id: true },
    });
  });

  it('скрытый показ — признака открытых позиций тоже нет', async () => {
    const { service, prisma } = make({ ...PLAYER, showTrades: false });
    prisma.openPositionSeen.findFirst.mockResolvedValue({ id: 'p1' });
    await expect(service.overview(ID, now)).resolves.toMatchObject({ hasOpenPositions: false });
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

  it('размер листа задаёт смотрящий — 1…20, мусор — 20; у каждого размера свой лист в кэше', async () => {
    const { service, prisma } = make({ showTrades: true });
    const rows = Array.from({ length: 12 }, (_, i) =>
      part({ id: `r${i}`, positionId: `BTCUSDT:long:${1_700_000_000_000 + i}` }),
    );
    prisma.trade.findMany.mockResolvedValue(rows);

    const five = await service.trades(ID, 2, 5);
    expect(five).toMatchObject({ page: 2, pageSize: 5, total: 12 });
    expect(five.trades).toHaveLength(5);
    expect((await service.trades(ID, 3, 5)).trades).toHaveLength(2);
    expect(await service.trades(ID, 1, 0)).toMatchObject({ pageSize: TRADES_PAGE_SIZE });
    expect(await service.trades(ID, 1, 500)).toMatchObject({ pageSize: TRADES_PAGE_SIZE });
    expect(await service.trades(ID, 1, 2.5)).toMatchObject({ pageSize: TRADES_PAGE_SIZE });
  });
});

describe('ProfileService.positions', () => {
  const now = new Date('2026-10-16T10:00:00Z');
  const row = (over: Record<string, unknown> = {}) => ({
    symbol: 'BTCUSDT',
    direction: 'long',
    firstSeenAt: new Date('2026-10-16T08:00:00Z'),
    size: '0.05',
    avgPrice: '112430.5',
    markPrice: '113000',
    positionValue: '5650',
    unrealisedPnl: '28.47',
    leverage: '10',
    liqPrice: null,
    snapshotAt: new Date('2026-10-16T09:59:00Z'),
    ...over,
  });

  it('не UUID и нет игрока — 404; скрыл показ — 403; снимок при этом не читается', async () => {
    const missing = make(null);
    await expect(missing.service.positions('admin', now)).rejects.toBeInstanceOf(NotFoundException);
    await expect(missing.service.positions(ID, now)).rejects.toBeInstanceOf(NotFoundException);
    const hidden = make({ showTrades: false });
    await expect(hidden.service.positions(ID, now)).rejects.toBeInstanceOf(ForbiddenException);
    expect(missing.prisma.openPositionSeen.findMany).not.toHaveBeenCalled();
    expect(hidden.prisma.openPositionSeen.findMany).not.toHaveBeenCalled();
  });

  it('только свежий снимок, строки в форме позиции биржи, время снимка — самое свежее', async () => {
    const { service, prisma } = make({ showTrades: true });
    prisma.openPositionSeen.findMany.mockResolvedValue([
      row(),
      row({ symbol: 'ETHUSDT', direction: 'short', snapshotAt: new Date('2026-10-16T09:59:30Z') }),
      row({ symbol: 'SOLUSDT', size: '0' }),
    ]);

    const out = await service.positions(ID, now);

    expect(prisma.openPositionSeen.findMany.mock.calls[0][0].where).toEqual({
      userId: ID,
      size: { not: null },
      snapshotAt: { gte: new Date(now.getTime() - POSITION_FRESH_MS) },
    });
    expect(out.asOf).toBe('2026-10-16T09:59:30.000Z');
    expect(out.positions.map((p) => p.symbol)).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(out.positions[0]).toEqual({
      symbol: 'BTCUSDT',
      direction: 'long',
      size: '0.05',
      avgPrice: '112430.5',
      markPrice: '113000',
      positionValue: '5650',
      unrealisedPnl: '28.47',
      leverage: '10',
      liqPrice: undefined,
      openedAt: '2026-10-16T08:00:00.000Z',
    });
  });

  it('свежих позиций нет — пусто и без времени снимка', async () => {
    const { service } = make({ showTrades: true });
    await expect(service.positions(ID, now)).resolves.toEqual({ asOf: null, positions: [] });
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

describe('ProfileService.setPrivacy: демо-аккаунт', () => {
  it('выключатель показа у демо заперт — 403 без записи', async () => {
    const { service, prisma } = make({ email: 'demo@example.com' });
    await expect(service.setPrivacy(ID, false)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('ProfileService.setName', () => {
  it('сохраняет имя и отдаёт его', async () => {
    const { service, prisma } = make({ email: 'nika@example.com' });
    prisma.user.update.mockResolvedValue({ name: 'Ника' });

    await expect(service.setName(ID, 'Ника')).resolves.toEqual({ name: 'Ника' });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: ID }, data: { name: 'Ника' }, select: { name: true } });
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
