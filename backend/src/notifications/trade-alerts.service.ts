import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenedPositionInfo, TelegramService } from '../telegram/telegram.service';
import { NotifierService } from './notifier.service';

/** Сколько подряд неудачных прогонов синхронизации считаем поломкой. */
const SYNC_FAILURES_BEFORE_ALERT = 3;
/**
 * Насколько свежей должна быть закрытая сделка, чтобы о ней уведомлять.
 * Первое подключение биржи заливает историю за год — без этого окна человек
 * получил бы сотни сообщений о сделках, закрытых задолго до установки бота.
 */
const CLOSED_TRADE_MAX_AGE_MS = 24 * 3_600_000;
/** Больше — и вместо потока карточек уходит одна сводка. */
const CLOSED_TRADE_BURST = 5;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (v: number) => `${v >= 0 ? '+' : '−'}$${Math.abs(v).toFixed(2)}`;

const humanDuration = (fromMs: number, toMs: number): string => {
  const min = Math.max(0, Math.round((toMs - fromMs) / 60_000));
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} ч ${min % 60} мин` : `${Math.floor(h / 24)} д ${h % 24} ч`;
};

/**
 * Сигналы, связанные со сделками пользователя. Вызывается из TradeSyncService:
 * синхронизация — единственное место, которое знает, что позиция появилась,
 * закрылась или что биржа перестала отвечать.
 */
@Injectable()
export class TradeAlertsService {
  private readonly logger = new Logger(TradeAlertsService.name);
  /** Счётчик неудач синхронизации на пользователя, в памяти процесса. */
  private readonly syncFailures = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: NotifierService,
    private readonly telegram: TelegramService,
  ) {}

  async positionOpened(userId: string, pos: OpenedPositionInfo): Promise<void> {
    const dir = pos.direction === 'long' ? '🟢 LONG' : '🔴 SHORT';
    const lev = pos.leverage ? ` · ${esc(pos.leverage)}x` : '';
    const vol = pos.size
      ? `Объём: ${esc(pos.size)}${pos.avgPrice ? ` @ ${esc(pos.avgPrice)}` : ''}`
      : null;
    const keyboard = await this.telegram.buildTagKeyboard(userId, pos.symbol, pos.direction);
    const hasTags = keyboard.inline_keyboard.length > 0;

    await this.notifier.sendEvent(userId, 'trade.opened', {
      text: [
        '🆕 Открыта позиция',
        `<b>${esc(pos.symbol)}</b> ${dir}${lev}`,
        ...(vol ? [vol] : []),
        '',
        hasTags
          ? 'Отметь причины входа — кнопки переключают теги:'
          : 'Тегов пока нет — создай их на странице тегов, следующая позиция придёт с кнопками.',
      ].join('\n'),
      ...(hasTags ? { replyMarkup: keyboard } : {}),
    });
  }

  /**
   * Сделки, вставленные текущим прогоном синхронизации. Свежесть проверяется
   * по closedAt, а не по факту вставки: бэкфилл истории — это тоже вставка.
   */
  async tradesClosed(userId: string, insertedAfter: Date): Promise<void> {
    const trades = await this.prisma.trade.findMany({
      where: {
        userId,
        createdAt: { gte: insertedAfter },
        closedAt: { gte: new Date(Date.now() - CLOSED_TRADE_MAX_AGE_MS) },
      },
      orderBy: { closedAt: 'asc' },
    });
    if (trades.length === 0) return;

    if (trades.length > CLOSED_TRADE_BURST) {
      const total = trades.reduce((s, t) => s + t.closedPnl, 0);
      await this.notifier.sendEvent(userId, 'trade.closed', {
        text: [
          `🏁 Закрыто сделок: <b>${trades.length}</b>`,
          `Итог: <b>${money(total)}</b>`,
          '',
          'Разметить их тегами можно в журнале приложения.',
        ].join('\n'),
      });
      return;
    }

    for (const trade of trades) {
      const dir = trade.direction === 'long' ? '🟢 LONG' : '🔴 SHORT';
      const fees = trade.openFee + trade.closeFee;
      const held = trade.openedAt
        ? humanDuration(trade.openedAt.getTime(), trade.closedAt.getTime())
        : null;

      // Карточка закрытия — только факт, без кнопок тегов: про причину входа
      // спрашивает карточка открытия, пока человек её помнит. Повторный вопрос
      // через несколько дней удержания собирал бы ответ задним числом, а разметить
      // пропущенное есть где — в журнале приложения.
      await this.notifier.sendEvent(userId, 'trade.closed', {
        text: [
          `🏁 Закрыта позиция ${trade.closedPnl >= 0 ? '✅' : '❌'}`,
          `<b>${esc(trade.symbol)}</b> ${dir}`,
          `Итог: <b>${money(trade.closedPnl)}</b> · комиссии: $${fees.toFixed(2)}`,
          ...(held ? [`В позиции: ${held}`] : []),
        ].join('\n'),
      });
    }
  }

  /** Переторговка: считаем закрытые за последние сутки. */
  async overtradeCheck(userId: string): Promise<void> {
    const threshold = await this.notifier.thresholdFor(userId, 'trade.overtrade');
    if (threshold == null) return;
    const count = await this.prisma.trade.count({
      where: { userId, closedAt: { gte: new Date(Date.now() - 24 * 3_600_000) } },
    });
    await this.notifier.maybeSend(userId, 'trade.overtrade', count > threshold, () => ({
      text: [
        `🔥 За сутки закрыто сделок: <b>${count}</b>`,
        `Твой порог — ${threshold}. Стоит посмотреть, что это были за входы.`,
      ].join('\n'),
    }));
  }

  /**
   * Отмечает исход прогона синхронизации. Сигнал уходит после трёх неудач
   * подряд: у адаптеров нет общего типа ошибки авторизации, и отличать
   * «ключ отозван» от «сеть моргнула» разбором чужих строк — способ, который
   * ломается молча. Три подряд говорят то же самое и без парсинга.
   */
  async syncOutcome(userId: string, ok: boolean): Promise<void> {
    if (ok) {
      this.syncFailures.delete(userId);
      return;
    }
    const failures = (this.syncFailures.get(userId) ?? 0) + 1;
    this.syncFailures.set(userId, failures);
    if (failures < SYNC_FAILURES_BEFORE_ALERT) return;

    await this.notifier.sendEvent(userId, 'sys.sync', {
      text: [
        '🛠 Синхронизация с биржей не проходит',
        `Неудачных попыток подряд: <b>${failures}</b>.`,
        'Проверь, живы ли API-ключи на бирже и не истёк ли их срок.',
      ].join('\n'),
    });
  }
}
