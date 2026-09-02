import { loadFlows } from './flows';

const T0 = new Date('2026-08-01T10:00:00Z');
const T1 = new Date('2026-08-01T12:00:00Z');

const prismaWith = (trade: { closedPnl: number; openFee: number; closeFee: number }) =>
  ({
    trade: {
      findMany: jest.fn().mockResolvedValue([{ at: T0, closedAt: T0, ...trade }]),
    },
    fundingFee: { findMany: jest.fn().mockResolvedValue([]) },
  }) as never;

describe('loadFlows', () => {
  const trade = { closedPnl: 100, openFee: 3, closeFee: 2 };

  // Шесть бирж из семи отдают PnL уже за вычетом комиссий. Вычесть их второй
  // раз значит увести ряд вниз, а уехавший ряд читается как вывод средств.
  it('не вычитает комиссии там, где биржа их уже вычла', async () => {
    const flows = await loadFlows(prismaWith(trade), 'u1', 'bybit', T0, T1);
    expect(flows[0].amount).toBe(100);
  });

  // Binance и Bitget — исключения: их поле PnL стоит до комиссий. Комиссии в
  // базе лежат положительными (адаптеры зовут Math.abs), поэтому вычитаем.
  it('вычитает комиссии у Binance', async () => {
    const flows = await loadFlows(prismaWith(trade), 'u1', 'binance', T0, T1);
    expect(flows[0].amount).toBe(95);
  });

  it('вычитает комиссии у Bitget', async () => {
    const flows = await loadFlows(prismaWith(trade), 'u1', 'bitget', T0, T1);
    expect(flows[0].amount).toBe(95);
  });
});
