import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { startOfUtcDay } from '../battlepass/daily';
import { levelFromXp } from '../battlepass/levels';
import { seasonBounds, seasonKey } from '../battlepass/season';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { demoLocked, isDemoEmail } from '../auth/demo-account';
import { assertReadableName } from '../auth/identity-rules';
import { achievementsOf } from './achievements';
import { AVATAR_MAX_BYTES, avatarUrl, sniffImage } from './avatar';
import { queryActions, queryXpByDay } from './profile-queries';
import {
  DAY_MS,
  RECENT_DAYS,
  balanceSeries,
  bestRun,
  countOf,
  gamesOf,
  xpByDay,
} from './series';

/** Сколько строк журнала монет в ленте профиля. */
export const FEED_LIMIT = 20;

/**
 * Баланс, с которого начинается каждый аккаунт, — дефолт колонки
 * `User.coinBalance`. Журнал ведётся от этой отметки, поэтому у нового
 * аккаунта максимум `balanceAfter` пуст, а баланс уже был тысячей.
 */
const START_BALANCE = 1000;

const notFound = () => new NotFoundException({ message: 'Игрок не найден', code: 'PROFILE_NOT_FOUND' });

/**
 * id пользователя — UUID. Чужой адрес `/profile/<что угодно>` отвечает 404
 * сразу, а не запросом в базу с заведомо невозможным ключом.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Профиль игрока — всё, что рисует дашборд, и одинаково для своего и чужого
 * (решение владельца 2026-10-01: чужой видит всё). Поэтому уровень сезона,
 * баланс и место в рейтинге едут здесь же, а не своими ключами: те ключи —
 * смотрящего. Почты в ответе нет — это не статистика.
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournaments: TournamentsService,
  ) {}

  async overview(userId: string, now: Date = new Date()) {
    if (!UUID.test(userId)) throw notFound();
    const windowStart = new Date(startOfUtcDay(now).getTime() - (RECENT_DAYS - 1) * DAY_MS);
    const season = seasonKey(now);

    const [
      user,
      actions,
      xp,
      recent,
      before,
      feed,
      finished,
      wins,
      seasons,
      jetpack,
      maxBalance,
      daily,
      rating,
    ] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, createdAt: true, coinBalance: true, avatarAt: true },
        }),
        queryActions(this.prisma, userId),
        queryXpByDay(this.prisma, userId, windowStart),
        this.prisma.coinTransaction.findMany({
          where: { userId, createdAt: { gte: windowStart } },
          select: { createdAt: true, delta: true, balanceAfter: true },
        }),
        this.prisma.coinTransaction.findFirst({
          where: { userId, createdAt: { lt: windowStart } },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, delta: true, balanceAfter: true },
        }),
        // Вторым ключом — id: награды сезона за несколько уровней пишутся одной
        // транзакцией с одним `createdAt`, и без него порядок таких строк плавал бы.
        this.prisma.coinTransaction.findMany({
          where: { userId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: FEED_LIMIT,
          select: { id: true, createdAt: true, kind: true, delta: true, balanceAfter: true },
        }),
        // Доигранный турнир — тот, где финал проставил место; те же условия,
        // что у рейтинга игры, иначе значок и рейтинг считали бы по-разному.
        this.prisma.tournamentParticipant.count({
          where: { userId, place: { not: null }, tournament: { status: 'finished' } },
        }),
        this.prisma.tournamentParticipant.count({
          where: { userId, place: 1, tournament: { status: 'finished' } },
        }),
        this.prisma.battlePassProgress.findMany({ where: { userId }, select: { season: true, xp: true } }),
        this.prisma.jetpackBet.aggregate({ where: { userId }, _max: { cashoutX100: true } }),
        this.prisma.coinTransaction.aggregate({ where: { userId }, _max: { balanceAfter: true } }),
        this.prisma.coinTransaction.findMany({
          where: { userId, kind: 'DAILY_REWARD' },
          select: { refId: true },
        }),
        this.tournaments.ratingOf(userId),
      ]);
    if (!user) throw notFound();

    const balance = user.coinBalance;
    const seasonXp = seasons.find((s) => s.season === season)?.xp ?? 0;
    // Рекорды — те же величины, что проверяют значки, но без потолка цели:
    // значок «×10» получен, а рекорд — ×37.40.
    const records = {
      bestX100: jetpack._max.cashoutX100 ?? 0,
      bestStreak: bestRun(daily.map((d) => d.refId)),
      peakBalance: Math.max(START_BALANCE, balance, maxBalance._max.balanceAfter ?? 0),
    };
    const toRow = (r: { createdAt: Date; delta: number; balanceAfter: number }) => ({
      at: r.createdAt,
      delta: r.delta,
      balanceAfter: r.balanceAfter,
    });

    return {
      user: { id: userId, name: user.name, avatar: avatarUrl(userId, user.avatarAt) },
      season: { key: season, endsAt: seasonBounds(season).endsAt, xp: seasonXp, ...levelFromXp(seasonXp) },
      balance,
      rating,
      records,
      since: user.createdAt.toISOString(),
      games: gamesOf(actions, now),
      xpSeries: xpByDay(xp, now),
      coinSeries: balanceSeries(recent.map(toRow), before ? toRow(before) : null, balance, now),
      achievements: achievementsOf({
        tournamentsFinished: finished,
        tournamentWins: wins,
        bestDailyRun: records.bestStreak,
        maxSeasonLevel: seasons.reduce((max, s) => Math.max(max, levelFromXp(s.xp).level), 1),
        jetpackRounds: countOf(actions, 'jetpack'),
        jetpackBestX100: records.bestX100,
        pokerHands: countOf(actions, 'poker'),
        blackjackHands: countOf(actions, 'blackjack'),
        maxBalance: records.peakBalance,
      }),
      feed: feed.map((r) => ({
        id: r.id,
        at: r.createdAt.toISOString(),
        kind: r.kind,
        delta: r.delta,
        balanceAfter: r.balanceAfter,
      })),
    };
  }

  /**
   * Поставить картинку. Байты и версия на `User` — одной транзакцией: иначе
   * адрес с новой версией мог бы уйти раньше, чем картинка, и браузер
   * закэшировал бы на год старую под новым адресом.
   */
  async setAvatar(userId: string, file: Buffer | undefined) {
    // Первым: демо-аккаунт получает «аккаунт общий» при любом файле, а не
    // разбор того, что именно в файле не так.
    await this.assertEditable(userId);
    if (!file || file.length === 0) {
      throw new BadRequestException({ message: 'Файл не пришёл', code: 'AVATAR_EMPTY' });
    }
    if (file.length > AVATAR_MAX_BYTES) {
      throw new PayloadTooLargeException({ message: 'Картинка больше 64 КБ', code: 'AVATAR_TOO_LARGE' });
    }
    const mime = sniffImage(file);
    if (!mime) {
      throw new BadRequestException({ message: 'Нужна картинка PNG, JPEG или WebP', code: 'AVATAR_TYPE' });
    }
    const at = new Date();
    const data = new Uint8Array(file);
    await this.prisma.$transaction([
      this.prisma.userAvatar.upsert({
        where: { userId },
        create: { userId, data, mime },
        update: { data, mime },
      }),
      this.prisma.user.update({ where: { id: userId }, data: { avatarAt: at } }),
    ]);
    return { avatar: avatarUrl(userId, at) };
  }

  async removeAvatar(userId: string) {
    await this.assertEditable(userId);
    await this.prisma.$transaction([
      this.prisma.userAvatar.deleteMany({ where: { userId } }),
      this.prisma.user.update({ where: { id: userId }, data: { avatarAt: null } }),
    ]);
    return { avatar: null };
  }

  /**
   * Новое имя из настроек профиля. Проверки — у `NameDto` (те же, что при
   * регистрации); демо-аккаунт — 403: его имя видит каждый посетитель витрины.
   */
  async setName(userId: string, name: string) {
    await this.assertEditable(userId);
    assertReadableName(name);
    return this.prisma.user.update({ where: { id: userId }, data: { name }, select: { name: true } });
  }

  /** Своё в профиле меняет кто угодно, кроме общего демо-аккаунта. */
  private async assertEditable(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user) throw notFound();
    if (isDemoEmail(user.email)) throw demoLocked();
  }

  /** Байты картинки для отдачи; нет картинки или игрока — 404. */
  async readAvatar(userId: string) {
    if (!UUID.test(userId)) throw notFound();
    const row = await this.prisma.userAvatar.findUnique({ where: { userId }, select: { data: true, mime: true } });
    if (!row) throw notFound();
    return row;
  }
}
