import { ServiceUnavailableException } from '@nestjs/common';
import { HlPositionWatchService } from './hl-position-watch.service';
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

const NOW = Date.UTC(2026, 10, 12, 12);
const A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const state = (...coins: [string, string][]) => ({
  assetPositions: coins.map(([coin, szi]) => ({
    position: {
      coin,
      szi,
      entryPx: '100',
      positionValue: '5000',
      unrealizedPnl: '5',
      leverage: { type: 'cross', value: 3 },
      liquidationPx: null,
    },
  })),
});

const seen = (minAgo: number, ...positions: { coin: string; side: string }[]) => ({
  at: NOW - minAgo * 60_000,
  positions,
});

interface W {
  address: string;
  note?: string | null;
  notifySeen: unknown;
}

function make(wallets: W[], chat: string | null = 'chat-1') {
  const prisma = {
    hlWallet: {
      findMany: jest
        .fn()
        .mockResolvedValue(wallets.map((w) => ({ note: null, ...w }))),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({ telegramChatId: chat }),
    },
  };
  const telegram = {
    enabled: true,
    sendText: jest.fn().mockResolvedValue(true),
  };
  const svc = new HlPositionWatchService(prisma as never, telegram as never);
  return { prisma, telegram, svc };
}

describe('HlPositionWatchService.tick', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (gate.hlPausedFor as jest.Mock).mockReturnValue(0);
  });

  it('нет кошельков с колокольчиком — ни чата, ни запросов к бирже', async () => {
    const { prisma, svc } = make([]);
    await svc.tick(NOW);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(gate.hlInfo).not.toHaveBeenCalled();
  });

  it('нет чата владельца — к бирже не ходит, состояние не трогает', async () => {
    const { prisma, svc } = make([{ address: A, notifySeen: null }], null);
    await svc.tick(NOW);
    expect(gate.hlInfo).not.toHaveBeenCalled();
    expect(prisma.hlWallet.updateMany).not.toHaveBeenCalled();
  });

  it('пауза шлюза после 429 — проход пропущен целиком', async () => {
    (gate.hlPausedFor as jest.Mock).mockReturnValue(30_000);
    const { prisma, svc } = make([{ address: A, notifySeen: null }]);
    await svc.tick(NOW);
    expect(prisma.hlWallet.findMany).not.toHaveBeenCalled();
    expect(gate.hlInfo).not.toHaveBeenCalled();
  });

  it('первая проверка только запоминает позиции и молчит', async () => {
    const { prisma, telegram, svc } = make([{ address: A, notifySeen: null }]);
    (gate.hlInfo as jest.Mock).mockResolvedValue(state(['BTC', '2']));
    await svc.tick(NOW);
    expect(telegram.sendText).not.toHaveBeenCalled();
    expect(prisma.hlWallet.updateMany).toHaveBeenCalledWith({
      where: { address: A, notifyAt: { not: null } },
      data: {
        notifySeen: {
          at: NOW,
          positions: [{ coin: 'BTC', side: 'long' }],
        },
      },
    });
  });

  it('новая позиция: состояние пишется до отправки, сообщение одно', async () => {
    const { prisma, telegram, svc } = make([
      {
        address: A,
        note: 'Тихий шортист',
        notifySeen: seen(1, { coin: 'BTC', side: 'long' }),
      },
    ]);
    (gate.hlInfo as jest.Mock).mockResolvedValue(
      state(['BTC', '2'], ['ETH', '-40']),
    );
    await svc.tick(NOW);

    expect(telegram.sendText).toHaveBeenCalledTimes(1);
    const [chat, text] = telegram.sendText.mock.calls[0] as [string, string];
    expect(chat).toBe('chat-1');
    expect(text).toContain('Тихий шортист');
    expect(text).toContain('ETH · шорт');
    expect(text).not.toContain('BTC · лонг');
    expect(prisma.hlWallet.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      telegram.sendText.mock.invocationCallOrder[0],
    );
  });

  it('новых позиций нет — состояние обновляется, сообщения нет', async () => {
    const { prisma, telegram, svc } = make([
      { address: A, notifySeen: seen(1, { coin: 'BTC', side: 'long' }) },
    ]);
    (gate.hlInfo as jest.Mock).mockResolvedValue(state(['BTC', '9']));
    await svc.tick(NOW);
    expect(telegram.sendText).not.toHaveBeenCalled();
    expect(prisma.hlWallet.updateMany).toHaveBeenCalledTimes(1);
  });

  it('проверка стояла дольше пяти минут — в сообщении оговорка', async () => {
    const { telegram, svc } = make([
      { address: A, notifySeen: seen(40, { coin: 'BTC', side: 'long' }) },
    ]);
    (gate.hlInfo as jest.Mock).mockResolvedValue(
      state(['BTC', '2'], ['SOL', '10']),
    );
    await svc.tick(NOW);
    expect((telegram.sendText.mock.calls[0] as [string, string])[1]).toContain(
      'Проверка стояла 40 мин',
    );
  });

  it('отказ шлюза прерывает проход и не трогает состояние', async () => {
    const { prisma, telegram, svc } = make([
      { address: A, notifySeen: null },
      { address: B, notifySeen: null },
    ]);
    (gate.hlInfo as jest.Mock).mockRejectedValue(
      new ServiceUnavailableException({ code: 'HL_PAUSED' }),
    );
    await svc.tick(NOW);
    expect(gate.hlInfo).toHaveBeenCalledTimes(1);
    expect(prisma.hlWallet.updateMany).not.toHaveBeenCalled();
    expect(telegram.sendText).not.toHaveBeenCalled();
  });

  it('сбой одного кошелька его пропускает, второй разбирается', async () => {
    const { prisma, telegram, svc } = make([
      { address: A, notifySeen: seen(1) },
      { address: B, notifySeen: seen(1) },
    ]);
    (gate.hlInfo as jest.Mock)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(state(['BTC', '2']));
    await svc.tick(NOW);
    expect(prisma.hlWallet.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.hlWallet.updateMany.mock.calls[0][0].where.address).toBe(B);
    expect(telegram.sendText).toHaveBeenCalledTimes(1);
  });

  it('колокольчик выключили посреди прохода — сообщения нет', async () => {
    const { prisma, telegram, svc } = make([
      { address: A, notifySeen: seen(1) },
    ]);
    prisma.hlWallet.updateMany.mockResolvedValue({ count: 0 });
    (gate.hlInfo as jest.Mock).mockResolvedValue(state(['BTC', '2']));
    await svc.tick(NOW);
    expect(telegram.sendText).not.toHaveBeenCalled();
  });

  it('второй проход, пока идёт первый, не стартует', async () => {
    const { svc } = make([{ address: A, notifySeen: seen(1) }]);
    let release!: () => void;
    (gate.hlInfo as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve(state());
      }),
    );
    const first = svc.tick(NOW);
    await svc.tick(NOW);
    release();
    await first;
    expect(gate.hlInfo).toHaveBeenCalledTimes(1);
  });
});
