import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HlWalletsService } from './hl-wallets.service';
import * as gate from '../hyperliquid/hl-gate';

jest.mock('../hyperliquid/hl-gate', () => ({
  hlInfo: jest.fn(),
  WEIGHT: { clearinghouseState: 2, portfolio: 20 },
}));

const ADDR = '0x' + 'a'.repeat(40);

function makePrisma(
  wallet: Record<string, unknown> | null = { address: ADDR, savedAt: null },
) {
  return {
    hlWallet: {
      findUnique: jest.fn().mockResolvedValue(wallet),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(async ({ data }) => ({
        ...wallet,
        ...data,
        volumeWeek: 0,
        openPositions: 0,
      })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _max: { seenAt: null } }),
    },
  };
}

describe('HlWalletsService — сохранённые', () => {
  beforeEach(() => jest.clearAllMocks());

  it('сохранение: адрес в нижний регистр, время ставится, заметка обрезается', async () => {
    const prisma = makePrisma();
    await new HlWalletsService(prisma as never).save(
      '0x' + 'A'.repeat(40),
      '  смотреть  ',
    );
    const { where, data } = prisma.hlWallet.update.mock.calls[0][0];
    expect(where).toEqual({ address: ADDR });
    expect(data.savedAt).toBeInstanceOf(Date);
    expect(data.note).toBe('смотреть');
  });

  it('смена заметки не двигает время сохранения; пустая заметка — null', async () => {
    const savedAt = new Date(1);
    const prisma = makePrisma({ address: ADDR, savedAt });
    await new HlWalletsService(prisma as never).save(ADDR, '');
    expect(prisma.hlWallet.update.mock.calls[0][0].data).toEqual({
      savedAt,
      note: null,
    });
  });

  it('без заметки в запросе прежняя заметка не трогается', async () => {
    const prisma = makePrisma();
    await new HlWalletsService(prisma as never).save(ADDR, undefined);
    expect(prisma.hlWallet.update.mock.calls[0][0].data).not.toHaveProperty(
      'note',
    );
  });

  it('неизвестный кошелёк — 404, не адрес — 400', async () => {
    await expect(
      new HlWalletsService(makePrisma(null) as never).save(ADDR, undefined),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      new HlWalletsService(makePrisma() as never).save('vault', undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('HlWalletsService — позиции', () => {
  beforeEach(() => jest.clearAllMocks());

  it('сбой одного кошелька не роняет остальные; ответ держится в кэше', async () => {
    const prisma = makePrisma();
    prisma.hlWallet.findMany.mockResolvedValue([
      { address: '0xa' },
      { address: '0xb' },
    ]);
    (gate.hlInfo as jest.Mock)
      .mockResolvedValueOnce({
        assetPositions: [
          {
            position: {
              coin: 'BTC',
              szi: '1',
              entryPx: '1',
              positionValue: '2',
              unrealizedPnl: '1',
              leverage: { type: 'cross', value: 3 },
              liquidationPx: null,
            },
          },
        ],
      })
      .mockRejectedValueOnce(new Error('boom'));
    const svc = new HlWalletsService(prisma as never);
    const res = await svc.positions(1000);
    expect(res.positions).toHaveLength(1);
    expect(res.failed).toEqual(['0xb']);
    await svc.positions(2000);
    expect(gate.hlInfo).toHaveBeenCalledTimes(2);
  });

  it('сохранение сбрасывает кэш позиций — новый кошелёк виден сразу', async () => {
    const prisma = makePrisma();
    (gate.hlInfo as jest.Mock).mockResolvedValue({ assetPositions: [] });
    prisma.hlWallet.findMany.mockResolvedValue([{ address: '0xa' }]);
    const svc = new HlWalletsService(prisma as never);
    await svc.positions(1000);
    await svc.save(ADDR, undefined);
    await svc.positions(2000);
    expect(gate.hlInfo).toHaveBeenCalledTimes(2);
  });

  it('два одновременных запроса вне кэша — один залп к Hyperliquid', async () => {
    const prisma = makePrisma();
    (gate.hlInfo as jest.Mock).mockResolvedValue({ assetPositions: [] });
    prisma.hlWallet.findMany.mockResolvedValue([{ address: '0xa' }]);
    const svc = new HlWalletsService(prisma as never);
    await Promise.all([svc.positions(1000), svc.positions(1000)]);
    expect(gate.hlInfo).toHaveBeenCalledTimes(1);
  });

  it('«убрать» снимает отметку, но заметку не стирает', async () => {
    const prisma = makePrisma();
    await new HlWalletsService(prisma as never).unsave(ADDR);
    expect(prisma.hlWallet.updateMany).toHaveBeenCalledWith({
      where: { address: ADDR },
      data: { savedAt: null },
    });
  });
});
