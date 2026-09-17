import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { MarketEventsService } from '../market-events/market-events.service';
import { TelegramService } from '../telegram/telegram.service';
import { PrefsService } from './prefs.service';
import { NotifierService } from './notifier.service';
import { NotificationStateService } from './notification-state.service';
import { MarketAlertsService } from './market-alerts.service';

/**
 * Регрессия B1: тик на 100 пользователях × 7 сигналов должен делать единицы
 * запросов к БД, а не тысячи (было 100 × 7 × 4 = 2800, из них 28 000 в
 * пересчёте на 1000 привязанных чатов — см. task-15-brief.md).
 *
 * Прежде тик пробрасывал prefs в notifier заново читая user.findUnique на
 * каждый чек — в стабе ниже такого метода нет вовсе: случайный откат к
 * построчному чтению настроек рушит тест TypeError'ом, а не тихо гоняет
 * лишние запросы.
 */
describe('MarketAlertsService.tick — счётчик запросов Prisma', () => {
  const USER_COUNT = 100;

  // Плоские "свечи": движение и размах — нули, ниже любого порога, поэтому
  // ни один сигнал в этом тесте не пытается реально отправить сообщение
  // (deliver() ни разу не вызывается, TelegramService можно не реализовывать).
  const flatCandle = (startMs: number) => [
    String(startMs),
    '100',
    '100',
    '100',
    '100',
    '0',
    '0',
  ];
  const CANDLE_COUNT = 7 * 24 + 1;

  function buildUsers() {
    const storedPrefs = {
      items: {
        'mkt.price1h': { e: true },
        'mkt.vol1h': { e: true },
        'mkt.volume': { e: true },
        'mkt.fng': { e: true },
        'mkt.ls': { e: true },
        'mkt.book': { e: true },
        'mkt.hour': { e: true },
      },
    };
    return Array.from({ length: USER_COUNT }, (_, i) => ({
      id: `u${i}`,
      telegramChatId: `chat${i}`,
      notifyPrefs: storedPrefs,
    }));
  }

  function buildService(users: ReturnType<typeof buildUsers>) {
    const prisma = {
      user: { findMany: jest.fn().mockResolvedValue(users) },
      notificationState: { findMany: jest.fn().mockResolvedValue([]) },
      liquiditySnapshot: {
        // Один ряд — book() возвращает рано (нужно минимум два), но сам
        // запрос за раз всё равно единственный на тик, не на пользователя.
        findMany: jest
          .fn()
          .mockResolvedValue([
            { price: 100, bidCenter: 99.9, askCenter: 100.1 },
          ]),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    const analytics = {
      getVolatility: jest.fn().mockResolvedValue({
        volumeChangePct: 0,
        volume24hUsd: 1_000_000,
        dominantSide: 'neutral',
      }),
      getFearAndGreed: jest
        .fn()
        .mockResolvedValue({ value: 50, classification: 'Neutral' }),
      getLongShortRatio: jest
        .fn()
        .mockResolvedValue({ points: [{ buyRatio: 0.5 }] }),
    };
    const marketEvents = {
      getWeekdayHourStats: jest.fn(),
      getCorrelation: jest.fn(),
    };
    const telegram = {
      chatIdOf: jest.fn(),
      sendText: jest.fn(),
    };

    const prefs = new PrefsService(prisma as unknown as PrismaService);
    const state = new NotificationStateService(
      prisma as unknown as PrismaService,
    );
    const notifier = new NotifierService(
      prefs,
      state,
      telegram as unknown as TelegramService,
    );
    const service = new MarketAlertsService(
      analytics as unknown as AnalyticsService,
      marketEvents as unknown as MarketEventsService,
      prisma as unknown as PrismaService,
      prefs,
      notifier,
      state,
    );
    return { service, prisma, telegram };
  }

  beforeEach(() => {
    // 00:00 UTC — вне окна mkt.hour (последние 10 минут часа), поэтому
    // volatileHour идёт по ветке "снятие фронта" без похода в marketEvents.
    jest.useFakeTimers().setSystemTime(new Date('2026-01-05T00:00:00Z'));
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          list: Array.from({ length: CANDLE_COUNT }, (_, i) =>
            flatCandle(i * 3_600_000),
          ),
        },
      }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('делает единицы запросов к БД, а не сотни/тысячи', async () => {
    const users = buildUsers();
    const { service, prisma, telegram } = buildService(users);

    await (service as unknown as { tick(): Promise<void> }).tick();

    // Ровно по одному разу на источник данных — вне зависимости от числа
    // пользователей и сигналов.
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1); // PrefsService.linkedUsers
    expect(prisma.notificationState.findMany).toHaveBeenCalledTimes(1); // beginBatch
    expect(prisma.liquiditySnapshot.findMany).toHaveBeenCalledTimes(1); // book()
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1); // flush тика

    const totalPrismaCalls =
      prisma.user.findMany.mock.calls.length +
      prisma.notificationState.findMany.mock.calls.length +
      prisma.liquiditySnapshot.findMany.mock.calls.length +
      prisma.$executeRaw.mock.calls.length;
    expect(totalPrismaCalls).toBeLessThan(10);

    // Условия сигналов заведомо ложны — ни одной отправки, значит ни одного
    // похода за chatId.
    expect(telegram.chatIdOf).not.toHaveBeenCalled();
    expect(telegram.sendText).not.toHaveBeenCalled();
  });
});
