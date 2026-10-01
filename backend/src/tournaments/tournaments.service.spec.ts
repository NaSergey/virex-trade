import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OWNER_EMAIL } from '../admin/owner';
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
      findUnique: jest.fn(async ({ where, include }: any) => {
        const row = tournaments.get(where.id) ?? null;
        if (!row || !include) return row;
        // include: { participants, creator } — как отдаёт Prisma; имя создателя
        // выводим из id тем же способом, что и findMany выше.
        return {
          ...row,
          ...(include.participants ? { participants: participants.filter((p) => p.tournamentId === row.id) } : {}),
          ...(include.creator ? { creator: { name: (row.creatorId ?? '').toUpperCase() } } : {}),
        };
      }),
      findMany: jest.fn(async ({ where }: any) =>
        [...tournaments.values()]
          .filter(
            (t) =>
              (!where?.visibility || t.visibility === where.visibility) &&
              (!where?.status ||
                (typeof where.status === 'string' ? t.status === where.status : where.status.in.includes(t.status))) &&
              (!where?.startsAt?.lte || (t.startsAt != null && t.startsAt <= where.startsAt.lte)) &&
              // participants: { some: { userId } } — «где я есть».
              (!where?.participants?.some ||
                participants.some(
                  (p) => p.tournamentId === t.id && p.userId === where.participants.some.userId,
                )) &&
              // participants: { none: { userId } } — «где меня нет».
              (!where?.participants?.none ||
                !participants.some(
                  (p) => p.tournamentId === t.id && p.userId === where.participants.none.userId,
                )),
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
        const row = {
          joinedAt: new Date(NOW),
          ready: false,
          finalEquity: null,
          place: null,
          prizeWon: null,
          ...data,
        };
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
      count: jest.fn(
        async ({ where }: any) =>
          participants.filter(
            (p) => p.tournamentId === where.tournamentId && (where.team === undefined || p.team === where.team),
          ).length,
      ),
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
      updateMany: jest.fn(async ({ where, data }: any) => {
        const rows = participants.filter(
          (p) =>
            (!where?.tournamentId || p.tournamentId === where.tournamentId) &&
            (!where?.userId || p.userId === where.userId),
        );
        for (const row of rows) Object.assign(row, data);
        return { count: rows.length };
      }),
    },
    backtestSession: {
      create: jest.fn(async ({ data }: any) => {
        // trades — закрытые сделки сессии: их читает сводка участника в `get`.
        const row = { id: 'sess' + sessions.length, balance: data.startBalance, trades: [], ...data };
        sessions.push(row);
        return row;
      }),
      findMany: jest.fn(async () => sessions),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const rows = sessions.filter((s) => !where?.tournamentId || s.tournamentId === where.tournamentId);
        for (const s of rows) Object.assign(s, data);
        return { count: rows.length };
      }),
    },
    backtestTrade: { findMany: jest.fn(async () => []) },
    user: { findMany: jest.fn(async () => participants.map((p) => ({ id: p.userId, name: p.userId.toUpperCase() }))) },
    // Замок строки турнира (`SELECT … FOR UPDATE`): в памяти гонок нет, но
    // вызов проверяется — без него вход и старт по времени расходятся.
    $queryRaw: jest.fn(async () => []),
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

  // XP начисляется в той же транзакции, что места и призы, — собираем вызовы
  // так же, как charges/credits у монет.
  const awards: { userId: string; source: string; refId: string; xp: number }[] = [];
  const battlePass = {
    award: jest.fn(async (_tx: unknown, userId: string, source: string, refId: string, xp: number) => {
      awards.push({ userId, source, refId, xp });
    }),
  };

  const service = new TournamentsService(prisma as never, coins as never, live as never, battlePass as never);
  return { service, prisma, coins, live, battlePass, tournaments, participants, charges, credits, sessions, awards };
}

/**
 * Довести лобби до старта: каждый участник отмечает готовность, и на последнем
 * турнир уходит в `running` сам — другого пути к старту в продукте нет.
 */
