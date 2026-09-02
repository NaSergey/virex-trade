import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  PeriodQueryDto,
  RetentionQueryDto,
  UsersQueryDto,
  UserSortField,
} from './dto/analytics-query.dto';
import {
  DAY_MS,
  SESSION_GAP_MIN,
  floorToDay,
  floorToWeek,
  median,
  round,
} from './usage/sessions';
import {
  SessionRow,
  countActiveUsers,
  countReturningUsers,
  queryActiveWeeks,
  queryDaily,
  querySessions,
  queryUserDays,
} from './usage/usage-queries';

const DEFAULT_PERIOD_DAYS = 30;
const DEFAULT_USER_LIMIT = 50;
const WEEK_MS = 7 * DAY_MS;

interface ResolvedPeriod {
  from: Date;
  to: Date;
  days: number;
  tzOffsetMinutes: number;
}

/**
 * Владельческая аналитика: пользуются сервисом или нет.
 *
 * Отвечает на три вопроса и старается не делать вид, что отвечает на большее:
 * сколько людей заходит, сколько времени они здесь проводят и доходят ли они до
 * той точки, ради которой продукт написан (свои сделки, размеченные тегами).
 *
 * Все временные метрики выводятся из минут активности (UserActivityMinute), а
 * не хранятся готовыми — определение сессии можно поменять, и вся история
 * пересчитается. Отсюда же главное ограничение, которое стоит помнить, читая
 * числа: «время на сайте» это время с ОТКРЫТЫМ приложением, потому что
 * фронтенд опрашивает API и с фоновой вкладки. Отделить присутствие человека
 * от открытой вкладки можно только заголовком `X-Client-Active` (поле
 * foreground), который фронт пока не шлёт.
 */
