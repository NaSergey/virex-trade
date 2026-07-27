import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CredentialsCryptoService } from './credentials-crypto.service';
import { BybitCredentials } from '../bybit/services/bybit-auth.service';

@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredentialsCryptoService,
  ) {}

  /** Decrypted Bybit credentials for a user, or null if not connected. */
  async get(userId: string): Promise<BybitCredentials | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { bybitApiKeyEnc: true, bybitApiSecretEnc: true },
    });
    if (!user?.bybitApiKeyEnc || !user?.bybitApiSecretEnc) return null;
    return {
      apiKey: this.crypto.decrypt(user.bybitApiKeyEnc),
      apiSecret: this.crypto.decrypt(user.bybitApiSecretEnc),
    };
  }

  /** Same as get(), but throws a clear, user-facing error when not connected. */
  async requireDecrypted(userId: string): Promise<BybitCredentials> {
    const creds = await this.get(userId);
    if (!creds) {
      throw new BadRequestException(
        'Bybit не подключён. Добавьте API-ключи на странице «Настройки».',
      );
    }
    return creds;
  }

  async save(userId: string, apiKey: string, apiSecret: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        bybitApiKeyEnc: this.crypto.encrypt(apiKey),
        bybitApiSecretEnc: this.crypto.encrypt(apiSecret),
        bybitConnectedAt: new Date(),
      },
    });
  }

  async clear(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { bybitApiKeyEnc: null, bybitApiSecretEnc: null, bybitConnectedAt: null },
    });
  }

  /** "ASSjQYU2q1zf6h28mZ" -> "••••••••••••••••mZ" — never expose the full key back to the client. */
  maskKey(apiKey: string): string {
    if (apiKey.length <= 4) return '••••';
    return '•'.repeat(apiKey.length - 4) + apiKey.slice(-4);
  }
}
