import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SWEEP_INTERVAL_MS = 60 * 60_000; // hourly

/**
 * Deletes refresh tokens past their expiry.
 *
 * Nothing else removes them: rotation replaces a row only when the session is
 * actually refreshed, and logout only fires when the user clicks it. Every
 * abandoned session — a closed tab, a wiped browser, a device that never comes
 * back — therefore left a row behind permanently, so `refresh_tokens` grew
 * without bound with rows that can no longer authenticate anything.
 *
 * Expired rows are already rejected by AuthService.refresh(), so dropping them
 * is purely reclamation and safe to run at any time.
 */
@Injectable()
export class RefreshTokenCleanupService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(RefreshTokenCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    // Don't block startup; the first sweep clears whatever accumulated while
    // the server was down.
    this.sweep().catch((e) => this.logger.error('initial refresh-token sweep failed', e));
    this.timer = setInterval(() => {
      this.sweep().catch((e) => this.logger.error('periodic refresh-token sweep failed', e));
    }, SWEEP_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(): Promise<{ deleted: number }> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (count > 0) this.logger.log(`removed ${count} expired refresh token(s)`);
    return { deleted: count };
  }
}
