import { describe, expect, it } from 'vitest';
import { afterExits, trackExit } from './exits';

describe('afterExits', () => {
  it('без выходов в пути — сразу', async () => {
    await expect(afterExits()).resolves.toBeUndefined();
  });

  it('списки ждут выхода, начатого раньше них, — первый ответ уже без меня за столом', async () => {
    let done!: () => void;
    trackExit(new Promise<void>((r) => (done = r)));
    let waited = false;
    const wait = afterExits().then(() => (waited = true));

    await Promise.resolve();
    expect(waited).toBe(false);
    done();
    await wait;
    expect(waited).toBe(true);
  });

  it('упавший выход список не роняет', async () => {
    trackExit(Promise.reject(new Error('offline')));
    await expect(afterExits()).resolves.toBeUndefined();
  });
});
