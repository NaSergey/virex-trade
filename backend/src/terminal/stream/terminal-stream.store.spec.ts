import { Prisma } from '@prisma/client';
import { TerminalStreamStore } from './terminal-stream.store';

function setup() {
  const prisma = {
    terminalStream: {
      upsert: jest.fn(async () => ({})),
      findUnique: jest.fn(async () => null),
      findMany: jest.fn(async () => [{ userId: 'u1' }, { userId: 'u2' }]),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };
  return { store: new TerminalStreamStore(prisma as any), prisma };
}

describe('TerminalStreamStore', () => {
  beforeEach(() => jest.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => jest.useRealTimers());

  it('спрос пишется не чаще раза в 20 с на пользователя', async () => {
    const { store, prisma } = setup();
    store.want('u1');
    store.want('u1');
    expect(prisma.terminalStream.upsert).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(20_000);
    store.want('u1');
    store.want('u2');
    expect(prisma.terminalStream.upsert).toHaveBeenCalledTimes(3);
  });

  it('упавшая запись спроса не роняет запрос и даёт повторить сразу', async () => {
    const { store, prisma } = setup();
    prisma.terminalStream.upsert.mockRejectedValueOnce(new Error('db'));
    store.want('u1');
    await jest.advanceTimersByTimeAsync(0);
    store.want('u1');
    expect(prisma.terminalStream.upsert).toHaveBeenCalledTimes(2);
  });

  it('список спроса — id пользователей', async () => {
    const { store, prisma } = setup();
    expect(await store.wanted(new Date(0))).toEqual(['u1', 'u2']);
    expect(prisma.terminalStream.findMany).toHaveBeenCalledWith({
      where: { wantedAt: { gte: new Date(0) } },
      select: { userId: true },
    });
  });

  it('пульс одной командой на всех; пустой список — без запроса', async () => {
    const { store, prisma } = setup();
    await store.heartbeat([]);
    expect(prisma.terminalStream.updateMany).not.toHaveBeenCalled();
    await store.heartbeat(['u1', 'u2']);
    expect(prisma.terminalStream.updateMany).toHaveBeenCalledWith({
      where: { userId: { in: ['u1', 'u2'] } },
      data: { liveAt: new Date(1_000_000) },
    });
  });

  it('сброс обнуляет пульс, отпечаток и состояние: опоздавший пульс строку не оживит', async () => {
    const { store, prisma } = setup();
    await store.drop('u1');
    expect(prisma.terminalStream.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { liveAt: null, keyHash: null, state: Prisma.DbNull },
    });
  });

  it('запись состояния — по userId, с пульсом; строки может не быть, поэтому updateMany', async () => {
    const { store, prisma } = setup();
    const state = { wallet: null, positions: {}, orders: {} };
    await store.save('u1', { keyHash: 'h', state, eventAt: new Date(5) });
    expect(prisma.terminalStream.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { keyHash: 'h', state, eventAt: new Date(5), liveAt: new Date(1_000_000) },
    });
  });
});
