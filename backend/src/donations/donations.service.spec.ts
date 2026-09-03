import { Prisma } from '@prisma/client';
import { DonationsService } from './donations.service';
import { DonationConfig, MAINNET_USDT_CONTRACT } from './donation.config';

/**
 * Проверяется самое дорогое место системы: сопоставление перевода с интентом и
 * защита от двойного зачисления. Prisma здесь подменена — важна не работа
 * драйвера, а то, ЧЕМ ограничен запрос: `claimByAmount` обязан обновлять строку
 * условием (compare-and-set), а не читать-и-писать.
 */

const CONFIG: DonationConfig = {
  enabled: true,
  receivingAddress: 'TZ4UXDV5ZhNW7fb2AMSbgfAEZ7hWsnYS2g',
  usdtContract: MAINNET_USDT_CONTRACT,
  apiUrl: 'https://api.trongrid.io',
  apiKey: null,
  ttlMs: 10 * 60_000,
  lateGraceMs: 20 * 60_000,
  pollIntervalMs: 15_000,
  minUnits: 1_000_000n,
  maxUnits: 10_000_000_000n,
  maxPendingPerUser: 3,
  qrMode: 'address',
};

const now = new Date('2026-09-03T12:00:00Z');

const donationRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'don-1',
  userId: 'user-a',
  status: 'PENDING',
  currency: 'USDT',
  network: 'TRC20',
  receivingAddress: CONFIG.receivingAddress,
  requestedUnits: 5_000_000n,
  expectedUnits: 5_004_300n,
  paidUnits: null,
  transactionHash: null,
  fromAddress: null,
  transferredAt: null,
  detectedAt: null,
  paidAfterExpiry: false,
  notifiedAt: null,
  note: null,
  expiresAt: new Date(now.getTime() + 5 * 60_000),
  matchUntil: new Date(now.getTime() + 25 * 60_000),
  createdAt: now,
  updatedAt: now,
  ...over,
});

interface Harness {
  service: DonationsService;
  updateManyArgs: any[];
  deletedLocks: bigint[];
}

const harness = (opts: {
  lock: unknown;
  updateManyResult?: { count: number } | Error;
}): Harness => {
  const updateManyArgs: any[] = [];
  const deletedLocks: bigint[] = [];

  const prisma = {
    donationAmountLock: {
      findUnique: jest.fn().mockResolvedValue(opts.lock),
      delete: jest.fn(({ where }: any) => {
        deletedLocks.push(where.expectedUnits);
        return Promise.resolve({});
      }),
    },
    donation: {
      updateMany: jest.fn((args: any) => {
        updateManyArgs.push(args);
        const result = opts.updateManyResult ?? { count: 1 };
        return result instanceof Error
          ? Promise.reject(result)
          : Promise.resolve(result);
      }),
    },
  };

  const service = new DonationsService(
    prisma as never,
    { notifyDonationReceived: jest.fn() } as never,
    { buildPayload: () => '', buildDataUrl: async () => null } as never,
    CONFIG,
  );
  return { service, updateManyArgs, deletedLocks };
};

const transfer = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    valueUnits: 5_004_300n,
    txId: 'tx-1',
    fromAddress: 'TXsender000000000000000000000000000',
    blockTimestamp: new Date(now.getTime() + 60_000),
    ...over,
  }) as any;

describe('DonationsService.claimByAmount', () => {
  it('засчитывает перевод интенту с ровно такой же суммой', async () => {
    const h = harness({
      lock: { expectedUnits: 5_004_300n, donation: donationRow() },
    });

    const res = await h.service.claimByAmount(transfer());

    expect(res).toEqual({ donationId: 'don-1' });
    // Слот суммы освобождён сразу — следующий донор получит этот хвост.
    expect(h.deletedLocks).toEqual([5_004_300n]);
  });

  it('обновляет строку условием, а не поверх прочитанного состояния', async () => {
    const h = harness({
      lock: { expectedUnits: 5_004_300n, donation: donationRow() },
    });

    await h.service.claimByAmount(transfer());

    // Ровно это условие делает зачисление безопасным при двух процессах:
    // второй получит count = 0, а не перезапишет чужой хеш.
    const where = h.updateManyArgs[0].where;
    expect(where.transactionHash).toBeNull();
    expect(where.expectedUnits).toBe(5_004_300n);
    expect(where.status).toEqual({ in: ['PENDING', 'EXPIRED'] });
  });

  it('не засчитывает, если строку уже занял другой процесс', async () => {
    const h = harness({
      lock: { expectedUnits: 5_004_300n, donation: donationRow() },
      updateManyResult: { count: 0 },
    });

    expect(await h.service.claimByAmount(transfer())).toBeNull();
    expect(h.deletedLocks).toEqual([]);
  });

  it('не засчитывает транзакцию, уже привязанную к другому донату', async () => {
    // Уникальный индекс на transactionHash — второй замок после
    // compare-and-set. Его срабатывание означает «перевод уже разобран».
    const p2002 = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const h = harness({
      lock: { expectedUnits: 5_004_300n, donation: donationRow() },
      updateManyResult: p2002,
    });

    expect(await h.service.claimByAmount(transfer())).toBeNull();
  });

  it('не трогает суммы, за которыми не закреплён интент', async () => {
    // Круглые 5.00 мимо формы — это не платёж User A, а деньги на сверку.
    const h = harness({ lock: null });
    expect(
      await h.service.claimByAmount(transfer({ valueUnits: 5_000_000n })),
    ).toBeNull();
  });

  it('засчитывает платёж, подтверждённый после истечения окна, и помечает его', async () => {
    const h = harness({
      lock: {
        expectedUnits: 5_004_300n,
        donation: donationRow({ status: 'EXPIRED' }),
      },
    });

    const res = await h.service.claimByAmount(
      transfer({ blockTimestamp: new Date(now.getTime() + 11 * 60_000) }),
    );

    expect(res).toEqual({ donationId: 'don-1' });
    expect(h.updateManyArgs[0].data.paidAfterExpiry).toBe(true);
    expect(h.updateManyArgs[0].data.status).toBe('PAID');
  });

  it('не засчитывает платёж позже запаса на подтверждение', async () => {
    // Хвост к этому моменту мог уже уехать другому интенту — засчитывать его
    // «кому-то» нельзя, деньги идут в сверку.
    const h = harness({
      lock: { expectedUnits: 5_004_300n, donation: donationRow() },
    });

    const res = await h.service.claimByAmount(
      transfer({ blockTimestamp: new Date(now.getTime() + 40 * 60_000) }),
    );

    expect(res).toBeNull();
  });

  it('не засчитывает отменённый интент', async () => {
    const h = harness({
      lock: {
        expectedUnits: 5_004_300n,
        donation: donationRow({ status: 'CANCELED' }),
      },
    });
    expect(await h.service.claimByAmount(transfer())).toBeNull();
  });

  it('не засчитывает уже оплаченный интент', async () => {
    const h = harness({
      lock: {
        expectedUnits: 5_004_300n,
        donation: donationRow({ status: 'PAID', transactionHash: 'tx-0' }),
      },
    });
    expect(
      await h.service.claimByAmount(transfer({ txId: 'tx-2' })),
    ).toBeNull();
  });
});
