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
 * Пять агрегатов выше — чистое чтение (`findMany`). `syncAll` — НЕ чтение:
 * это тот же боевой метод, что гоняет периодический таймер синка, — он
 * реально ходит к бирже и пишет `Trade` за каждого пользователя с
 * подключённой биржей. Скрипт вызывает его только если среди пользователей
 * базы нет никого с `activeExchange`, кроме demo (см. проверку перед
 * вызовом ниже) — на любой базе, где такие пользователи есть, `syncAll`
 * пропускается с предупреждением, а не вызывается вслепую. Поэтому у этого
 * скрипта нет безусловного контракта «ничего не пишет», как у
 * `synthetic-market-preview.ts` / `volatile-hour-preview.ts` — он либо не
 * пишет ничего (типичный случай — demo единственный активный аккаунт),
 * либо явно отказывается писать.
 *
 * Сервисы вызываются напрямую через @nestjs/testing, без NestFactory:
 * DI-граф собирается по-настоящему (боевые классы), но
 * `moduleRef.compile()` не запускает `onApplicationBootstrap` (в отличие от
 * `app.init()`), поэтому периодический таймер синка, телеграм-поллинг и
 * прочий фон не стартуют сами — `syncAll` вызывается ровно один раз, явно.
 *
 * Запуск локально (из backend/, база должна быть поднята и содержать
 * demo@example.com — см. start.bat и src/scripts/seed-demo.ts):
 *   npx ts-node -r tsconfig-paths/register src/scripts/load-baseline.ts
 *
 * Изолированная база для повторяемого замера (не расшаривает Postgres с
 * другим чекаутом/веткой, где может быть другая версия схемы) — так был
 * снят исходный baseline T1:
 *   docker run -d --name perf-baseline-db \
 *     -e POSTGRES_USER=virex -e POSTGRES_PASSWORD=virex -e POSTGRES_DB=virex \
 *     -p 127.0.0.1:5544:5432 postgres:16-alpine
 *   # backend/.env: DATABASE_URL=postgresql://virex:virex@localhost:5544/virex?schema=public
 *   #               + свои JWT_ACCESS_SECRET / CREDENTIALS_ENCRYPTION_KEY (openssl rand -hex 32)
 *   npx prisma db push --skip-generate
 *   npx ts-node -r tsconfig-paths/register src/scripts/seed-demo.ts
 *
 * Для прода не предназначен: там `activeExchange` есть у реальных
 * пользователей, и `syncAll` из этого скрипта откажется что-либо делать
 * (см. защиту выше) — числа агрегатов собрать можно, а сравнивать с прод-
 * нагрузкой по методологии этого скрипта не стоит.
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

    // T10 (A2, docs/superpowers/sdd/2026-09-16-backend-optimization):
    // каждый агрегат зовём ДВАЖДЫ подряд, теми же параметрами, в одном
    // процессе — версия данных пользователя между двумя вызовами не
    // меняется (никто не пишет в БД между ними), поэтому второй вызов —
    // ровно тот «шестидесятисекундный повторный опрос вкладки» из брифа.
    // До T10 второй вызов стоил столько же Prisma-запросов, сколько первый;
    // после — 0 (версия+LRU-кэш в памяти процесса, см. aggregate-cache.ts).
    const measureTwice = async (
      name: string,
      fn: () => Promise<unknown>,
      info: (r: unknown) => string,
    ) => {
      await measure(`${name} (1-й вызов)`, fn, info);
      await measure(`${name} (2-й, тот же запрос)`, fn, info);
    };

    await measureTwice(
      'GET /api/trades/stats',
      () => tradesService.stats(user.id, {}),
      (r) =>
        `${(r as { stats: { totalTrades: number } }).stats.totalTrades} сделок`,
    );
    await measureTwice(
      'GET /api/trades/stats-by-time',
      () => tradesService.statsByTime(user.id, {}),
      () => '',
    );
    await measureTwice(
      'GET /api/trades',
      () => tradesService.list(user.id, { page: 1, pageSize: 20 }),
      (r) => {
        const v = r as { total: number; trades: unknown[] };
        return `total=${v.total}, страница из ${v.trades.length}`;
      },
    );
    await measureTwice(
      'GET /api/trades/lab',
      () => labService.query(user.id, {}),
      (r) =>
        `${(r as { baseline: { trades: number } }).baseline.trades} сделок в базовой выборке`,
    );
    await measureTwice(
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

    // syncAll — боевой метод: реально ходит к бирже и пишет Trade за каждого
    // пользователя с activeExchange. Вызывать его вслепую на произвольной
    // базе значит синкать чужие реальные аккаунты из измерительного
    // скрипта — недопустимо для "ничего не пишет". Разрешаем вызов только
    // если единственный активный аккаунт в базе — сам demo (у него
    // activeExchange всегда null, см. CLAUDE.md, так что в норме таких
    // пользователей 0); на любой базе, где есть кто-то ещё, — отказываем.
    const otherActiveExchangeUsers = await prisma.user.findMany({
      where: { activeExchange: { not: null }, id: { not: user.id } },
      select: { email: true },
    });
    if (otherActiveExchangeUsers.length > 0) {
      rows.push({
        name: 'TradeSyncService.syncAll (один прогон)',
        ms: 0,
        queries: 0,
        info:
          `ПРОПУЩЕН — на базе ${otherActiveExchangeUsers.length} пользователь(ей) с ` +
          `подключённой биржей помимо demo (${otherActiveExchangeUsers.map((u) => u.email).join(', ')}); ` +
          'syncAll реально ходит к бирже и пишет Trade — не вызываю вслепую',
      });
    } else {
      // syncAll сам печатает [T1]-лог (длительность + запросы) через свой
      // логгер — это тот же лог, что появится в консоли настоящего сервера
      // при периодическом прогоне (раз в 60 с). Дублируем то же число здесь,
      // одной таблицей с остальным.
      await measure(
        'TradeSyncService.syncAll (один прогон)',
        () => syncService.syncAll(),
        (r) =>
          `inserted=${(r as { inserted: number }).inserted}, активных подключений: 0`,
      );
    }

    console.log(`\nБазовая линия — ${DEMO_EMAIL} (userId ${user.id})\n`);
    const nameW = Math.max(...rows.map((r) => r.name.length));
    for (const r of rows) {
      console.log(
        `${r.name.padEnd(nameW)}  ${String(r.ms).padStart(5)} мс  ${String(r.queries).padStart(3)} запросов  ${r.info}`,
      );
    }
    if (otherActiveExchangeUsers.length === 0) {
      console.log(
        '\nПользователей с activeExchange нет в этой базе, кроме demo (у него он\n' +
          'намеренно null, см. CLAUDE.md) — syncAll выше прошёл цикл по нулю\n' +
          'пользователей. Число здесь — стоимость самого опроса `user.findMany`, не\n' +
          'стоимость синка одного аккаунта; она — отдельная оценка в самой спеке\n' +
          '(~1 с/пользователь).',
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
