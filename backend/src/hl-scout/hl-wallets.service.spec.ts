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
    const live = (gate.hlInfo as jest.Mock).mock.calls.filter(
      (c) => c[0].type === 'clearinghouseState',
    );
    expect(live).toHaveLength(2);
  });

  it('время открытия берётся из исполнений в фоне и появляется на следующем опросе', async () => {
    const prisma = makePrisma();
    prisma.hlWallet.findMany.mockResolvedValue([{ address: '0xa' }]);
    const pos = {
      coin: 'BTC',
      szi: '2',
      entryPx: '1',
      positionValue: '2',
      unrealizedPnl: '1',
      leverage: { type: 'cross', value: 3 },
      liquidationPx: null,
    };
    (gate.hlInfo as jest.Mock).mockImplementation(async (body) =>
      body.type === 'userFills'
        ? [
            { coin: 'BTC', px: '1', sz: '1', side: 'B', time: 5000, dir: '', startPosition: '0', closedPnl: '0', fee: '0', crossed: true },
            { coin: 'BTC', px: '1', sz: '1', side: 'B', time: 6000, dir: '', startPosition: '1', closedPnl: '0', fee: '0', crossed: true },
          ]
        : { assetPositions: [{ position: pos }] },
    );
    const svc = new HlWalletsService(prisma as never);
    const T = 10_000_000;
    const first = await svc.positions(T);
    expect(first.positions[0].openedAt).toBeNull();
    await (svc as unknown as { resolving: Promise<void> }).resolving;
    const second = await svc.positions(T + 1000);
    expect(second.positions[0]).toMatchObject({ openedAt: 5000, openedPartial: false });
    // Известное время заново не ищется.
    await svc.positions(T + 200_000);
    expect(
      (gate.hlInfo as jest.Mock).mock.calls.filter((c) => c[0].type === 'userFills'),
    ).toHaveLength(1);
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
      data: { savedAt: null, starredAt: null },
    });
  });
});

