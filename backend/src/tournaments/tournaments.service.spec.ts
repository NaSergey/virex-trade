import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TournamentsService } from './tournaments.service';

/**
 * Турнир распоряжается чужими монетами, поэтому проверяется не «работает ли
 * форма», а два условия: взнос списывается ровно вместе со строкой участника
 * (иначе существует состояние «заплатил, но не участвует»), и призовой фонд
 * выплачивается ровно один раз, сколько бы раз финал ни позвали.
 */
const NOW = Date.UTC(2026, 8, 18, 12, 0, 30); // не круглая минута — конец обязан выровняться
const MIN = 60_000;

const CREATE = {
  name: 'Дуэль',
  maxPlayers: 2,
  startBalance: 10_000,
  durationMin: 60,
  entryFee: 100,
  prizeBonus: 0,
  winnersCount: 1,
  payoutShares: [100],
};

function makeService() {
  const tournaments = new Map<string, any>();
  const participants: any[] = [];
  const charges: any[] = [];
  const credits: any[] = [];
  const sessions: any[] = [];

  const prisma: any = {
    tournament: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: 'tn1', status: 'lobby', startedAt: null, endsAt: null, ...data };
        delete row.participants;
        tournaments.set(row.id, row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) => tournaments.get(where.id) ?? null),
      findMany: jest.fn(async ({ where }: any) =>
        [...tournaments.values()]
          .filter(
            (t) =>
              (!where?.visibility || t.visibility === where.visibility) &&
              (!where?.status || t.status === where.status),
          )
          // include: { _count, creator } — как отдаёт Prisma.
          .map((t) => ({
            ...t,
            creator: { name: (t.creatorId ?? '').toUpperCase() },
            _count: { participants: participants.filter((p) => p.tournamentId === t.id).length },
          })),
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const row = { ...tournaments.get(where.id), ...data };
        tournaments.set(where.id, row);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const row = tournaments.get(where.id);
        if (!row || (where.status && row.status !== where.status)) return { count: 0 };
        tournaments.set(where.id, { ...row, ...data });
        return { count: 1 };
      }),
      delete: jest.fn(async ({ where }: any) => {
        tournaments.delete(where.id);
        return {};
      }),
    },
    tournamentParticipant: {
      create: jest.fn(async ({ data }: any) => {
        const row = { joinedAt: new Date(NOW), finalEquity: null, place: null, prizeWon: null, ...data };
        participants.push(row);
        return row;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        participants.filter((p) => !where?.tournamentId || p.tournamentId === where.tournamentId),
      ),
      findUnique: jest.fn(async ({ where }: any) => {
        const key = where.tournamentId_userId;
        return participants.find((p) => p.tournamentId === key.tournamentId && p.userId === key.userId) ?? null;
      }),
      count: jest.fn(async ({ where }: any) => participants.filter((p) => p.tournamentId === where.tournamentId).length),
      delete: jest.fn(async ({ where }: any) => {
        const key = where.tournamentId_userId;
        const i = participants.findIndex((p) => p.tournamentId === key.tournamentId && p.userId === key.userId);
        return participants.splice(i, 1)[0];
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const key = where.tournamentId_userId;
        const row = participants.find((p) => p.tournamentId === key.tournamentId && p.userId === key.userId);
        Object.assign(row, data);
        return row;
      }),
    },
    backtestSession: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: 'sess' + sessions.length, balance: data.startBalance, ...data };
        sessions.push(row);
        return row;
      }),
      findMany: jest.fn(async () => sessions),
    },
    backtestTrade: { findMany: jest.fn(async () => []) },
    user: { findMany: jest.fn(async () => participants.map((p) => ({ id: p.userId, name: p.userId.toUpperCase() }))) },
    $transaction: jest.fn(),
  };
  // Транзакция откатывает состояние: без этого проверка «не хватило монет — и
  // участника нет» ничего бы не значила, ведь строку мы уже вставили.
  prisma.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg !== 'function') return Promise.all(arg as unknown[]);
    const snapshot = {
      tournaments: new Map(tournaments),
      participants: [...participants],
      charges: [...charges],
      credits: [...credits],
      sessions: [...sessions],
    };
    try {
      return await (arg as (tx: unknown) => unknown)(prisma);
    } catch (e) {
      tournaments.clear();
      for (const [k, v] of snapshot.tournaments) tournaments.set(k, v);
      participants.length = 0;
      participants.push(...snapshot.participants);
      charges.length = 0;
      charges.push(...snapshot.charges);
      credits.length = 0;
      credits.push(...snapshot.credits);
      sessions.length = 0;
      sessions.push(...snapshot.sessions);
      throw e;
    }
  });

  // Ноль в журнал не пишется — как в настоящем CoinsService: строка
  // «начислено 0» ничего не сообщает, а ключ журнала заняла бы.
  const coins = {
    charge: jest.fn(async (_tx: unknown, userId: string, amount: number, kind: string, refId: string) => {
      if (amount > 0) charges.push({ userId, amount, kind, refId });
    }),
    credit: jest.fn(async (_tx: unknown, userId: string, amount: number, kind: string, refId: string) => {
      if (amount > 0) credits.push({ userId, amount, kind, refId });
    }),
    refund: jest.fn(async (_tx: unknown, userId: string, amount: number, refId: string) => {
      if (amount > 0) credits.push({ userId, amount, kind: 'TOURNAMENT_REFUND', refId });
    }),
  };

  const live = { quote: jest.fn().mockResolvedValue({ time: new Date(NOW), price: 70_000 }) };

  const service = new TournamentsService(prisma as never, coins as never, live as never);
  return { service, prisma, coins, live, tournaments, participants, charges, credits, sessions };
}

