import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CoinsService } from '../coins/coins.service';
import { PrismaService } from '../prisma/prisma.service';
import { dailyAlreadyClaimed, nothingToClaim } from './battlepass-errors';
import { dailyState, dayKey, recentDayKeys, startOfUtcDay } from './daily';
import { coinsBetween, ladder, levelFromXp, rewardCoins } from './levels';
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

  /**
   * Забрать всё, что накопилось. Одним действием и подряд: награда одного вида
   * — монеты, и выбирать, какую монету получить раньше, незачем.
   *
   * Защита от двойного клика — compare-and-set в самом UPDATE (`claimedLevel`
   * равен прочитанному), тот же приём, что у списания монет: два запроса иначе
   * выдали бы награду дважды, и ни один не был бы неправ по отдельности.
   */
  async claim(userId: string, now: Date = new Date()) {
    const season = seasonKey(now);
    return this.prisma.$transaction(async (tx) => {
      const progress = await tx.battlePassProgress.findUnique({
        where: { userId_season: { userId, season } },
      });
      if (!progress) throw nothingToClaim();

      // Снимок «от какого уровня» берём один раз, до UPDATE: ниже используем
      // его же в цикле, а не перечитываем `progress.claimedLevel` — Prisma не
      // мутирует объект в JS, но полагаться на это не стоит, раз значение уже
      // под рукой.
      const fromLevel = progress.claimedLevel;
      const { level } = levelFromXp(progress.xp);
      const coins = coinsBetween(fromLevel, level);
      if (coins <= 0) throw nothingToClaim();

      const moved = await tx.battlePassProgress.updateMany({
        where: { userId, season, claimedLevel: fromLevel },
        data: { claimedLevel: level },
      });
      if (moved.count !== 1) throw nothingToClaim();

      // Строка журнала на уровень, а не одна на клик: одно событие — одна
      // строка, и уникальный ключ журнала тогда сторожит каждый уровень.
      for (let l = Math.max(2, fromLevel + 1); l <= level; l++) {
        await this.coins.credit(tx, userId, rewardCoins(l), 'BATTLEPASS_REWARD', `${season}:${l}`);
      }

      const user = await tx.user.findUnique({ where: { id: userId }, select: { coinBalance: true } });
      return { claimedLevel: level, coins, balance: user?.coinBalance ?? 0 };
    });
  }

  /**
   * Ежедневная награда за заход. Своего состояния не имеет: и «забрал ли
   * сегодня», и «какой день подряд» выводятся из строк журнала монет.
   *
   * Гонку двух вкладок ловит уникальный ключ журнала `(userId, kind, refId)`, а
   * не проверка выше по коду: проверка отвечает за понятный отказ, ключ — за
   * то, что второй выплаты не будет. Перехват P2002 стоит СНАРУЖИ транзакции:
   * в PostgreSQL упавший оператор прерывает её целиком, и продолжать там
   * нечего — только перевести ошибку в отказ.
   */
  async claimDaily(userId: string, now: Date = new Date()) {
    const today = dayKey(now);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.coinTransaction.findMany({
          where: { userId, kind: 'DAILY_REWARD', refId: { in: recentDayKeys(now) } },
          select: { refId: true },
        });
        const state = dailyState(new Set(claimed.map((r) => r.refId)), now);
        if (state.claimedToday) throw dailyAlreadyClaimed();

        await this.coins.credit(tx, userId, state.coins, 'DAILY_REWARD', today);
        const user = await tx.user.findUnique({ where: { id: userId }, select: { coinBalance: true } });
        return { day: state.day, streak: state.streak + 1, coins: state.coins, balance: user?.coinBalance ?? 0 };
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw dailyAlreadyClaimed();
      throw e;
    }
  }
}
