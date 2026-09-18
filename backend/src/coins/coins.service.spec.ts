import { Prisma } from '@prisma/client';
import { CoinsService } from './coins.service';

/**
 * Монеты — единственное в продукте, что можно потратить, и потратить дважды
 * нельзя. Проверяется не работа драйвера, а два условия, на которых всё
 * держится: списание идёт условием (`coinBalance >= n` в самом UPDATE), а не
 * «прочитал — посчитал — записал», и одно событие даёт одну строку журнала.
 *
 * Поддельная база ведёт себя как Postgres в двух местах, ради которых тесты и
 * написаны: `updateMany` применяется атомарно и возвращает число задетых строк,
 * а уникальный ключ журнала бросает P2002.
 */
type Row = { id: string; coinBalance: number };

function fakeDb(users: Row[]) {
  const balances = new Map(users.map((u) => [u.id, u.coinBalance]));
  const journal: { userId: string; delta: number; balanceAfter: number; kind: string; refId: string }[] = [];

  const tx = {
    user: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        const balance = balances.get(where.id);
        if (balance == null) return { count: 0 };
        if (where.coinBalance?.gte != null && balance < where.coinBalance.gte) return { count: 0 };
        balances.set(where.id, balance - (data.coinBalance?.decrement ?? 0));
        return { count: 1 };
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const balance = balances.get(where.id) ?? 0;
        const next = balance + (data.coinBalance?.increment ?? 0);
        balances.set(where.id, next);
        return { id: where.id, coinBalance: next };
      }),
      findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, coinBalance: balances.get(where.id) ?? 0 })),
    },
    coinTransaction: {
      create: jest.fn(async ({ data }: any) => {
        const duplicate = journal.some(
          (r) => r.userId === data.userId && r.kind === data.kind && r.refId === data.refId,
        );
        if (duplicate) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        journal.push(data);
        return data;
      }),
    },
  };

  return { tx, journal, balanceOf: (id: string) => balances.get(id) ?? 0 };
}

const service = () => new CoinsService({} as never);

describe('CoinsService.charge', () => {
  it('списывает монеты и пишет строку журнала с балансом после', async () => {
    const db = fakeDb([{ id: 'u1', coinBalance: 1000 }]);

    await service().charge(db.tx as never, 'u1', 300, 'TOURNAMENT_FEE', 't1:123');

    expect(db.balanceOf('u1')).toBe(700);
    expect(db.journal).toEqual([
      { userId: 'u1', delta: -300, balanceAfter: 700, kind: 'TOURNAMENT_FEE', refId: 't1:123' },
    ]);
  });

  it('списывает условием, а не поверх прочитанного баланса', async () => {
    const db = fakeDb([{ id: 'u1', coinBalance: 1000 }]);

    await service().charge(db.tx as never, 'u1', 300, 'TOURNAMENT_FEE', 't1:123');

    // Ровно это условие не даёт балансу уйти в минус при двух одновременных
    // списаниях: проигравший получит count = 0, а не запишет свой результат
    // поверх чужого.
    const where = db.tx.user.updateMany.mock.calls[0][0].where;
    expect(where.id).toBe('u1');
    expect(where.coinBalance).toEqual({ gte: 300 });
  });

  it('не уводит баланс в минус: второе списание в гонке отказывает', async () => {
    const db = fakeDb([{ id: 'u1', coinBalance: 500 }]);
    const coins = service();

    await coins.charge(db.tx as never, 'u1', 300, 'TOURNAMENT_FEE', 't1:1');
    await expect(coins.charge(db.tx as never, 'u1', 300, 'TOURNAMENT_FEE', 't2:1')).rejects.toMatchObject({
      response: { code: 'INSUFFICIENT_COINS' },
    });

    expect(db.balanceOf('u1')).toBe(200);
    expect(db.journal).toHaveLength(1);
  });

  it('нулевая сумма не трогает ни баланс, ни журнал', async () => {
    const db = fakeDb([{ id: 'u1', coinBalance: 1000 }]);

    await service().charge(db.tx as never, 'u1', 0, 'TOURNAMENT_FEE', 't1:1');

    expect(db.balanceOf('u1')).toBe(1000);
    expect(db.journal).toHaveLength(0);
    expect(db.tx.user.updateMany).not.toHaveBeenCalled();
  });
});

describe('CoinsService.credit', () => {
  it('начисляет и пишет строку журнала', async () => {
    const db = fakeDb([{ id: 'u1', coinBalance: 1000 }]);

    await service().credit(db.tx as never, 'u1', 2500, 'DONATION', 'don-1');

    expect(db.balanceOf('u1')).toBe(3500);
    expect(db.journal).toEqual([
      { userId: 'u1', delta: 2500, balanceAfter: 3500, kind: 'DONATION', refId: 'don-1' },
    ]);
  });

  it('второе начисление того же события упирается в ключ журнала', async () => {
    const db = fakeDb([{ id: 'u1', coinBalance: 0 }]);
    const coins = service();

    await coins.credit(db.tx as never, 'u1', 2500, 'DONATION', 'don-1');
    await expect(coins.credit(db.tx as never, 'u1', 2500, 'DONATION', 'don-1')).rejects.toMatchObject({
      code: 'P2002',
    });

    expect(db.journal).toHaveLength(1);
  });

  it('нулевое начисление не пишет журнал', async () => {
    const db = fakeDb([{ id: 'u1', coinBalance: 10 }]);

    await service().credit(db.tx as never, 'u1', 0, 'TOURNAMENT_PRIZE', 't1');

    expect(db.journal).toHaveLength(0);
    expect(db.tx.user.update).not.toHaveBeenCalled();
  });
});
