import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Moves pre-multi-exchange Bybit credentials into ExchangeConnection.
 *
 * Before exchange selection existed, a user's keys lived in three columns on
 * `users`. This copies each one into a connection row, marks bybit active, and
 * nulls the old columns so the copy happens exactly once.
 *
 * The ciphertext is moved verbatim — it is never decrypted here, so the sweep
 * works the same whether or not CREDENTIALS_ENCRYPTION_KEY can actually open
 * those blobs, and a wrong key surfaces at use time as it did before.
 *
 * The legacy columns still exist in the schema on purpose: removing them in the
 * same change would have `prisma db push` drop them before this ever runs. They
 * come out in a follow-up, once deployments have booted at least once.
 */
@Injectable()
export class LegacyCredentialsMigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LegacyCredentialsMigrationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    try {
      const { migrated } = await this.migrate();
      if (migrated > 0) {
        this.logger.log(`migrated ${migrated} Bybit connection(s) to exchange_connections`);
      }
    } catch (e) {
      // Never block startup: the app is fully usable for anyone who reconnects
      // their keys, and a failed sweep retries on the next boot.
      this.logger.error(`legacy credential migration failed: ${e}`);
    }
  }

  async migrate(): Promise<{ migrated: number }> {
    const legacy = await this.prisma.user.findMany({
      where: { bybitApiKeyEnc: { not: null }, bybitApiSecretEnc: { not: null } },
      select: { id: true, bybitApiKeyEnc: true, bybitApiSecretEnc: true, bybitConnectedAt: true },
    });

    let migrated = 0;
    for (const u of legacy) {
      await this.prisma.$transaction(async (tx) => {
        // A connection created by hand after the upgrade wins: it is newer than
        // whatever the legacy columns hold, so the copy must not overwrite it.
        const existing = await tx.exchangeConnection.findUnique({
          where: { userId_exchange: { userId: u.id, exchange: 'bybit' } },
          select: { id: true },
        });
        if (!existing) {
          await tx.exchangeConnection.create({
            data: {
              userId: u.id,
              exchange: 'bybit',
              apiKeyEnc: u.bybitApiKeyEnc as string,
              apiSecretEnc: u.bybitApiSecretEnc as string,
              connectedAt: u.bybitConnectedAt ?? new Date(),
            },
          });
        }
        await tx.user.update({
          where: { id: u.id },
          data: {
            bybitApiKeyEnc: null,
            bybitApiSecretEnc: null,
            bybitConnectedAt: null,
            // Their only exchange was Bybit, so it is what they should land on.
            activeExchange: 'bybit',
          },
        });
      });
      migrated++;
    }

    return { migrated };
  }
}
