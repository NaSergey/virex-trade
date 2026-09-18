import { SyntheticMarketService } from './synthetic-market.service';

describe('SyntheticMarketService', () => {
  const service = new SyntheticMarketService();

  it('отдаёт свечи в форме хранилища и одинаково на повторный запрос', () => {
    const { start } = service.start(5);
    const q = { timeframe: 60, to: start - 1, limit: 3 };
    const first = service.getCandles(5, q);
    expect(first).toHaveLength(3);
    expect(first[0].time).toBeInstanceOf(Date);
    expect(Object.keys(first[0]).sort()).toEqual(['close', 'high', 'low', 'open', 'time', 'volume']);
    expect(service.getCandles(5, q)).toEqual(first);
  });

  it('цена старта — закрытие минутки перед стартом', () => {
    const { start, price } = service.start(6);
    const [last] = service.getCandles(6, { timeframe: 1, to: start - 60_000, limit: 1 });
    expect(price).toBe(last.close);
  });
});
