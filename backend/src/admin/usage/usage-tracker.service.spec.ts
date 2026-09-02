import { PrismaService } from '../../prisma/prisma.service';
import { UsageTrackerService } from './usage-tracker.service';

function prismaStub() {
  return {
    userActivityMinute: { upsert: jest.fn().mockResolvedValue({}) },
    userSectionDay: { upsert: jest.fn().mockResolvedValue({}) },
  };
}

describe('UsageTrackerService', () => {
  const earlier = new Date('2026-09-01T10:00:30Z');

  it('пишет минуту одной строкой, а не запросом на запрос', async () => {
    const prisma = prismaStub();
    const tracker = new UsageTrackerService(prisma as unknown as PrismaService);

    for (let i = 0; i < 20; i++) {
      tracker.record('u1', '/api/trades', 'GET', false, earlier);
    }
    await tracker.flush(true);

    expect(prisma.userActivityMinute.upsert).toHaveBeenCalledTimes(1);
    const call = prisma.userActivityMinute.upsert.mock.calls[0][0];
    expect(call.create.requests).toBe(20);
    expect(call.create.minute.toISOString()).toBe('2026-09-01T10:00:00.000Z');
  });

  it('отделяет действия от опроса интерфейса', async () => {
    const prisma = prismaStub();
    const tracker = new UsageTrackerService(prisma as unknown as PrismaService);

    tracker.record('u1', '/api/trades', 'GET', false, earlier);
    tracker.record('u1', '/api/tags', 'POST', false, earlier);
    tracker.record('u1', '/api/tags/1', 'DELETE', false, earlier);
    await tracker.flush(true);

    const call = prisma.userActivityMinute.upsert.mock.calls[0][0];
    expect(call.create.requests).toBe(3);
    expect(call.create.writes).toBe(2);
  });

  it('минута считается проведённой на переднем плане, если хоть один запрос это сказал', async () => {
    const prisma = prismaStub();
    const tracker = new UsageTrackerService(prisma as unknown as PrismaService);

    tracker.record('u1', '/api/trades', 'GET', false, earlier);
    tracker.record('u1', '/api/trades', 'GET', true, earlier);
    await tracker.flush(true);

    expect(
      prisma.userActivityMinute.upsert.mock.calls[0][0].create.foreground,
    ).toBe(true);
  });

  it('не пишет незавершённую минуту', async () => {
    const prisma = prismaStub();
    const tracker = new UsageTrackerService(prisma as unknown as PrismaService);

    // Текущая минута ещё набирает запросы: записать её сейчас значит посчитать
    // её дважды — второй раз при следующем сбросе.
    tracker.record('u1', '/api/trades', 'GET', false, new Date());
    expect(await tracker.flush()).toEqual({ written: 0 });
    expect(prisma.userActivityMinute.upsert).not.toHaveBeenCalled();

    // На остановке процесса она всё же уходит в базу.
    expect((await tracker.flush(true)).written).toBe(1);
  });

  it('раскладывает запросы по разделам и считает минуту разделу один раз', async () => {
    const prisma = prismaStub();
    const tracker = new UsageTrackerService(prisma as unknown as PrismaService);

    tracker.record('u1', '/api/trades', 'GET', false, earlier);
    tracker.record('u1', '/api/trades?limit=50', 'GET', false, earlier);
    tracker.record('u1', '/api/tags', 'POST', false, earlier);
    await tracker.flush(true);

    const bySection = Object.fromEntries(
      prisma.userSectionDay.upsert.mock.calls.map(([arg]: [any]) => [
        arg.create.section,
        arg.create,
      ]),
    );
    expect(bySection.journal.requests).toBe(2);
    expect(bySection.journal.minutes).toBe(1);
    expect(bySection.tags.writes).toBe(1);
  });

  it('не считает использованием продукта саму админку', async () => {
    const prisma = prismaStub();
    const tracker = new UsageTrackerService(prisma as unknown as PrismaService);

    tracker.record(
      'owner',
      '/api/admin/analytics/overview',
      'GET',
      false,
      earlier,
    );
    await tracker.flush(true);

    expect(prisma.userActivityMinute.upsert).not.toHaveBeenCalled();
  });

  it('падение записи не роняет остальные минуты', async () => {
    const prisma = prismaStub();
    prisma.userActivityMinute.upsert
      .mockRejectedValueOnce(new Error('db is down'))
      .mockResolvedValue({});
    const tracker = new UsageTrackerService(prisma as unknown as PrismaService);

    tracker.record('u1', '/api/trades', 'GET', false, earlier);
    tracker.record('u2', '/api/trades', 'GET', false, earlier);

    // Аналитика не стоит того, чтобы ронять процесс: потерянная минута
    // логируется, а сброс продолжается.
    expect((await tracker.flush(true)).written).toBe(1);
  });
});
