import { ServiceUnavailableException } from '@nestjs/common';
import { HlScoutService } from './hl-scout.service';
import * as gate from '../hyperliquid/hl-gate';

jest.mock('../hyperliquid/hl-gate', () => {
  const actual = jest.requireActual('../hyperliquid/hl-gate');
  return {
    hlInfo: jest.fn(),
    hlPausedFor: jest.fn(() => 0),
    fetchLeaderboard: jest.fn(),
    isGateRefusal: actual.isGateRefusal,
    WEIGHT: actual.WEIGHT,
  };
});

const NOW = Date.UTC(2026, 9, 19, 12);
const clock = () => NOW;

function makePrisma(over: Record<string, unknown> = {}) {
  return {
    hlWallet: {
      aggregate: jest.fn().mockResolvedValue({ _max: { seenAt: null } }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      ...over,
    },
    $executeRaw: jest.fn().mockResolvedValue(0),
    $transaction: jest
      .fn()
      .mockImplementation(async (ops: unknown[]) => Promise.all(ops)),
  };
}

const lbRow = (addr: string) => ({
  ethAddress: addr,
  accountValue: '50000',
  displayName: null,
  windowPerformances: [
    ['week', { pnl: '1', roi: '0', vlm: '10' }],
    ['month', { pnl: '1', roi: '0', vlm: '10' }],
    ['allTime', { pnl: '1', roi: '0', vlm: '10' }],
  ],
});

describe('HlScoutService — отбор', () => {
  beforeEach(() => jest.clearAllMocks());

  it('не идёт, если прошлый был меньше 6 часов назад', async () => {
    const prisma = makePrisma({
      aggregate: jest
        .fn()
        .mockResolvedValue({ _max: { seenAt: new Date(NOW - 3600_000) } }),
    });
    await new HlScoutService(prisma as never).discoverIfDue(NOW);
    expect(gate.fetchLeaderboard).not.toHaveBeenCalled();
  });

  it('подозрительно короткий лидерборд не стирает отбор', async () => {
    (gate.fetchLeaderboard as jest.Mock).mockResolvedValue({
      leaderboardRows: [lbRow('0x' + '1'.repeat(40))],
    });
    const prisma = makePrisma();
    await new HlScoutService(prisma as never).discoverIfDue(NOW);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('полный лидерборд — одна транзакция: снять отметку, вставить кандидатов, удалить лишних', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) =>
      lbRow('0x' + i.toString(16).padStart(40, '0')),
    );
    (gate.fetchLeaderboard as jest.Mock).mockResolvedValue({
      leaderboardRows: rows,
    });
    const prisma = makePrisma();
    await new HlScoutService(prisma as never).discoverIfDue(NOW);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.hlWallet.updateMany).toHaveBeenCalledWith({
      where: { candidate: true },
      data: { candidate: false },
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.hlWallet.deleteMany).toHaveBeenCalledWith({
      where: { candidate: false, savedAt: null, hiddenAt: null },
    });
  });

  it('лидерборд целый, а кандидатов почти нет — сменился формат: таблица не стирается', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => ({
      ...lbRow('0x' + i.toString(16).padStart(40, '0')),
      accountValue: '1',
    }));
    (gate.fetchLeaderboard as jest.Mock).mockResolvedValue({
      leaderboardRows: rows,
    });
    const prisma = makePrisma();
    await new HlScoutService(prisma as never).discoverIfDue(NOW);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('сохранённому не-кандидату оборот обновляется из того же лидерборда', async () => {
    const saved = '0x' + 'f'.repeat(40);
    const rows = Array.from({ length: 1500 }, (_, i) =>
      lbRow('0x' + i.toString(16).padStart(40, '0')),
    );
    rows.push({ ...lbRow(saved), accountValue: '1' });
    (gate.fetchLeaderboard as jest.Mock).mockResolvedValue({
      leaderboardRows: rows,
    });
    const prisma = makePrisma({
      findMany: jest.fn().mockResolvedValue([{ address: saved }]),
    });
    await new HlScoutService(prisma as never).discoverIfDue(NOW);
    expect(prisma.hlWallet.updateMany).toHaveBeenCalledWith({
      where: { address: saved },
      data: { volumeWeek: 10 },
    });
  });
});

