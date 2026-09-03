import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import { MarketEventsService } from '../market-events/market-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { isEnabled } from './prefs';
import { PrefsService } from './prefs.service';
import { NotifierService } from './notifier.service';
import {
  HourCandle,
  bookSpreadPct,
  fngHolds,
  hourMovePct,
  lsHolds,
  parseKline,
  rangePct,
  rangeRatio,
  spreadRatio,
  topQuartileHours,
  weakWeekdays,
} from './market-metrics';

const SYMBOL = 'BTCUSDT';
const TICK_MS = 5 * 60_000;
const BASELINE_HOURS = 7 * 24;
/** Сколько снимков стакана берём за базу: снимок раз в 15 минут → неделя. */
const BOOK_BASELINE_POINTS = 7 * 24 * 4;
/** За сколько минут до начала часа предупреждаем о нём. */
const HOUR_LEAD_MIN = 10;

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
export class MarketAlertsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MarketAlertsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly analytics: AnalyticsService,
    private readonly marketEvents: MarketEventsService,
    private readonly prisma: PrismaService,
    private readonly prefs: PrefsService,
    private readonly notifier: NotifierService,
  ) {}

  onApplicationBootstrap() {
    this.tick().catch((e) => this.logger.warn(`первый тик рыночных сигналов не прошёл: ${e}`));
    this.timer = setInterval(() => {
      this.tick().catch((e) => this.logger.warn(`тик рыночных сигналов не прошёл: ${e}`));
    }, TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const users = await this.prefs.linkedUsers();
      if (users.length === 0) return;
      // Считаем, что нужно, только если хоть кому-то это включено: тик не
      // должен ходить в шесть внешних API ради выключенных сигналов.
      const wanted = (key: string) => users.some((u) => isEnabled(u.prefs, key));
      const ids = users.map((u) => u.id);

      if (wanted('mkt.price1h') || wanted('mkt.vol1h')) {
        const candles = await this.candles();
        const last = candles.at(-1) ?? null;
        const baseline = candles.slice(0, -1);
        for (const userId of ids) {
          await this.priceMove(userId, last);
          await this.volatility(userId, last, baseline);
        }
      }
      if (wanted('mkt.volume')) await this.volume(ids);
      if (wanted('mkt.fng')) await this.fearAndGreed(ids);
      if (wanted('mkt.ls')) await this.longShort(ids);
      if (wanted('mkt.book')) await this.book(ids);
      if (wanted('mkt.hour')) await this.volatileHour(ids);
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

  private async priceMove(userId: string, last: HourCandle | null): Promise<void> {
    if (!last) return;
    const threshold = await this.notifier.thresholdFor(userId, 'mkt.price1h');
    if (threshold == null) return;
    const move = hourMovePct(last);
    const up = last.close >= last.open;
    await this.notifier.maybeSend(userId, 'mkt.price1h', move >= threshold, () => ({
      text: [
        `${up ? '🟢' : '🔴'} BTC ${up ? '+' : '−'}${move.toFixed(2)}% за час`,
        `Цена: <b>${last.close.toFixed(0)}</b>`,
      ].join('\n'),
    }));
  }

  private async volatility(
    userId: string,
    last: HourCandle | null,
    baseline: HourCandle[],
  ): Promise<void> {
    if (!last) return;
    const threshold = await this.notifier.thresholdFor(userId, 'mkt.vol1h');
    if (threshold == null) return;
    const ratio = rangeRatio(last, baseline);
    if (ratio == null) return;
    await this.notifier.maybeSend(userId, 'mkt.vol1h', ratio >= threshold, () => ({
      text: [
        `⚡ Волатильность BTC ×${ratio.toFixed(1)} к обычному часу`,
        `Размах часа: <b>${rangePct(last).toFixed(2)}%</b>`,
      ].join('\n'),
    }));
  }

  private async volume(userIds: string[]): Promise<void> {
    const snap = await this.analytics.getVolatility(SYMBOL).catch(() => null);
    if (!snap) return;
    const side =
      snap.dominantSide === 'buy'
        ? '🟢 перевес в покупку'
        : snap.dominantSide === 'sell'
          ? '🔴 перевес в продажу'
          : '⚪ без явного перевеса';
    for (const userId of userIds) {
      const threshold = await this.notifier.thresholdFor(userId, 'mkt.volume');
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
      );
    }
  }

  private async fearAndGreed(userIds: string[]): Promise<void> {
    const fng = await this.analytics.getFearAndGreed().catch(() => null);
    if (!fng) return;
    for (const userId of userIds) {
      const threshold = await this.notifier.thresholdFor(userId, 'mkt.fng');
      if (threshold == null) continue;
      await this.notifier.maybeSend(userId, 'mkt.fng', fngHolds(fng.value, threshold), () => ({
        text: `😱 Fear & Greed: <b>${fng.value}</b> — ${fng.classification}`,
      }));
    }
  }

  private async longShort(userIds: string[]): Promise<void> {
    // getLongShortRatio бросает HttpException — для фонового тика это просто
    // «в этот раз без сигнала».
    const data = await this.analytics.getLongShortRatio(SYMBOL).catch(() => null);
    const point = data?.points.at(-1);
    if (!point) return;
    const buyPct = point.buyRatio * 100;
    for (const userId of userIds) {
      const threshold = await this.notifier.thresholdFor(userId, 'mkt.ls');
      if (threshold == null) continue;
      await this.notifier.maybeSend(userId, 'mkt.ls', lsHolds(buyPct, threshold), () => ({
        text: [
          '⚖️ Перекос позиций на Bybit',
          `Лонги: <b>${buyPct.toFixed(1)}%</b> · шорты: ${(100 - buyPct).toFixed(1)}%`,
        ].join('\n'),
      }));
    }
  }

  private async book(userIds: string[]): Promise<void> {
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
      const threshold = await this.notifier.thresholdFor(userId, 'mkt.book');
      if (threshold == null) continue;
      await this.notifier.maybeSend(userId, 'mkt.book', ratio >= threshold, () => ({
        text: [
          `📖 Стакан BTC разъехался: ×${ratio.toFixed(1)} к обычному`,
          `Раздвижка: <b>${bookSpreadPct(last).toFixed(3)}%</b> от цены`,
        ].join('\n'),
      }));
    }
  }

  private async volatileHour(userIds: string[]): Promise<void> {
    const now = new Date();
    const minutes = now.getUTCMinutes();
    // Сигнал предупреждающий, поэтому он живёт последние десять минут часа.
    const holds = minutes >= 60 - HOUR_LEAD_MIN;
    const nextHour = (now.getUTCHours() + 1) % 24;

    const [{ hourly }, { weekday }] = await Promise.all([
      this.marketEvents.getHourlyStats(),
      this.marketEvents.getCorrelation(),
    ]);
    const top = topQuartileHours(hourly);
    const weak = weakWeekdays(weekday);
    const hourIsTop = top.includes(nextHour);

    for (const userId of userIds) {
      const mode = await this.notifier.thresholdFor(userId, 'mkt.hour');
      if (mode == null) continue;
      await this.notifier.maybeSend(userId, 'mkt.hour', holds && hourIsTop, () => {
        const lines = [
          `⏰ Через ${HOUR_LEAD_MIN} минут начинается ${String(nextHour).padStart(2, '0')}:00 UTC`,
          'Исторически один из самых волатильных часов суток.',
        ];
        // mode = 1 — «час + слабый день»: строка про день добавляется к тому
        // же сообщению, отдельным сигналом день не ходит.
        if (mode === 1 && weak.includes(now.getUTCDay())) {
          lines.push('Сегодня лонг закрывается в плюс реже, чем в половине случаев.');
        }
        return { text: lines.join('\n') };
      });
    }
  }
}
