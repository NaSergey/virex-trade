import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationStateBatch,
  NotificationStateService,
} from './notification-state.service';

function prismaStub() {
  return {
    notificationState: { findMany: jest.fn().mockResolvedValue([]) },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
}

const T0 = new Date('2026-09-16T10:00:00Z');
const HOUR = 3_600_000;

describe('NotificationStateService.beginBatch', () => {
  it('поднимает состояния одним findMany на весь набор userId × key', async () => {
    const prisma = prismaStub();
    const service = new NotificationStateService(
      prisma as unknown as PrismaService,
    );

    const ids = Array.from({ length: 100 }, (_, i) => `u${i}`);
    const keys = [
      'mkt.price1h',
      'mkt.vol1h',
      'mkt.volume',
      'mkt.fng',
      'mkt.ls',
      'mkt.book',
      'mkt.hour',
    ];

    await service.beginBatch(ids, keys);

    expect(prisma.notificationState.findMany).toHaveBeenCalledTimes(1);
    const arg = prisma.notificationState.findMany.mock.calls[0][0];
    expect(arg.where.userId.in).toEqual(ids);
    expect(arg.where.key.in).toEqual(keys);
  });

  it('пустой набор пользователей или ключей не ходит в БД', async () => {
    const prisma = prismaStub();
    const service = new NotificationStateService(
      prisma as unknown as PrismaService,
    );

    await service.beginBatch([], ['mkt.price1h']);
    await service.beginBatch(['u1'], []);

    expect(prisma.notificationState.findMany).not.toHaveBeenCalled();
  });
});

describe('NotificationStateBatch.check', () => {
  // Та же таблица случаев, что в notification-state.spec.ts (decide), но
  // прогнанная через батч, чтобы подтвердить: перенос на пачку не изменил
  // решений построчной логики.
  it('условие не держится — не шлём и гасим фронт', () => {
    const batch = new NotificationStateBatch({} as unknown as PrismaService, [
      { userId: 'u1', key: 'mkt.price1h', activeSince: T0, lastSentAt: T0 },
    ]);
    const send = batch.check(
      'u1',
      'mkt.price1h',
      false,
      2 * HOUR,
      new Date(T0.getTime() + HOUR),
    );
    expect(send).toBe(false);
  });

  it('первый раз держится — шлём (строки в кэше нет)', () => {
    const batch = new NotificationStateBatch(
      {} as unknown as PrismaService,
      [],
    );
    const send = batch.check('u1', 'mkt.price1h', true, 2 * HOUR, T0);
    expect(send).toBe(true);
  });

  it('держится второй тик подряд — молчим', () => {
    const batch = new NotificationStateBatch({} as unknown as PrismaService, [
      { userId: 'u1', key: 'mkt.price1h', activeSince: T0, lastSentAt: T0 },
    ]);
    const send = batch.check(
      'u1',
      'mkt.price1h',
      true,
      2 * HOUR,
      new Date(T0.getTime() + 5 * 60_000),
    );
    expect(send).toBe(false);
  });

  it('новый фронт после cooldown — шлём', () => {
    const batch = new NotificationStateBatch({} as unknown as PrismaService, [
      { userId: 'u1', key: 'mkt.price1h', activeSince: null, lastSentAt: T0 },
    ]);
    const send = batch.check(
      'u1',
      'mkt.price1h',
      true,
      2 * HOUR,
      new Date(T0.getTime() + 3 * HOUR),
    );
    expect(send).toBe(true);
  });

  it('разные пользователи и разные ключи не путаются между собой', () => {
    const batch = new NotificationStateBatch({} as unknown as PrismaService, [
      { userId: 'u1', key: 'mkt.price1h', activeSince: T0, lastSentAt: T0 },
    ]);
    // Тот же ключ, другой пользователь — для него строки в кэше нет, решение независимое.
    expect(batch.check('u2', 'mkt.price1h', true, 2 * HOUR, T0)).toBe(true);
    // Тот же пользователь, другой ключ — тоже независимое решение.
    expect(batch.check('u1', 'mkt.vol1h', true, 2 * HOUR, T0)).toBe(true);
  });
});

describe('NotificationStateBatch.flush', () => {
  it('ничего не пишет, если ни один check не звался', async () => {
    const prisma = prismaStub();
    const batch = new NotificationStateBatch(
      prisma as unknown as PrismaService,
      [],
    );
    await batch.flush();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('пишет решения тика на сотнях пользователей одним запросом', async () => {
    const prisma = prismaStub();
    const batch = new NotificationStateBatch(
      prisma as unknown as PrismaService,
      [],
    );

    for (let i = 0; i < 100; i++) {
      for (const key of [
        'mkt.price1h',
        'mkt.vol1h',
        'mkt.volume',
        'mkt.fng',
        'mkt.ls',
        'mkt.book',
        'mkt.hour',
      ]) {
        batch.check(`u${i}`, key, false, 2 * HOUR, T0);
      }
    }
    await batch.flush();

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const sql = (prisma.$executeRaw.mock.calls[0][0] as string[]).join('?');
    expect(sql).toContain('ON CONFLICT ("userId", key)');
    expect(sql).toContain(
      'DO UPDATE SET "activeSince" = EXCLUDED."activeSince"',
    );
  });
});
