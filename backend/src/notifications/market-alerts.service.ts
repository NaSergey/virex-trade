import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import { MarketEventsService } from '../market-events/market-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prefs, isEnabled } from './prefs';
import { PrefsService } from './prefs.service';
import { NotifierService } from './notifier.service';
import {
  NotificationStateBatch,
  NotificationStateService,
} from './notification-state.service';
import {
  HourCandle,
  bookSpreadPct,
  fngHolds,
  hourChangePct,
  hourDirection,
  hourMovePct,
  lsHolds,
  parseKline,
  peakHourOfWeekday,
  rangePct,
  rangeRatio,
  spreadRatio,
  weakWeekdays,
} from './market-metrics';
import { runsBackgroundJobs } from '../role';

const SYMBOL = 'BTCUSDT';
const TICK_MS = 5 * 60_000;
const BASELINE_HOURS = 7 * 24;
/** Сколько снимков стакана берём за базу: снимок раз в 15 минут → неделя. */
const BOOK_BASELINE_POINTS = 7 * 24 * 4;
/** За сколько минут до начала часа предупреждаем о нём. */
const HOUR_LEAD_MIN = 10;

/**
 * Все ключи сигналов этого сервиса — набор для {@link NotificationStateService.beginBatch}:
 * один findMany на тик поднимает состояния сразу по всем семи, а не по одному
 * на сигнал.
 */
const MARKET_NOTIF_KEYS = [
  'mkt.price1h',
  'mkt.vol1h',
  'mkt.volume',
  'mkt.fng',
  'mkt.ls',
  'mkt.book',
  'mkt.hour',
];

const WEEKDAY_NAMES = [
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
];

/**
 * Строка направления для карточки волатильности. Отдельной функцией, потому
 * что «куда пошла цена» и «насколько трясло» — разные вопросы, и час с большим
 * размахом честно может не иметь ответа на первый.
 */
const directionLine = (c: HourCandle): string => {
  const change = hourChangePct(c);
  const abs = `${Math.abs(change).toFixed(2)}%`;
  switch (hourDirection(c)) {
    case 'up':
      return `🟢 Вверх: +${abs}, цена <b>${c.close.toFixed(0)}</b>`;
    case 'down':
      return `🔴 Вниз: −${abs}, цена <b>${c.close.toFixed(0)}</b>`;
    default:
      return `⚪ Без направления: сводило в обе стороны, итог ${change >= 0 ? '+' : '−'}${abs}`;
  }
};

