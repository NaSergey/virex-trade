import { GamesService } from './games.service';

const TABLE = {
  gameType: 'blackjack' as const,
  name: 'Стол 1',
  minBuyIn: 100,
  maxBuyIn: 1000,
  maxSeats: 3,
};

function makeService() {
  const tables = new Map<string, any>();
  const seats: any[] = [];
  let nextTableId = 1;

  const prisma: any = {
    gameTable: {
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `gt${nextTableId++}`,
          status: 'open',
          visibility: 'private',
          closedAt: null,
          createdAt: new Date(),
          ...data,
        };
        tables.set(row.id, row);
        return row;
      }),
      findUnique: jest.fn(async ({ where, include }: any) => {
        const row = tables.get(where.id) ?? null;
        if (!row || !include) return row;
        return {
          ...row,
          ...(include.seats ? { seats: seats.filter((s) => s.tableId === row.id) } : {}),
          ...(include.creator ? { creator: { name: (row.creatorId ?? '').toUpperCase() } } : {}),
        };
      }),
      findMany: jest.fn(async ({ where }: any) =>
        [...tables.values()]
          .filter(
            (t) =>
              (!where?.visibility || t.visibility === where.visibility) &&
              (!where?.status || t.status === where.status) &&
              (!where?.gameType || t.gameType === where.gameType) &&
              (!where?.OR ||
                where.OR.some(
                  (cond: any) =>
                    (cond.creatorId && t.creatorId === cond.creatorId) ||
                    (cond.seats?.some &&
                      seats.some((s) => s.tableId === t.id && s.userId === cond.seats.some.userId)),
                )) &&
              (!where?.seats?.none ||
                !seats.some((s) => s.tableId === t.id && s.userId === where.seats.none.userId)),
          )
          .map((t) => ({
            ...t,
            creator: { name: (t.creatorId ?? '').toUpperCase() },
            _count: { seats: seats.filter((s) => s.tableId === t.id).length },
          })),
      ),
    },
    gameSeat: {},
  };

  const coins = { charge: jest.fn(), credit: jest.fn() };
  const gateway = { broadcastTableState: jest.fn() };

  const service = new GamesService(prisma as never, coins as never, gateway as never);
  return { service, prisma, tables, seats };
}

describe('GamesService.create', () => {
  it('создаёт стол без посадки создателя', async () => {
    const h = makeService();

    const table = await h.service.create('u1', TABLE);

    expect(table).toMatchObject({ gameType: 'blackjack', creatorId: 'u1', status: 'open' });
    expect(h.seats).toHaveLength(0);
  });

  it('число мест вне диапазона типа игры отклоняется', async () => {
    const h = makeService();

    await expect(h.service.create('u1', { ...TABLE, maxSeats: 8 })).rejects.toMatchObject({
      response: { code: 'GAME_BAD_SEATS' },
    });
  });

  it('minBuyIn больше maxBuyIn отклоняется', async () => {
    const h = makeService();

    await expect(h.service.create('u1', { ...TABLE, minBuyIn: 500, maxBuyIn: 100 })).rejects.toMatchObject({
      response: { code: 'GAME_BAD_BUYIN_RANGE' },
    });
  });
});

describe('GamesService.listPublic / listMine', () => {
  it('публичный список не показывает столы без свободных мест и столы, где я уже сижу', async () => {
    const h = makeService();
    await h.service.create('creator', { ...TABLE, visibility: 'public' });
    h.seats.push({ tableId: 'gt1', userId: 'me', seatIndex: 0, stack: 100 });

    const rows = await h.service.listPublic('me');

    expect(rows).toHaveLength(0);
  });

  it('мои столы включают те, где я создатель, даже без места', async () => {
    const h = makeService();
    await h.service.create('me', TABLE);

    const rows = await h.service.listMine('me');

    expect(rows).toHaveLength(1);
  });
});

describe('GamesService.get', () => {
  it('несуществующий стол — GAME_TABLE_NOT_FOUND', async () => {
    const h = makeService();

    await expect(h.service.get('u1', 'missing')).rejects.toMatchObject({
      response: { code: 'GAME_TABLE_NOT_FOUND' },
    });
  });

  it('отдаёт места и мой seatIndex', async () => {
    const h = makeService();
    await h.service.create('creator', TABLE);
    h.seats.push({ tableId: 'gt1', userId: 'me', seatIndex: 1, stack: 200 });

    const state = await h.service.get('me', 'gt1');

    expect(state.mySeat).toBe(1);
    expect(state.isCreator).toBe(false);
    expect(state.seats).toEqual([{ userId: 'me', name: null, seatIndex: 1, stack: 200 }]);
  });
});
