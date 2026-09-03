import { BadRequestException, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PrefsService } from '../notifications/prefs.service';
import { unpackId } from './ids';

const TG_API = 'https://api.telegram.org';
// Telegram hard limit for callback_data is 64 bytes: "pt|SYMBOL|long|<uuid36>".
const MAX_CALLBACK_DATA = 64;
// How long a /start deep link stays redeemable. The code is a bearer token for
// "attach this chat to that account", so an unused one shouldn't stay live
// indefinitely in a chat history, a screenshot or a URL bar.
const LINK_CODE_TTL_MS = 15 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface OpenedPositionInfo {
  symbol: string;
  direction: 'long' | 'short';
  size?: string;
  avgPrice?: string;
  leverage?: string;
  /** Стоп на бирже. Отсутствует и когда его нет, и когда биржа его не отдаёт. */
  stopLoss?: string;
}

/**
 * Telegram bot integration, dependency-free (plain fetch against the Bot API).
 *
 * - Account linking: the app hands out a one-time /start <code> deep link;
 *   the bot resolves the code to a user and stores the chat id.
 * - Inbound buttons: tag toggles on an open position write the same PositionTag
 *   rows the web UI does (so the trade sync copies them onto closed trades as
 *   usual); `ct|` buttons tag a closed trade directly.
 *
 * Тексты уведомлений собирает NotificationsModule, а не этот сервис: здесь
 * остался транспорт (`sendText`) и разбор входящих. На двенадцати типах
 * сигналов метод notifyXxx на каждый перестал бы помещаться в голове.
 *
 * Настройки уведомлений правятся только на странице настроек в приложении.
 * Панель `/settings` в чате была и снята: два места, редактирующих одно
 * состояние, — это два набора багов, а веб-форма ещё и не зависит от того,
 * какой инстанс держит polling.
 *
 * Disabled entirely (no polling, no sends) when TELEGRAM_BOT_TOKEN is unset,
 * so environments without the bot behave as before. Run the poller in ONE
 * environment only — two pollers on the same token fight over getUpdates
 * (Telegram answers 409 Conflict).
 */
