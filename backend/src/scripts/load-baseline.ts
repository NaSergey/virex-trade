/**
 * T1 — базовая линия для спеки оптимизации бэкенда
 * (`docs/superpowers/specs/2026-09-16-backend-optimization.md`).
 *
 * Печатает для демо-аккаунта (`seed-demo.ts`, `demo@example.com`) время
 * ответа и число SQL-запросов Prisma на пяти «живых» агрегатах, которые
 * спека называет узким местом (A1): `stats`, `stats-by-time`, `list`,
 * `lab`, `habits`. Плюс один прогон `TradeSyncService.syncAll` — со счётом
 * запросов и длительностью, тем же механизмом.
 *
 * Ничего не пишет и не меняет: сервисы вызываются напрямую (через
 * @nestjs/testing, без NestFactory) — DI-граф собирается по-настоящему, но
 * `moduleRef.compile()` не запускает `onApplicationBootstrap` (в отличие от
 * `app.init()`), поэтому периодический таймер синка, телеграм-поллинг и
 * прочий фон не стартуют — синк вызывается ровно один раз, явно, ниже.
 *
 * Запуск локально (из backend/, база должна быть поднята и содержать
 * demo@example.com — см. start.bat и src/scripts/seed-demo.ts):
 *   npx ts-node -r tsconfig-paths/register src/scripts/load-baseline.ts
 * На проде — не предназначен (нужен для сравнения "было/стало" в разработке):
 *   docker compose --env-file .env.prod -f docker-compose.prod.yml \
 *     exec api node dist/scripts/load-baseline.js
 *
 * Числа этого прогона — точка сравнения для всех последующих задач спеки:
 * без базовой линии "стало быстрее" — утверждение без доказательства.
 */
import 'reflect-metadata';
// Включить счётчик запросов Prisma (PrismaService, backend/src/prisma) ДО
// того, как модуль соберёт PrismaService — константа читается в конструкторе.
process.env.PRISMA_LOG_QUERIES = process.env.PRISMA_LOG_QUERIES || '1';

import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { TradesModule } from '../trades/trades.module';
import { TradesService } from '../trades/trades.service';
import { LabService } from '../trades/lab.service';
import { HabitsService } from '../trades/habits.service';
import { TradeSyncService } from '../trades/trade-sync.service';

// Не импортируется из seed-demo.ts: тот модуль на верхнем уровне запускает
// реseed при простом импорте (нет require.main-охраны) — берём только
// значение константы, дословно.
const DEMO_EMAIL = 'demo@example.com';

interface Row {
  name: string;
  ms: number;
  queries: number;
  info: string;
}

async function main() {
  // PrismaModule — @Global в обычном приложении (регистрируется через
  // AppModule); в урезанном графе теста его нужно перечислить явно, иначе
  // PrismaService не резолвится.
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
      PrismaModule,
      TradesModule,
    ],
  }).compile();
  // @nestjs/testing глушит Logger.log() по умолчанию (TestingLogger) — включаем
  // обратно, чтобы временный [T1]-лог внутри syncAll реально был виден: это тот
  // же лог, что появится в консоли настоящего сервера при периодическом прогоне.
  moduleRef.useLogger(new Logger());

  const prisma = moduleRef.get(PrismaService);
  const tradesService = moduleRef.get(TradesService);
  const labService = moduleRef.get(LabService);
  const habitsService = moduleRef.get(HabitsService);
  const syncService = moduleRef.get(TradeSyncService);

  try {
    const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
    if (!user) {
      console.error(
        `Демо-аккаунт ${DEMO_EMAIL} не найден. Прогони сначала:\n` +
          '  npx ts-node -r tsconfig-paths/register src/scripts/seed-demo.ts',
      );
      process.exit(1);
    }

    const rows: Row[] = [];
    const measure = async (
      name: string,
      fn: () => Promise<unknown>,
      info: (r: unknown) => string,
    ) => {
      prisma.resetQueryCount();
      const t0 = Date.now();
      const result = await fn();
      const ms = Date.now() - t0;
      rows.push({ name, ms, queries: prisma.queryCount, info: info(result) });
    };

    await measure(
      'GET /api/trades/stats',
      () => tradesService.stats(user.id, {}),
      (r) =>
        `${(r as { stats: { totalTrades: number } }).stats.totalTrades} сделок`,
    );
    await measure(
      'GET /api/trades/stats-by-time',
      () => tradesService.statsByTime(user.id, {}),
      () => '',
    );
    await measure(
      'GET /api/trades',
      () => tradesService.list(user.id, { page: 1, pageSize: 20 }),
      (r) => {
        const v = r as { total: number; trades: unknown[] };
        return `total=${v.total}, страница из ${v.trades.length}`;
      },
    );
    await measure(
      'GET /api/trades/lab',
      () => labService.query(user.id, {}),
      (r) =>
        `${(r as { baseline: { trades: number } }).baseline.trades} сделок в базовой выборке`,
    );
    await measure(
      'GET /api/trades/habits',
      () => habitsService.scan(user.id),
      (r) => {
        const v = r as {
          status: string;
          habits?: unknown[];
          edges?: unknown[];
        };
        return v.status === 'ok'
          ? `${v.habits?.length ?? 0} привычек, ${v.edges?.length ?? 0} преимуществ`
          : `status=${v.status}`;
      },
    );

    // syncAll сам печатает [T1]-лог (длительность + запросы) через свой
    // логгер — это тот же лог, что появится в консоли настоящего сервера
    // при периодическом прогоне (раз в 60 с). Дублируем то же число здесь,
    // одной таблицей с остальным.
    const activeExchangeUsers = await prisma.user.count({
      where: { activeExchange: { not: null } },
    });
    await measure(
      'TradeSyncService.syncAll (один прогон)',
      () => syncService.syncAll(),
      (r) =>
        `inserted=${(r as { inserted: number }).inserted}, активных подключений: ${activeExchangeUsers}`,
    );

    console.log(`\nБазовая линия — ${DEMO_EMAIL} (userId ${user.id})\n`);
    const nameW = Math.max(...rows.map((r) => r.name.length));
    for (const r of rows) {
      console.log(
        `${r.name.padEnd(nameW)}  ${String(r.ms).padStart(5)} мс  ${String(r.queries).padStart(3)} запросов  ${r.info}`,
      );
    }
    if (activeExchangeUsers === 0) {
      console.log(
        '\nПользователей с activeExchange нет в этой базе (у demo он намеренно null,\n' +
          'см. CLAUDE.md) — syncAll выше прошёл цикл по нулю пользователей. Число\n' +
          'здесь — стоимость самого опроса `user.findMany`, не стоимость синка одного\n' +
          'аккаунта; она — отдельная оценка в самой спеке (~1 с/пользователь).',
      );
    }
  } finally {
    await moduleRef.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