@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Сводка по сервису: аудитория, время, воронка пути и график по дням. */
  async overview(dto: PeriodQueryDto) {
    const period = resolvePeriod(dto);
    const now = new Date();

    const [sessions, daily, userDays, users, dau, wau, mau, funnel, sections] =
      await Promise.all([
        querySessions(this.prisma, period.from, period.to),
        queryDaily(this.prisma, period.from, period.to, period.tzOffsetMinutes),
        queryUserDays(
          this.prisma,
          period.from,
          period.to,
          period.tzOffsetMinutes,
        ),
        this.prisma.user.findMany({ select: { id: true, createdAt: true } }),
        countActiveUsers(this.prisma, new Date(now.getTime() - DAY_MS), now),
        countActiveUsers(
          this.prisma,
          new Date(now.getTime() - 7 * DAY_MS),
          now,
        ),
        countActiveUsers(
          this.prisma,
          new Date(now.getTime() - 30 * DAY_MS),
          now,
        ),
        this.lifetimeFunnel(),
        this.sectionUsage(period),
      ]);

    const activeUserIds = new Set(sessions.map((s) => s.userId));
    const durations = sessions.map((s) => s.durationMin);
    const minutesOnSite = sum(durations);
    const activeMinutes = sum(sessions.map((s) => s.activeMinutes));
    const foregroundMinutes = sum(sessions.map((s) => s.foregroundMinutes));
    const actions = sum(sessions.map((s) => s.writes));

    const newUsers = users.filter(
      (u) => u.createdAt >= period.from && u.createdAt < period.to,
    ).length;

    const daysActiveByUser = new Map<string, number>();
    for (const row of userDays) {
      daysActiveByUser.set(
        row.userId,
        (daysActiveByUser.get(row.userId) ?? 0) + 1,
      );
    }

    return {
      period: {
        from: period.from,
        to: period.to,
        days: period.days,
        tzOffsetMinutes: period.tzOffsetMinutes,
        sessionGapMin: SESSION_GAP_MIN,
      },
      totals: {
        users: users.length,
        newUsers,
        activeUsers: activeUserIds.size,
        sessions: sessions.length,
        minutesOnSite,
        activeMinutes,
        // null, а не 0: ноль здесь значит «никто не был на переднем плане», а
        // правда — «фронт ещё не сообщает об этом».
        foregroundMinutes: foregroundMinutes > 0 ? foregroundMinutes : null,
        actions,
        avgSessionMin: round(avg(durations)),
        medianSessionMin: round(median(durations)),
        avgMinutesPerActiveUser: round(
          divide(minutesOnSite, activeUserIds.size),
        ),
        avgSessionsPerActiveUser: round(
          divide(sessions.length, activeUserIds.size),
        ),
        avgDaysActivePerUser: round(avg([...daysActiveByUser.values()])),
      },
      audience: {
        dau,
        wau,
        mau,
        // Насколько «ежедневный» продукт: 1.0 — заходят каждый день, 0.03 —
        // раз в месяц. Считать по-настоящему осмысленным можно от десятков
        // пользователей, ниже это шум.
        stickiness: round(divide(dau, mau), 2),
        avgDailyActiveUsers: round(avg(daily.map((d) => d.activeUsers))),
      },
      funnel,
      daily: this.buildDailySeries(period, daily, sessions, users),
      sections,
      caveats: CAVEATS,
    };
  }

  /** Таблица пользователей с их активностью за окно. */
  async users(dto: UsersQueryDto) {
    const period = resolvePeriod(dto);
    const limit = dto.limit ?? DEFAULT_USER_LIMIT;
    const offset = dto.offset ?? 0;
    const sort: UserSortField = dto.sort ?? 'lastSeenAt';
    const order = dto.order ?? 'desc';
    const q = dto.q?.trim();

    const where = q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' as const } },
            { name: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, sessions, userDays, lastSeen, trades, tags, connections] =
      await Promise.all([
        this.prisma.user.findMany({
          where,
          select: {
            id: true,
            email: true,
            name: true,
            createdAt: true,
            activeExchange: true,
            telegramChatId: true,
          },
        }),
        querySessions(this.prisma, period.from, period.to),
        queryUserDays(
          this.prisma,
          period.from,
          period.to,
          period.tzOffsetMinutes,
        ),
        this.prisma.userActivityMinute.groupBy({
          by: ['userId'],
          _max: { minute: true },
        }),
        this.prisma.trade.groupBy({ by: ['userId'], _count: { _all: true } }),
        this.prisma.tag.groupBy({ by: ['userId'], _count: { _all: true } }),
        this.prisma.exchangeConnection.findMany({
          select: { userId: true, exchange: true },
        }),
      ]);

    const sessionsByUser = groupBy(sessions, (s) => s.userId);
    const daysByUser = new Map<string, number>();
    for (const row of userDays)
      daysByUser.set(row.userId, (daysByUser.get(row.userId) ?? 0) + 1);
    const lastSeenByUser = new Map(
      lastSeen.map((r) => [r.userId, r._max.minute]),
    );
    const tradesByUser = new Map(trades.map((r) => [r.userId, r._count._all]));
    const tagsByUser = new Map(tags.map((r) => [r.userId, r._count._all]));
    const exchangesByUser = groupBy(connections, (c) => c.userId);

    const rows = users.map((user) => {
      const own = sessionsByUser.get(user.id) ?? [];
      const durations = own.map((s) => s.durationMin);
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        registeredAt: user.createdAt,
        lastSeenAt: lastSeenByUser.get(user.id) ?? null,
        // Всё, что ниже, — за окно отчёта, а не за всё время.
        sessions: own.length,
        minutesOnSite: sum(durations),
        activeMinutes: sum(own.map((s) => s.activeMinutes)),
        actions: sum(own.map((s) => s.writes)),
        daysActive: daysByUser.get(user.id) ?? 0,
        avgSessionMin: round(avg(durations)),
        longestSessionMin: durations.length ? Math.max(...durations) : 0,
        // Это — за всё время: столько накопил аккаунт, а не столько сделал за месяц.
        trades: tradesByUser.get(user.id) ?? 0,
        tags: tagsByUser.get(user.id) ?? 0,
        exchanges: (exchangesByUser.get(user.id) ?? []).map((c) => c.exchange),
        activeExchange: user.activeExchange,
        telegramLinked: !!user.telegramChatId,
      };
    });

    rows.sort((a, b) => compareBy(a, b, sort, order));

    return {
      period: { from: period.from, to: period.to, days: period.days },
      total: rows.length,
      limit,
      offset,
      rows: rows.slice(offset, offset + limit),
      caveats: CAVEATS,
    };
  }

  /** Один пользователь: чем и когда он тут занимался. */
  async userDetail(userId: string, dto: PeriodQueryDto) {
    const period = resolvePeriod(dto);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        activeExchange: true,
        telegramChatId: true,
        exchangeConnections: { select: { exchange: true, connectedAt: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const [
      sessions,
      days,
      sectionRows,
      bounds,
      trades,
      tags,
      taggedTrades,
      positionTags,
    ] = await Promise.all([
      querySessions(this.prisma, period.from, period.to, userId),
      queryUserDays(
        this.prisma,
        period.from,
        period.to,
        period.tzOffsetMinutes,
        userId,
      ),
      this.prisma.userSectionDay.groupBy({
        by: ['section'],
        where: { userId, day: { gte: floorToDay(period.from), lt: period.to } },
        _sum: { requests: true, writes: true, minutes: true },
      }),
      this.prisma.userActivityMinute.aggregate({
        where: { userId },
        _min: { minute: true },
        _max: { minute: true },
        _count: { _all: true },
      }),
      this.prisma.trade.count({ where: { userId } }),
      this.prisma.tag.count({ where: { userId } }),
      this.prisma.trade.count({ where: { userId, tags: { some: {} } } }),
      this.prisma.positionTag.count({ where: { userId } }),
    ]);

    const durations = sessions.map((s) => s.durationMin);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        registeredAt: user.createdAt,
        firstSeenAt: bounds._min.minute,
        lastSeenAt: bounds._max.minute,
        lifetimeActiveMinutes: bounds._count._all,
        activeExchange: user.activeExchange,
        exchanges: user.exchangeConnections,
        telegramLinked: !!user.telegramChatId,
        trades,
        tags,
        taggedTrades,
        positionTags,
      },
      period: {
        from: period.from,
        to: period.to,
        days: period.days,
        tzOffsetMinutes: period.tzOffsetMinutes,
      },
      totals: {
        sessions: sessions.length,
        minutesOnSite: sum(durations),
        activeMinutes: sum(sessions.map((s) => s.activeMinutes)),
        actions: sum(sessions.map((s) => s.writes)),
        daysActive: days.length,
        avgSessionMin: round(avg(durations)),
        medianSessionMin: round(median(durations)),
        longestSessionMin: durations.length ? Math.max(...durations) : 0,
      },
      daily: days.map((d) => ({
        date: d.day,
        activeMinutes: d.activeMinutes,
        requests: d.requests,
        actions: d.writes,
      })),
      // Свежие сессии сверху: смотрят обычно «что человек делал в последний раз».
      sessions: [...sessions].reverse().map((s) => ({
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationMin: s.durationMin,
        activeMinutes: s.activeMinutes,
        requests: s.requests,
        actions: s.writes,
      })),
      sections: sectionRows
        .map((r) => ({
          section: r.section,
          minutes: r._sum.minutes ?? 0,
          requests: r._sum.requests ?? 0,
          actions: r._sum.writes ?? 0,
        }))
        .sort((a, b) => b.minutes - a.minutes),
      caveats: CAVEATS,
    };
  }

  /**
   * Когортное удержание по неделям регистрации.
   *
   * Строка — неделя, в которую люди зарегистрировались; колонки — сколько из
   * них заходило спустя 0, 1, 2… недели. Неделя 0 меньше 100% не случайно:
   * часть регистраций не доходит даже до первого содержательного захода.
   */
  async retention(dto: RetentionQueryDto) {
    const weeks = dto.weeks ?? 8;
    const tz = dto.tzOffsetMinutes ?? 0;
    const now = new Date();
    const anchor = floorToWeek(
      new Date(now.getTime() - (weeks - 1) * WEEK_MS),
      tz,
    );

    const [users, activeWeeks] = await Promise.all([
      this.prisma.user.findMany({
        where: { createdAt: { gte: anchor } },
        select: { id: true, createdAt: true },
      }),
      queryActiveWeeks(this.prisma, anchor, anchor),
    ]);

    const activeByUser = new Map<string, Set<number>>();
    for (const row of activeWeeks) {
      const set = activeByUser.get(row.userId) ?? new Set<number>();
      set.add(row.week);
      activeByUser.set(row.userId, set);
    }

    const currentWeek = Math.floor(
      (now.getTime() - anchor.getTime()) / WEEK_MS,
    );
    const cohorts = new Map<number, string[]>();
    for (const user of users) {
      const week = Math.floor(
        (user.createdAt.getTime() - anchor.getTime()) / WEEK_MS,
      );
      cohorts.set(week, [...(cohorts.get(week) ?? []), user.id]);
    }

    const rows = [...cohorts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([week, ids]) => ({
        cohortStart: new Date(anchor.getTime() + week * WEEK_MS),
        size: ids.length,
        weeks: range(0, currentWeek - week).map((offset) => {
          const retained = ids.filter((id) =>
            activeByUser.get(id)?.has(week + offset),
          ).length;
          return {
            offset,
            users: retained,
            pct: round(divide(retained, ids.length) * 100),
          };
        }),
      }));

    return { anchor, weeks, currentWeek, cohorts: rows };
  }

  /**
   * Путь, по которому продукт считается пройденным (см. CLAUDE.md, «Готовность»):
   * регистрация → ключи биржи → свои сделки → первый тег → первый срез статистики.
   *
   * Считается за всё время, а не за окно отчёта: это жизненный путь аккаунта, и
   * человек, подключивший ключи полгода назад, ступень прошёл.
   */
  private async lifetimeFunnel() {
    const [
      registered,
      connected,
      withTrades,
      withTags,
      taggedTrades,
      taggedPositions,
      readStats,
      returned,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.exchangeConnection
        .findMany({ select: { userId: true }, distinct: ['userId'] })
        .then((r) => r.length),
      this.prisma.trade
        .findMany({ select: { userId: true }, distinct: ['userId'] })
        .then((r) => r.length),
      this.prisma.tag.findMany({
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.trade
        .findMany({
          where: { tags: { some: {} } },
          select: { userId: true },
          distinct: ['userId'],
        })
        .then((r) => r.map((x) => x.userId)),
      this.prisma.positionTag
        .findMany({ select: { userId: true }, distinct: ['userId'] })
        .then((r) => r.map((x) => x.userId)),
      this.prisma.userSectionDay
        .findMany({
          where: { section: { in: ['stats', 'lab', 'habits'] } },
          select: { userId: true },
          distinct: ['userId'],
        })
        .then((r) => r.length),
      countReturningUsers(this.prisma),
    ]);

    // Разметка засчитывается и по закрытым сделкам, и по открытым позициям:
    // тег на открытой позиции — это тот же ручной труд, просто раньше по времени.
    const tagged = new Set([...taggedTrades, ...taggedPositions]).size;

    return {
      registered,
      connectedExchange: connected,
      syncedTrades: withTrades,
      createdTag: withTags.length,
      taggedSomething: tagged,
      readStats,
      returnedAnotherDay: returned,
    };
  }

  /** Чем пользуются: минуты и действия по разделам за окно. */
  private async sectionUsage(period: ResolvedPeriod) {
    const rows = await this.prisma.userSectionDay.groupBy({
      by: ['section', 'userId'],
      where: { day: { gte: floorToDay(period.from), lt: period.to } },
      _sum: { requests: true, writes: true, minutes: true },
    });

    const bySection = new Map<
      string,
      {
        section: string;
        users: number;
        minutes: number;
        requests: number;
        actions: number;
      }
    >();
    for (const row of rows) {
      const entry = bySection.get(row.section) ?? {
        section: row.section,
        users: 0,
        minutes: 0,
        requests: 0,
        actions: 0,
      };
      entry.users++;
      entry.minutes += row._sum.minutes ?? 0;
      entry.requests += row._sum.requests ?? 0;
      entry.actions += row._sum.writes ?? 0;
      bySection.set(row.section, entry);
    }

    return [...bySection.values()].sort((a, b) => b.minutes - a.minutes);
  }

  /** График по дням: аудитория, сессии и время. */
  private buildDailySeries(
    period: ResolvedPeriod,
    daily: {
      day: Date;
      activeUsers: number;
      activeMinutes: number;
      writes: number;
    }[],
    sessions: SessionRow[],
    users: { createdAt: Date }[],
  ) {
    const byDay = new Map(daily.map((d) => [d.day.getTime(), d]));

    // Сессия относится к суткам, в которые НАЧАЛАСЬ. Пересекающая полночь
    // засчитывается целиком первому дню — иначе одна сессия превращается в две.
    const sessionsByDay = new Map<number, SessionRow[]>();
    for (const s of sessions) {
      const key = floorToDay(s.startedAt, period.tzOffsetMinutes).getTime();
      sessionsByDay.set(key, [...(sessionsByDay.get(key) ?? []), s]);
    }

    const newByDay = new Map<number, number>();
    for (const u of users) {
      if (u.createdAt < period.from || u.createdAt >= period.to) continue;
      const key = floorToDay(u.createdAt, period.tzOffsetMinutes).getTime();
      newByDay.set(key, (newByDay.get(key) ?? 0) + 1);
    }

    const out: unknown[] = [];
    const firstDay = floorToDay(period.from, period.tzOffsetMinutes).getTime();
    for (let t = firstDay; t < period.to.getTime(); t += DAY_MS) {
      const day = byDay.get(t);
      const daySessions = sessionsByDay.get(t) ?? [];
      out.push({
        date: new Date(t),
        activeUsers: day?.activeUsers ?? 0,
        newUsers: newByDay.get(t) ?? 0,
        sessions: daySessions.length,
        minutesOnSite: sum(daySessions.map((s) => s.durationMin)),
        activeMinutes: day?.activeMinutes ?? 0,
        actions: day?.writes ?? 0,
      });
    }
    return out;
  }
}