@Injectable()
export class TelegramService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private readonly token = process.env.TELEGRAM_BOT_TOKEN ?? '';
  private stopped = false;
  private offset = 0;
  private abortPoll?: AbortController;
  private botUsername: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly prefs: PrefsService,
  ) {}

  get enabled(): boolean {
    return this.token.length > 0;
  }

  onApplicationBootstrap() {
    if (!this.enabled) {
      this.logger.log('TELEGRAM_BOT_TOKEN not set — telegram notifications disabled');
      return;
    }
    // Don't block startup; the loop lives for the process lifetime.
    void this.pollLoop().catch((e) => this.logger.error(`poll loop crashed: ${e}`));
  }

  onModuleDestroy() {
    this.stopped = true;
    this.abortPoll?.abort();
  }

  // ── Bot API plumbing ──

  private async api<T = unknown>(method: string, body?: object, signal?: AbortSignal): Promise<T | null> {
    try {
      const res = await fetch(`${TG_API}/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
      if (!data?.ok) {
        this.logger.warn(`telegram ${method} failed: ${data?.description ?? `HTTP ${res.status}`}`);
        return null;
      }
      return data.result ?? null;
    } catch (e) {
      if (!this.stopped) this.logger.warn(`telegram ${method} error: ${e}`);
      return null;
    }
  }

  async getBotUsername(): Promise<string | null> {
    if (!this.enabled) return null;
    if (!this.botUsername) {
      const me = await this.api<{ username?: string }>('getMe');
      this.botUsername = me?.username ?? null;
    }
    return this.botUsername;
  }

  /**
   * Отправка готового текста в чат. Публичная точка входа для всех чекеров:
   * `api` остаётся приватной, чтобы никто не слал мимо NotifierService и его
   * проверок включённости.
   */
  async sendText(chatId: string, text: string, replyMarkup?: object): Promise<boolean> {
    if (!this.enabled) return false;
    const res = await this.api('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
    return res != null;
  }

  async chatIdOf(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true },
    });
    return user?.telegramChatId ?? null;
  }

  // ── Long polling ──

  private async pollLoop(): Promise<void> {
    this.logger.log('telegram polling started');
    while (!this.stopped) {
      this.abortPoll = new AbortController();
      const updates = await this.api<Array<Record<string, any>>>(
        'getUpdates',
        { offset: this.offset, timeout: 25, allowed_updates: ['message', 'callback_query'] },
        this.abortPoll.signal,
      );
      if (this.stopped) break;
      if (updates == null) {
        // network hiccup or 409 (another poller) — back off, then retry
        await sleep(5000);
        continue;
      }
      for (const u of updates) {
        this.offset = Math.max(this.offset, (u.update_id as number) + 1);
        try {
          if (u.message?.text) await this.handleMessage(u.message);
          else if (u.callback_query) await this.handleCallback(u.callback_query);
        } catch (e) {
          this.logger.warn(`update handling failed: ${e}`);
        }
      }
    }
  }

  // ── Incoming: /start linking ──

  private async handleMessage(msg: Record<string, any>): Promise<void> {
    const chatId = String(msg.chat?.id ?? '');
    const text: string = msg.text ?? '';
    if (!chatId) return;

    // Указатель, а не редактор: настройки живут на странице настроек в
    // приложении, и второго места, где то же состояние правится, быть не
    // должно. Но человек, набравший команду в чате, не должен упереться в
    // тишину — поэтому ответ есть.
    if (/^\/settings\b/.test(text)) {
      await this.api('sendMessage', {
        chat_id: chatId,
        text: 'Уведомления настраиваются на странице «Настройки» в приложении — там можно включить нужные сигналы и задать пороги.',
      });
      return;
    }

    const m = text.match(/^\/start(?:\s+(\S+))?/);
    if (!m) return;

    const code = m[1];
    if (!code) {
      await this.api('sendMessage', {
        chat_id: chatId,
        text: 'Привет! Чтобы привязать аккаунт, нажми «Подключить Telegram» на странице настроек в приложении и открой ссылку оттуда.',
      });
      return;
    }
    const user = await this.prisma.user.findUnique({ where: { telegramLinkCode: code } });
    if (!user) {
      await this.api('sendMessage', {
        chat_id: chatId,
        text: 'Код не найден или уже использован — сгенерируй новую ссылку в приложении.',
      });
      return;
    }
    const issuedAt = user.telegramLinkCodeAt?.getTime();
    if (issuedAt == null || Date.now() - issuedAt > LINK_CODE_TTL_MS) {
      // Burn the stale code so a leaked link can't be retried later.
      await this.prisma.user.update({
        where: { id: user.id },
        data: { telegramLinkCode: null, telegramLinkCodeAt: null },
      });
      await this.api('sendMessage', {
        chat_id: chatId,
        text: 'Ссылка устарела — сгенерируй новую в приложении.',
      });
      return;
    }
    await this.prisma.$transaction([
      // telegramChatId is unique, so re-linking a chat to another account has
      // to release it from the previous owner rather than hit the constraint.
      this.prisma.user.updateMany({
        where: { telegramChatId: chatId, id: { not: user.id } },
        data: { telegramChatId: null },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { telegramChatId: chatId, telegramLinkCode: null, telegramLinkCodeAt: null },
      }),
    ]);
    await this.api('sendMessage', {
      chat_id: chatId,
      text: [
        '✅ Готово!',
        '',
        'Сразу включены: карточка открытой позиции с кнопками тегов, итог закрытой сделки, отчёт за неделю и сообщение о сбое синхронизации. Из рыночных — резкое движение цены BTC за час.',
        '',
        'Всё остальное и пороги — в /settings.',
      ].join('\n'),
    });
  }

  // ── Incoming: tag toggle buttons ──

  private async handleCallback(cb: Record<string, any>): Promise<void> {
    const chatId = String(cb.message?.chat?.id ?? '');
    const messageId = cb.message?.message_id;
    const answer = (text?: string) =>
      this.api('answerCallbackQuery', { callback_query_id: cb.id, text });

    const user = chatId
      ? await this.prisma.user.findUnique({ where: { telegramChatId: chatId } })
      : null;
    if (!user) {
      await answer('Аккаунт не привязан');
      return;
    }
    // Тег закрытой сделки: пишет TradeTag напрямую, поэтому оба uuid едут
    // упакованными — в сыром виде пара не влезает в 64 байта callback_data.
    const [ctKind, shortTrade, shortTag] = String(cb.data ?? '').split('|');
    if (ctKind === 'ct') {
      const tradeId = unpackId(shortTrade ?? '');
      const tagId = unpackId(shortTag ?? '');
      const trade = tradeId
        ? await this.prisma.trade.findFirst({ where: { id: tradeId, userId: user.id } })
        : null;
      const tag = tagId
        ? await this.prisma.tag.findFirst({ where: { id: tagId, userId: user.id } })
        : null;
      if (!trade || !tag) {
        await answer('Сделка или тег не найдены');
        return;
      }
      const existing = await this.prisma.tradeTag.findUnique({
        where: { tradeId_tagId: { tradeId: trade.id, tagId: tag.id } },
      });
      if (existing) {
        await this.prisma.tradeTag.delete({
          where: { tradeId_tagId: { tradeId: trade.id, tagId: tag.id } },
        });
      } else {
        await this.prisma.tradeTag.create({ data: { tradeId: trade.id, tagId: tag.id } });
      }
      await answer(existing ? `− ${tag.name}` : `✓ ${tag.name}`);
      return;
    }

    const [kind, symbol, direction, tagId] = String(cb.data ?? '').split('|');

    // "Сохранить" — tags are already persisted on every toggle below, this
    // button just dismisses the panel by deleting the message.
    if (kind === 'pd') {
      if (!symbol || !direction) {
        await answer();
        return;
      }
      if (messageId != null) await this.api('deleteMessage', { chat_id: chatId, message_id: messageId });
      await answer('Сохранено ✅');
      return;
    }

    if (kind !== 'pt' || !symbol || !direction || !tagId) {
      await answer();
      return;
    }

    // Position already closed → its registry row is pruned; tags set now would
    // be swept before the sync could copy them, so say it instead of lying.
    const stillOpen = await this.prisma.openPositionSeen.findUnique({
      where: { userId_symbol_direction: { userId: user.id, symbol, direction } },
    });
    if (!stillOpen) {
      if (messageId != null) {
        await this.api('editMessageReplyMarkup', {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [] },
        });
      }
      await answer('Позиция уже закрыта — теги можно поставить в истории приложения');
      return;
    }

    const tag = await this.prisma.tag.findFirst({ where: { id: tagId, userId: user.id } });
    if (!tag) {
      await answer('Тег не найден (удалён?)');
      return;
    }

    const key = { userId: user.id, symbol, direction, tagId };
    const existing = await this.prisma.positionTag.findUnique({
      where: { userId_symbol_direction_tagId: key },
    });
    if (existing) await this.prisma.positionTag.delete({ where: { id: existing.id } });
    else await this.prisma.positionTag.create({ data: key });

    if (messageId != null) {
      await this.api('editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: await this.buildTagKeyboard(user.id, symbol, direction),
      });
    }
    await answer(existing ? `− ${tag.name}` : `✓ ${tag.name}`);
  }

  async buildTagKeyboard(userId: string, symbol: string, direction: string) {
    const [tags, selected] = await Promise.all([
      this.prisma.tag.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.positionTag.findMany({ where: { userId, symbol, direction }, select: { tagId: true } }),
    ]);
    const sel = new Set(selected.map((s) => s.tagId));
    const buttons = tags
      .map((t) => ({
        text: `${sel.has(t.id) ? '✅ ' : ''}${t.name}`,
        callback_data: `pt|${symbol}|${direction}|${t.id}`,
      }))
      .filter((b) => Buffer.byteLength(b.callback_data) <= MAX_CALLBACK_DATA);
    const rows: Array<typeof buttons> = [];
    for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
    if (buttons.length > 0) {
      rows.push([{ text: '✅ Сохранить', callback_data: `pd|${symbol}|${direction}` }]);
    }
    return { inline_keyboard: rows };
  }

  // ── Linking API (used by the controller) ──

  async status(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return {
      success: true,
      enabled: this.enabled,
      linked: !!user?.telegramChatId,
      botUsername: this.enabled ? await this.getBotUsername() : null,
    };
  }

  async createLinkCode(userId: string) {
    if (!this.enabled) throw new BadRequestException('Telegram-бот не настроен на сервере (TELEGRAM_BOT_TOKEN)');
    const username = await this.getBotUsername();
    if (!username) throw new BadRequestException('Telegram-бот недоступен — проверьте токен');
    const code = randomBytes(8).toString('hex');
    await this.prisma.user.update({
      where: { id: userId },
      // Issue time drives the TTL check in handleMessage; regenerating a link
      // restarts the window and invalidates the previous code.
      data: { telegramLinkCode: code, telegramLinkCodeAt: new Date() },
    });
    return { success: true, url: `https://t.me/${username}?start=${code}` };
  }

  async unlink(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { telegramChatId: null, telegramLinkCode: null, telegramLinkCodeAt: null },
    });
    return { success: true };
  }

  /** Manual "does it reach me" check from the app UI. */
  async sendTest(userId: string) {
    if (!this.enabled) throw new BadRequestException('Telegram-бот не настроен на сервере');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.telegramChatId) throw new BadRequestException('Telegram не привязан');
    await this.api('sendMessage', {
      chat_id: user.telegramChatId,
      text: '🔔 Тест: уведомления работают. При открытии новой позиции пришлю кнопки тегов.',
    });
    return { success: true };
  }
}
