import { Logger } from '@nestjs/common';
import { msTo } from './jetpack';
import { BET_MS, CRASH_PAUSE_MS, RETRY_MS } from './jetpack.config';
import { JetpackService } from './jetpack.service';

// Точка краша — 2.00x: floor(99 / (1 − 0.505)) = 200.
jest.mock('./jetpack', () => ({ ...jest.requireActual('./jetpack'), randomUnit: () => 0.505 }));

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

/** `where` из тех, что задаёт сервис: равенство и `{ not }`. */
const match = (row: Row, where: Where) =>
  Object.entries(where).every(([k, v]) =>
    v !== null && typeof v === 'object' && 'not' in v ? row[k] !== (v as { not: unknown }).not : row[k] === v,
  );

/**
 * База в памяти ровно на те вызовы, что делает сервис. `$transaction`
 * откатывает всё, включая журнал монет, если колбэк бросил: иначе сбой
 * посреди вывода оставил бы в фейке то, чего настоящая база не оставит.
 */
function setup() {
  let seq = 0;
  let state = { rounds: [] as Row[], bets: [] as Row[], credits: [] as Row[], failCredit: 0, failRoundUpdate: 0 };
  const db = {
    jetpackRound: {
      findMany: async ({ where }: { where: Where }) => state.rounds.filter((r) => match(r, where)),
      create: async () => {
        const r = { id: `r${++seq}`, crashX100: null, finishedAt: null, voided: false };
        state.rounds.push(r);
        return { id: r.id };
      },
      updateMany: async ({ where, data }: { where: Where; data: Row }) => {
        if (state.failRoundUpdate > 0) {
          state.failRoundUpdate--;
          throw new Error('db down');
        }
        const hit = state.rounds.filter((r) => match(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
    },
    jetpackBet: {
      create: async ({ data }: { data: Row }) => {
        const b = { id: `b${++seq}`, cashoutX100: null, payout: null, ...data };
        state.bets.push(b);
        return { id: b.id, user: { name: String(data.userId).toUpperCase() } };
      },
      findMany: async ({ where }: { where: Where }) => state.bets.filter((b) => match(b, where)),
      findUniqueOrThrow: async ({ where }: { where: Where }) => {
        const b = state.bets.find((x) => x.id === where.id);
        if (!b) throw new Error('not found');
        return { cashoutX100: b.cashoutX100, payout: b.payout };
      },
      updateMany: async ({ where, data }: { where: Where; data: Row }) => {
        const hit = state.bets.filter((b) => match(b, where));
        hit.forEach((b) => Object.assign(b, data));
        return { count: hit.length };
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const saved = structuredClone(state);
      try {
        return await fn(db);
      } catch (e) {
        state = { ...saved, failCredit: state.failCredit, failRoundUpdate: state.failRoundUpdate };
        throw e;
      }
    },
  };
  const coins = {
    charge: jest.fn(async () => undefined),
    credit: jest.fn(async (_tx: unknown, userId: string, amount: number, kind: string, refId: string) => {
      if (state.failCredit > 0) {
        state.failCredit--;
        throw new Error('db down');
      }
      state.credits.push({ userId, amount, kind, refId });
    }),
  };
  const gateway = { roomSize: jest.fn(async () => 1), emitPersonal: jest.fn(async () => undefined) };
  const svc = new JetpackService(db as never, coins as never, gateway as never);
  return { svc, gateway, st: () => state };
}

const code = (e: unknown) => ((e as { getResponse?: () => { code?: string } }).getResponse?.() ?? {}).code;

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('JetpackService', () => {
  it('краш платит автовывод, чей будильник сорвался на сбое базы, — ровно один раз', async () => {
    const { svc, st } = setup();
    await svc.view('a');
    await svc.bet('a', 100, 1.5);
    await jest.advanceTimersByTimeAsync(BET_MS);
    expect((await svc.view('a')).phase).toBe('flying');

    st().failCredit = 1;
    await jest.advanceTimersByTimeAsync(msTo(150) + 50);
    expect(st().credits).toEqual([]);

    await jest.advanceTimersByTimeAsync(msTo(200) - msTo(150));
    const round = st().rounds[0];
    expect(st().credits).toEqual([{ userId: 'a', amount: 150, kind: 'JETPACK_WIN', refId: round.id }]);
    expect(round).toMatchObject({ crashX100: 200, finishedAt: expect.any(Date) });
    expect(st().bets[0]).toMatchObject({ cashoutX100: 150, payout: 150 });
  });

  it('двойной клик и вывод руками после автовывода не платят дважды', async () => {
    const { svc, st } = setup();
    await svc.view('a');
    await svc.bet('a', 100);
    await svc.bet('b', 100, 1.5);
    await jest.advanceTimersByTimeAsync(BET_MS + 2000);

    const twice = await Promise.allSettled([svc.cashout('a'), svc.cashout('a')]);
    expect(twice.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    expect(code((twice[1] as PromiseRejectedResult).reason)).toBe('JETPACK_NO_BET');

    await jest.advanceTimersByTimeAsync(msTo(150) - 2000 + 50);
    await expect(svc.cashout('b')).rejects.toMatchObject({ response: { code: 'JETPACK_NO_BET' } });

    const byUser = (u: string) => st().credits.filter((c) => c.userId === u);
    expect(byUser('a')).toEqual([expect.objectContaining({ amount: 117, kind: 'JETPACK_WIN' })]);
    expect(byUser('b')).toEqual([expect.objectContaining({ amount: 150, kind: 'JETPACK_WIN' })]);
  });

  it('автовывод ровно на точке краша — выигрыш', async () => {
    const { svc, st } = setup();
    await svc.view('a');
    await svc.bet('a', 10, 2);
    await jest.advanceTimersByTimeAsync(BET_MS + msTo(200) + 50);
    expect(st().credits).toEqual([expect.objectContaining({ userId: 'a', amount: 20, kind: 'JETPACK_WIN' })]);
  });

  it('вывод после краша — поздно, ставка в полёте — не принимается, вторая ставка — отказ', async () => {
    const { svc } = setup();
    await svc.view('a');
    await svc.bet('a', 100);
    await expect(svc.bet('a', 5)).rejects.toMatchObject({ response: { code: 'JETPACK_ALREADY_BET' } });
    await expect(svc.cashout('a')).rejects.toMatchObject({ response: { code: 'JETPACK_NOT_FLYING' } });
    await jest.advanceTimersByTimeAsync(BET_MS + 1000);
    await expect(svc.bet('b', 5)).rejects.toMatchObject({ response: { code: 'JETPACK_NOT_BETTING' } });
    await jest.advanceTimersByTimeAsync(msTo(200));
    await expect(svc.cashout('a')).rejects.toMatchObject({ response: { code: 'JETPACK_TOO_LATE' } });
  });

  it('точки краша нет в виде, пока ракета летит', async () => {
    const { svc } = setup();
    await svc.view('a');
    await jest.advanceTimersByTimeAsync(BET_MS + 1000);
    const flying = await svc.view('a');
    expect(flying).toMatchObject({ phase: 'flying', crashX100: null });
    await jest.advanceTimersByTimeAsync(msTo(200));
    expect(await svc.view('a')).toMatchObject({ phase: 'crashed', crashX100: 200 });
  });

  it('запись краша повторяется, и новое окно ждёт её', async () => {
    const { svc, st } = setup();
    await svc.view('a');
    await jest.advanceTimersByTimeAsync(BET_MS);
    st().failRoundUpdate = 1;
    await jest.advanceTimersByTimeAsync(msTo(200) + 50);
    expect(st().rounds[0].finishedAt).toBeNull();

    // Повтор записи и пауза краша равны: не жди окно записи, оно открылось бы здесь.
    await jest.advanceTimersByTimeAsync(RETRY_MS);
    expect(st().rounds[0]).toMatchObject({ crashX100: 200, finishedAt: expect.any(Date) });
    expect(st().rounds).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(CRASH_PAUSE_MS);
    expect(st().rounds).toHaveLength(2);
  });

  it('без зрителей цикл засыпает, открытие страницы будит', async () => {
    const { svc, gateway, st } = setup();
    await svc.view('a');
    gateway.roomSize.mockResolvedValue(0);
    await jest.advanceTimersByTimeAsync(BET_MS + msTo(200) + CRASH_PAUSE_MS + 50);
    expect(st().rounds).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(st().rounds).toHaveLength(1);

    expect((await svc.view('a')).phase).toBe('betting');
    expect(st().rounds).toHaveLength(2);
  });

  it('перезапуск возвращает только невыведенные ставки, и только один раз', async () => {
    const { svc, st } = setup();
    st().rounds.push({ id: 'old', crashX100: null, finishedAt: null, voided: false });
    st().bets.push(
      { id: 'x', roundId: 'old', userId: 'x', amount: 100, cashoutX100: 200, payout: 200 },
      { id: 'y', roundId: 'old', userId: 'y', amount: 50, cashoutX100: null, payout: null },
    );
    await svc.onApplicationBootstrap();
    await svc.onApplicationBootstrap();
    expect(st().credits).toEqual([{ userId: 'y', amount: 50, kind: 'JETPACK_REFUND', refId: 'old' }]);
    expect(st().rounds[0]).toMatchObject({ voided: true, finishedAt: expect.any(Date) });
  });
});
