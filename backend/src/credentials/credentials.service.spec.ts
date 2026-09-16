import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CredentialsCryptoService } from './credentials-crypto.service';
import {
  CredentialsService,
  CREDENTIALS_CACHE_TTL_MS,
} from './credentials.service';
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

const serviceReading = (
  hex: string,
  rows: ReturnType<typeof connectionRow>[],
) => {
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

      expect(
        (await service.list('u1')).map((c) => [c.exchange, c.needsReconnect]),
      ).toEqual([
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

      await expect(service.get('u1', 'bybit')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.get('u1', 'bybit')).rejects.toThrow(/Настройки/);
    });
  });

  // T20 (B4): get()/activeExchange() cache their DB read for CREDENTIALS_CACHE_TTL_MS
  // (15s), and invalidate() must drop that cache immediately — settings.controller.ts
  // calls it right after save()/clear()/setActive() so a key change never rides out
  // the TTL. invalidate() only reaches the process that calls it (see the
  // "cache survives across process instances" test below), so the TTL is what
  // actually bounds the worst case for a process that was never told.
  describe('caching + invalidation (T20)', () => {
    const makePrisma = (
      rows: ReturnType<typeof connectionRow>[],
      activeExchange: string | null = 'bybit',
    ) => {
      return {
        exchangeConnection: {
          findMany: jest.fn().mockResolvedValue(rows),
          findUnique: jest.fn().mockResolvedValue(rows[0] ?? null),
        },
        user: {
          findUnique: jest.fn().mockResolvedValue({ activeExchange }),
        },
      } as unknown as PrismaService;
    };

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('serves get() from cache within the TTL instead of re-reading the DB', async () => {
      const prisma = makePrisma([connectionRow(KEY_A)]);
      const service = new CredentialsService(prisma, cryptoWith(KEY_A));
      jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

      const first = await service.get('u1', 'bybit');
      const second = await service.get('u1', 'bybit');

      expect(second).toEqual(first);
      expect(prisma.exchangeConnection.findUnique).toHaveBeenCalledTimes(1);
    });

    it('re-reads the DB once the TTL has elapsed', async () => {
      const prisma = makePrisma([connectionRow(KEY_A)]);
      const service = new CredentialsService(prisma, cryptoWith(KEY_A));
      jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
      await service.get('u1', 'bybit');

      jest
        .spyOn(Date, 'now')
        .mockReturnValue(1_000_000 + CREDENTIALS_CACHE_TTL_MS + 1);
      await service.get('u1', 'bybit');

      expect(prisma.exchangeConnection.findUnique).toHaveBeenCalledTimes(2);
    });

    it('coalesces concurrent get() calls for the same user+exchange into one DB read — a real race, not two sequential awaits', async () => {
      const rowA = connectionRow(KEY_A);
      let resolveRow!: (v: unknown) => void;
      const pending = new Promise((r) => {
        resolveRow = r;
      });
      const prisma = {
        exchangeConnection: { findUnique: jest.fn().mockReturnValue(pending) },
      } as unknown as PrismaService;
      const service = new CredentialsService(prisma, cryptoWith(KEY_A));

      // Two callers ask before the DB has answered the first — e.g. two
      // browser tabs' polls landing at the same moment.
      const p1 = service.get('u1', 'bybit');
      const p2 = service.get('u1', 'bybit');
      resolveRow(rowA);
      const [r1, r2] = await Promise.all([p1, p2]);

      expect(prisma.exchangeConnection.findUnique).toHaveBeenCalledTimes(1);
      expect(r1).toEqual(r2);
    });

    it('invalidate() makes the very next read hit the DB again, still inside the TTL window', async () => {
      const prisma = makePrisma([connectionRow(KEY_A)]);
      const service = new CredentialsService(prisma, cryptoWith(KEY_A));
      jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

      await service.get('u1', 'bybit');
      expect(prisma.exchangeConnection.findUnique).toHaveBeenCalledTimes(1);

      service.invalidate('u1');
      await service.get('u1', 'bybit');

      // Time never advanced — only invalidate() explains a second DB read.
      expect(prisma.exchangeConnection.findUnique).toHaveBeenCalledTimes(2);
    });

    it('two reads after invalidate() both see the new key, never the stale one', async () => {
      const rowA = connectionRow(KEY_A);
      const prisma = makePrisma([rowA]);
      const service = new CredentialsService(prisma, cryptoWith(KEY_A));
      jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

      const before = await service.get('u1', 'bybit');
      expect(before).toEqual({
        apiKey: 'ASSjQYU2q1zf6h28mZ',
        apiSecret: 'super-secret',
      });

      // settings.controller.ts: save() writes the new row, then invalidate().
      const rowB = {
        ...rowA,
        apiKeyEnc: cryptoWith(KEY_A).encrypt('NEWKEY12345'),
      };
      (prisma.exchangeConnection.findUnique as jest.Mock).mockResolvedValue(
        rowB,
      );
      service.invalidate('u1');

      const read1 = await service.get('u1', 'bybit');
      const read2 = await service.get('u1', 'bybit');

      expect(read1).toEqual({
        apiKey: 'NEWKEY12345',
        apiSecret: 'super-secret',
      });
      expect(read2).toEqual({
        apiKey: 'NEWKEY12345',
        apiSecret: 'super-secret',
      });
    });

    it('caches activeExchange() too, and invalidate() drops it', async () => {
      const prisma = makePrisma([], 'bybit');
      const service = new CredentialsService(prisma, cryptoWith(KEY_A));
      jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

      expect(await service.activeExchange('u1')).toBe('bybit');

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        activeExchange: 'okx',
      });
      expect(await service.activeExchange('u1')).toBe('bybit'); // still cached

      service.invalidate('u1');
      expect(await service.activeExchange('u1')).toBe('okx');
    });

    it('invalidate() only clears the given user — another user’s cache survives', async () => {
      const prisma = makePrisma([connectionRow(KEY_A)]);
      const service = new CredentialsService(prisma, cryptoWith(KEY_A));
      jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

      await service.get('u1', 'bybit');
      await service.get('u2', 'bybit');
      expect(prisma.exchangeConnection.findUnique).toHaveBeenCalledTimes(2);

      service.invalidate('u1');
      await service.get('u1', 'bybit'); // re-fetched
      await service.get('u2', 'bybit'); // still cached

      expect(prisma.exchangeConnection.findUnique).toHaveBeenCalledTimes(3);
    });

    // T20 fix (review, Important #1): `api` and `worker` run as separate
    // processes in prod (T11, backend/src/role.ts) — settings.controller.ts's
    // invalidate() runs in `api` and reaches only `api`'s own
    // CredentialsService instance. Modeled here as two independent instances
    // reading the same underlying "DB": invalidate() on one does not affect
    // the other, but the other's staleness is bounded by
    // CREDENTIALS_CACHE_TTL_MS, not indefinite.
    it('invalidate() on one process instance does not reach another — but that instance still self-corrects once its own TTL elapses', async () => {
      const rowOld = connectionRow(KEY_A);
      const prisma = makePrisma([rowOld]);
      const apiInstance = new CredentialsService(prisma, cryptoWith(KEY_A));
      const workerInstance = new CredentialsService(prisma, cryptoWith(KEY_A));
      jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

      // Both processes read once, each populating its own independent cache.
      await apiInstance.get('u1', 'bybit');
      await workerInstance.get('u1', 'bybit');

      // The key is rotated — the "DB" now serves the new row.
      const rowNew = {
        ...rowOld,
        apiKeyEnc: cryptoWith(KEY_A).encrypt('ROTATED'),
      };
      (prisma.exchangeConnection.findUnique as jest.Mock).mockResolvedValue(
        rowNew,
      );

      // settings.controller.ts invalidates in the `api` process only.
      apiInstance.invalidate('u1');
      expect(await apiInstance.get('u1', 'bybit')).toEqual({
        apiKey: 'ROTATED',
        apiSecret: 'super-secret',
      });

      // `worker` was never told — still serves what it cached before the
      // rotation, right up until its own TTL runs out.
      expect(await workerInstance.get('u1', 'bybit')).toEqual({
        apiKey: 'ASSjQYU2q1zf6h28mZ',
        apiSecret: 'super-secret',
      });

      jest
        .spyOn(Date, 'now')
        .mockReturnValue(1_000_000 + CREDENTIALS_CACHE_TTL_MS + 1);
      expect(await workerInstance.get('u1', 'bybit')).toEqual({
        apiKey: 'ROTATED',
        apiSecret: 'super-secret',
      });
    });
  });
});