describe('HlWalletsService — просмотрен и удалён', () => {
  beforeEach(() => jest.clearAllMocks());

  it('просмотр ставит время только первый раз', async () => {
    const prisma = makePrisma();
    await new HlWalletsService(prisma as never).markViewed(ADDR);
    const { where, data } = prisma.hlWallet.updateMany.mock.calls[0][0];
    expect(where).toEqual({ address: ADDR, viewedAt: null });
    expect(data.viewedAt).toBeInstanceOf(Date);
  });

  it('удаление ставит метку hiddenAt, строку не стирает', async () => {
    const prisma = makePrisma({ address: ADDR, savedAt: null, hiddenAt: null });
    await new HlWalletsService(prisma as never).hide(ADDR);
    expect(
      prisma.hlWallet.update.mock.calls[0][0].data.hiddenAt,
    ).toBeInstanceOf(Date);
  });

  it('сохранённый не удаляется — у него заметка', async () => {
    const prisma = makePrisma({ address: ADDR, savedAt: new Date(1) });
    await expect(
      new HlWalletsService(prisma as never).hide(ADDR),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.hlWallet.update).not.toHaveBeenCalled();
  });

  it('неизвестный кошелёк при удалении — 404', async () => {
    await expect(
      new HlWalletsService(makePrisma(null) as never).hide(ADDR),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('таблица не показывает удалённые', async () => {
    const prisma = makePrisma();
    await new HlWalletsService(prisma as never).list();
    expect(prisma.hlWallet.findMany.mock.calls[0][0].where).toMatchObject({
      hiddenAt: null,
    });
  });

  it('таблица не показывает сохранённые — они переезжают на свою страницу', async () => {
    const prisma = makePrisma();
    await new HlWalletsService(prisma as never).list();
    expect(prisma.hlWallet.findMany.mock.calls[0][0].where).toMatchObject({
      savedAt: null,
    });
  });
});

describe('HlWalletsService — звёздочка', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ставится сохранённому и снимается; время не двигается повторной', async () => {
    const starredAt = new Date(5);
    const prisma = makePrisma({ address: ADDR, savedAt: new Date(1), starredAt });
    const svc = new HlWalletsService(prisma as never);
    await svc.setStar(ADDR, true);
    expect(prisma.hlWallet.update.mock.calls[0][0].data).toEqual({ starredAt });
    await svc.setStar(ADDR, false);
    expect(prisma.hlWallet.update.mock.calls[1][0].data).toEqual({ starredAt: null });
  });

  it('не сохранённому звёздочку не ставят — 404', async () => {
    const svc = new HlWalletsService(
      makePrisma({ address: ADDR, savedAt: null }) as never,
    );
    await expect(svc.setStar(ADDR, true)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('HlWalletsService — ордера и сделки сохранённого', () => {
  beforeEach(() => jest.clearAllMocks());
  const saved = { address: ADDR, savedAt: new Date(1) };

  it('не сохранённый кошелёк — 404: эндпоинт не прокси к Hyperliquid', async () => {
    const svc = new HlWalletsService(
      makePrisma({ address: ADDR, savedAt: null }) as never,
    );
    await expect(svc.orders(ADDR)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.trades(ADDR)).rejects.toBeInstanceOf(NotFoundException);
    expect(gate.hlInfo).not.toHaveBeenCalled();
  });

  it('ордера и сделки идут разными запросами и держатся минуту каждые', async () => {
    (gate.hlInfo as jest.Mock).mockResolvedValue([]);
    const svc = new HlWalletsService(makePrisma(saved) as never);
    await svc.orders(ADDR, 1000);
    await svc.orders(ADDR, 2000);
    await svc.trades(ADDR, 2000);
    expect(gate.hlInfo).toHaveBeenCalledTimes(2);
    expect((gate.hlInfo as jest.Mock).mock.calls.map((c) => c[0].type)).toEqual(
      ['frontendOpenOrders', 'userFills'],
    );
    await svc.orders(ADDR, 1000 + 61_000);
    expect(gate.hlInfo).toHaveBeenCalledTimes(3);
  });

  it('сбой не залипает в кэше — следующий клик пробует заново', async () => {
    (gate.hlInfo as jest.Mock)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([]);
    const svc = new HlWalletsService(makePrisma(saved) as never);
    await expect(svc.trades(ADDR, 1000)).rejects.toThrow('boom');
    await new Promise((r) => setImmediate(r));
    await expect(svc.trades(ADDR, 1500)).resolves.toMatchObject({ trades: [] });
  });
});

describe('HlWalletsService — свой кошелёк', () => {
  beforeEach(() => jest.clearAllMocks());

  it('создаёт или поднимает запись: сохранён, удаление снято, адрес в нижнем регистре', async () => {
    const prisma = makePrisma();
    (prisma.hlWallet as unknown as Record<string, jest.Mock>).upsert = jest
      .fn()
      .mockImplementation(async ({ create }) => ({
        ...create,
        volumeWeek: 0,
        openPositions: null,
      }));
    await new HlWalletsService(prisma as never).add(
      '0x' + 'A'.repeat(40),
      '  мой  ',
    );
    const arg = (prisma.hlWallet as unknown as Record<string, jest.Mock>).upsert
      .mock.calls[0][0];
    expect(arg.where).toEqual({ address: ADDR });
    expect(arg.create).toMatchObject({ address: ADDR, note: 'мой' });
    expect(arg.create.savedAt).toBeInstanceOf(Date);
    expect(arg.update).toMatchObject({ hiddenAt: null, note: 'мой' });
  });

  it('пустая заметка прежнюю не стирает; не адрес — 400', async () => {
    const prisma = makePrisma();
    (prisma.hlWallet as unknown as Record<string, jest.Mock>).upsert = jest
      .fn()
      .mockResolvedValue({ address: ADDR });
    const svc = new HlWalletsService(prisma as never);
    await svc.add(ADDR, '');
    expect(
      (prisma.hlWallet as unknown as Record<string, jest.Mock>).upsert.mock
        .calls[0][0].update,
    ).not.toHaveProperty('note');
    await expect(svc.add('vault', undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