async function rejection(p: Promise<unknown>): Promise<any> {
  return p.then(
    () => {
      throw new Error('ожидался отказ');
    },
    (e) => e,
  );
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(NOW));
});
afterEach(() => {
  jest.useRealTimers();
});

describe('TournamentsService.create', () => {
  it('создатель сразу участник, и взнос списан вместе со строкой участия', async () => {
    const h = makeService();

    await h.service.create('u1', CREATE);

    expect(h.participants).toHaveLength(1);
    expect(h.participants[0]).toMatchObject({ userId: 'u1' });
    expect(h.charges).toEqual([
      { userId: 'u1', amount: 100, kind: 'TOURNAMENT_FEE', refId: `tn1:${NOW}` },
    ]);
  });

  it('добавка в фонд списывается отдельной строкой', async () => {
    const h = makeService();

    await h.service.create('u1', { ...CREATE, prizeBonus: 500 });

    expect(h.charges).toContainEqual({ userId: 'u1', amount: 500, kind: 'TOURNAMENT_BONUS', refId: 'tn1' });
  });

  it('бесплатный турнир без добавки ничего не списывает', async () => {
    const h = makeService();

    await h.service.create('u1', { ...CREATE, entryFee: 0, prizeBonus: 0 });

    expect(h.charges).toEqual([]);
  });

  it('по умолчанию турнир закрытый', async () => {
    const h = makeService();

    const { tournament } = await h.service.create('u1', CREATE);

    expect(tournament.visibility).toBe('private');
  });

  it('доли, не дающие ста процентов, отклоняются до всякого списания', async () => {
    const h = makeService();

    const e = await rejection(h.service.create('u1', { ...CREATE, winnersCount: 2, payoutShares: [70, 20] }));

    expect(e).toBeInstanceOf(BadRequestException);
    expect(e.response.code).toBe('TOURNAMENT_BAD_PAYOUT');
    expect(h.charges).toEqual([]);
  });

  it('победителей не может быть столько же, сколько мест', async () => {
    const h = makeService();

    const e = await rejection(
      h.service.create('u1', { ...CREATE, maxPlayers: 2, winnersCount: 2, payoutShares: [60, 40] }),
    );

    expect(e.response.code).toBe('TOURNAMENT_BAD_PAYOUT');
  });
});

