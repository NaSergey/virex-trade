import { ServiceUnavailableException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { BUDGET, BybitGate, PAUSE_MS, WINDOW_MS } from './bybit-gate';

/** Шлюз на подменных часах: сон двигает время, а не ждёт его. */
function makeGate(budget: number, maxWaitMs = 10_000, status = 200) {
  let t = 1_000_000;
  const send = jest.fn().mockImplementation(async () => new Response('{}', { status }));
  const gate = new BybitGate({
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

const codeOf = (e: unknown) => ((e as ServiceUnavailableException).getResponse() as { code: string }).code;

describe('BybitGate — окно', () => {
  it('в пределах бюджета запросы уходят сразу', async () => {
    const { gate, send, now } = makeGate(3);
    const start = now();
    await Promise.all([gate.fetch('u'), gate.fetch('u'), gate.fetch('u')]);
    expect(send).toHaveBeenCalledTimes(3);
    expect(now()).toBe(start);
  });

  it('сверх бюджета запрос ждёт, пока самый старый не выйдет из окна', async () => {
    const { gate, send, now, advance } = makeGate(2);
    const start = now();
    await gate.fetch('u');
    advance(1_000);
    await gate.fetch('u');
    await gate.fetch('u');
    expect(send).toHaveBeenCalledTimes(3);
    // Третий ушёл ровно тогда, когда первый вышел из окна, — не раньше.
    expect(now()).toBe(start + WINDOW_MS);
  });

  it('окно скользящее: два бюджета за пару секунд не проходят на стыке', async () => {
    const { gate, send, now, advance } = makeGate(2);
    advance(4_900);
    const start = now();
    await gate.fetch('u');
    await gate.fetch('u');
    advance(200); // «новая пятисекундка» по часам, но окно ещё полное
    await gate.fetch('u');
    expect(send).toHaveBeenCalledTimes(3);
    expect(now()).toBe(start + WINDOW_MS);
  });

  it('не дождался места за свой срок — 503 BYBIT_BUSY, в сеть не ходит', async () => {
    const { gate, send } = makeGate(1, 1_000);
    await gate.fetch('u');
    const err = await gate.fetch('u').catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(codeOf(err)).toBe('BYBIT_BUSY');
    expect(send).toHaveBeenCalledTimes(1);
    expect(gate.rejections()).toBe(1);
  });

  it('нулевой бюджет — отказ сразу и без похода в сеть', async () => {
    const { gate, send } = makeGate(0, 0);
    const err = await gate.fetch('u').catch((e: unknown) => e);
    expect(codeOf(err)).toBe('BYBIT_BUSY');
    expect(send).not.toHaveBeenCalled();
    expect(gate.rejections()).toBe(1);
  });

  it('процесс игр к Bybit не ходит — бюджет ноль', () => {
    expect(BUDGET.games).toBe(0);
  });
});

describe('BybitGate — бан IP', () => {
  it('403 ставит паузу на весь процесс: следующие запросы отклоняются без сети', async () => {
    const { gate, send } = makeGate(10, 10_000, 403);
    const first = await gate.fetch('u').catch((e) => e);
    expect(codeOf(first)).toBe('BYBIT_PAUSED');
    expect(gate.isPaused()).toBe(true);

    const second = await gate.fetch('u').catch((e) => e);
    expect(codeOf(second)).toBe('BYBIT_PAUSED');
    // Каждый запрос в бан его продлевает — второй до биржи не дошёл.
    expect(send).toHaveBeenCalledTimes(1);
    expect(gate.rejections()).toBe(2);
  });

  it('после паузы запросы снова уходят', async () => {
    const { gate, send, advance } = makeGate(10, 10_000, 403);
    await gate.fetch('u').catch(() => undefined);
    send.mockImplementation(async () => new Response('{}', { status: 200 }));

    advance(PAUSE_MS - 1);
    await expect(gate.fetch('u')).rejects.toBeInstanceOf(ServiceUnavailableException);
    advance(1);
    await expect(gate.fetch('u')).resolves.toBeInstanceOf(Response);
    expect(gate.isPaused()).toBe(false);
  });

  it('прочие ошибки биржи паузу не ставят — их разбирает вызывающий', async () => {
    const { gate } = makeGate(10, 10_000, 500);
    const res = await gate.fetch('u');
    expect(res.status).toBe(500);
    expect(gate.isPaused()).toBe(false);
  });
});

/**
 * Инвариант: к Bybit ходят только через шлюз. Лимит — на IP сервера, и
 * запрос мимо шлюза тратит общий бюджет так, что шлюз этого не видит.
 */
describe('к Bybit — только через шлюз', () => {
  const SRC = path.join(__dirname, '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) files.push(full);
    }
  };
  walk(SRC);
  const rel = (f: string) => path.relative(SRC, f).replace(/\\/g, '/');

  it('адрес api.bybit.com написан только в шлюзе', () => {
    const offenders = files
      .filter((f) => fs.readFileSync(f, 'utf8').includes('api.bybit.com'))
      .map(rel)
      .filter((f) => f !== 'bybit/bybit-gate.ts');
    expect(offenders).toEqual([]);
  });

  it('нет голого fetch по адресу Bybit', () => {
    const bare = /(?<![\w.])fetch\(\s*`\$\{(?:this\.baseUrl|BYBIT_API)/;
    const offenders = files.filter((f) => bare.test(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('клиенты Bybit (наследники BybitAuthService) не зовут fetch вовсе — только bybitFetch', () => {
    const anyFetch = /(?<![\w.])fetch\(/;
    const offenders = files
      .filter((f) => {
        const src = fs.readFileSync(f, 'utf8');
        return /extends BybitAuthService\b/.test(src) && anyFetch.test(src);
      })
      .map(rel);
    expect(offenders).toEqual([]);
  });
});
