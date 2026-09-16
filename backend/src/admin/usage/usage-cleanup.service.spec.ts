import { PrismaService } from '../../prisma/prisma.service';
import { UsageCleanupService } from './usage-cleanup.service';
import { ACTIVITY_RETENTION_DAYS, DAY_MS } from './visits';

/**
 * Присма-заглушка, которая ДЕЙСТВИТЕЛЬНО фильтрует строки по условию `where`,
 * а не просто отмечает факт вызова — иначе тест утверждает только «сервис
 * вызвал deleteMany с каким-то аргументом», а не то, что удаляются именно
 * строки старше порога.
 */
function fakePrisma(minuteDates: Date[], dayDates: Date[]) {
  let minuteRows = minuteDates.map((minute) => ({ minute }));
  let dayRows = dayDates.map((day) => ({ day }));

  const prisma = {
    userActivityMinute: {
      deleteMany: jest.fn(
        async ({ where }: { where: { minute: { lt: Date } } }) => {
          const before = minuteRows.length;
          minuteRows = minuteRows.filter((r) => !(r.minute < where.minute.lt));
          return { count: before - minuteRows.length };
        },
      ),
    },
    userSectionDay: {
      deleteMany: jest.fn(
        async ({ where }: { where: { day: { lt: Date } } }) => {
          const before = dayRows.length;
          dayRows = dayRows.filter((r) => !(r.day < where.day.lt));
          return { count: before - dayRows.length };
        },
      ),
    },
  };

  return {
    prisma,
    remainingMinutes: () => minuteRows,
    remainingDays: () => dayRows,
  };
}

describe('UsageCleanupService', () => {
  // Часы зафиксированы: sweep() сам вызывает Date.now() внутри, и без фиксации
  // тест на точную границу порога («ровно 180 дней назад») плавает — реальное
  // время между вычислением фикстур в этом файле и вызовом sweep() внутри
  // теста сдвигает cutoff вперёд на миллисекунды выполнения, и строка «ровно
  // на границе» неожиданно оказывается старше cutoff.
  const now = new Date('2026-09-17T00:00:00.000Z').getTime();

  beforeEach(() => {
    jest.useFakeTimers({ now });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const old = new Date(now - (ACTIVITY_RETENTION_DAYS + 5) * DAY_MS);
  const recent = new Date(now - (ACTIVITY_RETENTION_DAYS - 5) * DAY_MS);
  const veryRecent = new Date(now - DAY_MS);

  it('удаляет только строки старше порога хранения, свежие оставляет', async () => {
    const { prisma, remainingMinutes, remainingDays } = fakePrisma(
      [old, recent, veryRecent],
      [old, recent, veryRecent],
    );
    const service = new UsageCleanupService(prisma as unknown as PrismaService);

    const result = await service.sweep();

    expect(result).toEqual({ deletedMinutes: 1, deletedSectionDays: 1 });
    expect(remainingMinutes()).toEqual([
      { minute: recent },
      { minute: veryRecent },
    ]);
    expect(remainingDays()).toEqual([{ day: recent }, { day: veryRecent }]);
  });

  it('ничего не удаляет, если все строки в пределах срока хранения', async () => {
    const { prisma, remainingMinutes, remainingDays } = fakePrisma(
      [recent, veryRecent],
      [recent, veryRecent],
    );
    const service = new UsageCleanupService(prisma as unknown as PrismaService);

    const result = await service.sweep();

    expect(result).toEqual({ deletedMinutes: 0, deletedSectionDays: 0 });
    expect(remainingMinutes()).toHaveLength(2);
    expect(remainingDays()).toHaveLength(2);
  });

  it('строка ровно на границе порога ещё не удаляется (строгое less than)', async () => {
    const exactlyAtThreshold = new Date(now - ACTIVITY_RETENTION_DAYS * DAY_MS);
    const { prisma, remainingMinutes } = fakePrisma([exactlyAtThreshold], []);
    const service = new UsageCleanupService(prisma as unknown as PrismaService);

    const result = await service.sweep();

    expect(result.deletedMinutes).toBe(0);
    expect(remainingMinutes()).toEqual([{ minute: exactlyAtThreshold }]);
  });

  it('удаляет оба вида строк независимо: минуты и дни — разные пороги вызовов', async () => {
    const { prisma } = fakePrisma([old], [old]);
    const service = new UsageCleanupService(prisma as unknown as PrismaService);

    await service.sweep();

    expect(prisma.userActivityMinute.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.userSectionDay.deleteMany).toHaveBeenCalledTimes(1);
    const minuteCutoff = (
      prisma.userActivityMinute.deleteMany.mock.calls[0][0] as {
        where: { minute: { lt: Date } };
      }
    ).where.minute.lt;
    const dayCutoff = (
      prisma.userSectionDay.deleteMany.mock.calls[0][0] as {
        where: { day: { lt: Date } };
      }
    ).where.day.lt;
    expect(minuteCutoff.getTime()).toBe(dayCutoff.getTime());
    // Часы зафиксированы (см. beforeEach) — порог точно «сейчас минус срок хранения».
    expect(minuteCutoff.getTime()).toBe(now - ACTIVITY_RETENTION_DAYS * DAY_MS);
  });
});
