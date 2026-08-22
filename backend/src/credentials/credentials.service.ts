import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialsCryptoService } from './credentials-crypto.service';
import { ExchangeCredentials, ExchangeId } from '../exchanges/exchange.types';

/** A connection as the settings page sees it — never carries a live secret. */
export interface ConnectionStatus {
  exchange: ExchangeId;
  /** Null when the stored blob can't be opened — see `needsReconnect`. */
  apiKeyMasked: string | null;
  connectedAt: Date;
  /**
   * The row exists but its secrets are unreadable under the current
   * CREDENTIALS_ENCRYPTION_KEY: the user has to enter the keys again.
   */
  needsReconnect: boolean;
}

/**
 * Stores and retrieves per-user, per-exchange API credentials.
 *
 * Credentials live in ExchangeConnection rows, encrypted at rest, and are
 * decrypted only at the moment a request needs them. `activeExchange` on the
 * user picks which connection drives sync, positions and trading.
 */
@Injectable()
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredentialsCryptoService,
  ) {}

  /** Decrypted credentials for one exchange, or null if it isn't connected. */
  async get(userId: string, exchange: ExchangeId): Promise<ExchangeCredentials | null> {
    const row = await this.prisma.exchangeConnection.findUnique({
      where: { userId_exchange: { userId, exchange } },
    });
    if (!row) return null;
    try {
      return {
        apiKey: this.crypto.decrypt(row.apiKeyEnc),
        apiSecret: this.crypto.decrypt(row.apiSecretEnc),
        ...(row.passphraseEnc ? { passphrase: this.crypto.decrypt(row.passphraseEnc) } : {}),
      };
    } catch (e) {
      // A raw throw here surfaced as a bare 500 "Internal server error", which
      // told the user nothing and named no way out. The cause is an operator
      // one (key rotated, DB restored under another key), so it goes to the
      // log; the client gets the one sentence that describes the remedy.
      this.logger.error(`cannot decrypt ${exchange} credentials of user ${userId}: ${e}`);
      throw new BadRequestException({
        message:
          `Сохранённые ключи «${exchange}» не читаются: они зашифрованы другим ключом сервера. ` +
          'Подключите биржу заново на странице «Настройки».',
        code: 'EXCHANGE_KEYS_UNREADABLE',
        params: { exchange },
      });
    }
  }

  /** Which exchange this user is currently working with, if any. */
  async activeExchange(userId: string): Promise<ExchangeId | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { activeExchange: true },
    });
    return (user?.activeExchange as ExchangeId | null) ?? null;
  }

  /**
   * Credentials of the active exchange, plus which one it is. Null when the
   * user has connected nothing — callers that must have keys use
   * requireActive() instead.
   */
  async getActive(
    userId: string,
  ): Promise<{ exchange: ExchangeId; credentials: ExchangeCredentials } | null> {
    const exchange = await this.activeExchange(userId);
    if (!exchange) return null;
    const credentials = await this.get(userId, exchange);
    if (!credentials) return null;
    return { exchange, credentials };
  }

  /** Same as getActive(), but throws a clear, user-facing error when absent. */
  async requireActive(
    userId: string,
  ): Promise<{ exchange: ExchangeId; credentials: ExchangeCredentials }> {
    const active = await this.getActive(userId);
    if (!active) {
      throw new BadRequestException({
        message: 'Биржа не подключена. Добавьте API-ключи на странице «Настройки».',
        code: 'EXCHANGE_NOT_CONNECTED',
      });
    }
    return active;
  }

  /** Same, for endpoints that are specific to one exchange rather than active. */
  async require(userId: string, exchange: ExchangeId): Promise<ExchangeCredentials> {
    const creds = await this.get(userId, exchange);
    if (!creds) {
      throw new BadRequestException({
        message: `Биржа «${exchange}» не подключена. Добавьте API-ключи на странице «Настройки».`,
        code: 'EXCHANGE_NOT_CONNECTED_NAMED',
        params: { exchange },
      });
    }
    return creds;
  }

  /**
   * Every connection this user holds, for the settings page.
   *
   * A key that won't decrypt must not take the list down with it: this is the
   * only page from which the user can re-enter the keys, and a throw here left
   * it stuck on its loading skeleton — the one screen that fixes the problem
   * was the one screen the problem closed. Such a row comes back as connected
   * but `needsReconnect`, without a masked key it cannot produce.
   */
  async list(userId: string): Promise<ConnectionStatus[]> {
    const rows = await this.prisma.exchangeConnection.findMany({
      where: { userId },
      orderBy: { connectedAt: 'asc' },
    });
    return rows.map((r) => {
      const exchange = r.exchange as ExchangeId;
      try {
        return {
          exchange,
          apiKeyMasked: this.maskKey(this.crypto.decrypt(r.apiKeyEnc)),
          connectedAt: r.connectedAt,
          needsReconnect: false,
        };
      } catch (e) {
        this.logger.error(`cannot decrypt ${exchange} credentials of user ${userId}: ${e}`);
        return { exchange, apiKeyMasked: null, connectedAt: r.connectedAt, needsReconnect: true };
      }
    });
  }

  /**
   * Store (or replace) one exchange's credentials. The first connection also
   * becomes the active one, so connecting is a single step for a new user.
   */
  async save(
    userId: string,
    exchange: ExchangeId,
    creds: ExchangeCredentials,
  ): Promise<void> {
    const data = {
      apiKeyEnc: this.crypto.encrypt(creds.apiKey),
      apiSecretEnc: this.crypto.encrypt(creds.apiSecret),
      passphraseEnc: creds.passphrase ? this.crypto.encrypt(creds.passphrase) : null,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.exchangeConnection.upsert({
        where: { userId_exchange: { userId, exchange } },
        create: { userId, exchange, ...data, connectedAt: new Date() },
        update: { ...data, connectedAt: new Date() },
      });
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { activeExchange: true },
      });
      if (!user?.activeExchange) {
        await tx.user.update({ where: { id: userId }, data: { activeExchange: exchange } });
      }
    });
  }

  /**
   * Drop one exchange's credentials. If it was the active one, hand the slot to
   * another connection rather than leaving the user pointed at nothing — that
   * would silently stop sync for an account they still have connected.
   */
  async clear(userId: string, exchange: ExchangeId): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.exchangeConnection.deleteMany({ where: { userId, exchange } });
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { activeExchange: true },
      });
      if (user?.activeExchange !== exchange) return;
      const fallback = await tx.exchangeConnection.findFirst({
        where: { userId },
        orderBy: { connectedAt: 'asc' },
        select: { exchange: true },
      });
      await tx.user.update({
        where: { id: userId },
        data: { activeExchange: fallback?.exchange ?? null },
      });
    });
  }

  /** Switch which connected exchange the app works with. */
  async setActive(userId: string, exchange: ExchangeId): Promise<void> {
    const connected = await this.prisma.exchangeConnection.findUnique({
      where: { userId_exchange: { userId, exchange } },
      select: { id: true },
    });
    if (!connected) {
      throw new BadRequestException({
        message: 'Сначала подключите API-ключи этой биржи',
        code: 'EXCHANGE_NOT_CONNECTED',
      });
    }
    await this.prisma.user.update({ where: { id: userId }, data: { activeExchange: exchange } });
  }

  /** "ASSjQYU2q1zf6h28mZ" -> "••••••••••••••••mZ" — never expose the full key back to the client. */
  maskKey(apiKey: string): string {
    if (apiKey.length <= 4) return '••••';
    return '•'.repeat(apiKey.length - 4) + apiKey.slice(-4);
  }
}