async function allReady(h: { service: TournamentsService; participants: any[] }, id = 'tn1') {
  for (const p of h.participants.filter((x) => x.tournamentId === id)) {
    await h.service.setReady(p.userId, id, true);
  }
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

  it('время старта сохраняется по минуте', async () => {
    const h = makeService();

    await h.service.create('u1', { ...CREATE, startsAt: new Date(NOW + 2 * 3_600_000).toISOString() });

    expect(h.tournaments.get('tn1').startsAt).toEqual(new Date(Date.UTC(2026, 8, 18, 14, 0, 0)));
  });

  it('без времени старта поле пустое — турнир стартует по готовности', async () => {
    const h = makeService();

    await h.service.create('u1', CREATE);

    expect(h.tournaments.get('tn1').startsAt).toBeNull();
  });

  it('негодное время старта отклоняется до всякого списания', async () => {
    const h = makeService();

    const e = await rejection(h.service.create('u1', { ...CREATE, startsAt: new Date(NOW + 10_000).toISOString() }));

    expect(e).toBeInstanceOf(BadRequestException);
    expect(e.response.code).toBe('TOURNAMENT_BAD_START');
    expect(h.charges).toEqual([]);
    expect(h.tournaments.size).toBe(0);
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

  // Решение владельца 2026-09-27: после старта войти нельзя, даже при
  // свободных местах, — ни взноса, ни сессии.
  it('в начавшийся турнир войти нельзя, даже если места есть', async () => {
    const h = makeService();
    await h.service.create('u1', { ...CREATE, maxPlayers: 3 });
    await h.service.join('u2', 'tn1');
    await allReady(h);

    const e = await rejection(h.service.join('u3', 'tn1'));

    expect(e).toBeInstanceOf(ConflictException);
    expect(e.response.code).toBe('TOURNAMENT_NOT_LOBBY');
    expect(h.charges.filter((c) => c.userId === 'u3')).toEqual([]);
    expect(h.sessions.map((s) => s.userId)).not.toContain('u3');
  });

  it('в завершённый и отменённый турнир войти нельзя', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);

    for (const status of ['finished', 'cancelled']) {
      h.tournaments.set('tn1', { ...h.tournaments.get('tn1'), status });
      const e = await rejection(h.service.join('u2', 'tn1'));
      expect(e.response.code).toBe('TOURNAMENT_CLOSED');
    }
  });

  it('несуществующий турнир — 404', async () => {
    const h = makeService();
    const e = await rejection(h.service.join('u2', 'нет'));
    expect(e).toBeInstanceOf(NotFoundException);
    expect(e.response.code).toBe('TOURNAMENT_NOT_FOUND');
  });
});

