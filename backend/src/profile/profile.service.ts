import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { startOfUtcDay } from '../battlepass/daily';
import { levelFromXp } from '../battlepass/levels';
import { seasonBounds, seasonKey } from '../battlepass/season';
import { DataVersionService } from '../prisma/data-version.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { AggregateCacheService, cacheKey } from '../trades/aggregate-cache';
import { demoLocked, isDemoEmail } from '../auth/demo-account';
import { collapseToPositions } from '../trades/positions';
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

/** Сколько позиций на листе чужого журнала сделок — и наибольший лист, который можно попросить. */
export const TRADES_PAGE_SIZE = 20;

/**
 * Снимок открытой позиции старше этого не показывается: синк этого игрока не
 * идёт (ключ снят, биржа отказывает), и позиция могла давно закрыться. Синк
 * проходит всех раз в минуту, а пауза шлюза Bybit после бана IP — 11 минут:
 * окно длиннее паузы, чтобы вкладка не пропадала посреди неё.
 */
export const POSITION_FRESH_MS = 15 * 60_000;

/** Строки реестра открытых позиций со свежим снимком — общее условие признака и списка. */
const freshPositions = (userId: string, now: Date) => ({
  userId,
  size: { not: null },
  snapshotAt: { gte: new Date(now.getTime() - POSITION_FRESH_MS) },
});

/**
 * Поля чужой сделки — свой явный список, а не `select` журнала.
 *
 * Так публичная поверхность названа в одном месте: поле, добавленное журналу,
 * сюда не приезжает само. Тегов здесь нет намеренно (решение владельца
 * 2026-10-02): «почему вошёл» — личная заметка, и половина ценности разметки
 * держится на том, что человек пишет её себе. Рыночного контекста тоже нет —
 * строка чужого журнала не раскрывается, показывать его негде.
 */
/** Лист чужого журнала — то, что кладётся в кэш и уходит наружу. */
export interface ProfileTradesPage {
  total: number;
  page: number;
  pageSize: number;
  trades: Array<Omit<Prisma.TradeGetPayload<{ select: typeof PUBLIC_TRADE_SELECT }>, 'positionId'> & { parts: number }>;
}

const PUBLIC_TRADE_SELECT = {
  id: true,
  positionId: true,
  symbol: true,
  direction: true,
  qty: true,
  avgEntryPrice: true,
  avgExitPrice: true,
  closedPnl: true,
  openFee: true,
  closeFee: true,
  leverage: true,
  closedAt: true,
  openedAt: true,
} satisfies Prisma.TradeSelect;

/**
 * Баланс, с которого начинается каждый аккаунт, — дефолт колонки
 * `User.coinBalance`. Журнал ведётся от этой отметки, поэтому у нового
 * аккаунта максимум `balanceAfter` пуст, а баланс уже был тысячей.
 */
const START_BALANCE = 1000;

const notFound = () => new NotFoundException({ message: 'Игрок не найден', code: 'PROFILE_NOT_FOUND' });

/**
 * Отказ, а не пустой список: пустой читался бы как «не торгует», и это была бы
 * ложь о человеке, который просто закрыл показ.
 */
