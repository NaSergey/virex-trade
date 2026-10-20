import { ServiceUnavailableException } from '@nestjs/common';
import { HlSnapshotService } from './hl-snapshot.service';
import * as gate from '../hyperliquid/hl-gate';

jest.mock('../hyperliquid/hl-gate', () => {
  const actual = jest.requireActual('../hyperliquid/hl-gate');
  return {
    hlInfo: jest.fn(),
    hlPausedFor: jest.fn(() => 0),
    isGateRefusal: actual.isGateRefusal,
    WEIGHT: actual.WEIGHT,
  };
});

const NOW = Date.UTC(2026, 9, 20, 12);

const state = (coin: string, szi: string, value: string) => ({
  assetPositions: [
    {
      position: {
        coin,
        szi,
        entryPx: '100',
        positionValue: value,
        unrealizedPnl: '5',
        leverage: { type: 'cross', value: 3 },
        liquidationPx: null,
      },
    },
  ],
});

function makePrisma(
  wallets: { address: string; accountValue: number | null }[],
  lastAt: Date | null = null,
) {
  return {
    hlPositionSnapshot: {
      aggregate: jest.fn().mockResolvedValue({ _max: { at: lastAt } }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    hlWallet: {
      findMany: jest.fn().mockResolvedValue(wallets),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest
      .fn()
      .mockImplementation(async (ops: unknown[]) => Promise.all(ops)),
  };
}

describe('HlSnapshotService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('прошлый снимок моложе получаса — ничего не делает', async () => {
    const prisma = makePrisma(
      [{ address: '0xa', accountValue: 1000 }],
      new Date(NOW - 10 * 60_000),
    );
    await new HlSnapshotService(prisma as never).runIfDue(NOW);
    expect(prisma.hlWallet.findMany).not.toHaveBeenCalled();
    expect(gate.hlInfo).not.toHaveBeenCalled();
  });

  it('снимает позиции каждого кошелька одним временем и пишет экспозицию в кошелёк', async () => {
    const prisma = makePrisma([
      { address: '0xa', accountValue: 1000 },
      { address: '0xb', accountValue: 2000 },
    ]);
    (gate.hlInfo as jest.Mock)
      .mockResolvedValueOnce(state('BTC', '-2', '500'))
      .mockResolvedValueOnce({ assetPositions: [] });
    await new HlSnapshotService(prisma as never).runIfDue(NOW);

    const { data } = prisma.hlPositionSnapshot.createMany.mock.calls[0][0];
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      address: '0xa',
      equity: 1000,
      at: new Date(NOW),
    });
    expect(data[0].positions).toEqual([
      { coin: 'BTC', szi: -2, notional: 500, entryPx: 100, upnl: 5 },
    ]);
    expect(data[1].positions).toEqual([]);
    expect(prisma.hlWallet.updateMany).toHaveBeenCalledWith({
      where: { address: '0xa' },
      data: {
        netExposure: -0.5,
        grossExposure: 0.5,
        exposureAt: new Date(NOW),
      },
    });
    expect(prisma.hlWallet.updateMany).toHaveBeenCalledWith({
      where: { address: '0xb' },
      data: { netExposure: 0, grossExposure: 0, exposureAt: new Date(NOW) },
    });
  });

  it('сбой одного кошелька не роняет проход; без баланса экспозиции нет', async () => {
    const prisma = makePrisma([
      { address: '0xa', accountValue: null },
      { address: '0xb', accountValue: 1000 },
    ]);
    (gate.hlInfo as jest.Mock)
      .mockResolvedValueOnce(state('ETH', '1', '300'))
      .mockRejectedValueOnce(new Error('boom'));
    await new HlSnapshotService(prisma as never).runIfDue(NOW);
    const { data } = prisma.hlPositionSnapshot.createMany.mock.calls[0][0];
    expect(data.map((r: { address: string }) => r.address)).toEqual(['0xa']);
    expect(data[0].equity).toBeNull();
    // Позиция записана, а экспозицию к неизвестному балансу не выдумываем.
    expect(prisma.hlWallet.updateMany).not.toHaveBeenCalled();
  });

  it('отказ шлюза обрывает проход, но собранное сохраняется', async () => {
    const prisma = makePrisma([
      { address: '0xa', accountValue: 1000 },
      { address: '0xb', accountValue: 1000 },
      { address: '0xc', accountValue: 1000 },
    ]);
    (gate.hlInfo as jest.Mock)
      .mockResolvedValueOnce(state('BTC', '1', '100'))
      .mockRejectedValueOnce(
        new ServiceUnavailableException({ message: 'x', code: 'HL_BUSY' }),
      );
    await new HlSnapshotService(prisma as never).runIfDue(NOW);
    expect(gate.hlInfo).toHaveBeenCalledTimes(2);
    expect(
      prisma.hlPositionSnapshot.createMany.mock.calls[0][0].data,
    ).toHaveLength(1);
  });

  it('старые снимки удаляются', async () => {
    const prisma = makePrisma([]);
    await new HlSnapshotService(prisma as never).runIfDue(NOW);
    expect(prisma.hlPositionSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { at: { lt: new Date(NOW - 120 * 86_400_000) } },
    });
  });
});