describe('TournamentsService.setReady', () => {
  it('когда готовы все, турнир стартует сам: одинаковые сессии и конец по минуте', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);
    await h.service.join('u2', 'tn1');

    await allReady(h);

    expect(h.tournaments.get('tn1').status).toBe('running');
    expect(h.sessions).toHaveLength(2);
    for (const s of h.sessions) {
      expect(s).toMatchObject({ tournamentId: 'tn1', startBalance: 10_000, hideDate: false, hidePrice: false, priceScale: 1 });
    }
    // Начало текущей минуты плюс час: финальная цена — закрытие конкретной минутки.
    const expectedEnd = new Date(Math.floor(NOW / MIN) * MIN + 60 * MIN);
    expect(h.tournaments.get('tn1').endsAt).toEqual(expectedEnd);
    expect(h.sessions[0].endTime).toEqual(expectedEnd);
  });

  it('пока готовы не все, лобби стоит', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);
    await h.service.join('u2', 'tn1');

    await h.service.setReady('u1', 'tn1', true);

    expect(h.tournaments.get('tn1').status).toBe('lobby');
    expect(h.sessions).toHaveLength(0);
  });

  it('готовность снимается и чужую не трогает', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);
    await h.service.join('u2', 'tn1');
    await h.service.setReady('u1', 'tn1', true);
    await h.service.setReady('u2', 'tn1', true);

    // Турнир уже идёт — снять готовность нельзя, и это отдельный случай ниже.
    expect(h.tournaments.get('tn1').status).toBe('running');

    const g = makeService();
    await g.service.create('u1', { ...CREATE, maxPlayers: 10 });
    await g.service.join('u2', 'tn1');
    await g.service.join('u3', 'tn1');
    await g.service.setReady('u1', 'tn1', true);
    await g.service.setReady('u2', 'tn1', true);
    await g.service.setReady('u1', 'tn1', false);

    expect(g.participants.map((p) => p.ready)).toEqual([false, true, false]);
    expect(g.tournaments.get('tn1').status).toBe('lobby');
  });

  it('в одиночку турнир не стартует: делить фонд не на кого', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);

    await h.service.setReady('u1', 'tn1', true);

    expect(h.tournaments.get('tn1').status).toBe('lobby');
    expect(h.sessions).toHaveLength(0);
  });

  it('при трёх победителях трёх готовых мало — нужен четвёртый', async () => {
    const h = makeService();
    await h.service.create('u1', { ...CREATE, maxPlayers: 10, winnersCount: 3, payoutShares: [50, 30, 20] });
    await h.service.join('u2', 'tn1');
    await h.service.join('u3', 'tn1');

    await allReady(h);
    expect(h.tournaments.get('tn1').status).toBe('lobby');

    await h.service.join('u4', 'tn1');
    await allReady(h);
    expect(h.tournaments.get('tn1').status).toBe('running');
  });

  it('выход последнего, кого ждали, запускает турнир', async () => {
    const h = makeService();
    await h.service.create('u1', { ...CREATE, maxPlayers: 10 });
    await h.service.join('u2', 'tn1');
    await h.service.join('u3', 'tn1');
    await h.service.setReady('u1', 'tn1', true);
    await h.service.setReady('u2', 'tn1', true);

    await h.service.leave('u3', 'tn1');

    expect(h.tournaments.get('tn1').status).toBe('running');
    expect(h.sessions.map((s) => s.userId)).toEqual(['u1', 'u2']);
  });

  it('не участник готовность не отмечает', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);

    const e = await rejection(h.service.setReady('u2', 'tn1', true));

    expect(e).toBeInstanceOf(ForbiddenException);
    expect(e.response.code).toBe('TOURNAMENT_NOT_PARTICIPANT');
  });

  it('у турнира по времени готовности нет — он начнётся сам', async () => {
    const h = makeService();
    await h.service.create('u1', { ...CREATE, startsAt: new Date(NOW + 3_600_000).toISOString() });

    const e = await rejection(h.service.setReady('u1', 'tn1', true));

    expect(e).toBeInstanceOf(ConflictException);
    expect(e.response.code).toBe('TOURNAMENT_SCHEDULED');
  });

  it('турнир по времени не стартует по готовности, даже если все отмечены', async () => {
    const h = makeService();
    await h.service.create('u1', { ...CREATE, maxPlayers: 3, startsAt: new Date(NOW + 3_600_000).toISOString() });
    await h.service.join('u2', 'tn1');
    await h.service.join('u3', 'tn1');
    // Отметки не из API (там готовность запрещена) — проверяется сам запуск.
    for (const p of h.participants) p.ready = p.userId !== 'u3';

    await h.service.leave('u3', 'tn1');

    expect(h.tournaments.get('tn1').status).toBe('lobby');
    expect(h.sessions).toEqual([]);
  });

  it('в идущем турнире готовность уже ничего не значит', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);
    await h.service.join('u2', 'tn1');
    await allReady(h);

    const e = await rejection(h.service.setReady('u1', 'tn1', false));

    expect(e.response.code).toBe('TOURNAMENT_NOT_LOBBY');
  });
});