const fmtUsdCompact = (v: number): string => {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toFixed(0)}`;
};

/**
 * Семь рыночных сигналов по BTC, один тик на все. Заменяет
 * VolatilityAlertService: тот держал фронт нарастания в двух булевых полях
 * процесса, одинаковых для всех пользователей, — с персональными порогами
 * такой фронт неверен, а после перезапуска ещё и рассылался заново.
 *
 * Данные тянутся один раз на тик и раздаются всем пользователям: пороги у всех
 * разные, а рынок один.
 */
@Injectable()
export class MarketAlertsService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(MarketAlertsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly analytics: AnalyticsService,
    private readonly marketEvents: MarketEventsService,
    private readonly prisma: PrismaService,
    private readonly prefs: PrefsService,
    private readonly notifier: NotifierService,
    private readonly state: NotificationStateService,
  ) {}

  onApplicationBootstrap() {
    // T11: фоновый сервис — только роль worker (и дефолтная all).
    if (!runsBackgroundJobs()) return;
    this.tick().catch((e) =>
      this.logger.warn(`первый тик рыночных сигналов не прошёл: ${e}`),
    );
    this.timer = setInterval(() => {
      this.tick().catch((e) =>
        this.logger.warn(`тик рыночных сигналов не прошёл: ${e}`),
      );
    }, TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Настройки всех привязанных пользователей — один запрос (linkedUsers).
      // Раздаём их же в notifier ниже, вместо того чтобы он перечитывал
      // каждого пользователя заново на каждый сигнал (B1).
      const users = await this.prefs.linkedUsers();
      if (users.length === 0) return;
      // Считаем, что нужно, только если хоть кому-то это включено: тик не
      // должен ходить в шесть внешних API ради выключенных сигналов.
      const wanted = (key: string) =>
        users.some((u) => isEnabled(u.prefs, key));
      const ids = users.map((u) => u.id);
      const prefsById = new Map(users.map((u) => [u.id, u.prefs]));

      // Состояния фронта/cooldown по всем (пользователь × сигнал) — один
      // findMany на тик, а не findUnique+upsert на каждую пару (B1).
      const stateBatch = await this.state.beginBatch(ids, MARKET_NOTIF_KEYS);
      try {
        if (wanted('mkt.price1h') || wanted('mkt.vol1h')) {
          const candles = await this.candles();
          const last = candles.at(-1) ?? null;
          const baseline = candles.slice(0, -1);
          for (const userId of ids) {
            await this.priceMove(userId, last, prefsById, stateBatch);
            await this.volatility(
              userId,
              last,
              baseline,
              prefsById,
              stateBatch,
            );
          }
        }
        if (wanted('mkt.volume')) await this.volume(ids, prefsById, stateBatch);
        if (wanted('mkt.fng'))
          await this.fearAndGreed(ids, prefsById, stateBatch);
        if (wanted('mkt.ls')) await this.longShort(ids, prefsById, stateBatch);
        if (wanted('mkt.book')) await this.book(ids, prefsById, stateBatch);
        if (wanted('mkt.hour'))
          await this.volatileHour(ids, prefsById, stateBatch);
      } finally {
        // Пишем решения тика одним запросом, даже если один из чекеров упал —
        // иначе уже принятые в памяти решения (например, снятие фронта у
        // сигналов, отработавших раньше сбойного) потерялись бы молча.
        await stateBatch.flush();
      }
    } finally {
      this.running = false;
    }
  }

  /** Часовые свечи берём напрямую с биржи: hourly_prices отстаёт до получаса. */
  private async candles(): Promise<HourCandle[]> {
    try {
      const res = await fetch(
        `https://api.bybit.com/v5/market/kline?category=linear&symbol=${SYMBOL}&interval=60&limit=${BASELINE_HOURS + 1}`,
      );
      if (!res.ok) throw new Error(`kline ${res.status}`);
      const json = await res.json();
      return parseKline(json.result?.list);
    } catch (e) {
      this.logger.warn(`свечи BTC недоступны: ${e}`);
      return [];
    }
  }

  private async priceMove(
    userId: string,
    last: HourCandle | null,
    prefsById: Map<string, Prefs>,
    stateBatch: NotificationStateBatch,
  ): Promise<void> {
    if (!last) return;
    const prefs = prefsById.get(userId);
    if (!prefs) return;
    const threshold = await this.notifier.thresholdFor(
      userId,
      'mkt.price1h',
      prefs,
    );
    if (threshold == null) return;
    const move = hourMovePct(last);
    const up = last.close >= last.open;
    await this.notifier.maybeSend(
      userId,
      'mkt.price1h',
      move >= threshold,
      () => ({
        text: [
          `${up ? '🟢' : '🔴'} BTC ${up ? '+' : '−'}${move.toFixed(2)}% за час`,
          `Цена: <b>${last.close.toFixed(0)}</b>`,
        ].join('\n'),
      }),
      prefs,
      stateBatch,
    );
  }

  private async volatility(
    userId: string,
    last: HourCandle | null,
    baseline: HourCandle[],
    prefsById: Map<string, Prefs>,
    stateBatch: NotificationStateBatch,
  ): Promise<void> {
    if (!last) return;
    const prefs = prefsById.get(userId);
    if (!prefs) return;
    const threshold = await this.notifier.thresholdFor(
      userId,
      'mkt.vol1h',
      prefs,
    );
    if (threshold == null) return;
    const ratio = rangeRatio(last, baseline);
    if (ratio == null) return;
    await this.notifier.maybeSend(
      userId,
      'mkt.vol1h',
      ratio >= threshold,
      () => ({
        text: [
          `⚡ Волатильность BTC ×${ratio.toFixed(1)} к обычному часу`,
          `Размах часа: <b>${rangePct(last).toFixed(2)}%</b>`,
          directionLine(last),
        ].join('\n'),
      }),
      prefs,
      stateBatch,
    );
  }

  private async volume(
    userIds: string[],
    prefsById: Map<string, Prefs>,
    stateBatch: NotificationStateBatch,
  ): Promise<void> {
    const snap = await this.analytics.getVolatility(SYMBOL).catch(() => null);
    if (!snap) return;
    const side =
      snap.dominantSide === 'buy'
        ? '🟢 перевес в покупку'
        : snap.dominantSide === 'sell'
          ? '🔴 перевес в продажу'
          : '⚪ без явного перевеса';
    for (const userId of userIds) {
      const prefs = prefsById.get(userId);
      if (!prefs) continue;
      const threshold = await this.notifier.thresholdFor(
        userId,
        'mkt.volume',
        prefs,
      );
      if (threshold == null) continue;
      await this.notifier.maybeSend(
        userId,
        'mkt.volume',
        snap.volumeChangePct >= threshold,
        () => ({
          text: [
            '📊 Объём BTC выше обычного',
            `Сутки: <b>${fmtUsdCompact(snap.volume24hUsd)}</b> (+${snap.volumeChangePct.toFixed(1)}% к среднему за неделю)`,
            side,
          ].join('\n'),
        }),
        prefs,
        stateBatch,
      );
    }
  }

  private async fearAndGreed(
    userIds: string[],
    prefsById: Map<string, Prefs>,
    stateBatch: NotificationStateBatch,
  ): Promise<void> {
    const fng = await this.analytics.getFearAndGreed().catch(() => null);
    if (!fng) return;
    for (const userId of userIds) {
      const prefs = prefsById.get(userId);
      if (!prefs) continue;
      const threshold = await this.notifier.thresholdFor(
        userId,
        'mkt.fng',
        prefs,
      );
      if (threshold == null) continue;
      await this.notifier.maybeSend(
        userId,
        'mkt.fng',
        fngHolds(fng.value, threshold),
        () => ({
          text: `😱 Fear & Greed: <b>${fng.value}</b> — ${fng.classification}`,
        }),
        prefs,
        stateBatch,
      );
    }
  }

  private async longShort(
    userIds: string[],
    prefsById: Map<string, Prefs>,
    stateBatch: NotificationStateBatch,
  ): Promise<void> {
    // getLongShortRatio бросает HttpException — для фонового тика это просто
    // «в этот раз без сигнала».
    const data = await this.analytics
      .getLongShortRatio(SYMBOL)
      .catch(() => null);
    const point = data?.points.at(-1);
    if (!point) return;
    const buyPct = point.buyRatio * 100;
    for (const userId of userIds) {
      const prefs = prefsById.get(userId);
      if (!prefs) continue;
      const threshold = await this.notifier.thresholdFor(
        userId,
        'mkt.ls',
        prefs,
      );
      if (threshold == null) continue;
      await this.notifier.maybeSend(
        userId,
        'mkt.ls',
        lsHolds(buyPct, threshold),
        () => ({
          text: [
            '⚖️ Перекос позиций на Bybit',
            `Лонги: <b>${buyPct.toFixed(1)}%</b> · шорты: ${(100 - buyPct).toFixed(1)}%`,
          ].join('\n'),
        }),
        prefs,
        stateBatch,
      );
    }
  }

  private async book(
    userIds: string[],
    prefsById: Map<string, Prefs>,
    stateBatch: NotificationStateBatch,
  ): Promise<void> {
    const rows = await this.prisma.liquiditySnapshot.findMany({
      where: { symbol: SYMBOL },
      orderBy: { ts: 'desc' },
      take: BOOK_BASELINE_POINTS,
      select: { price: true, bidCenter: true, askCenter: true },
    });
    const last = rows[0];
    if (!last || rows.length < 2) return;
    const ratio = spreadRatio(last, rows.slice(1));
    if (ratio == null) return;
    for (const userId of userIds) {
      const prefs = prefsById.get(userId);
      if (!prefs) continue;
      const threshold = await this.notifier.thresholdFor(
        userId,
        'mkt.book',
        prefs,
      );
      if (threshold == null) continue;
      await this.notifier.maybeSend(
        userId,
        'mkt.book',
        ratio >= threshold,
        () => ({
          text: [
            `📖 Стакан BTC разъехался: ×${ratio.toFixed(1)} к обычному`,
            `Раздвижка: <b>${bookSpreadPct(last).toFixed(3)}%</b> от цены`,
          ].join('\n'),
        }),
        prefs,
        stateBatch,
      );
    }
  }

  /**
   * Предупреждение о волатильном часе — но только в тот день недели, в
   * который этот час действительно живее обычного.
   *
   * Раньше час сравнивался со средним сразу по всем дням: верхняя четверть
   * суток — это шесть часов, и они одни и те же каждый день, поэтому в чат
   * уходило до шести одинаковых сообщений в сутки. Теперь час сравнивается
   * сам с собой в другие дни недели, и кандидат в сутках остаётся ровно один
   * или ни одного (см. peakHourOfWeekday).
   */
  private async volatileHour(
    userIds: string[],
    prefsById: Map<string, Prefs>,
    stateBatch: NotificationStateBatch,
  ): Promise<void> {
    const now = new Date();
    // Сигнал предупреждающий, поэтому он живёт последние десять минут часа.
    const holds = now.getUTCMinutes() >= 60 - HOUR_LEAD_MIN;

    if (!holds) {
      // Вне окна условие заведомо ложно, но снять фронт всё равно нужно.
      // С батчем это уже не N походов в БД (findUnique+upsert на человека),
      // а обновление в памяти — flush() тика запишет их одним запросом
      // вместе со всем остальным (B1, п.3).
      for (const userId of userIds) {
        const prefs = prefsById.get(userId);
        if (!prefs) continue;
        await this.notifier.maybeSend(
          userId,
          'mkt.hour',
          false,
          () => ({ text: '' }),
          prefs,
          stateBatch,
        );
      }
      return;
    }

    // День берём по часу, о котором предупреждаем, а не по текущему: в 23:50
    // UTC речь уже о первом часе следующего дня недели.
    const next = new Date(now.getTime() + HOUR_LEAD_MIN * 60_000);
    const nextHour = next.getUTCHours();
    const nextWeekday = next.getUTCDay();

    const [{ cells }, { weekday }] = await Promise.all([
      this.marketEvents.getWeekdayHourStats(),
      this.marketEvents.getCorrelation(),
    ]);
    const weak = weakWeekdays(weekday);
    // Порог у пользователей свой, а таблица одна: разбор считается на каждое
    // встреченное значение порога, а не на каждого пользователя.
    const picks = new Map<number, ReturnType<typeof peakHourOfWeekday>>();

    for (const userId of userIds) {
      const prefs = prefsById.get(userId);
      if (!prefs) continue;
      const minRatio = await this.notifier.thresholdFor(
        userId,
        'mkt.hour',
        prefs,
      );
      if (minRatio == null) continue;
      if (!picks.has(minRatio)) {
        picks.set(minRatio, peakHourOfWeekday(cells, nextWeekday, minRatio));
      }
      const pick = picks.get(minRatio) ?? null;
      if (!pick || pick.hour !== nextHour) {
        await this.notifier.maybeSend(
          userId,
          'mkt.hour',
          false,
          () => ({ text: '' }),
          prefs,
          stateBatch,
        );
        continue;
      }

      await this.notifier.maybeSend(
        userId,
        'mkt.hour',
        true,
        () => {
          const lines = [
            `⏰ Через ${HOUR_LEAD_MIN} минут начинается ${String(nextHour).padStart(2, '0')}:00 UTC`,
            `${WEEKDAY_NAMES[nextWeekday]} — самый волатильный день недели в этот час:`,
            `размах <b>${pick.avgVolatilityPct.toFixed(2)}%</b> против ${pick.weekAvgPct.toFixed(2)}% в среднем по неделе.`,
          ];
          if (weak.includes(nextWeekday)) {
            lines.push(
              'Сегодня лонг закрывается в плюс реже, чем в половине случаев.',
            );
          }
          return { text: lines.join('\n') };
        },
        prefs,
        stateBatch,
      );
    }
  }
}
