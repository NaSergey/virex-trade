import { Prisma } from '@prisma/client';
import { GamesService } from './games.service';

const TABLE = {
  gameType: 'blackjack' as const,
  name: 'Стол 1',
  minBuyIn: 100,
  maxBuyIn: 1000,
  maxSeats: 3,
};

/**
 * Отдельный набор моков `gameTable`/`gameSeat` для `tx`, а не тот же объект,
 * что у `prisma`: если `join`/`leave`/`close` по ошибке обратятся к
 * `this.prisma.*` внутри транзакции вместо `tx.*`, вызов попадёт на другой
 * jest.fn() и тест это поймает — иначе транзакционность нечем было бы
 * проверить, ведь в реальном Prisma `tx` и `prisma` тоже разные клиенты.
 */
function makeTableApi(tables: Map<string, any>, seats: any[], counters: { table: number }) {
  return {
    create: jest.fn(async ({ data }: any) => {
      const row = {
        id: `gt${counters.table++}`,
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
    updateMany: jest.fn(async ({ where, data }: any) => {
      const row = tables.get(where.id);
      if (!row) return { count: 0 };
      if (where.status && row.status !== where.status) return { count: 0 };
      if (where.seats?.none && seats.some((s) => s.tableId === where.id)) return { count: 0 };
      tables.set(where.id, { ...row, ...data });
      return { count: 1 };
    }),
  };
}

function makeSeatApi(seats: any[], counters: { seat: number }) {
  return {
    create: jest.fn(async ({ data }: any) => {
      const clash = seats.some(
        (s) => s.tableId === data.tableId && (s.seatIndex === data.seatIndex || s.userId === data.userId),
      );
      if (clash) throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' });
      const row = { id: `gs${counters.seat++}`, joinedAt: new Date(), ...data };
      seats.push(row);
      return row;
    }),
    findUnique: jest.fn(async ({ where }: any) => {
      const key = where.tableId_userId;
      return seats.find((s) => s.tableId === key.tableId && s.userId === key.userId) ?? null;
    }),
    delete: jest.fn(async ({ where }: any) => {
      const key = where.tableId_userId;
      const i = seats.findIndex((s) => s.tableId === key.tableId && s.userId === key.userId);
      return seats.splice(i, 1)[0];
    }),
  };
}

function makeService() {
  const tables = new Map<string, any>();
  const seats: any[] = [];
  const charges: any[] = [];
  const credits: any[] = [];
  const counters = { table: 1, seat: 1 };

  // `prisma` (внешний, вне транзакции) и `tx` (внутри `$transaction`) — два
  // независимых набора моков поверх одних и тех же данных: если код по
  // ошибке позовёт `this.prisma.*` вместо `tx.*` внутри транзакции, вызов
  // попадёт на присма-мок, а не на tx-мок, и тест это заметит.
  const gameTable = makeTableApi(tables, seats, counters);
  const gameSeat = makeSeatApi(seats, counters);
  const txGameTable = makeTableApi(tables, seats, counters);
  const txGameSeat = makeSeatApi(seats, counters);

  const tx = { gameTable: txGameTable, gameSeat: txGameSeat };

  const prisma: any = {
    gameTable,
    gameSeat,
    $transaction: jest.fn(),
  };

  // Транзакция откатывает состояние: без этого проверка «не хватило монет —
  // и места нет» ничего бы не значила, ведь строку мы уже вставили.
  prisma.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg !== 'function') return Promise.all(arg as unknown[]);
    const snapshotTables = new Map(tables);
    const snapshotSeats = [...seats];
    try {
      return await (arg as (tx: unknown) => unknown)(tx);
    } catch (e) {
      tables.clear();
      for (const [k, v] of snapshotTables) tables.set(k, v);
      seats.length = 0;
      seats.push(...snapshotSeats);
      throw e;
    }
  });

  const coins = {
    charge: jest.fn(async (_tx: unknown, userId: string, amount: number, kind: string, refId: string) => {
      charges.push({ userId, amount, kind, refId });
    }),
    credit: jest.fn(async (_tx: unknown, userId: string, amount: number, kind: string, refId: string) => {
      credits.push({ userId, amount, kind, refId });
    }),
  };

  const gateway = { broadcastTableState: jest.fn() };

  const service = new GamesService(prisma as never, coins as never, gateway as never);
  return { service, prisma, tx, coins, gateway, tables, seats, charges, credits };
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

describe('GamesService.join', () => {
  it('садится на первое свободное место и списывает buy-in', async () => {
    const h = makeService();
    await h.service.create('creator', TABLE);

    const state = await h.service.join('me', 'gt1', 300);

    expect(state.mySeat).toBe(0);
    expect(h.charges).toEqual([{ userId: 'me', amount: 300, kind: 'GAME_BUYIN', refId: h.seats[0].id }]);
    expect(h.gateway.broadcastTableState).toHaveBeenCalledWith('gt1', expect.any(Object));
  });

  it('вставка места идёт через транзакционный клиент, а не напрямую через prisma', async () => {
    const h = makeService();
    await h.service.create('creator', TABLE);

    await h.service.join('me', 'gt1', 300);

    expect(h.tx.gameSeat.create).toHaveBeenCalledTimes(1);
    expect(h.prisma.gameSeat.create).not.toHaveBeenCalled();
  });

  it('повторная посадка за тот же стол отклоняется', async () => {
    const h = makeService();
    await h.service.create('creator', TABLE);
    await h.service.join('me', 'gt1', 300);

    await expect(h.service.join('me', 'gt1', 300)).rejects.toMatchObject({
      response: { code: 'GAME_ALREADY_SEATED' },
    });
    expect(h.charges).toHaveLength(1);
  });

  it('buy-in вне диапазона стола отклоняется, монеты не списываются', async () => {
    const h = makeService();
    await h.service.create('creator', TABLE);

    await expect(h.service.join('me', 'gt1', 50)).rejects.toMatchObject({
      response: { code: 'GAME_BUY_IN_OUT_OF_RANGE' },
    });
    expect(h.charges).toHaveLength(0);
    expect(h.seats).toHaveLength(0);
  });

  it('полный стол отклоняет посадку', async () => {
    const h = makeService();
    await h.service.create('creator', { ...TABLE, maxSeats: 1 });
    await h.service.join('p1', 'gt1', 300);

    await expect(h.service.join('p2', 'gt1', 300)).rejects.toMatchObject({
      response: { code: 'GAME_TABLE_FULL' },
    });
  });

  it('гонка за место — P2002 превращается в GAME_SEAT_RACE, монеты не списываются', async () => {
    const h = makeService();
    await h.service.create('creator', TABLE);
    // Кто-то другой успел занять место 0 между чтением и вставкой.
    h.tx.gameSeat.create.mockImplementationOnce(() => {
      throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' });
    });

    await expect(h.service.join('me', 'gt1', 300)).rejects.toMatchObject({
      response: { code: 'GAME_SEAT_RACE' },
    });
    expect(h.charges).toHaveLength(0);
  });

  it('нехватка монет откатывает уже вставленное место', async () => {
    const h = makeService();
    await h.service.create('creator', TABLE);
    h.coins.charge.mockImplementationOnce(async () => {
      throw new Error('INSUFFICIENT_COINS');
    });

    await expect(h.service.join('me', 'gt1', 300)).rejects.toThrow();

    expect(h.seats).toHaveLength(0);
  });
});
