import { ConflictException, Logger } from '@nestjs/common';
import { RESULT_KEEP_MS, WAIT_MS } from './race.config';
import { RaceService } from './race.service';
import { TRACK_LEN } from './sim';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;
const match = (row: Row, where: Where) =>
  Object.entries(where).every(([k, v]) => row[k] === v);

/**
 * База в памяти ровно на те вызовы, что делает сервис. `$transaction`
 * откатывает всё, если колбэк бросил: иначе отказ в монетах оставил бы в фейке
 * строку гонки, которой настоящая база не оставит.
 */
function setup() {
  let seq = 0;
  let state = {
    rounds: [] as Row[],
    entries: [] as Row[],
    credits: [] as Row[],
    charges: [] as Row[],
  };
  const gone = new Set<string>();
  const db = {
    user: {
      findUnique: async ({ where }: { where: Where }) =>
        gone.has(where.id as string) ? null : { id: where.id },
    },
    raceRound: {
      create: async ({ data }: { data: Row }) => {
        state.rounds.push({
          startedAt: null,
          finishedAt: null,
          voided: false,
          ...data,
        });
        return data;
      },
      updateMany: async ({ where, data }: { where: Where; data: Row }) => {
        const hit = state.rounds.filter((r) => match(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
      delete: async ({ where }: { where: Where }) => {
        state.rounds = state.rounds.filter((r) => r.id !== where.id);
        state.entries = state.entries.filter((e) => e.raceId !== where.id);
      },
      findMany: async ({ where }: { where: Where }) =>
        state.rounds
          .filter((r) => match(r, where))
          .map((r) => ({
            id: r.id,
            stake: r.stake,
            entries: state.entries
              .filter((e) => e.raceId === r.id)
              .map((e) => ({ userId: e.userId, joinedAt: e.joinedAt })),
          })),
    },
    raceEntry: {
      create: async ({ data }: { data: Row }) => {
        const e = { id: `e${++seq}`, ...data };
        state.entries.push(e);
        return { id: e.id, user: { name: String(data.userId).toUpperCase() } };
      },
      createMany: async ({ data }: { data: Row[] }) => {
        for (const d of data) state.entries.push({ id: `e${++seq}`, ...d });
        return { count: data.length };
      },
      delete: async ({ where }: { where: Where }) => {
        state.entries = state.entries.filter((e) => e.id !== where.id);
      },
      updateMany: async ({ where, data }: { where: Where; data: Row }) => {
        const hit = state.entries.filter((e) => match(e, where));
        hit.forEach((e) => Object.assign(e, data));
        return { count: hit.length };
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const saved = structuredClone(state);
      try {
        return await fn(db);
      } catch (e) {
        state = saved;
        throw e;
      }
    },
  };
  const coins = {
    charge: jest.fn(
      async (
        _tx: unknown,
        userId: string,
        amount: number,
        kind: string,
        refId: string,
      ) => {
        if (userId === 'poor')
          throw new ConflictException({ code: 'INSUFFICIENT_COINS' });
        state.charges.push({ userId, amount, kind, refId });
      },
    ),
    credit: jest.fn(
      async (
        _tx: unknown,
        userId: string,
        amount: number,
        kind: string,
        refId: string,
      ) => {
        state.credits.push({ userId, amount, kind, refId });
      },
    ),
  };
  const gateway = {
    emitPersonal: jest.fn(async () => undefined),
    listen: jest.fn(),
  };
  const battlePass = { award: jest.fn(async () => undefined) };
  const svc = new RaceService(
    db as never,
    coins as never,
    gateway as never,
    battlePass as never,
  );
  let n = 0;
  svc.seed = () => 100 + ++n;
  // Доступ к гонкам в памяти — только тестам: подвинуть машины к финишу.
  const races = () =>
    (
      svc as unknown as {
        races: Map<string, { runtime: { state: { cars: Row[] } } | null }>;
      }
    ).races;
  return { svc, st: () => state, coins, gateway, battlePass, races, gone };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('RaceService', () => {
  it('вход списывает взнос по id гонки и времени входа; второй вход — отказ', async () => {
    const { svc, st } = setup();
    const v = await svc.join('a', 100, 'buggy');
    expect(v.phase).toBe('lobby');
    const id = v.race!.id;
    expect(st().charges).toEqual([
      {
        userId: 'a',
        amount: 100,
        kind: 'RACE_STAKE',
        refId: `${id}:${Date.now()}`,
      },
    ]);
    await expect(svc.join('a', 100, 'tank')).rejects.toMatchObject({
      response: { code: 'RACE_ALREADY_IN' },
    });
    svc.onModuleDestroy();
  });

  it('неверная ставка или машина — отказ без списания', async () => {
    const { svc, st } = setup();
    await expect(svc.join('a', 7, 'buggy')).rejects.toMatchObject({
      response: { code: 'RACE_BAD_STAKE' },
    });
    await expect(svc.join('a', 10, 'plane')).rejects.toMatchObject({
      response: { code: 'RACE_BAD_CAR' },
    });
    expect(st().charges).toEqual([]);
  });

  it('нехватка монет не оставляет ни лобби, ни строки гонки', async () => {
    const { svc, st } = setup();
    await expect(svc.join('poor', 10, 'buggy')).rejects.toBeDefined();
    expect(st().rounds).toEqual([]);
    expect(svc.view('poor').phase).toBe('none');
  });

  it('одна ставка — одно лобби, другая ставка — своё', async () => {
    const { svc } = setup();
    const a = await svc.join('a', 50, 'buggy');
    const b = await svc.join('b', 50, 'tank');
    const c = await svc.join('c', 10, 'arrow');
    expect(b.race!.id).toBe(a.race!.id);
    expect(c.race!.id).not.toBe(a.race!.id);
    expect(b.race!.me).toBe(1);
    svc.onModuleDestroy();
  });

  it(`через ${WAIT_MS} мс пустые места занимают боты, живым — опыт`, async () => {
    const { svc, st, battlePass } = setup();
    const { race } = await svc.join('a', 10, 'buggy');
    await jest.advanceTimersByTimeAsync(WAIT_MS);
    const v = svc.view('a');
    expect(v.phase).toBe('countdown');
    expect(v.race!.racers.map((r) => r.bot)).toEqual([false, true, true]);
    expect(st().rounds[0].startedAt).toEqual(expect.any(Date));
    expect(st().entries.filter((e) => e.userId === null)).toHaveLength(2);
    expect(battlePass.award).toHaveBeenCalledWith(
      expect.anything(),
      'a',
      'game.race',
      race!.id,
      5,
    );
    svc.onModuleDestroy();
  });

  it('трое живых стартуют сразу', async () => {
    const { svc } = setup();
    await svc.join('a', 10, 'buggy');
    await svc.join('b', 10, 'tank');
    const v = await svc.join('c', 10, 'arrow');
    expect(v.phase).toBe('countdown');
    expect(v.race!.racers.every((r) => !r.bot)).toBe(true);
    svc.onModuleDestroy();
  });

  it('выход из лобби возвращает взнос тем же refId; последний ушедший убирает гонку', async () => {
    const { svc, st } = setup();
    const { race } = await svc.join('a', 10, 'buggy');
    const refId = st().charges[0].refId;
    await svc.leave('a');
    expect(st().credits).toEqual([
      { userId: 'a', amount: 10, kind: 'RACE_REFUND', refId },
    ]);
    expect(st().rounds.find((r) => r.id === race!.id)).toBeUndefined();
    await expect(svc.leave('a')).rejects.toMatchObject({
      response: { code: 'RACE_NOT_IN' },
    });
    await jest.advanceTimersByTimeAsync(WAIT_MS);
    expect(svc.view('a').phase).toBe('none');
  });

  it('после старта выйти нельзя', async () => {
    const { svc } = setup();
    await svc.join('a', 10, 'buggy');
    await jest.advanceTimersByTimeAsync(WAIT_MS);
    await expect(svc.leave('a')).rejects.toMatchObject({
      response: { code: 'RACE_STARTED' },
    });
    svc.onModuleDestroy();
  });

  it('финиш платит банк живому победителю ровно один раз и пишет места', async () => {
    const { svc, st, races } = setup();
    const { race } = await svc.join('a', 100, 'buggy');
    await jest.advanceTimersByTimeAsync(WAIT_MS + 3000);
    const cars = races().get(race!.id)!.runtime!.state.cars;
    Object.assign(cars[0], { z: TRACK_LEN - 50, speed: 5000 });
    Object.assign(cars[1], { dead: true, deadAt: 3, speed: 0 });
    Object.assign(cars[2], { dead: true, deadAt: 3, speed: 0 });
    await jest.advanceTimersByTimeAsync(5000);
    expect(st().credits).toEqual([
      { userId: 'a', amount: 300, kind: 'RACE_WIN', refId: race!.id },
    ]);
    expect(st().rounds[0].finishedAt).toEqual(expect.any(Date));
    expect(st().entries.find((e) => e.userId === 'a')).toMatchObject({
      place: 1,
      payout: 300,
    });
    const v = svc.view('a');
    expect(v.phase).toBe('over');
    expect(v.race!.result![0]).toMatchObject({
      slot: 0,
      place: 1,
      payout: 300,
    });
    await jest.advanceTimersByTimeAsync(5000);
    expect(st().credits).toHaveLength(1);
    // Итог помнится, но новая гонка уже доступна.
    const next = await svc.join('a', 100, 'tank');
    expect(next.race!.id).not.toBe(race!.id);
    svc.onModuleDestroy();
  });

  it('победил бот — выигрыш сгорает, живым не платят', async () => {
    const { svc, st, races } = setup();
    const { race } = await svc.join('a', 100, 'buggy');
    await jest.advanceTimersByTimeAsync(WAIT_MS + 3000);
    const cars = races().get(race!.id)!.runtime!.state.cars;
    Object.assign(cars[0], { dead: true, deadAt: 3, speed: 0 });
    Object.assign(cars[1], { z: TRACK_LEN - 50, speed: 5000 });
    Object.assign(cars[2], { dead: true, deadAt: 3, speed: 0 });
    await jest.advanceTimersByTimeAsync(5000);
    expect(st().credits).toEqual([]);
    expect(svc.view('a').race!.result![0]).toMatchObject({
      slot: 1,
      place: 1,
      payout: 0,
    });
    await jest.advanceTimersByTimeAsync(RESULT_KEEP_MS + 1000);
    expect(svc.view('a').phase).toBe('none');
    svc.onModuleDestroy();
  });

  it('полное лобби, чей старт сорвался, не принимает четвёртого — тот открывает новое', async () => {
    const { svc, battlePass } = setup();
    battlePass.award.mockRejectedValueOnce(new Error('db down'));
    const a = await svc.join('a', 10, 'buggy');
    await svc.join('b', 10, 'tank');
    const c = await svc.join('c', 10, 'arrow');
    expect(c.phase).toBe('lobby');
    const d = await svc.join('d', 10, 'buggy');
    expect(d.race!.id).not.toBe(a.race!.id);
    await jest.advanceTimersByTimeAsync(3000);
    expect(svc.view('a').phase).toBe('countdown');
    expect(svc.view('a').race!.racers.every((r) => !r.bot)).toBe(true);
    svc.onModuleDestroy();
  });

  it('аккаунт победителя удалён — гонка заканчивается без выплаты', async () => {
    const { svc, st, races, gone } = setup();
    const { race } = await svc.join('a', 100, 'buggy');
    await jest.advanceTimersByTimeAsync(WAIT_MS + 3000);
    const cars = races().get(race!.id)!.runtime!.state.cars;
    Object.assign(cars[0], { z: TRACK_LEN - 50, speed: 5000 });
    Object.assign(cars[1], { dead: true, deadAt: 3, speed: 0 });
    Object.assign(cars[2], { dead: true, deadAt: 3, speed: 0 });
    gone.add('a');
    await jest.advanceTimersByTimeAsync(5000);
    expect(st().credits).toEqual([]);
    expect(st().rounds[0].finishedAt).toEqual(expect.any(Date));
    svc.onModuleDestroy();
  });

  it('гонка, прерванная перезапуском, возвращает взносы живым — один раз', async () => {
    const { svc, st } = setup();
    const joinedAt = new Date(5000);
    st().rounds.push({
      id: 'old',
      stake: 50,
      startedAt: new Date(),
      finishedAt: null,
      voided: false,
    });
    st().entries.push(
      { id: 'e1', raceId: 'old', userId: 'a', joinedAt },
      { id: 'e2', raceId: 'old', userId: null, joinedAt },
    );
    await svc.onApplicationBootstrap();
    await svc.onApplicationBootstrap();
    expect(st().credits).toEqual([
      { userId: 'a', amount: 50, kind: 'RACE_REFUND', refId: 'old:5000' },
    ]);
    expect(st().rounds[0]).toMatchObject({
      voided: true,
      finishedAt: expect.any(Date),
    });
  });

  it('нажатия из сокета доходят до своей гонки; чужие, кривые и лишние — нет', async () => {
    const { svc, gateway, races } = setup();
    svc.onModuleInit();
    const handler = gateway.listen.mock.calls[0][1] as (
      u: string,
      p: unknown,
    ) => void;
    const { race } = await svc.join('a', 10, 'buggy');
    await jest.advanceTimersByTimeAsync(WAIT_MS);
    const rt = races().get(race!.id)!.runtime! as unknown as {
      push: (...a: unknown[]) => void;
    };
    const push = jest.spyOn(rt, 'push');
    handler('a', { raceId: race!.id, t: 3, l: false, r: true, b: false });
    expect(push).toHaveBeenCalledWith(
      0,
      3,
      { left: false, right: true, brake: false },
      expect.any(Number),
    );
    handler('a', { raceId: 'other', t: 3, r: true });
    handler('b', { raceId: race!.id, t: 3, r: true });
    handler('a', { raceId: race!.id, t: 'x' });
    handler('a', null);
    expect(push).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 100; i++)
      handler('a', { raceId: race!.id, t: 3, r: true });
    expect(push.mock.calls.length).toBeLessThanOrEqual(60);
    svc.onModuleDestroy();
  });
});
