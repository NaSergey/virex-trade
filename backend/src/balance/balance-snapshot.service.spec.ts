import { BalanceSnapshotService } from './balance-snapshot.service';

const HOUR = 60 * 60 * 1000;
const T0 = new Date('2026-08-01T10:00:00Z');
const T1 = new Date(T0.getTime() + HOUR);

/**
 * Сервис собирается вручную с заглушками — это тест про то, какая строка
 * появляется в базе, а не про HTTP и не про Nest.
 */
function serviceWith(opts: {
  balance: number;
  prevAnchor?: { at: Date; balance: number };
  flows?: { at: Date; amount: number }[];
  positionsOpen?: boolean;
  exchange?: string;
  balanceSuccess?: boolean;
  positionsSuccess?: boolean;
}) {
  const created: Record<string, unknown>[] = [];
  const exchange = opts.exchange ?? 'okx';
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1', activeExchange: 'bybit' }]) },
    balanceSnapshot: {
      findFirst: jest.fn().mockResolvedValue(
        opts.prevAnchor ? { ...opts.prevAnchor, source: 'snapshot', gap: null } : null,
      ),
      create: jest.fn().mockImplementation(({ data }) => {
        created.push(data);
        return data;
      }),
    },
    trade: {
      findMany: jest.fn().mockResolvedValue(
        (opts.flows ?? []).map((f) => ({ closedAt: f.at, closedPnl: f.amount, openFee: 0, closeFee: 0 })),
      ),
    },
    fundingFee: { findMany: jest.fn().mockResolvedValue([]) },
  } as never;

  const balanceSuccess = opts.balanceSuccess ?? true;
  const positionsSuccess = opts.positionsSuccess ?? true;
  const adapter = {
    getBalance: jest.fn().mockResolvedValue(
      balanceSuccess
        ? { success: true, balance: opts.balance, availableToWithdraw: opts.balance }
        : { success: false },
    ),
    getOpenPositions: jest
      .fn()
      .mockResolvedValue(
        positionsSuccess
          ? { success: true, positions: opts.positionsOpen ? [{ symbol: 'BTCUSDT', size: 1 }] : [] }
          : { success: false },
      ),
  };
  const exchanges = { get: () => adapter } as never;
  const credentials = {
    getActive: jest
      .fn()
      .mockResolvedValue({ exchange, credentials: { apiKey: 'k', apiSecret: 's' } }),
  } as never;
  const risk = { computeMissing: jest.fn().mockResolvedValue(0) } as never;

  return { service: new BalanceSnapshotService(prisma, exchanges, credentials, risk), created };
}

describe('BalanceSnapshotService.captureFor', () => {
  it('пишет якорь, когда предыдущего нет', async () => {
    const { service, created } = serviceWith({ balance: 1000 });

    await expect(service.captureFor('u1', T0)).resolves.toBe('written');
    expect(created[0]).toMatchObject({ userId: 'u1', balance: 1000, source: 'snapshot', gap: null });
  });

  // Ряд, который сошёлся с ожиданием по сделкам, разрыва не несёт: gap здесь
  // должен быть именно null, а не 0 — «расхождения не было» и «расхождение
  // ровно нулевое» читаются по-разному тем, кто потом смотрит историю.
  it('не ставит разрыв, когда баланс сошёлся с ожиданием', async () => {
    const { service, created } = serviceWith({
      balance: 1060,
      prevAnchor: { at: T0, balance: 1000 },
      flows: [{ at: new Date(T0.getTime() + HOUR / 2), amount: 60 }],
    });

    await service.captureFor('u1', T1);
    expect(created[0]).toMatchObject({ balance: 1060, gap: null });
  });

  it('ставит разрыв, когда баланс вырос без сделок', async () => {
    const { service, created } = serviceWith({
      balance: 1500,
      prevAnchor: { at: T0, balance: 1000 },
      flows: [],
    });

    await service.captureFor('u1', T1);
    expect(created[0]).toMatchObject({ balance: 1500, gap: 500 });
  });

  it('ставит отрицательный разрыв на выводе средств', async () => {
    const { service, created } = serviceWith({
      balance: 700,
      prevAnchor: { at: T0, balance: 1000 },
      flows: [],
    });

    await service.captureFor('u1', T1);
    expect(created[0]).toMatchObject({ gap: -300 });
  });

  // Пропуск не ошибка: дыру закроет вывод по цепочке, а следующий якорь
  // заодно проверит отрезок. Ошибкой было бы записать баланс, в котором
  // болтается нереализованный PnL открытой позиции — он дышит вместе с
  // рынком, и каждый вдох прочитался бы как ввод средств.
  it('пропускает тик, когда есть открытые позиции на бирже, требующей плоского счёта', async () => {
    const { service, created } = serviceWith({ balance: 1000, positionsOpen: true, exchange: 'okx' });

    await expect(service.captureFor('u1', T0)).resolves.toBe('skipped');
    expect(created).toHaveLength(0);
  });

  // Bybit возвращает баланс кошелька, не включающий нереализованный PnL открытой
  // позиции. Открытая позиция не портит якорь, поэтому ждать её закрытия незачем —
  // это стоило бы пропущенных якорей без причины. На Bybit yakors берутся даже
  // при открытых позициях, потому что плавающая прибыль в баланс не входит и
  // не будет прочитана как ввод средств.
  it('снимает якорь при открытых позициях на бирже вне ANCHOR_REQUIRES_FLAT', async () => {
    const { service, created } = serviceWith({ balance: 1000, positionsOpen: true, exchange: 'bybit' });

    await expect(service.captureFor('u1', T0)).resolves.toBe('written');
    expect(created[0]).toMatchObject({ userId: 'u1', balance: 1000, source: 'snapshot', gap: null });
  });

  // Адаптер недостижим или отказал — якорь не снимаем, пока не поправится. Следующий
  // цикл попробует ещё раз.
  it('возвращает failed, когда адаптер не ответил на getBalance', async () => {
    const { service, created } = serviceWith({ balance: 1000, balanceSuccess: false });

    await expect(service.captureFor('u1', T0)).resolves.toBe('failed');
    expect(created).toHaveLength(0);
  });

  // Открытые позиции читаются независимо: если адаптер отказал на getOpenPositions,
  // это не getBalance. Тоже failed, потому что ряд рисует неполный.
  it('возвращает failed, когда адаптер не ответил на getOpenPositions для требующей плоского счёта биржи', async () => {
    const { service, created } = serviceWith({
      balance: 1000,
      exchange: 'okx',
      positionsSuccess: false,
    });

    await expect(service.captureFor('u1', T0)).resolves.toBe('failed');
    expect(created).toHaveLength(0);
  });
});
