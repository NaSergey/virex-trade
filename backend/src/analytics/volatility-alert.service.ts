import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { AnalyticsService } from './analytics.service';

const CHECK_INTERVAL_MS = 10 * 60_000;

/**
 * Watches BTC realized volatility and volume (via AnalyticsService.getVolatility)
 * and pings every telegram-linked user once when either crosses above its
 * 7-day baseline. Notifies on the rising edge only — each flag resets once
 * its metric drops back below baseline, so the next spike can fire again
 * instead of staying silent forever or re-notifying every tick.
 */
@Injectable()
export class VolatilityAlertService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(VolatilityAlertService.name);
  private timer?: NodeJS.Timeout;
  private volatilityElevated = false;
  private volumeElevated = false;

  constructor(
    private readonly analytics: AnalyticsService,
    private readonly telegram: TelegramService,
    private readonly prisma: PrismaService,
  ) {}

  onApplicationBootstrap() {
    if (!this.telegram.enabled) return;
    this.check().catch((e) => this.logger.warn(`initial volatility check failed: ${e}`));
    this.timer = setInterval(() => {
      this.check().catch((e) => this.logger.warn(`volatility check failed: ${e}`));
    }, CHECK_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async check(): Promise<void> {
    const snapshot = await this.analytics.getVolatility('BTCUSDT');

    if (snapshot.elevated && !this.volatilityElevated) {
      const users = await this.linkedUsers();
      for (const u of users) await this.telegram.notifyVolatilitySpike(u.id, snapshot);
    }
    this.volatilityElevated = snapshot.elevated;

    if (snapshot.volumeRising && !this.volumeElevated) {
      const users = await this.linkedUsers();
      for (const u of users) await this.telegram.notifyVolumeSpike(u.id, snapshot);
    }
    this.volumeElevated = snapshot.volumeRising;
  }

  private linkedUsers() {
    return this.prisma.user.findMany({
      where: { telegramChatId: { not: null } },
      select: { id: true },
    });
  }
}