describe('TournamentsService.startScheduled', () => {
  const AT = new Date(Date.UTC(2026, 8, 18, 13, 0, 0));
  const scheduled = async (over: Partial<typeof CREATE> = {}) => {
    const h = makeService();
    await h.service.create('u1', { ...CREATE, maxPlayers: 3, startsAt: AT.toISOString(), ...over });
    return h;
  };

  it('ищет лобби, чьё время пришло', async () => {
    const h = makeService();

    await h.service.dueForStart(AT);

    expect(h.prisma.tournament.findMany).toHaveBeenCalledWith({ where: { status: 'lobby', startsAt: { lte: AT } } });
  });

  it('двое без готовности — старт тем же путём, что и по готовности', async () => {
    const h = await scheduled();
    await h.service.join('u2', 'tn1');

    expect(await h.service.startScheduled('tn1', AT)).toBe('started');

    expect(h.tournaments.get('tn1').status).toBe('running');
    expect(h.sessions.map((s) => s.userId).sort()).toEqual(['u1', 'u2']);
    expect(h.prisma.$queryRaw).toHaveBeenCalled();
  });

  it('стартует, даже если призовых мест не меньше, чем участников', async () => {
    const h = await scheduled({ maxPlayers: 4, winnersCount: 3, payoutShares: [50, 30, 20] });
    await h.service.join('u2', 'tn1');

    expect(await h.service.startScheduled('tn1', AT)).toBe('started');
    expect(h.sessions).toHaveLength(2);
  });

  it('участник один — отмена, взнос и добавка возвращаются', async () => {
    const h = await scheduled({ prizeBonus: 300 });

    expect(await h.service.startScheduled('tn1', AT)).toBe('cancelled');

    expect(h.tournaments.get('tn1')).toMatchObject({ status: 'cancelled', finishedAt: AT });
    expect(h.sessions).toEqual([]);
    expect(h.credits).toEqual([
      { userId: 'u1', amount: 100, kind: 'TOURNAMENT_REFUND', refId: `tn1:${NOW}` },
      { userId: 'u1', amount: 300, kind: 'TOURNAMENT_REFUND', refId: 'tn1:bonus' },
    ]);
  });

  it('раньше времени ничего не происходит', async () => {
    const h = await scheduled();
    await h.service.join('u2', 'tn1');

    expect(await h.service.startScheduled('tn1', new Date(AT.getTime() - 1_000))).toBeNull();
    expect(h.tournaments.get('tn1').status).toBe('lobby');
  });

  it('повторный вызов после старта ничего не делает', async () => {
    const h = await scheduled();
    await h.service.join('u2', 'tn1');
    await h.service.startScheduled('tn1', AT);

    expect(await h.service.startScheduled('tn1', AT)).toBeNull();
    expect(h.sessions).toHaveLength(2);
  });

  it('турнир без времени старта по расписанию не запускается', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);
    await h.service.join('u2', 'tn1');

    expect(await h.service.startScheduled('tn1', AT)).toBeNull();
    expect(h.tournaments.get('tn1').status).toBe('lobby');
  });
});

describe('TournamentsService.get — сводка участников', () => {
  it('в лобби сводки нет: сессий ещё не существует', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);

    const view = await h.service.get('u1', 'tn1');

    expect(view.participants).toEqual([{ userId: 'u1', name: 'U1', ready: false, team: null, stats: null }]);
  });

  it('считает закрытые сделки каждого участника', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);
    await h.service.join('u2', 'tn1');
    await allReady(h);
    // Две закрытых сделки у первого, одна у второго.
    h.sessions[0].trades = [
      { pnl: 300, r: 1.5 },
      { pnl: -100, r: -1 },
    ];
    h.sessions[1].trades = [{ pnl: 50, r: 0.5 }];

    const view = await h.service.get('u2', 'tn1');

    expect(view.participants[0].stats).toMatchObject({ trades: 2, wins: 1, winRate: 50, pnl: 200 });
    expect(view.participants[1].stats).toMatchObject({ trades: 1, wins: 1, winRate: 100, pnl: 50 });
  });

  it('сводка не содержит ни направлений, ни цен — только числа результата', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);
    await h.service.join('u2', 'tn1');
    await allReady(h);
    h.sessions[0].trades = [{ pnl: 300, r: 1.5 }];

    const view = await h.service.get('u2', 'tn1');

    // Условие игры: сторона чужой сделки не должна утекать на страницу.
    const keys = Object.keys(view.participants[0].stats ?? {});
    expect(keys).not.toContain('direction');
    expect(keys).not.toContain('entryPrice');
    expect(keys.sort()).toEqual(['avgR', 'pnl', 'totalR', 'trades', 'winRate', 'wins'].sort());
  });

  it('за закрытыми сделками ходит запрос только по ним', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);
    await h.service.join('u2', 'tn1');
    await allReady(h);

    await h.service.get('u2', 'tn1');

    const call = h.prisma.backtestSession.findMany.mock.calls.at(-1)[0];
    expect(call.select.trades.where).toEqual({ exitTime: { not: null } });
  });
});

