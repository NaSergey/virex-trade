import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotifierService } from './notifier.service';
import { PrefsService } from './prefs.service';
import { isEnabled } from './prefs';
import { ReportTrade, buildWeeklyReport, lastWeekRange } from './weekly-report';

/** Понедельник, 09:00 UTC = 12:00 МСК. */
const SEND_WEEKDAY = 1;
const SEND_UTC_HOUR = 9;
const TICK_MS = 10 * 60_000;
const WEEK_MS = 7 * 24 * 3_600_000;

/**
 * Отчёт шлётся раз в неделю по таймеру с шагом в десять минут, а не по cron:
 * зависимостей планировщика в проекте нет, а от повторной отправки внутри
 * часа защищает cooldown самого сигнала (`report.weekly` — сутки).
 */
@Injectable()
export class WeeklyReportService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WeeklyReportService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly prefs: PrefsService,
    private readonly notifier: NotifierService,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => {
      this.tick().catch((e) => this.logger.warn(`недельный отчёт не отправлен: ${e}`));
    }, TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(now: Date = new Date()): Promise<void> {
    if (now.getUTCDay() !== SEND_WEEKDAY || now.getUTCHours() !== SEND_UTC_HOUR) return;

    const range = lastWeekRange(now);
    const users = await this.prefs.linkedUsers();
    for (const user of users) {
      if (!isEnabled(user.prefs, 'report.weekly')) continue;
      const [current, previous] = await Promise.all([
        this.tradesOf(user.id, range.from, range.to),
        this.tradesOf(user.id, new Date(range.from.getTime() - WEEK_MS), range.from),
      ]);
      await this.notifier.sendEvent(user.id, 'report.weekly', {
        text: buildWeeklyReport(current, previous),
      });
    }
  }

  private async tradesOf(userId: string, from: Date, to: Date): Promise<ReportTrade[]> {
    const rows = await this.prisma.trade.findMany({
      where: { userId, closedAt: { gte: from, lt: to } },
      select: {
        closedPnl: true,
        stopLoss: true,
        tags: { select: { tag: { select: { name: true } } } },
      },
    });
    return rows.map((r) => ({
      closedPnl: r.closedPnl,
      stopLoss: r.stopLoss,
      tagNames: r.tags.map((t) => t.tag.name),
    }));
  }
}
