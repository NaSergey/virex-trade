import { loadCandles, PublicGet } from './bybit-candles';

const STEP = 15 * 60_000;
/** Биржа: свечи с момента `listed`, отдаёт окно новейшими вперёд. */
function exchange(
  listed: number,
  calls: Record<string, string>[] = [],
): PublicGet {
  return async (_path, params) => {
    calls.push(params);
    const list: string[][] = [];
    const end = Number(params.end);
    const start = Number(params.start);
    for (let t = end - (end % STEP); t >= start; t -= STEP) {
      if (t >= listed) list.push([String(t), '1', '3', '0.5', '2', '10', '20']);
    }
    return { list };
  };
}

describe('loadCandles', () => {
  it('читает страницами по возрастанию, без дыр и повторов', async () => {
    const calls: Record<string, string>[] = [];
    const to = 2500 * STEP;
    const rows = await loadCandles(exchange(0, calls), 'BTCUSDT', 15, 0, to, 0);
    expect(rows).toHaveLength(2500);
    rows.forEach((r, i) => expect(r.time).toBe(i * STEP));
    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatchObject({
      category: 'linear',
      symbol: 'BTCUSDT',
      interval: '15',
      start: '0',
      limit: '1000',
    });
    expect(rows[0]).toEqual({
      time: 0,
      open: 1,
      high: 3,
      low: 0.5,
      close: 2,
    });
  });

  it('незакрытой свечи нет', async () => {
    const to = 10 * STEP + 1000;
    const rows = await loadCandles(exchange(0), 'BTCUSDT', 15, 0, to, 0);
    expect(rows).toHaveLength(10);
    expect(rows[9].time).toBe(9 * STEP);
  });

  it('пустая страница до листинга чтение не обрывает', async () => {
    const listed = 1500 * STEP;
    const rows = await loadCandles(
      exchange(listed),
      'PEPE',
      15,
      0,
      2000 * STEP,
      0,
    );
    expect(rows).toHaveLength(500);
    expect(rows[0].time).toBe(listed);
  });

  it('сбой сети — повтор, третий подряд — отказ', async () => {
    let fails = 2;
    const flaky: PublicGet = async (path, params) => {
      if (fails-- > 0) throw new Error('сеть');
      return exchange(0)(path, params);
    };
    await expect(
      loadCandles(flaky, 'BTCUSDT', 15, 0, 5 * STEP, 0),
    ).resolves.toHaveLength(5);
    const dead: PublicGet = async () => {
      throw new Error('сеть');
    };
    await expect(
      loadCandles(dead, 'BTCUSDT', 15, 0, 5 * STEP, 0),
    ).rejects.toThrow('сеть');
  });

  it('таймфрейм без интервала Bybit — отказ', async () => {
    await expect(
      loadCandles(exchange(0), 'BTCUSDT', 7, 0, STEP, 0),
    ).rejects.toThrow();
  });
});