describe('TournamentsService.finishEarly', () => {
  const running = async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);
    await h.service.join('u2', 'tn1');
    await allReady(h);
    return h;
  };

  it('переносит конец на сейчас — и турниру, и сессиям', async () => {
    const h = await running();

    await h.service.finishEarly('u1', 'u1@example.com', 'tn1');

    // Именно текущий момент, а не граница минутки: иначе у сделок, открытых в
    // этой минутке, выход оказался бы раньше входа.
    expect(h.tournaments.get('tn1').endsAt).toEqual(new Date(NOW));
    for (const s of h.sessions) expect(s.endTime).toEqual(new Date(NOW));
  });

  it('итоги не подводит и монет не платит — это дело движка', async () => {
    const h = await running();

    await h.service.finishEarly('u1', 'u1@example.com', 'tn1');

    expect(h.tournaments.get('tn1').status).toBe('running');
    expect(h.credits).toEqual([]);
  });

  it('владелец сервиса может закончить чужой турнир', async () => {
    const h = await running();

    await expect(h.service.finishEarly('u9', OWNER_EMAIL, 'tn1')).resolves.toMatchObject({ success: true });
  });

  it('посторонний не может', async () => {
    const h = await running();

    const e = await rejection(h.service.finishEarly('u2', 'u2@example.com', 'tn1'));

    expect(e).toBeInstanceOf(ForbiddenException);
    expect(h.tournaments.get('tn1').endsAt).not.toEqual(new Date(NOW));
  });

  it('лобби завершать нечего', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);

    const e = await rejection(h.service.finishEarly('u1', 'u1@example.com', 'tn1'));

    expect(e).toBeInstanceOf(ConflictException);
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

    await allReady(h);
    expect((await rejection(h.service.remove('u1', 'tn1'))).response.code).toBe('TOURNAMENT_NOT_LOBBY');
  });

  it('удаление завершённого турнира не трогает деньги — призы уже выплачены финалом', async () => {
    const h = makeService();
    await h.service.create('u1', { ...CREATE, prizeBonus: 500 });
    await h.service.join('u2', 'tn1');
    await allReady(h);
    await h.service.finalize(h.tournaments.get('tn1'));
    h.credits.length = 0;

    await h.service.remove('u1', 'tn1');

    expect(h.credits).toEqual([]);
    expect(h.tournaments.has('tn1')).toBe(false);
  });
});