/**
 * Оговорки едут вместе с числами, а не лежат в документации: метрику
 * присутствия слишком легко прочитать как «человек сидел и работал», и один
 * раз так прочитанная, она потом обосновывает решения.
 */
const CAVEATS = [
  'Время на сайте — это время с открытым приложением: фронтенд опрашивает API и с фоновой вкладки. Отделить присутствие человека можно будет по foreground, когда фронт начнёт слать заголовок X-Client-Active.',
  'Минуты по разделам не складываются во время на сайте: одна минута попадает в несколько разделов, если за неё открыли и журнал, и настройки.',
  'Сессия — это цепочка минут с паузой меньше ' +
    SESSION_GAP_MIN +
    ' минут, а не факт из базы; при другой паузе числа будут другими.',
];

export function resolvePeriod(dto: PeriodQueryDto): ResolvedPeriod {
  const tzOffsetMinutes = dto.tzOffsetMinutes ?? 0;
  const to = dto.to ? new Date(dto.to) : new Date();

  if (dto.from) {
    const from = new Date(dto.from);
    return {
      from,
      to,
      days: Math.max(1, Math.ceil((to.getTime() - from.getTime()) / DAY_MS)),
      tzOffsetMinutes,
    };
  }

  const days = dto.days ?? DEFAULT_PERIOD_DAYS;
  // Окно начинается с НАЧАЛА суток: иначе «за 7 дней» это шесть с хвостом,
  // и первый столбик графика всегда занижен на случайную величину.
  const from = new Date(
    floorToDay(to, tzOffsetMinutes).getTime() - (days - 1) * DAY_MS,
  );
  return { from, to, days, tzOffsetMinutes };
}

function compareBy(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  field: UserSortField,
  order: 'asc' | 'desc',
): number {
  const dir = order === 'asc' ? 1 : -1;
  const av = a[field === 'createdAt' ? 'registeredAt' : field];
  const bv = b[field === 'createdAt' ? 'registeredAt' : field];
  // Никогда не заходившие уезжают вниз при любой сортировке: они не «самые
  // старые», о них просто нет данных.
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  const an = av instanceof Date ? av.getTime() : Number(av);
  const bn = bv instanceof Date ? bv.getTime() : Number(bv);
  return an === bn ? 0 : (an < bn ? -1 : 1) * dir;
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

function avg(values: number[]): number {
  return values.length ? sum(values) / values.length : 0;
}

function divide(a: number, b: number): number {
  return b ? a / b : 0;
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}
