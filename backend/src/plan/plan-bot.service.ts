import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  TelegramService,
  type CallbackContext,
} from '../telegram/telegram.service';
import { OWNER_EMAIL, isOwnerEmail } from '../admin/owner';
import { runsBackgroundJobs } from '../role';
import { PlanService } from './plan.service';
import { addDays, weekdayOf } from './plan-time';
import type { Status } from './plan-stats';
import {
  CB,
  eveningMessage,
  itemMessage,
  morningMessage,
  sealedMessage,
  weekBlock,
  type CbAction,
} from './plan-messages';

const TICK_MS = 30_000;
/**
 * Утро и вечер, проспанные `worker`'ом дольше этого, не шлются: план дня в
 * обед и «итог дня» в четыре утра — шум, а не напоминание.
 */
const LATE_WINDOW_MIN = 180;
/** Воскресенье — к вечернему отчёту итог недели. */
const SUNDAY = 6;

const ACTIONS: Record<CbAction, { status: Status; reply: string }> = {
  go: { status: 'started', reply: 'Поехали ▶️' },
  walk: { status: 'walk', reply: 'Хорошей прогулки 🚶' },
  skip: { status: 'skipped', reply: 'Записал: забил' },
  done: { status: 'done', reply: 'Сделано ✅' },
  part: { status: 'partial', reply: 'Записал: частично' },
};

/**
 * План дня в Telegram: напоминание в начале блока с кнопками «Сажусь за
 * работу / Иду гулять / Забил», вопрос «как прошло» в конце, утренний план и
 * вечерний отчёт (в воскресенье — с неделей).
 *
 * Шлёт только `worker` — тот же фон, что у остальных сервисов: два процесса
 * прислали бы каждое напоминание дважды. Кнопки разбирает поллер бота, а он
 * тоже живёт в `worker`. Каждое «отправить» сначала ставит отметку условным
 * `updateMany` и только потом шлёт: потерянное сообщение лучше двух.
 */