describe('TournamentsService.join / leave', () => {
  it('вход списывает взнос вместе со строкой участника', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);

    await h.service.join('u2', 'tn1');

    expect(h.participants.map((p) => p.userId)).toEqual(['u1', 'u2']);
    expect(h.charges).toContainEqual({ userId: 'u2', amount: 100, kind: 'TOURNAMENT_FEE', refId: `tn1:${NOW}` });
  });

  it('нехватка монет не оставляет участника: списание и строка — одна транзакция', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);
    h.coins.charge.mockRejectedValueOnce(
      new ConflictException({ message: 'Не хватает монет', code: 'INSUFFICIENT_COINS' }),
    );

    const e = await rejection(h.service.join('u2', 'tn1'));

    expect(e.response.code).toBe('INSUFFICIENT_COINS');
    expect(h.participants.map((p) => p.userId)).toEqual(['u1']);
  });

  it('повторный вход того же человека — успех без второго взноса', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);
    await h.service.join('u2', 'tn1');

    await h.service.join('u2', 'tn1');

    expect(h.participants).toHaveLength(2);
    expect(h.charges.filter((c) => c.userId === 'u2')).toHaveLength(1);
  });

  it('дуэль закрывается на втором участнике', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);
    await h.service.join('u2', 'tn1');

    const e = await rejection(h.service.join('u3', 'tn1'));

    expect(e).toBeInstanceOf(ConflictException);
    expect(e.response.code).toBe('TOURNAMENT_FULL');
  });

  it('выход возвращает взнос', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);
    await h.service.join('u2', 'tn1');

    await h.service.leave('u2', 'tn1');

    expect(h.participants.map((p) => p.userId)).toEqual(['u1']);
    expect(h.credits).toContainEqual({
      userId: 'u2',
      amount: 100,
      kind: 'TOURNAMENT_REFUND',
      refId: `tn1:${NOW}`,
    });
  });

  it('создатель не выходит из своего турнира', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);

    const e = await rejection(h.service.leave('u1', 'tn1'));

    expect(e).toBeInstanceOf(ConflictException);
    expect(e.response.code).toBe('TOURNAMENT_CREATOR_LEAVE');
  });

  it('после старта войти нельзя', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);
    await h.service.join('u2', 'tn1');
    await h.service.start('u1', 'tn1');

    const e = await rejection(h.service.join('u3', 'tn1'));

    expect(e.response.code).toBe('TOURNAMENT_NOT_LOBBY');
  });

  it('несуществующий турнир — 404', async () => {
    const h = makeService();
    const e = await rejection(h.service.join('u2', 'нет'));
    expect(e).toBeInstanceOf(NotFoundException);
    expect(e.response.code).toBe('TOURNAMENT_NOT_FOUND');
  });
});

describe('TournamentsService.start', () => {
  it('раздаёт всем одинаковые сессии и выравнивает конец по минуте', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);
    await h.service.join('u2', 'tn1');

    await h.service.start('u1', 'tn1');

    expect(h.sessions).toHaveLength(2);
    for (const s of h.sessions) {
      expect(s).toMatchObject({ tournamentId: 'tn1', startBalance: 10_000, hideDate: false, hidePrice: false, priceScale: 1 });
    }
    // Начало текущей минуты плюс час: финальная цена — закрытие конкретной минутки.
    const expectedEnd = new Date(Math.floor(NOW / MIN) * MIN + 60 * MIN);
    expect(h.tournaments.get('tn1').endsAt).toEqual(expectedEnd);
    expect(h.sessions[0].endTime).toEqual(expectedEnd);
  });

  it('старт только создателем', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);
    await h.service.join('u2', 'tn1');

    const e = await rejection(h.service.start('u2', 'tn1'));

    expect(e).toBeInstanceOf(ForbiddenException);
    expect(e.response.code).toBe('TOURNAMENT_NOT_CREATOR');
  });

  it('в одиночку турнир не стартует', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);

    const e = await rejection(h.service.start('u1', 'tn1'));

    expect(e.response.code).toBe('TOURNAMENT_TOO_FEW');
  });

  it('при трёх победителях нужно больше трёх участников', async () => {
    const h = makeService();
    await h.service.create('u1', { ...CREATE, maxPlayers: 10, winnersCount: 3, payoutShares: [50, 30, 20] });
    await h.service.join('u2', 'tn1');
    await h.service.join('u3', 'tn1');

    const e = await rejection(h.service.start('u1', 'tn1'));
    expect(e.response.code).toBe('TOURNAMENT_TOO_FEW');

    await h.service.join('u4', 'tn1');
    await expect(h.service.start('u1', 'tn1')).resolves.toBeDefined();
  });
});