const tradesHidden = () =>
  new ForbiddenException({ message: 'Игрок скрыл свои сделки', code: 'PROFILE_TRADES_HIDDEN' });

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
    private readonly dataVersion: DataVersionService,
    private readonly cache: AggregateCacheService,
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
      exchangeTrades,
      openPosition,
    ] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, createdAt: true, coinBalance: true, avatarAt: true, showTrades: true },
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
        // `findFirst`, а не `count`: вкладке нужно только «есть ли вообще», и
        // этот запрос идёт на каждый просмотр любого профиля. Счёт обошёл бы
        // по индексу все сделки человека ради числа, которое нигде не
        // показывается, — а первая строка берётся за постоянное время.
        this.prisma.trade.findFirst({ where: { userId }, select: { id: true } }),
        // Признак вкладки «Открытые позиции» — так же первой строкой: число
        // нигде не показывается.
        this.prisma.openPositionSeen.findFirst({ where: freshPositions(userId, now), select: { id: true } }),
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
      /**
       * Есть ли у него настоящие сделки — по этому страница решает, заводить ли
       * вкладку «Биржа» (владелец: «если они есть»). Признак, а не число:
       * числа на странице нет, а закрытый показ не должен сообщать, сколько
       * сделок спрятано. Сам список отказывает отдельно.
       */
      hasExchangeTrades: user.showTrades && exchangeTrades !== null,
      /** Есть ли открытые позиции в свежем снимке синка — вкладка «Открытые позиции». */
      hasOpenPositions: user.showTrades && openPosition !== null,
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
        taggedTrades: countOf(actions, 'tag'),
        backtestSessions: countOf(actions, 'backtest'),
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
   * Настоящие сделки игрока — вкладка «Биржа» на его профиле.
   *
   * Лист режется после сборки позиций, а не в SQL, — как в журнале: одна
   * позиция собирается из нескольких закрывающих ордеров, и `LIMIT` в запросе
   * разрезал бы её пополам, разведя число сделок с тем, что показывает сам
   * игрок у себя.
   *
   * Поэтому же ответ идёт через тот же LRU-кэш, что и свой журнал
   * (`AggregateCacheService`, ключ — `(scope, userId, версия данных, лист)`):
   * чтение здесь стоит столько же, сколько лист своего журнала, но вызвать его
   * теперь может любой смотрящий, и повторно — на каждую перерисовку. Без
   * кэша один открытый профиль означал бы полное чтение чужого журнала на
   * каждый такой запрос. Запись протухает сама, когда синк поднимет версию
   * данных игрока, — отдельной инвалидации нет, как и у журнала.
   */
  async trades(userId: string, page = 1, pageSize = TRADES_PAGE_SIZE) {
    if (!UUID.test(userId)) throw notFound();
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { showTrades: true } });
    if (!user) throw notFound();
    if (!user.showTrades) throw tradesHidden();

    const current = Math.max(1, Math.floor(page) || 1);
    // Лист — столько строк, сколько влезает в окно смотрящего (профиль стоит в
    // экран без прокрутки), но не больше прежнего: мусор и запредельное — 20.
    const size =
      Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= TRADES_PAGE_SIZE ? pageSize : TRADES_PAGE_SIZE;
    // Своя область кэша, не `list`: набор полей здесь другой (без тегов и
    // контекста), и общий ключ отдал бы чужому профилю строку журнала.
    const key = cacheKey('profile-trades', userId, await this.dataVersion.get(userId), { page: current, size });
    const hit = this.cache.get<ProfileTradesPage>(key);
    if (hit) return hit;

    const rows = await this.prisma.trade.findMany({
      where: { userId },
      orderBy: { closedAt: 'desc' },
      select: PUBLIC_TRADE_SELECT,
    });
    const positions = collapseToPositions(rows);
    const from = (current - 1) * size;

    const out: ProfileTradesPage = {
      total: positions.length,
      page: current,
      pageSize: size,
      // positionId и tradeIds остаются на сервере: это ручки для разбора
      // позиции, а чужая строка не раскрывается.
      trades: positions.slice(from, from + size).map(({ positionId, tradeIds, ...trade }) => ({
        ...trade,
        parts: tradeIds.length,
      })),
    };
    this.cache.set(key, out);
    return out;
  }

  /**
   * Открытые позиции игрока — вкладка «Открытые позиции» его профиля.
   *
   * Снимок синка, а не биржа: журнал берёт позиции у биржи ключом владельца в
   * момент запроса, но чужой профиль так делать не может — каждый просмотр
   * любого профиля тратил бы общий бюджет шлюза Bybit. Синк и так читает
   * позиции раз в минуту и пишет их в `open_positions_seen`; цена и P&L здесь
   * отстают до минуты, и время снимка уходит наружу (`asOf`).
   */
  async positions(userId: string, now: Date = new Date()) {
    if (!UUID.test(userId)) throw notFound();
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { showTrades: true } });
    if (!user) throw notFound();
    if (!user.showTrades) throw tradesHidden();

    const rows = await this.prisma.openPositionSeen.findMany({
      where: freshPositions(userId, now),
      orderBy: { firstSeenAt: 'asc' },
      select: {
        symbol: true,
        direction: true,
        firstSeenAt: true,
        size: true,
        avgPrice: true,
        markPrice: true,
        positionValue: true,
        unrealisedPnl: true,
        leverage: true,
        liqPrice: true,
        snapshotAt: true,
      },
    });
    const live = rows.filter((r) => parseFloat(r.size ?? '') > 0);
    const asOf = live.reduce<Date | null>((m, r) => (r.snapshotAt && (!m || r.snapshotAt > m) ? r.snapshotAt : m), null);
    // Пустое поле — `undefined`, а не null: форма та же, что у позиции биржи,
    // где поле, которого биржа не сообщает, просто отсутствует.
    const opt = (v: string | null) => v ?? undefined;
    return {
      asOf: asOf?.toISOString() ?? null,
      positions: live.map((r) => ({
        symbol: r.symbol,
        direction: r.direction as 'long' | 'short',
        size: r.size as string,
        avgPrice: opt(r.avgPrice),
        markPrice: opt(r.markPrice),
        positionValue: opt(r.positionValue),
        unrealisedPnl: opt(r.unrealisedPnl),
        leverage: opt(r.leverage),
        liqPrice: opt(r.liqPrice),
        openedAt: r.firstSeenAt.toISOString(),
      })),
    };
  }

  /** Видят ли другие его сделки — состояние выключателя на странице настроек. */
  async privacy(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { showTrades: true } });
    if (!user) throw notFound();
    return { showTrades: user.showTrades };
  }

  async setPrivacy(userId: string, showTrades: boolean) {
    // Демо — витрина: посетитель не должен прятать её сделки от следующих.
    await this.assertEditable(userId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { showTrades },
      select: { showTrades: true },
    });
    return { showTrades: user.showTrades };
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
