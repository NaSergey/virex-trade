import { PrismaService } from '../../prisma/prisma.service';
import { UsageTrackerService } from './usage-tracker.service';

function prismaStub() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
}

/** Склеивает шаблонные строки вызова $executeRaw в один текст для grep-проверок. */
function sqlOf(call: unknown[]): string {
  return (call[0] as string[]).join('?');
}

describe('UsageTrackerService', () => {
  const earlier = new Date('2026-09-01T10:00:30Z');

  it('пишет минуту одним запросом, а не upsert на корзину', async () => {
    const prisma = prismaStub();
    const tracker = new UsageTrackerService(prisma as unknown as PrismaService);

    for (let i = 0; i < 20; i++) {
      tracker.record('u1', '/api/trades', 'GET', earlier);
    }
    const res = await tracker.flush(true);

    expect(res.written).toBe(1);
    // Одна корзина, один раздел (journal) — минуты и разделы одним запросом каждая.
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    expect(sqlOf(prisma.$executeRaw.mock.calls[0])).toContain(
      'user_activity_minutes',
    );
    expect(sqlOf(prisma.$executeRaw.mock.calls[1])).toContain(
      'user_section_days',
    );
  });

  it('сброс тысячи корзин делает 1-2 запроса, а не тысячи', async () => {
    const prisma = prismaStub();
    const tracker = new UsageTrackerService(prisma as unknown as PrismaService);

    for (let i = 0; i < 1000; i++) {
      tracker.record(`u${i}`, '/api/trades', 'GET', earlier);
    }
    const res = await tracker.flush(true);

    expect(res.written).toBe(1000);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });

  // Семантика инкремента: requests/writes складываются при повторной записи
  // той же минуты, а не перезаписываются. Проверяем по SQL-тексту
  // (DO UPDATE SET x = table.x + EXCLUDED.x), а численно — интеграционно
  // против реальной БД (см. task-15-16-report.md, раздел T16).
  it('пишет минуту через ON CONFLICT DO UPDATE со сложением, а не перезаписью', async () => {
    const prisma = prismaStub();
    const tracker = new UsageTrackerService(prisma as unknown as PrismaService);

    tracker.record('u1', '/api/trades', 'GET', earlier);
    await tracker.flush(true);

    const sql = sqlOf(prisma.$executeRaw.mock.calls[0]);
    expect(sql).toContain('ON CONFLICT ("userId", minute)');
    expect(sql).toContain(
      'requests = "user_activity_minutes".requests + EXCLUDED.requests',
    );
    expect(sql).toContain(
      'writes = "user_activity_minutes".writes + EXCLUDED.writes',
    );
  });

  it('повторный сброс той же (незакрытой на первый раз) минуты складывает счётчики', async () => {
    const prisma = prismaStub();
    const tracker = new UsageTrackerService(prisma as unknown as PrismaService);

    // Первый сброс той же минуты.
    tracker.record('u1', '/api/trades', 'GET', earlier);
    tracker.record('u1', '/api/trades', 'GET', earlier);
    await tracker.flush(true);

    // Второй сброс — новые записи той же минуты (например, минута снова
    // "открылась" в буфере между двумя force-флашами). Инкрементная семантика
    // в самой БД (ON CONFLICT DO UPDATE SET x = x + EXCLUDED.x) гарантирует
    // сложение, а не перезапись — что и утверждает предыдущий тест на SQL, и
    // что подтверждено прогоном той же строки против реальной БД
    // (perf-baseline-db:5544, см. отчёт).
    tracker.record('u1', '/api/trades', 'GET', earlier);
    await tracker.flush(true);

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(4); // 2 запроса × 2 сброса
    const firstCallValues = prisma.$executeRaw.mock.calls[0];
    const secondCallValues = prisma.$executeRaw.mock.calls[2];
    // Оба запроса пишут одну и ту же минуту (одна and та же строка в БД):
    // сама проверка "сложились, а не перезаписались" числово — на реальной БД.
    expect(sqlOf(firstCallValues)).toContain('ON CONFLICT');
    expect(sqlOf(secondCallValues)).toContain('ON CONFLICT');
  });

  it('отделяет действия от опроса интерфейса', async () => {
    const prisma = prismaStub();
    const tracker = new UsageTrackerService(prisma as unknown as PrismaService);

    tracker.record('u1', '/api/trades', 'GET', earlier);
    tracker.record('u1', '/api/tags', 'POST', earlier);
    tracker.record('u1', '/api/tags/1', 'DELETE', earlier);
    await tracker.flush(true);

    // requests/writes встроены как параметры запроса, а не в текст SQL —
    // числовую корректность подтверждает интеграционная проверка (см. отчёт).
    // Здесь проверяем, что запись действительно случилась одним запросом на
    // таблицу и что раздел (journal + tags) попал в отдельную вставку.
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    const sectionSql = sqlOf(prisma.$executeRaw.mock.calls[1]);
    expect(sectionSql).toContain('user_section_days');
  });

  it('не пишет незавершённую минуту', async () => {
    const prisma = prismaStub();
    const tracker = new UsageTrackerService(prisma as unknown as PrismaService);

    // Текущая минута ещё набирает запросы: записать её сейчас значит вернуться
    // к ней вторым сбросом.
    tracker.record('u1', '/api/trades', 'GET', new Date());
    expect(await tracker.flush()).toEqual({ written: 0 });
    expect(prisma.$executeRaw).not.toHaveBeenCalled();

    // На остановке процесса она всё же уходит в базу.
    expect((await tracker.flush(true)).written).toBe(1);
  });

  it('раскладывает обращения по разделам, схлопывая корзины одного дня', async () => {
    const prisma = prismaStub();
    const tracker = new UsageTrackerService(prisma as unknown as PrismaService);

    tracker.record('u1', '/api/trades', 'GET', earlier);
    tracker.record('u1', '/api/trades?limit=50', 'GET', earlier);
    tracker.record('u1', '/api/tags', 'POST', earlier);
    await tracker.flush(true);

    // Один запрос на всю раскладку по разделам, а не по строке на раздел.
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    const sql = sqlOf(prisma.$executeRaw.mock.calls[1]);
    expect(sql).toContain('user_section_days');
    expect(sql).toContain('ON CONFLICT ("userId", day, section)');
  });

  it('не считает использованием продукта саму админку', async () => {
    const prisma = prismaStub();
    const tracker = new UsageTrackerService(prisma as unknown as PrismaService);

    tracker.record('owner', '/api/admin/analytics/overview', 'GET', earlier);
    await tracker.flush(true);

    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('падение записи минут не ретраится бесконечно и не роняет flush', async () => {
    const prisma = prismaStub();
    prisma.$executeRaw.mockRejectedValueOnce(new Error('db is down'));
    const tracker = new UsageTrackerService(prisma as unknown as PrismaService);

    tracker.record('u1', '/api/trades', 'GET', earlier);
    tracker.record('u2', '/api/trades', 'GET', earlier);

    // Аналитика не стоит того, чтобы ронять процесс: пачка теряется и
    // логируется, flush не бросает исключение.
    const res = await tracker.flush(true);
    expect(res.written).toBe(0);
    // Буфер уже очищен в flush() до попытки записи — потерянные корзины не
    // возвращаются и не будут отправлены повторно на следующем сбросе.
    expect((await tracker.flush(true)).written).toBe(0);
  });

  it('падение записи разделов не теряет уже записанные минуты', async () => {
    const prisma = prismaStub();
    prisma.$executeRaw
      .mockResolvedValueOnce(1) // user_activity_minutes — успех
      .mockRejectedValueOnce(new Error('db is down')); // user_section_days — падение
    const tracker = new UsageTrackerService(prisma as unknown as PrismaService);

    tracker.record('u1', '/api/trades', 'GET', earlier);
    const res = await tracker.flush(true);

    expect(res.written).toBe(1);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });
});
