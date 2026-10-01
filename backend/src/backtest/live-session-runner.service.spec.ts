import { LiveSessionRunnerService } from './live-session-runner.service';

const T = Date.UTC(2026, 8, 25, 12, 0, 0);

function makeRunner(sessions: { id: string; processedUntil: Date | null }[]) {
  const prisma: any = {
    backtestSession: {
      findMany: jest.fn(async () => sessions),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };
  const engine = {
    run: jest.fn(async () => true),
    forget: jest.fn(),
  };
  const runner = new LiveSessionRunnerService(prisma as never, engine as never);
  return { runner, prisma, engine };
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date(T));
});
afterEach(() => {
  jest.useRealTimers();
});

describe('LiveSessionRunnerService.tick', () => {
  it('каждая сессия с позициями идёт своим потоком и своим курсором', async () => {
    const h = makeRunner([
      { id: 's1', processedUntil: new Date(T - 2000) },
      { id: 's2', processedUntil: null },
    ]);

    await h.runner.tick();

    expect(h.engine.run).toHaveBeenCalledWith('s:s1', new Date(T - 2000), T, { id: 's1' });
    expect(h.engine.run).toHaveBeenCalledWith('s:s2', null, T, { id: 's2' });
    expect(h.prisma.backtestSession.updateMany).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { processedUntil: new Date(T) },
    });
  });

  it('берёт только активные сессии эфира, где есть что исполнять', async () => {
    const h = makeRunner([]);

    await h.runner.tick();

    expect(h.prisma.backtestSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          dataSource: 'live',
          status: 'active',
          OR: [{ trades: { some: { exitTime: null } } }, { entryOrders: { some: {} } }],
        },
      }),
    );
  });

  it('движок не велит двигать курсор — строка не переписывается', async () => {
    const h = makeRunner([{ id: 's1', processedUntil: new Date(T) }]);
    h.engine.run.mockResolvedValue(false);

    await h.runner.tick();

    expect(h.prisma.backtestSession.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 's1' } }),
    );
  });

  it('курсор простаивающих сессий идёт раз в минуту, с запасом в тик', async () => {
    const h = makeRunner([{ id: 's1', processedUntil: new Date(T) }]);

    await h.runner.tick();

    expect(h.prisma.backtestSession.updateMany).toHaveBeenLastCalledWith({
      where: {
        dataSource: 'live',
        status: 'active',
        id: { notIn: ['s1'] },
        OR: [{ processedUntil: null }, { processedUntil: { lt: new Date(T - 60_000) } }],
      },
      data: { processedUntil: new Date(T - 2000) },
    });
  });

  it('падение одной сессии не останавливает остальные', async () => {
    const h = makeRunner([
      { id: 'bad', processedUntil: null },
      { id: 'good', processedUntil: null },
    ]);
    h.engine.run.mockRejectedValueOnce(new Error('база отвалилась'));

    await expect(h.runner.tick()).resolves.toBeUndefined();

    expect(h.engine.run).toHaveBeenCalledTimes(2);
    expect(h.prisma.backtestSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'good' } }),
    );
    expect(h.prisma.backtestSession.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'bad' } }),
    );
  });

  it('сессия без позиций выпадает из движка — её снимок забывается', async () => {
    const h = makeRunner([{ id: 's1', processedUntil: null }]);
    await h.runner.tick();
    expect(h.engine.forget).not.toHaveBeenCalled();

    h.prisma.backtestSession.findMany.mockResolvedValue([]);
    await h.runner.tick();

    expect(h.engine.forget).toHaveBeenCalledWith('s:s1');
  });
});
