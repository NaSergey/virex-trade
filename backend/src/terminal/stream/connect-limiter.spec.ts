import { ConnectLimiter } from './connect-limiter';

describe('ConnectLimiter', () => {
  it('пускает не больше лимита за окно и освобождает место, когда старое выходит из окна', () => {
    const limiter = new ConnectLimiter(2, 1_000);
    expect(limiter.tryTake(0)).toBe(true);
    expect(limiter.tryTake(500)).toBe(true);
    expect(limiter.tryTake(900)).toBe(false);
    expect(limiter.tryTake(1_000)).toBe(true); // первое вышло из окна
    expect(limiter.tryTake(1_400)).toBe(false);
  });
});