describe('TournamentsService.finalize', () => {
  const runTournament = async (over: Partial<typeof CREATE> = {}) => {
    const h = makeService();
    await h.service.create('u1', { ...CREATE, ...over });
    await h.service.join('u2', 'tn1');
    await allReady(h);
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

  it('игроков меньше призовых мест — доли пустых мест уходят первому, фонд раздан целиком', async () => {
    const h = makeService();
    const AT = new Date(Date.UTC(2026, 8, 18, 13, 0, 0));
    await h.service.create('u1', {
      ...CREATE,
      maxPlayers: 4,
      winnersCount: 3,
      payoutShares: [50, 30, 20],
      startsAt: AT.toISOString(),
    });
    await h.service.join('u2', 'tn1');
    await h.service.startScheduled('tn1', AT);
    h.sessions.find((s) => s.userId === 'u1').balance = 9_000;
    h.sessions.find((s) => s.userId === 'u2').balance = 11_000;

    await h.service.finalize(h.tournaments.get('tn1'));

    const prizes = h.credits.filter((c) => c.kind === 'TOURNAMENT_PRIZE');
    expect(prizes).toEqual([
      { userId: 'u2', amount: 140, kind: 'TOURNAMENT_PRIZE', refId: 'tn1' },
      { userId: 'u1', amount: 60, kind: 'TOURNAMENT_PRIZE', refId: 'tn1' },
    ]);
  });

  it('нулевой фонд не выплачивается, но места проставляются', async () => {
    const h = await runTournament({ entryFee: 0, prizeBonus: 0 });

    await h.service.finalize(h.tournaments.get('tn1'));

    expect(h.credits.filter((c) => c.kind === 'TOURNAMENT_PRIZE')).toEqual([]);
    expect(h.participants.every((p) => p.place != null)).toBe(true);
  });

  it('финал начисляет XP каждому участнику по его месту', async () => {
    const h = await runTournament();

    await h.service.finalize(h.tournaments.get('tn1'));

    // Турнир на двоих: победитель обошёл одного соперника (100 + 25), второй —
    // никого (100). Размер турнира входит в цену победы, см. xp-registry.
    expect(h.awards).toContainEqual({ userId: 'u2', source: 'game.tournament', refId: 'tn1', xp: 125 });
    expect(h.awards).toContainEqual({ userId: 'u1', source: 'game.tournament', refId: 'tn1', xp: 100 });
  });

  it('второй финал не начисляет XP повторно', async () => {
    const h = await runTournament();

    await h.service.finalize(h.tournaments.get('tn1'));
    await h.service.finalize({ ...h.tournaments.get('tn1'), status: 'running' });

    expect(h.awards).toHaveLength(2);
  });
});

describe('TournamentsService.board', () => {
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

  it('свои — в любом статусе, с отношением «создал» или «играю»', async () => {
    const h = makeService();
    await h.service.create('u1', { ...CREATE, maxPlayers: 3 });
    await h.service.join('u2', 'tn1');
    h.tournaments.set('tn1', { ...h.tournaments.get('tn1'), status: 'finished' });

    expect((await h.service.board('u1')).map((r: any) => [r.id, r.relation])).toEqual([['tn1', 'created']]);
    expect((await h.service.board('u2')).map((r: any) => [r.id, r.relation])).toEqual([['tn1', 'joined']]);
  });

  it('чужие — только публичные в наборе и идущие, заполненные тоже', async () => {
    const h = makeService();
    await h.service.create('u1', { ...CREATE, visibility: 'public' });
    await h.service.join('u2', 'tn1');

    // Дуэль заполнена — в неё не войти, но за ней можно смотреть.
    expect(ids(await h.service.board('u9'))).toEqual(['tn1']);

    h.tournaments.set('tn1', { ...h.tournaments.get('tn1'), status: 'finished' });
    expect(await h.service.board('u9')).toEqual([]);
  });

  it('закрытый чужой турнир в таблицу не попадает', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);

    expect(await h.service.board('u9')).toEqual([]);
  });

  it('фонд — собранный сейчас, как в шапке окна', async () => {
    const h = makeService();
    await h.service.create('u1', { ...CREATE, maxPlayers: 5, winnersCount: 1, prizeBonus: 50, visibility: 'public' });
    await h.service.join('u2', 'tn1');

    const [row] = await h.service.board('u9');

    expect(row).toMatchObject({ players: 2, prizePool: 250, creatorName: 'U1', relation: 'other' });
  });

  it('чужие берутся одним ограниченным запросом без меня', async () => {
    const h = makeService();

    await h.service.board('u9');

    expect(h.prisma.tournament.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          visibility: 'public',
          status: { in: ['lobby', 'running'] },
          participants: { none: { userId: 'u9' } },
        },
        take: 50,
      }),
    );
  });
});

describe('TournamentsService.trades', () => {
  it('сделки одного турнира, свежие сверху', async () => {
    const h = makeService();
    await h.service.create('u1', CREATE);

    await h.service.trades('tn1');

    expect(h.prisma.backtestTrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { session: { tournamentId: 'tn1' } },
        orderBy: { entryTime: 'desc' },
        take: 50,
      }),
    );
  });

  it('несуществующий турнир — 404', async () => {
    const h = makeService();

    const e = await rejection(h.service.trades('нет'));

    expect(e).toBeInstanceOf(NotFoundException);
  });
});

