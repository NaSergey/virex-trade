import { BalanceHistoryService } from './balance-history.service';

const HOUR = 60 * 60 * 1000;
const T0 = new Date('2026-08-01T10:00:00Z');
const T1 = new Date(T0.getTime() + HOUR);
const T2 = new Date(T0.getTime() + 2 * HOUR);

function serviceWith(opts: {
  anchors: { at: Date; balance: number; gap: number | null }[];
  flows?: { at: Date; amount: number }[];
}) {
  const prisma = {
    balanceSnapshot: {
      findMany: jest.fn().mockResolvedValue(
        opts.anchors.map((a) => ({ ...a, source: 'snapshot', userId: 'u1', exchange: 'bybit' })),
      ),
    },
    trade: {
      findMany: jest.fn().mockResolvedValue(
        (opts.flows ?? []).map((f) => ({ closedAt: f.at, closedPnl: f.amount })),
      ),
    },
    fundingFee: { findMany: jest.fn().mockResolvedValue([]) },
  } as never;
  return new BalanceHistoryService(prisma);
}

describe('BalanceHistoryService.balanceAt', () => {
  it('отдаёт якорь как есть, когда момент совпал с ним', async () => {
    const service = serviceWith({ anchors: [{ at: T1, balance: 1060, gap: null }] });

    await expect(service.balanceAt('u1', 'bybit', T1)).resolves.toEqual({
      balance: 1060,
      source: 'snapshot',
    });
  });

  it('выводит баланс назад от ближайшего якоря', async () => {
    const service = serviceWith({
      anchors: [{ at: T1, balance: 1060, gap: null }],
      flows: [{ at: new Date(T0.getTime() + HOUR / 2), amount: 60 }],
    });

    await expect(service.balanceAt('u1', 'bybit', T0)).resolves.toEqual({
      balance: 1000,
      source: 'derived',
    });
  });

  // Разрыв — граница отрезка, а не точка на нём. Ввод средств в T1 означает,
  // что баланс до него с балансом после него цепочкой не связан, и протянуть
  // вывод через разрыв значило бы приписать пользователю прибыль в размере
  // его же пополнения.
  it('не выводит баланс через разрыв', async () => {
    const service = serviceWith({
      anchors: [
        { at: T1, balance: 1500, gap: 500 },
        { at: T2, balance: 1520, gap: null },
      ],
      flows: [],
    });

    await expect(service.balanceAt('u1', 'bybit', T0)).resolves.toBeNull();
  });

  it('внутри отрезка после разрыва выводит нормально', async () => {
    const service = serviceWith({
      anchors: [
        { at: T1, balance: 1500, gap: 500 },
        { at: T2, balance: 1520, gap: null },
      ],
      flows: [{ at: new Date(T1.getTime() + HOUR / 2), amount: 20 }],
    });

    await expect(service.balanceAt('u1', 'bybit', new Date(T1.getTime() + HOUR / 4))).resolves.toEqual(
      { balance: 1500, source: 'derived' },
    );
  });

  it('отдаёт null, когда якорей нет вовсе', async () => {
    const service = serviceWith({ anchors: [] });

    await expect(service.balanceAt('u1', 'bybit', T0)).resolves.toBeNull();
  });
});
