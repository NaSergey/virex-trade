import { PrismaService } from '../prisma/prisma.service';
import type { ActionRow } from './series';

/**
 * Действия человека за всё время, сгруппированные по (день UTC, вид). Один
 * запрос на сетку активности, таблицу игр, паутинку и счётчики достижений:
 * всё это — разные свёртки одних и тех же строк, и пять запросов разошлись бы
 * в определении «действия» при первой правке одного из них.
 *
 * Действие — участие в турнире, своя сессия бектеста (турнирные — уже
 * участие), ставка джетпака, завершённая раздача стола с вкладом человека,
 * сделка, размеченная тегом, ежедневная награда. Вид раздачи — `gameType`
 * стола (`poker` / `blackjack`), он же id игры.
 *
 * Раздачи ищутся по ключу JSON `contributions` — ключи там и есть id игроков —
 * оператором `?` («есть такой ключ») по GIN-индексу (`GameHand`, 2026-10-02).
 * Именно `?`, а не `-> … IS NOT NULL`: тот же смысл (вкладов `null` не
 * бывает), но второй вариант индексом не пользуется, и каждый просмотр любого
 * профиля обходил бы все раздачи всех игроков за всё время. Колонки —
 * `timestamp` без пояса в UTC, поэтому `::date` и есть день UTC.
 */
export function queryActions(prisma: PrismaService, userId: string): Promise<ActionRow[]> {
  return prisma.$queryRaw<ActionRow[]>`
    SELECT to_char(a.at::date, 'YYYY-MM-DD') AS "day", a.kind AS "kind", COUNT(*)::int AS "n"
    FROM (
      SELECT "joinedAt" AS at, 'tournament' AS kind
        FROM "tournament_participants" WHERE "userId" = ${userId}
      UNION ALL
      SELECT "createdAt", 'backtest'
        FROM "backtest_sessions" WHERE "userId" = ${userId} AND "tournamentId" IS NULL
      UNION ALL
      SELECT "createdAt", 'jetpack'
        FROM "jetpack_bets" WHERE "userId" = ${userId}
      UNION ALL
      SELECT h."startedAt", t."gameType"
        FROM "game_hands" h JOIN "game_tables" t ON t."id" = h."tableId"
        WHERE h."contributions" ? ${userId}::text
          AND h."finishedAt" IS NOT NULL AND NOT h."voided"
      UNION ALL
      SELECT "createdAt", 'tag'
        FROM "battle_pass_xp_events" WHERE "userId" = ${userId} AND "source" = 'journal.tag'
      UNION ALL
      SELECT "createdAt", 'daily'
        FROM "coin_transactions" WHERE "userId" = ${userId} AND "kind" = 'DAILY_REWARD'
    ) a
    GROUP BY 1, 2
  `;
}

/** XP по дням UTC начиная с `since` — сырьё ряда «опыт по дням». */
export function queryXpByDay(
  prisma: PrismaService,
  userId: string,
  since: Date,
): Promise<{ day: string; xp: number }[]> {
  return prisma.$queryRaw<{ day: string; xp: number }[]>`
    SELECT to_char("createdAt"::date, 'YYYY-MM-DD') AS "day", SUM("xp")::int AS "xp"
    FROM "battle_pass_xp_events"
    WHERE "userId" = ${userId} AND "createdAt" >= ${since}
    GROUP BY 1
  `;
}