describe('TournamentsService.remove', () => {
  it('удаление лобби возвращает взносы всем и добавку создателю', async () => {
    const h = makeService();
    await h.service.create('u1', { ...CREATE, prizeBonus: 500 });
    await h.service.join('u2', 'tn1');

    await h.service.remove('u1', 'tn1');

    expect(h.credits).toContainEqual({ userId: 'u1', amount: 100, kind: 'TOURNAMENT_REFUND', refId: `tn1:${NOW}` });
    expect(h.credits).toContainEqual({ userId: 'u2', amount: 100, kind: 'TOURNAMENT_REFUND', refId: `tn1:${NOW}` });
    expect(h.credits).toContainEqual({ userId: 'u1', amount: 500, kind: 'TOURNAMENT_REFUND', refId: 'tn1:bonus' });
    expect(h.tournaments.has('tn1')).toBe(false);
  });

  it('удалить может только создатель и только лобби', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);
    await h.service.join('u2', 'tn1');

    expect((await rejection(h.service.remove('u2', 'tn1'))).response.code).toBe('TOURNAMENT_NOT_CREATOR');

    await h.service.start('u1', 'tn1');
    expect((await rejection(h.service.remove('u1', 'tn1'))).response.code).toBe('TOURNAMENT_NOT_LOBBY');
  });
});

describe('TournamentsService.finalize', () => {
  const runTournament = async (over: Partial<typeof CREATE> = {}) => {
    const h = makeService();
    await h.service.create('u1', { ...CREATE, ...over });
    await h.service.join('u2', 'tn1');
    await h.service.start('u1', 'tn1');
    // u2 заработал больше.
    h.sessions[0].balance = 9_000;
    h.sessions[1].balance = 11_000;
    return h;
  };

  it('проставляет места и выплачивает фонд победителю', async () => {
    const h = await runTournament();

    await h.service.finalize(h.tournaments.get('tn1'));

    const byUser = Object.fromEntries(h.participants.map((p) => [p.userId, p]));
    expect(byUser.u2).toMatchObject({ place: 1, finalEquity: 11_000, prizeWon: 200 });
    expect(byUser.u1).toMatchObject({ place: 2, finalEquity: 9_000, prizeWon: 0 });
    expect(h.credits).toContainEqual({ userId: 'u2', amount: 200, kind: 'TOURNAMENT_PRIZE', refId: 'tn1' });
    expect(h.tournaments.get('tn1').status).toBe('finished');
  });

  it('второй финал ничего не выплачивает', async () => {
    const h = await runTournament();

    await h.service.finalize(h.tournaments.get('tn1'));
    await h.service.finalize({ ...h.tournaments.get('tn1'), status: 'running' });

    expect(h.credits.filter((c) => c.kind === 'TOURNAMENT_PRIZE')).toHaveLength(1);
  });

  it('нулевой фонд не выплачивается, но места проставляются', async () => {
    const h = await runTournament({ entryFee: 0, prizeBonus: 0 });

    await h.service.finalize(h.tournaments.get('tn1'));

    expect(h.credits.filter((c) => c.kind === 'TOURNAMENT_PRIZE')).toEqual([]);
    expect(h.participants.every((p) => p.place != null)).toBe(true);
  });
});

describe('TournamentsService.listPublic', () => {
  it('отдаёт только публичные лобби со свободными местами', async () => {
    const h = makeService();

    await h.service.listPublic();

    expect(h.prisma.tournament.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { visibility: 'public', status: 'lobby' } }),
    );
  });

  it('заполненное лобби в общем списке не показывается', async () => {
    const h = makeService();
    await h.service.create('u1', { ...CREATE, visibility: 'public' });
    await h.service.join('u2', 'tn1');

    expect(await h.service.listPublic()).toEqual([]);
  });
});