@Injectable()
export class PlanBotService
  implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PlanBotService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly plan: PlanService,
  ) {}

  onModuleInit() {
    this.telegram.onCallback(CB, (ctx) => this.onButton(ctx));
    this.telegram.onCommand('plan', async ({ chatId, email }) => {
      if (isOwnerEmail(email))
        await this.telegram.sendText(chatId, await this.dayText());
    });
    this.telegram.onCommand('report', async ({ chatId, email }) => {
      if (isOwnerEmail(email))
        await this.telegram.sendText(chatId, await this.eveningText(false));
    });
    this.telegram.onCommand('week', async ({ chatId, email }) => {
      if (isOwnerEmail(email))
        await this.telegram.sendText(
          chatId,
          weekBlock(await this.plan.stats(7)),
        );
    });
  }

  onApplicationBootstrap() {
    if (!runsBackgroundJobs() || !this.telegram.enabled) return;
    const run = () =>
      this.tick().catch((e) => this.logger.error(`план дня: ${e}`));
    void run();
    this.timer = setInterval(run, TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Чат владельца — как у бэкапа базы: переменной с id чата нет. */
  async ownerChat(): Promise<string | null> {
    const owner = await this.prisma.user.findFirst({
      where: { email: { equals: OWNER_EMAIL, mode: 'insensitive' } },
      select: { telegramChatId: true },
    });
    return owner?.telegramChatId ?? null;
  }

  async tick(at: Date = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const chatId = await this.ownerChat();
      if (!chatId) return;
      const { settings, now } = await this.plan.now(at);
      const items = await this.plan.ensureDay(now.day, now.day);

      if (settings.morningMin != null && now.min >= settings.morningMin) {
        const claimed = await this.prisma.planDay.updateMany({
          where: { day: now.day, morningSentAt: null },
          data: { morningSentAt: at },
        });
        if (
          claimed.count > 0 &&
          now.min < settings.morningMin + LATE_WINDOW_MIN
        ) {
          await this.telegram.sendText(chatId, await this.dayText(at));
        }
      }

      for (const it of items) {
        if (!it.track || it.status !== 'planned' || it.notifiedAt) continue;
        if (now.min < it.startMin - settings.leadMin || now.min >= it.endMin)
          continue;
        const claimed = await this.prisma.planItem.updateMany({
          where: { id: it.id, notifiedAt: null, status: 'planned' },
          data: { notifiedAt: at },
        });
        if (claimed.count === 0) continue;
        const v = this.plan.view(it, settings.tz, now);
        const msg = itemMessage(v, now.day, now.min);
        const messageId = await this.telegram.sendMessage(
          chatId,
          msg.text,
          msg.kb,
        );
        if (messageId != null)
          await this.prisma.planItem.update({
            where: { id: it.id },
            data: { messageId },
          });
      }

      // Конец блока. Вчерашний день — ради блоков до полуночи, которые
      // кончаются ровно в 24:00, и ночи, когда `worker` лежал.
      const ending = await this.prisma.planItem.findMany({
        where: {
          track: true,
          endedAt: null,
          OR: [
            { day: addDays(now.day, -1) },
            { day: now.day, endMin: { lte: now.min } },
          ],
        },
      });
      for (const it of ending) {
        const claimed = await this.prisma.planItem.updateMany({
          where: { id: it.id, endedAt: null },
          data: { endedAt: at },
        });
        if (claimed.count === 0) continue;
        const v = this.plan.view(it, settings.tz, now);
        if (it.status === 'started') {
          // Старое сообщение — без кнопок, вопрос — новым: чтобы он прозвенел.
          if (it.messageId != null) {
            await this.telegram.editMessage(
              chatId,
              it.messageId,
              sealedMessage(v),
              { inline_keyboard: [] },
            );
          }
          const msg = itemMessage(v, now.day, now.min);
          const messageId = await this.telegram.sendMessage(
            chatId,
            msg.text,
            msg.kb,
          );
          if (messageId != null)
            await this.prisma.planItem.update({
              where: { id: it.id },
              data: { messageId },
            });
        } else if (it.status === 'planned' && it.messageId != null) {
          const msg = itemMessage(v, now.day, now.min);
          await this.telegram.editMessage(
            chatId,
            it.messageId,
            msg.text,
            msg.kb,
          );
        }
      }

      if (settings.eveningMin != null && now.min >= settings.eveningMin) {
        const claimed = await this.prisma.planDay.updateMany({
          where: { day: now.day, eveningSentAt: null },
          data: { eveningSentAt: at },
        });
        if (
          claimed.count > 0 &&
          now.min < settings.eveningMin + LATE_WINDOW_MIN
        ) {
          await this.telegram.sendText(
            chatId,
            await this.eveningText(weekdayOf(now.day) === SUNDAY, at),
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async onButton(ctx: CallbackContext): Promise<string | undefined> {
    if (!isOwnerEmail(ctx.email)) return 'План — только у владельца';
    const action = ACTIONS[ctx.parts[1] as CbAction];
    const id = ctx.parts[2];
    if (!action || !id) return undefined;
    const item = await this.plan.setStatus(id, action.status);
    if (!item) return 'Блок не найден — удалён из плана?';
    if (ctx.messageId != null) {
      const { settings, now } = await this.plan.now();
      const v = this.plan.view(item, settings.tz, now);
      const msg = itemMessage(v, now.day, now.min);
      await this.telegram.editMessage(
        ctx.chatId,
        ctx.messageId,
        msg.text,
        msg.kb,
      );
    }
    return action.reply;
  }

  private async dayText(at: Date = new Date()): Promise<string> {
    const { settings, now } = await this.plan.now(at);
    const items = await this.plan.ensureDay(now.day, now.day);
    return morningMessage(
      now.day,
      items.map((i) => this.plan.view(i, settings.tz, now)),
      now.min,
    );
  }

  private async eveningText(
    withWeek: boolean,
    at: Date = new Date(),
  ): Promise<string> {
    const { settings, now } = await this.plan.now(at);
    const month = await this.plan.stats(30, at);
    const items = (await this.plan.ensureDay(now.day, now.day)).map((i) =>
      this.plan.view(i, settings.tz, now),
    );
    const today = month.byDay[month.byDay.length - 1];
    return eveningMessage(
      now.day,
      items,
      today,
      now.min,
      month.streak,
      withWeek ? await this.plan.stats(7, at) : undefined,
    );
  }
}