describe('TournamentsService.feed', () => {
  const TRADE = {
    id: 'tr1',
    symbol: 'BTCUSDT',
    direction: 'long',
    leverage: 10,
    entryTime: new Date(NOW),
    entryPrice: 70_000,
    stopLoss: 69_000,
    takeProfit: 72_000,
    exitTime: null,
    pnl: null,
    session: { userId: 'u2', user: { name: 'Вася' }, tournament: { id: 'tn1', name: 'Дуэль' } },
  };

  // Закрытый турнир — только по ссылке, и лента не должна его раскрывать:
  // кроме тех, где смотрящий сам играет.
  it('берёт свежие сделки идущих турниров — публичных или где я участник', async () => {
    const h = makeService();

    await h.service.feed('u9');

    expect(h.prisma.backtestTrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          session: {
            tournament: {
              is: {
                status: 'running',
                OR: [{ visibility: 'public' }, { participants: { some: { userId: 'u9' } } }],
              },
            },
          },
        },
        orderBy: { entryTime: 'desc' },
        take: 50,
      }),
    );
  });

  it('открытая сделка отдаётся со стороной, входом и уровнями', async () => {
    const h = makeService();
    h.prisma.backtestTrade.findMany.mockResolvedValueOnce([TRADE]);

    expect(await h.service.feed('u9')).toEqual([
      {
        id: 'tr1',
        tournamentId: 'tn1',
        tournamentName: 'Дуэль',
        userId: 'u2',
        playerName: 'Вася',
        symbol: 'BTCUSDT',
        direction: 'long',
        leverage: 10,
        entryTime: new Date(NOW),
        entryPrice: 70_000,
        stopLoss: 69_000,
        takeProfit: 72_000,
        exitTime: null,
        pnl: null,
      },
    ]);
  });
});

