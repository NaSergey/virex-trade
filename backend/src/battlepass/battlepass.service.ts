import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CoinsService } from '../coins/coins.service';
import { PrismaService } from '../prisma/prisma.service';
import { dailyState, recentDayKeys, startOfUtcDay } from './daily';
import { coinsBetween, ladder, levelFromXp } from './levels';
import { seasonBounds, seasonKey } from './season';
import { XP_SOURCES, type XpSource } from './xp-registry';

/**
 * Battle Pass: опыт за игры, сезонные уровни и награды за них.
 *
 * Метод, который пишет XP, принимает клиент транзакции, а не открывает свою, —
 * как `CoinsService`. Опыт начисляется только вместе с тем, ради чего его
 * тронули: отдельная транзакция означала бы состояние, где турнир
 * финализирован и призы выплачены, а опыта за него нет.
 */
@Injectable()
export class BattlePassService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coins: CoinsService,
  ) {}

  /**
   * Начислить XP за событие. Повторный вызов с тем же `(userId, source, refId)`
   * не начисляет ничего и, главное, НЕ роняет транзакцию вызывающего: событие
   * уже разобрано, и ронять из-за этого финал турнира с выплатами нельзя.
   *
   * Отсюда `createMany({ skipDuplicates })`, а не `create` с перехватом P2002:
   * в PostgreSQL упавший оператор переводит всю транзакцию в прерванное
   * состояние, и пойманная ошибка её уже не спасёт. `skipDuplicates` —
   * это `ON CONFLICT DO NOTHING`: конфликт не поднимает ошибку вовсе, а
   * `count === 0` и есть признак повтора.
   */
  async award(
    tx: Prisma.TransactionClient,
    userId: string,
    source: XpSource,
    refId: string,
    xp: number,
    now: Date = new Date(),
  ): Promise<void> {
    const def = XP_SOURCES[source];
    if (!def?.enabled) return;

    const season = seasonKey(now);
    const granted = await this.withinDailyCap(tx, userId, source, xp, now);

    const written = await tx.battlePassXpEvent.createMany({
      data: [{ userId, season, source, refId, xp: granted }],
      skipDuplicates: true,
    });
    if (written.count === 0) return;
    if (granted === 0) return;

    await tx.battlePassProgress.upsert({
      where: { userId_season: { userId, season } },
      create: { userId, season, xp: granted },
      update: { xp: { increment: granted } },
    });
  }

  /** Сколько из запрошенного помещается в сегодняшний потолок источника. */
  private async withinDailyCap(
    tx: Prisma.TransactionClient,
    userId: string,
    source: XpSource,
    xp: number,
    now: Date,
  ): Promise<number> {
    const wanted = Math.max(0, Math.floor(xp));
    const cap = XP_SOURCES[source].dailyCap;
    if (cap == null || wanted === 0) return wanted;

    const today = await tx.battlePassXpEvent.aggregate({
      where: { userId, source, createdAt: { gte: startOfUtcDay(now) } },
      _sum: { xp: true },
    });
    const used = today._sum.xp ?? 0;
    return Math.max(0, Math.min(wanted, cap - used));
  }

  /** Всё, что показывает страница профиля. Ничего не пишет. */
  async state(userId: string, now: Date = new Date()) {
    const season = seasonKey(now);
    const [progress, claimedDays] = await Promise.all([
      this.prisma.battlePassProgress.findUnique({ where: { userId_season: { userId, season } } }),
      this.prisma.coinTransaction.findMany({
        where: { userId, kind: 'DAILY_REWARD', refId: { in: recentDayKeys(now) } },
        select: { refId: true },
      }),
    ]);

    const xp = progress?.xp ?? 0;
    const claimedLevel = progress?.claimedLevel ?? 0;
    const { level, xpIntoLevel, xpToNext } = levelFromXp(xp);

    return {
      season: { key: season, endsAt: seasonBounds(season).endsAt },
      xp,
      level,
      xpIntoLevel,
      xpToNext,
      claimedLevel,
      pendingCoins: coinsBetween(claimedLevel, level),
      levels: ladder().map((row) => ({
        ...row,
        state: row.level <= claimedLevel ? 'claimed' : row.level <= level ? 'ready' : 'locked',
      })),
      daily: dailyState(new Set(claimedDays.map((r) => r.refId)), now),
    };
  }
}
