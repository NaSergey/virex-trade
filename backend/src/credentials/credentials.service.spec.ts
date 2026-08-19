import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CredentialsCryptoService } from './credentials-crypto.service';
import { CredentialsService } from './credentials.service';
import { PrismaService } from '../prisma/prisma.service';

const KEY_A = 'a'.repeat(64);
const KEY_B = 'b'.repeat(64);

const cryptoWith = (hex: string) =>
  new CredentialsCryptoService({ get: () => hex } as unknown as ConfigService);

/** Rows as Prisma returns them, with the secrets written under `hex`. */
const connectionRow = (hex: string, exchange = 'bybit') => {
  const c = cryptoWith(hex);
  return {
    id: 'row-1',
    userId: 'u1',
    exchange,
    apiKeyEnc: c.encrypt('ASSjQYU2q1zf6h28mZ'),
    apiSecretEnc: c.encrypt('super-secret'),
    passphraseEnc: null,
    connectedAt: new Date('2026-01-01T00:00:00Z'),
  };
};

const serviceReading = (hex: string, rows: ReturnType<typeof connectionRow>[]) => {
  const prisma = {
    exchangeConnection: {
      findMany: jest.fn().mockResolvedValue(rows),
      findUnique: jest.fn().mockResolvedValue(rows[0] ?? null),
    },
  } as unknown as PrismaService;
  return new CredentialsService(prisma, cryptoWith(hex));
};

describe('CredentialsService', () => {
  describe('list', () => {
    it('masks the key of a connection it can decrypt', async () => {
      const service = serviceReading(KEY_A, [connectionRow(KEY_A)]);

      expect(await service.list('u1')).toEqual([
        {
          exchange: 'bybit',
          apiKeyMasked: '••••••••••••••28mZ',
          connectedAt: new Date('2026-01-01T00:00:00Z'),
          needsReconnect: false,
        },
      ]);
    });

    // The settings page is the only place these keys can be re-entered, so a
    // blob written under another master key must not take the whole list down
    // with it — that left the page hanging on its loading skeleton forever.
    it('reports a connection it cannot decrypt instead of throwing', async () => {
      const service = serviceReading(KEY_A, [connectionRow(KEY_B)]);

      expect(await service.list('u1')).toEqual([
        {
          exchange: 'bybit',
          apiKeyMasked: null,
          connectedAt: new Date('2026-01-01T00:00:00Z'),
          needsReconnect: true,
        },
      ]);
    });

    it('keeps listing the readable connections next to a broken one', async () => {
      const service = serviceReading(KEY_A, [
        connectionRow(KEY_B, 'bybit'),
        connectionRow(KEY_A, 'okx'),
      ]);

      expect((await service.list('u1')).map((c) => [c.exchange, c.needsReconnect])).toEqual([
        ['bybit', true],
        ['okx', false],
      ]);
    });
  });

  describe('get', () => {
    it('returns the decrypted credentials', async () => {
      const service = serviceReading(KEY_A, [connectionRow(KEY_A)]);

      expect(await service.get('u1', 'bybit')).toEqual({
        apiKey: 'ASSjQYU2q1zf6h28mZ',
        apiSecret: 'super-secret',
      });
    });

    // A raw throw reached the client as a bare 500 "Internal server error",
    // which named neither the cause nor the way out.
    it('explains an undecryptable connection instead of failing opaquely', async () => {
      const service = serviceReading(KEY_A, [connectionRow(KEY_B)]);

      await expect(service.get('u1', 'bybit')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.get('u1', 'bybit')).rejects.toThrow(/Настройки/);
    });
  });
});