describe('Командный турнир', () => {
  const TEAMS = { ...CREATE, format: 'teams' as const, teamSize: 2, maxPlayers: 2, winnersCount: 1, payoutShares: [100] };

  const teamLobby = async (over: Partial<typeof TEAMS> & { startsAt?: string } = {}) => {
    const h = makeService();
    await h.service.create('u1', { ...TEAMS, ...over });
    return h;
  };

  it('места, победители и доли выводятся из размера команды; создатель — в команде A', async () => {
    const h = await teamLobby({ teamSize: 5, maxPlayers: 2, winnersCount: 3, payoutShares: [50, 30, 20] });

    expect(h.tournaments.get('tn1')).toMatchObject({
      format: 'teams',
      teamSize: 5,
      maxPlayers: 10,
      winnersCount: 1,
      payoutShares: [100],
    });
    expect(h.participants[0]).toMatchObject({ userId: 'u1', team: 0 });
  });

  it('без размера команды — 400', async () => {
    const h = makeService();

    const e = await rejection(h.service.create('u1', { ...TEAMS, teamSize: undefined }));

    expect(e.response.code).toBe('TOURNAMENT_BAD_TEAM_SIZE');
    expect(h.charges).toEqual([]);
  });

  it('вход — в выбранную команду; без команды — 400', async () => {
    const h = await teamLobby();

    const e = await rejection(h.service.join('u2', 'tn1'));
    expect(e.response.code).toBe('TOURNAMENT_TEAM_REQUIRED');

    await h.service.join('u2', 'tn1', 1);
    expect(h.participants.find((p) => p.userId === 'u2')).toMatchObject({ team: 1 });
  });

  it('в полную команду не войти, в другую — можно', async () => {
    const h = await teamLobby();
    await h.service.join('u2', 'tn1', 0);

    const e = await rejection(h.service.join('u3', 'tn1', 0));
    expect(e.response.code).toBe('TOURNAMENT_TEAM_FULL');
    expect(h.charges.filter((c) => c.userId === 'u3')).toEqual([]);

    await h.service.join('u3', 'tn1', 1);
    expect(h.participants.find((p) => p.userId === 'u3')).toMatchObject({ team: 1 });
  });

  it('создатель переставляет игрока в команду со свободным местом', async () => {
    const h = await teamLobby();
    await h.service.join('u2', 'tn1', 0);

    await h.service.moveTeam('u1', 'tn1', 'u2', 1);

    expect(h.participants.find((p) => p.userId === 'u2')).toMatchObject({ team: 1 });
  });

  it('переставлять может только создатель, только в наборе и только в команду с местом', async () => {
    const h = await teamLobby();
    await h.service.join('u2', 'tn1', 1);
    await h.service.join('u3', 'tn1', 1);

    expect((await rejection(h.service.moveTeam('u2', 'tn1', 'u3', 0))).response.code).toBe('TOURNAMENT_NOT_CREATOR');
    expect((await rejection(h.service.moveTeam('u1', 'tn1', 'u1', 1))).response.code).toBe('TOURNAMENT_TEAM_FULL');

    h.tournaments.set('tn1', { ...h.tournaments.get('tn1'), status: 'running' });
    expect((await rejection(h.service.moveTeam('u1', 'tn1', 'u3', 0))).response.code).toBe('TOURNAMENT_NOT_LOBBY');
  });

  it('в арене переставлять некого', async () => {
    const h = makeService();
    await h.service.create('u1', { ...CREATE, maxPlayers: 3 });
    await h.service.join('u2', 'tn1');

    expect((await rejection(h.service.moveTeam('u1', 'tn1', 'u2', 1))).response.code).toBe('TOURNAMENT_NOT_TEAMS');
  });

  it('по готовности не стартует, пока одна из команд пуста', async () => {
    const h = await teamLobby();
    await h.service.join('u2', 'tn1', 0);
    await allReady(h);
    expect(h.tournaments.get('tn1').status).toBe('lobby');

    await h.service.join('u3', 'tn1', 1);
    await allReady(h);
    expect(h.tournaments.get('tn1').status).toBe('running');
    expect(h.sessions).toHaveLength(3);
  });

  it('по времени: хотя бы по одному в команде — старт; все в одной — отмена с возвратом', async () => {
    const AT = new Date(Date.UTC(2026, 8, 18, 13, 0, 0));

    const ok = await teamLobby({ startsAt: AT.toISOString() });
    await ok.service.join('u2', 'tn1', 1);
    expect(await ok.service.startScheduled('tn1', AT)).toBe('started');

    const one = await teamLobby({ startsAt: AT.toISOString() });
    await one.service.join('u2', 'tn1', 0);
    expect(await one.service.startScheduled('tn1', AT)).toBe('cancelled');
    expect(one.credits.filter((c) => c.kind === 'TOURNAMENT_REFUND').map((c) => c.userId).sort()).toEqual(['u1', 'u2']);
  });

  it('финал: побеждает средний результат команды, фонд — победителям поровну', async () => {
    const h = await teamLobby({ teamSize: 3, entryFee: 100 });
    await h.service.join('u2', 'tn1', 1);
    await h.service.join('u3', 'tn1', 1);
    await allReady(h);
    // A (u1): +300. B (u2, u3): +250 и +250 — сумма больше, среднее меньше.
    h.sessions.find((s) => s.userId === 'u1').balance = 10_300;
    h.sessions.find((s) => s.userId === 'u2').balance = 10_250;
    h.sessions.find((s) => s.userId === 'u3').balance = 10_250;

    await h.service.finalize(h.tournaments.get('tn1'));

    const byUser = Object.fromEntries(h.participants.map((p) => [p.userId, p]));
    expect(byUser.u1).toMatchObject({ place: 1, prizeWon: 300 });
    expect(byUser.u2).toMatchObject({ place: 2, prizeWon: 0 });
    expect(byUser.u3).toMatchObject({ place: 2, prizeWon: 0 });
    expect(h.awards).toContainEqual({ userId: 'u1', source: 'game.tournament', refId: 'tn1', xp: 125 });
    expect(h.awards).toContainEqual({ userId: 'u2', source: 'game.tournament', refId: 'tn1', xp: 100 });
  });

  it('финал: остаток деления фонда — лучшему в победившей команде', async () => {
    const h = await teamLobby({ teamSize: 2, entryFee: 0, prizeBonus: 101 });
    await h.service.join('u2', 'tn1', 0);
    await h.service.join('u3', 'tn1', 1);
    await allReady(h);
    h.sessions.find((s) => s.userId === 'u1').balance = 10_100;
    h.sessions.find((s) => s.userId === 'u2').balance = 10_500;
    h.sessions.find((s) => s.userId === 'u3').balance = 10_000;

    await h.service.finalize(h.tournaments.get('tn1'));

    const byUser = Object.fromEntries(h.participants.map((p) => [p.userId, p]));
    expect(byUser.u2.prizeWon).toBe(51);
    expect(byUser.u1.prizeWon).toBe(50);
    expect(byUser.u3.prizeWon).toBe(0);
  });
});
