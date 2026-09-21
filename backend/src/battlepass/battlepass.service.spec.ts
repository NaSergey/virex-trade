import { BattlePassService } from './battlepass.service';
import { XP_SOURCES } from './xp-registry';

const NOW = new Date('2026-09-21T10:00:00Z');
const SEASON = '2026-Q3';

/**
 * Поддельная база ведёт себя как Postgres ровно в тех двух местах, ради
 * которых тесты и написаны: `createMany` со `skipDuplicates` не бросает на
 * конфликте, а возвращает `count: 0`, и `aggregate` складывает то, что уже
 * начислено за сегодня.
 */
function fakeDb() {
  const events: { userId: string; season: string; source: string; refId: string; xp: number; createdAt: Date }[] = [];
  const progress = new Map<string, { userId: string; season: string; xp: number; claimedLevel: number }>();
  const key = (userId: string, season: string) => `${userId}:${season}`;

  const tx = {
    battlePassXpEvent: {
      createMany: jest.fn(async ({ data }: any) => {
        const rows = Array.isArray(data) ? data : [data];
        let count = 0;
        for (const row of rows) {
          const exists = events.some(
            (e) => e.userId === row.userId && e.source === row.source && e.refId === row.refId,
          );
          if (exists) continue;
          events.push({ ...row, createdAt: row.createdAt ?? NOW });
          count += 1;
        }
        return { count };
      }),
      aggregate: jest.fn(async ({ where }: any) => {
        const since = where.createdAt?.gte?.getTime() ?? 0;
        const sum = events
          .filter((e) => e.userId === where.userId && e.source === where.source && e.createdAt.getTime() >= since)
          .reduce((acc, e) => acc + e.xp, 0);
        return { _sum: { xp: sum } };
      }),
    },
    battlePassProgress: {
      upsert: jest.fn(async ({ where, create, update }: any) => {
        const k = key(where.userId_season.userId, where.userId_season.season);
        const row = progress.get(k);
        if (!row) {
          const created = { claimedLevel: 0, ...create };
          progress.set(k, created);
          return created;
        }
        row.xp += update.xp?.increment ?? 0;
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) => progress.get(key(where.userId_season.userId, where.userId_season.season)) ?? null),
    },
  };

  return { tx, events, progress, key };
}

const service = (prisma: unknown = {}) => new BattlePassService(prisma as never, {} as never);

describe('BattlePassService.award', () => {
  it('пишет событие и двигает прогресс сезона', async () => {
    const db = fakeDb();
    await service().award(db.tx as never, 'u1', 'game.backtest', 's1', 50, NOW);

    expect(db.events).toHaveLength(1);
    expect(db.events[0]).toMatchObject({ userId: 'u1', season: SEASON, source: 'game.backtest', xp: 50 });
    expect(db.progress.get(db.key('u1', SEASON))?.xp).toBe(50);
  });

  it('повтор того же события не начисляет второй раз и не бросает', async () => {
    const db = fakeDb();
    await service().award(db.tx as never, 'u1', 'game.backtest', 's1', 50, NOW);
    await expect(service().award(db.tx as never, 'u1', 'game.backtest', 's1', 50, NOW)).resolves.toBeUndefined();

    expect(db.events).toHaveLength(1);
    expect(db.progress.get(db.key('u1', SEASON))?.xp).toBe(50);
  });

  it('дневной потолок режет начисление и оставляет отметку с нулём', async () => {
    const db = fakeDb();
    const cap = XP_SOURCES['game.backtest'].dailyCap!;
    // Шесть сессий по 50 — это 300, весь дневной потолок.
    for (let i = 0; i < cap / 50; i++) {
      await service().award(db.tx as never, 'u1', 'game.backtest', `s${i}`, 50, NOW);
    }
    await service().award(db.tx as never, 'u1', 'game.backtest', 'over', 50, NOW);

    expect(db.progress.get(db.key('u1', SEASON))?.xp).toBe(cap);
    expect(db.events[db.events.length - 1]).toMatchObject({ refId: 'over', xp: 0 });
  });

  it('потолок одного источника не отнимает XP у другого', async () => {
    const db = fakeDb();
    for (let i = 0; i < 6; i++) await service().award(db.tx as never, 'u1', 'game.backtest', `s${i}`, 50, NOW);
    await service().award(db.tx as never, 'u1', 'journal.tag', 't1', 15, NOW);

    expect(db.progress.get(db.key('u1', SEASON))?.xp).toBe(315);
  });

  it('выключенный источник не начисляет и не оставляет следов', async () => {
    const db = fakeDb();
    await service().award(db.tx as never, 'u1', 'game.table', 'seat1', 100, NOW);

    expect(db.events).toHaveLength(0);
  });
});

describe('BattlePassService.state', () => {
  it('пустой прогресс — первый уровень, забирать нечего', async () => {
    const prisma = {
      battlePassProgress: { findUnique: jest.fn(async () => null) },
      coinTransaction: { findMany: jest.fn(async () => []) },
    };
    const state = await service(prisma).state('u1', NOW);

    expect(state.season.key).toBe(SEASON);
    expect(state.level).toBe(1);
    expect(state.pendingCoins).toBe(0);
    expect(state.levels[0]).toMatchObject({ level: 2, state: 'locked' });
    expect(state.daily.day).toBe(1);
  });

  it('достигнутые, но не забранные уровни помечены и посчитаны', async () => {
    const prisma = {
      battlePassProgress: { findUnique: jest.fn(async () => ({ userId: 'u1', season: SEASON, xp: 300, claimedLevel: 1 })) },
      coinTransaction: { findMany: jest.fn(async () => [{ refId: '2026-09-21' }]) },
    };
    const state = await service(prisma).state('u1', NOW);

    // 300 XP = 100 + 120 и остаток 80 → третий уровень.
    expect(state.level).toBe(3);
    expect(state.pendingCoins).toBe(100);
    expect(state.levels.find((l) => l.level === 2)?.state).toBe('ready');
    expect(state.levels.find((l) => l.level === 4)?.state).toBe('locked');
    expect(state.daily.claimedToday).toBe(true);
  });
});
