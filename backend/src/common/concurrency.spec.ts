import { runWithConcurrency } from './concurrency';

describe('runWithConcurrency', () => {
  it('не превышает лимит одновременных воркеров', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 20 }, (_, i) => i);

    await runWithConcurrency(items, 4, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
    });

    expect(maxInFlight).toBeLessThanOrEqual(4);
  });

  it('обрабатывает каждый элемент ровно один раз', async () => {
    const items = Array.from({ length: 37 }, (_, i) => i);
    const seen: number[] = [];

    await runWithConcurrency(items, 5, async (item) => {
      seen.push(item);
    });

    expect(seen.sort((a, b) => a - b)).toEqual(items);
  });

  // Медленный элемент не должен держать простаивать остальные слоты пула —
  // воркер сразу берёт следующий элемент из общей очереди, не ждёт пачками.
  it('свободный воркер сразу подхватывает следующий элемент, не ждёт пачку', async () => {
    const durations = [50, 1, 1, 1, 1];
    const order: number[] = [];

    await runWithConcurrency(durations, 2, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      order.push(i);
    });

    // Элемент 0 (50мс) стартует в первой паре, но остальные (1мс каждый)
    // должны все завершиться раньше него на втором воркере.
    expect(order[order.length - 1]).toBe(0);
  });

  it('лимит больше числа элементов не создаёт лишних воркеров и не падает', async () => {
    const items = [1, 2, 3];
    const seen: number[] = [];
    await runWithConcurrency(items, 100, async (item) => {
      seen.push(item);
    });
    expect(seen.sort()).toEqual([1, 2, 3]);
  });

  it('пустой список ничего не делает', async () => {
    const worker = jest.fn();
    await runWithConcurrency([], 4, worker);
    expect(worker).not.toHaveBeenCalled();
  });
});
