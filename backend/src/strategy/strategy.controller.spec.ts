import { StrategyController } from './strategy.controller';
import { STRATEGY_VERSION } from './report';

const at = new Date('2026-10-30T00:00:00Z');
const make = (row: unknown) =>
  new StrategyController({ read: async () => row } as never);

describe('StrategyController', () => {
  it('нет строки — pending', async () => {
    expect(await make(null).report()).toEqual({
      status: 'pending',
      computedAt: null,
      report: null,
    });
  });

  it('старая версия — pending с датой прошлого расчёта', async () => {
    const res = await make({
      version: STRATEGY_VERSION - 1,
      computedAt: at,
      data: {},
    }).report();
    expect(res).toEqual({
      status: 'pending',
      computedAt: at.toISOString(),
      report: null,
    });
  });

  it('текущая версия — отчёт', async () => {
    const data = { version: STRATEGY_VERSION };
    const res = await make({
      version: STRATEGY_VERSION,
      computedAt: at,
      data,
    }).report();
    expect(res).toEqual({
      status: 'ready',
      computedAt: at.toISOString(),
      report: data,
    });
  });
});
