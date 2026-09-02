import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VISIT_GAP_MIN } from './visits';

/**
 * Тяжёлые выборки по минутам активности — сырым SQL.
 *
 * Визит — это цепочка соседних минут, то есть оконная функция; тянуть ради неё
 * все минуты в Node значит грузить сотни тысяч строк на каждый показ отчёта.
 * Постгрес сшивает их сам и отдаёт уже визиты — единицы строк на пользователя
 * за месяц.
 *
 * Числа приводятся к ::int прямо в запросе: COUNT() и SUM() иначе приезжают
 * через Prisma как BigInt и ломают арифметику молча (BigInt + Number бросает
 * TypeError уже в рантайме).
 */

export interface VisitRow {
  userId: string;
  /** Когда человек пришёл. Когда ушёл — не отдаётся: это было бы время на сайте. */
  startedAt: Date;
  requests: number;
  writes: number;
}

export interface DayRow {
  day: Date;
  activeUsers: number;
  requests: number;
  writes: number;
}

export interface UserDayRow {
  userId: string;
  day: Date;
  requests: number;
  writes: number;
}

/** Целое число, безопасное для подстановки в SQL текстом. */
function int(value: number): Prisma.Sql {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n))
    throw new Error(`expected a finite number, got ${value}`);
  return Prisma.raw(String(n));
}

/** Сдвиг суток под часовой пояс отчёта. */
function dayExpr(tzOffsetMinutes: number): Prisma.Sql {
  const off = int(tzOffsetMinutes);
  return Prisma.sql`date_trunc('day', "minute" + make_interval(mins => ${off})) - make_interval(mins => ${off})`;
}

/**
 * Визиты за окно: минуты, разделённые паузой длиннее VISIT_GAP_MIN, считаются
 * разными заходами.
 */
export async function queryVisits(
  prisma: PrismaService,
  from: Date,
  to: Date,
  userId?: string,
): Promise<VisitRow[]> {
  const gap = int(VISIT_GAP_MIN);
  const userFilter = userId
    ? Prisma.sql`AND "userId" = ${userId}`
    : Prisma.empty;

  return prisma.$queryRaw<VisitRow[]>`
    WITH marked AS (
      SELECT
        "userId", "minute", "requests", "writes",
        CASE
          WHEN "minute" - LAG("minute") OVER w > make_interval(mins => ${gap}) THEN 1
          WHEN LAG("minute") OVER w IS NULL THEN 1
          ELSE 0
        END AS is_start
      FROM "user_activity_minutes"
      WHERE "minute" >= ${from} AND "minute" < ${to} ${userFilter}
      WINDOW w AS (PARTITION BY "userId" ORDER BY "minute")
    ),
    grouped AS (
      SELECT *,
        SUM(is_start) OVER (
          PARTITION BY "userId" ORDER BY "minute" ROWS UNBOUNDED PRECEDING
        ) AS visit_no
      FROM marked
    )
    SELECT
      "userId",
      MIN("minute")        AS "startedAt",
      SUM("requests")::int AS "requests",
      SUM("writes")::int   AS "writes"
    FROM grouped
    GROUP BY "userId", visit_no
    ORDER BY "startedAt"
  `;
}

/** Разбивка по суткам: сколько разных людей заходило и сколько было обращений. */
export async function queryDaily(
  prisma: PrismaService,
  from: Date,
  to: Date,
  tzOffsetMinutes: number,
): Promise<DayRow[]> {
  return prisma.$queryRaw<DayRow[]>`
    SELECT
      ${dayExpr(tzOffsetMinutes)}   AS "day",
      COUNT(DISTINCT "userId")::int AS "activeUsers",
      SUM("requests")::int          AS "requests",
      SUM("writes")::int            AS "writes"
    FROM "user_activity_minutes"
    WHERE "minute" >= ${from} AND "minute" < ${to}
    GROUP BY 1
    ORDER BY 1
  `;
}

/** То же по суткам, но с разрезом по пользователю. */
export async function queryUserDays(
  prisma: PrismaService,
  from: Date,
  to: Date,
  tzOffsetMinutes: number,
  userId?: string,
): Promise<UserDayRow[]> {
  const userFilter = userId
    ? Prisma.sql`AND "userId" = ${userId}`
    : Prisma.empty;

  return prisma.$queryRaw<UserDayRow[]>`
    SELECT
      "userId",
      ${dayExpr(tzOffsetMinutes)} AS "day",
      SUM("requests")::int        AS "requests",
      SUM("writes")::int          AS "writes"
    FROM "user_activity_minutes"
    WHERE "minute" >= ${from} AND "minute" < ${to} ${userFilter}
    GROUP BY 1, 2
    ORDER BY 2
  `;
}

/** Сколько разных людей заходило за окно. */
export async function countActiveUsers(
  prisma: PrismaService,
  from: Date,
  to: Date,
): Promise<number> {
  const rows = await prisma.$queryRaw<{ users: number }[]>`
    SELECT COUNT(DISTINCT "userId")::int AS "users"
    FROM "user_activity_minutes"
    WHERE "minute" >= ${from} AND "minute" < ${to}
  `;
  return rows[0]?.users ?? 0;
}

/**
 * Сколько людей заходило больше чем в один день.
 *
 * Главный вопрос владельца («пользуются или нет») в одном числе:
 * зарегистрироваться и посмотреть один раз может кто угодно, вернуться на
 * другой день — только тот, кому сервис зачем-то нужен.
 */
export async function countReturningUsers(
  prisma: PrismaService,
): Promise<number> {
  const rows = await prisma.$queryRaw<{ users: number }[]>`
    SELECT COUNT(*)::int AS "users" FROM (
      SELECT "userId"
      FROM "user_activity_minutes"
      GROUP BY "userId"
      HAVING COUNT(DISTINCT date_trunc('day', "minute")) >= 2
    ) t
  `;
  return rows[0]?.users ?? 0;
}

/**
 * Пары «пользователь — номер недели от точки отсчёта» для когортного удержания.
 *
 * Возвращаются только недели, в которые человек заходил, поэтому строк тут
 * столько же, сколько активных недель у всех пользователей вместе — на порядки
 * меньше, чем минут.
 */
export async function queryActiveWeeks(
  prisma: PrismaService,
  anchor: Date,
  from: Date,
): Promise<{ userId: string; week: number }[]> {
  return prisma.$queryRaw<{ userId: string; week: number }[]>`
    SELECT DISTINCT
      "userId",
      FLOOR(EXTRACT(EPOCH FROM ("minute" - ${anchor})) / 604800)::int AS "week"
    FROM "user_activity_minutes"
    WHERE "minute" >= ${from}
  `;
}
