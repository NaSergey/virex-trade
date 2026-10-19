import { ServiceUnavailableException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { HlGate, PAUSE_MS, WINDOW_MS } from './hl-gate';

/** Шлюз на подменных часах: сон двигает время, а не ждёт его. */
function makeGate(budget: number, maxWaitMs = 120_000, status = 200) {
  let t = 1_000_000;
  const send = jest
    .fn()
    .mockImplementation(async () => new Response('{"ok":1}', { status }));
  const gate = new HlGate({
    budget,
    maxWaitMs,
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
    fetch: send as never,
  });
  return { gate, send, advance: (ms: number) => (t += ms), now: () => t };
}

const codeOf = (e: unknown) =>
  ((e as ServiceUnavailableException).getResponse() as { code: string }).code;

describe('HlGate — вес в окне', () => {
  it('в пределах бюджета уходит сразу и разбирает JSON', async () => {
    const { gate, send, now } = makeGate(40);
    const start = now();
    const res = await gate.info({ type: 'portfolio', user: '0x1' }, 20);
    await gate.info({ type: 'portfolio', user: '0x2' }, 20);
    expect(res).toEqual({ ok: 1 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(now()).toBe(start);
  });

  it('сверх бюджета ждёт, пока вес старейшего не выйдет из окна', async () => {
    const { gate, now, advance } = makeGate(40);
    const start = now();
    await gate.info({ type: 'portfolio' }, 20);
    advance(10_000);
    await gate.info({ type: 'portfolio' }, 20);
    await gate.info({ type: 'clearinghouseState' }, 2);
    expect(now()).toBe(start + WINDOW_MS);
  });

  it('не дождался за свой срок — HL_BUSY без похода в сеть', async () => {
    const { gate, send } = makeGate(20, 1_000);
    await gate.info({ type: 'portfolio' }, 20);
    const err = await gate.info({ type: 'portfolio' }, 20).catch((e) => e);
    expect(codeOf(err)).toBe('HL_BUSY');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('без бюджета — отказ сразу', async () => {
    const { gate, send } = makeGate(0);
    expect(
      codeOf(await gate.info({ type: 'portfolio' }, 20).catch((e) => e)),
    ).toBe('HL_BUSY');
    expect(send).not.toHaveBeenCalled();
  });

  it('429 — пауза процесса: следующие запросы не уходят до её конца', async () => {
    const { gate, send, advance } = makeGate(1000, 120_000, 429);
    expect(
      codeOf(await gate.info({ type: 'portfolio' }, 20).catch((e) => e)),
    ).toBe('HL_PAUSED');
    expect(gate.pausedFor()).toBe(PAUSE_MS);
    expect(
      codeOf(await gate.info({ type: 'portfolio' }, 20).catch((e) => e)),
    ).toBe('HL_PAUSED');
    expect(send).toHaveBeenCalledTimes(1);
    advance(PAUSE_MS);
    expect(gate.pausedFor()).toBe(0);
  });

  it('прочий не-200 — HL_FAILED, без паузы', async () => {
    const { gate } = makeGate(1000, 120_000, 500);
    expect(
      codeOf(await gate.info({ type: 'portfolio' }, 20).catch((e) => e)),
    ).toBe('HL_FAILED');
    expect(gate.pausedFor()).toBe(0);
  });
});

/**
 * Инвариант: к Hyperliquid ходят только через шлюз. Лимит — на IP сервера, и
 * запрос мимо шлюза тратит общий бюджет так, что шлюз этого не видит.
 */
describe('к Hyperliquid — только через шлюз', () => {
  const SRC = path.join(__dirname, '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (full.endsWith('.ts') && !full.endsWith('.spec.ts'))
        files.push(full);
    }
  };
  walk(SRC);
  const rel = (f: string) => path.relative(SRC, f).replace(/\\/g, '/');

  it.each(['api.hyperliquid.xyz', 'stats-data.hyperliquid.xyz'])(
    'адрес %s написан только в шлюзе',
    (host) => {
      const offenders = files
        .filter((f) => fs.readFileSync(f, 'utf8').includes(host))
        .map(rel)
        .filter((f) => f !== 'hyperliquid/hl-gate.ts');
      expect(offenders).toEqual([]);
    },
  );
});