describe('HlScoutService — разбор', () => {
  beforeEach(() => jest.clearAllMocks());

  it('разбирать некого — false', async () => {
    expect(
      await new HlScoutService(makePrisma() as never).analyzeNext(clock),
    ).toBe(false);
  });

  it('пишет вердикт, статистику и число открытых позиций', async () => {
    const prisma = makePrisma({
      findFirst: jest.fn().mockResolvedValue({ address: '0xa' }),
    });
    (gate.hlInfo as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce({
      assetPositions: [{ position: { szi: '1' } }, { position: { szi: '0' } }],
    });
    expect(await new HlScoutService(prisma as never).analyzeNext(clock)).toBe(
      true,
    );
    const { where, data } = prisma.hlWallet.updateMany.mock.calls[0][0];
    expect(where).toEqual({ address: '0xa' });
    expect(data).toMatchObject({
      analyzedAt: new Date(NOW),
      qualified: false,
      rejectReason: 'noData',
      openPositions: 1,
    });
  });

  it('сбой Hyperliquid тоже сдвигает analyzedAt — иначе кошелёк стоял бы первым всегда', async () => {
    const prisma = makePrisma({
      findFirst: jest.fn().mockResolvedValue({ address: '0xa' }),
    });
    (gate.hlInfo as jest.Mock).mockRejectedValue(new Error('boom'));
    expect(await new HlScoutService(prisma as never).analyzeNext(clock)).toBe(
      true,
    );
    expect(prisma.hlWallet.updateMany).toHaveBeenCalledWith({
      where: { address: '0xa' },
      data: { analyzedAt: new Date(NOW) },
    });
  });

  it.each(['HL_BUSY', 'HL_PAUSED'])(
    'отказ шлюза (%s) кошелёк не сдвигает — иначе очередь «разобралась» бы без запросов',
    async (code) => {
      const prisma = makePrisma({
        findFirst: jest.fn().mockResolvedValue({ address: '0xa' }),
      });
      (gate.hlInfo as jest.Mock).mockRejectedValue(
        new ServiceUnavailableException({ message: 'x', code }),
      );
      await expect(
        new HlScoutService(prisma as never).analyzeNext(clock),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(prisma.hlWallet.updateMany).not.toHaveBeenCalled();
    },
  );
  describe('фильтр ботов', () => {
    // Кривая, проходящая отбор: 30 недель стабильного роста.
    const goodPortfolio = () => {
      const week = 7 * 86_400_000;
      const pts = Array.from({ length: 30 }, (_, i) => [
        NOW - (29 - i) * week,
        String(10_000 + i * 500),
      ]);
      const win = (name: string) => [
        name,
        {
          accountValueHistory: pts,
          pnlHistory: pts.map(([t], i) => [t, String(i * 500)]),
          vlm: '1',
        },
      ];
      return [
        'perpWeek',
        'perpMonth',
        'perpAllTime',
        'week',
        'month',
        'allTime',
      ].map(win);
    };
    const botFills = () =>
      Array.from({ length: 80 }, (_, i) => ({
        coin: 'ETH',
        px: '100',
        sz: '1',
        side: i % 2 ? 'A' : 'B',
        time: NOW - (80 - i) * 120_000,
        dir: '',
        startPosition: i % 2 ? '1' : '0',
        closedPnl: '0',
        fee: '0',
        crossed: true,
      }));
    const state = { assetPositions: [] };

    it('кривая прошла, но торгует по минуте — отказ «бот», метрики записаны', async () => {
      const prisma = makePrisma({
        findFirst: jest
          .fn()
          .mockResolvedValue({ address: '0xa', behaviorAt: null }),
      });
      (gate.hlInfo as jest.Mock)
        .mockResolvedValueOnce(goodPortfolio())
        .mockResolvedValueOnce(state)
        .mockResolvedValueOnce(botFills());
      await new HlScoutService(prisma as never).analyzeNext(clock);
      const { data } = prisma.hlWallet.updateMany.mock.calls[0][0];
      expect(data).toMatchObject({ qualified: false, rejectReason: 'bot' });
      expect(data.medianHoldMs).toBe(120_000);
      expect(data.behaviorAt).toEqual(new Date(NOW));
    });

    it('проверка свежая (меньше суток) — исполнения заново не качаются, вердикт по сохранённому', async () => {
      const prisma = makePrisma({
        findFirst: jest.fn().mockResolvedValue({
          address: '0xa',
          behaviorAt: new Date(NOW - 3600_000),
          medianHoldMs: 60_000,
          fillsPerDay: 10,
        }),
      });
      (gate.hlInfo as jest.Mock)
        .mockResolvedValueOnce(goodPortfolio())
        .mockResolvedValueOnce(state);
      await new HlScoutService(prisma as never).analyzeNext(clock);
      expect(gate.hlInfo).toHaveBeenCalledTimes(2);
      const { data } = prisma.hlWallet.updateMany.mock.calls[0][0];
      expect(data).toMatchObject({ rejectReason: 'bot' });
      expect(data).not.toHaveProperty('behaviorAt');
    });

    it('кривая не прошла — исполнения не запрашиваются вовсе', async () => {
      const prisma = makePrisma({
        findFirst: jest
          .fn()
          .mockResolvedValue({ address: '0xa', behaviorAt: null }),
      });
      (gate.hlInfo as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(state);
      await new HlScoutService(prisma as never).analyzeNext(clock);
      expect(gate.hlInfo).toHaveBeenCalledTimes(2);
    });
  });
});
